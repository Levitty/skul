<?php
/**
 * M-Pesa C2B Confirmation — Safaricom calls this AFTER a parent pays.
 * This is the auto-payment engine: parent pays to Till/Paybill →
 * Safaricom notifies us → we match to an invoice → record payment.
 *
 * Route: ?route=api/mpesa/c2b-confirmation (public, no auth)
 *
 * Matching logic (in order):
 * 1. BillRefNumber matches an invoice reference exactly (e.g. INV-A3F8B2C1)
 * 2. BillRefNumber matches a student admission number → find their oldest unpaid invoice
 * 3. Phone number matches a guardian → find their oldest unpaid invoice
 * 4. No match → log as unmatched for manual reconciliation
 */

http_response_code(200);
header('Content-Type: application/json');

require_once __DIR__ . '/../../includes/mpesa.php';
require_once __DIR__ . '/../../includes/payment-reconcile.php';

$rawBody = file_get_contents('php://input');

// Log every C2B confirmation
$logDir = __DIR__ . '/../../logs';
if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
file_put_contents($logDir . '/mpesa_c2b_' . date('Y-m-d') . '.log',
    date('c') . " | " . $rawBody . "\n", FILE_APPEND);

// R2 — verify the request actually came from Safaricom. Log-only by default
// (set MPESA_IP_ENFORCE=true in config.php once live callbacks are confirmed
// to pass); enforcing drops off-allowlist requests before any money moves.
MpesaApi::guardCallbackSource($logDir, 'c2b-confirmation');

$parsed = MpesaApi::parseC2BConfirmation($rawBody);

if (!$parsed || $parsed['amount'] <= 0) {
    echo json_encode(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
    exit;
}

$sb = new Supabase();

$transId   = $parsed['trans_id'];
$amount    = $parsed['amount'];
$billRef   = $parsed['bill_ref'];  // What the parent typed as "Account Number"
$phone     = $parsed['phone'];
$payerName = trim(($parsed['first_name'] ?? '') . ' ' . ($parsed['last_name'] ?? ''));

// ── Prevent duplicate processing ─────────────────────────
$dupCheck = $sb->from('mpesa_c2b_payments')->select('id')
    ->eq('trans_id', $transId)->single()->execute();
if (!empty($dupCheck['data'])) {
    echo json_encode(['ResultCode' => 0, 'ResultDesc' => 'Already processed']);
    exit;
}

// ── Determine the school ─────────────────────────────────
// Match the EXACT shortcode this payment was made to. Crediting "the first
// school with any shortcode configured" silently mis-attributed every C2B
// payment to whichever school sorted first once a second school enabled
// M-Pesa — a cross-tenant financial bug. Fail closed: no exact match → leave
// it unmatched for manual reconciliation rather than guessing a tenant.
$payShortcode = $parsed['shortcode'] ?? '';
$allSettings = $sb->from('school_settings')->select('school_id,value')
    ->eq('key', 'mpesa_shortcode')->execute();
$schoolId = null;
foreach (($allSettings['data'] ?? []) as $row) {
    if (!empty($row['value']) && $payShortcode !== '' && (string)$row['value'] === $payShortcode) {
        $schoolId = $row['school_id'];
        break;
    }
}

if (!$schoolId) {
    // No school owns this shortcode (or the payload carried none) — log for
    // manual reconciliation and exit.
    $sb->from('mpesa_c2b_payments')->insert([
        'trans_id'    => $transId,
        'phone'       => $phone,
        'amount'      => $amount,
        'bill_ref'    => $billRef,
        'payer_name'  => $payerName,
        'status'      => 'unmatched',
        'match_notes' => $payShortcode === ''
            ? 'C2B payload carried no BusinessShortCode'
            : 'No school configured for shortcode ' . $payShortcode,
        'raw_payload' => $rawBody,
    ]);
    echo json_encode(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
    exit;
}

// ── Try to match to an invoice ───────────────────────────
$matchedInvoice = null;
$matchMethod    = '';

// Strategy 1: BillRefNumber matches an invoice reference
if ($billRef) {
    $invResult = $sb->from('invoices')->select('id,student_id,amount,paid_amount,status,reference')
        ->eq('school_id', $schoolId)
        ->ilike('reference', $billRef)
        ->in('status', ['unpaid', 'partial'])
        ->limit(1)->execute();
    $matchedInvoice = ($invResult['data'] ?? [])[0] ?? null;
    if ($matchedInvoice) $matchMethod = 'invoice_reference';
}

// Strategy 2: BillRefNumber matches a student admission number — fuzzily.
// Parents type "281" / "uts281" / "UTS 281" for "UTS-281"; the shared
// fuzzy finder normalises both sides and fails closed on ambiguity.
if (!$matchedInvoice && $billRef) {
    $student = reconcileFindStudentByRef($sb, $schoolId, $billRef);

    if ($student) {
        $invResult = $sb->from('invoices')->select('id,student_id,amount,paid_amount,status,reference')
            ->eq('school_id', $schoolId)
            ->eq('student_id', $student['id'])
            ->in('status', ['unpaid', 'partial'])
            ->order('created_at')
            ->limit(1)->execute();
        $matchedInvoice = ($invResult['data'] ?? [])[0] ?? null;
        if ($matchedInvoice) $matchMethod = 'admission_number_' . ($student['via'] ?? 'exact');
    }
}

// Strategy 3: Phone matches a guardian
if (!$matchedInvoice && $phone) {
    // Normalize phone for search: try with and without 254 prefix
    $phoneVariants = [$phone];
    if (str_starts_with($phone, '254')) {
        $phoneVariants[] = '0' . substr($phone, 3);
        $phoneVariants[] = '+' . $phone;
    }

    foreach ($phoneVariants as $pv) {
        $stuResult = $sb->from('students')->select('id')
            ->eq('school_id', $schoolId)
            ->eq('status', 'active')
            ->eq('guardian_phone', $pv)
            ->limit(1)->execute();
        $student = ($stuResult['data'] ?? [])[0] ?? null;

        if ($student) {
            $invResult = $sb->from('invoices')->select('id,student_id,amount,paid_amount,status,reference')
                ->eq('school_id', $schoolId)
                ->eq('student_id', $student['id'])
                ->in('status', ['unpaid', 'partial'])
                ->order('created_at')
                ->limit(1)->execute();
            $matchedInvoice = ($invResult['data'] ?? [])[0] ?? null;
            if ($matchedInvoice) {
                $matchMethod = 'guardian_phone';
                break;
            }
        }
    }
}

// ── Record the C2B payment ───────────────────────────────
$c2bRecord = [
    'school_id'   => $schoolId,
    'trans_id'     => $transId,
    'phone'        => $phone,
    'amount'       => $amount,
    'bill_ref'     => $billRef,
    'payer_name'   => $payerName,
    'raw_payload'  => $rawBody,
    'match_method' => $matchMethod ?: null,
    'invoice_id'   => $matchedInvoice['id'] ?? null,
    'status'       => $matchedInvoice ? 'matched' : 'unmatched',
    'match_notes'  => $matchedInvoice
        ? 'Matched via ' . $matchMethod . ' to ' . ($matchedInvoice['reference'] ?? '')
        : 'No matching invoice found. Bill ref: ' . $billRef . ', Phone: ' . $phone,
];

$sb->from('mpesa_c2b_payments')->insert($c2bRecord);

// ── If matched, auto-record the payment ─────────────────���
if ($matchedInvoice) {
    $invoiceId   = $matchedInvoice['id'];
    $currentPaid = (float)($matchedInvoice['paid_amount'] ?? 0);
    $invoiceTotal = (float)($matchedInvoice['amount'] ?? 0);
    $balanceOwed = $invoiceTotal - $currentPaid;
    $amountToApply = min($amount, $balanceOwed);
    $overpayment = max(0, $amount - $balanceOwed);
    $newPaid     = $currentPaid + $amountToApply;
    $newStatus   = $newPaid >= $invoiceTotal ? 'paid' : 'partial';

    // Record payment
    $sb->from('payments')->insert([
        'invoice_id'      => $invoiceId,
        'school_id'       => $schoolId,
        'amount'          => $amount,
        'method'          => 'mpesa',
        'transaction_ref' => $transId,
        'status'          => 'completed',
        'paid_at'         => date('c'),
        'payment_date'    => date('Y-m-d'),
    ]);

    // Update invoice
    $sb->from('invoices')->eq('id', $invoiceId)->update([
        'paid_amount' => $newPaid,
        'status'      => $newStatus,
        'updated_at'  => date('c'),
    ]);

    // Handle overpayment → credit balance
    if ($overpayment > 0 && !empty($matchedInvoice['student_id'])) {
        $stuResult = $sb->from('students')->select('id,credit_balance')
            ->eq('id', $matchedInvoice['student_id'])->single()->execute();
        $currentCredit = (float)($stuResult['data'][0]['credit_balance'] ?? 0);
        $sb->from('students')->eq('id', $matchedInvoice['student_id'])->update([
            'credit_balance' => $currentCredit + $overpayment,
            'updated_at'     => date('c'),
        ]);
    }

    // Audit log
    try {
        $sb->from('audit_logs')->insert([
            'school_id'   => $schoolId,
            'action'      => 'mpesa_c2b_payment',
            'entity_type' => 'invoice',
            'entity_id'   => $invoiceId,
            'payload'     => json_encode([
                'amount' => $amount, 'trans_id' => $transId, 'phone' => $phone,
                'bill_ref' => $billRef, 'payer' => $payerName,
                'match_method' => $matchMethod, 'overpayment' => $overpayment > 0 ? $overpayment : null,
            ]),
        ]);
    } catch (\Throwable $e) {}
}

echo json_encode(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
