<?php
/**
 * M-Pesa STK Push Callback — receives payment confirmations from Safaricom.
 * This is a PUBLIC endpoint (no auth required) — Safaricom POSTs here.
 *
 * Route: ?route=api/mpesa/callback
 *
 * Flow:
 * 1. Safaricom sends JSON payload with payment result
 * 2. We parse the callback to extract receipt, amount, phone
 * 3. Look up the pending STK request by CheckoutRequestID
 * 4. Record the payment against the matched invoice
 * 5. Update invoice paid_amount and status
 */

// Always respond 200 to Safaricom (they retry on failure)
http_response_code(200);
header('Content-Type: application/json');

require_once __DIR__ . '/../../includes/mpesa.php';

$rawBody = file_get_contents('php://input');

// Log the raw callback for debugging
$logDir = __DIR__ . '/../../logs';
if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
file_put_contents($logDir . '/mpesa_callback_' . date('Y-m-d') . '.log',
    date('c') . " | " . $rawBody . "\n", FILE_APPEND);

// R2 — verify the request actually came from Safaricom. Log-only by default
// (set MPESA_IP_ENFORCE=true in config.php once live callbacks are confirmed
// to pass); enforcing drops off-allowlist requests before any money moves.
MpesaApi::guardCallbackSource($logDir, 'stk-callback');

$parsed = MpesaApi::parseCallback($rawBody);

if (!$parsed) {
    // Payment failed or user cancelled — nothing to do
    echo json_encode(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
    exit;
}

$sb = new Supabase();

// Find the pending STK request by checkout_id
$stkResult = $sb->from('mpesa_stk_requests')->select('id,invoice_id,school_id,amount,source,wa_phone')
    ->eq('checkout_request_id', $parsed['checkout_id'])
    ->eq('status', 'pending')
    ->single()->execute();

$stkRequest = $stkResult['data'][0] ?? null;

if (!$stkRequest) {
    // No matching request — log and exit
    file_put_contents($logDir . '/mpesa_unmatched_' . date('Y-m-d') . '.log',
        date('c') . " | checkout_id=" . ($parsed['checkout_id'] ?? '') . " | receipt=" . ($parsed['receipt'] ?? '') . "\n", FILE_APPEND);
    echo json_encode(['ResultCode' => 0, 'ResultDesc' => 'No matching request']);
    exit;
}

$invoiceId = $stkRequest['invoice_id'];
$schoolId  = $stkRequest['school_id'];
$amount    = (float)($parsed['amount'] ?? $stkRequest['amount']);
$receipt   = $parsed['receipt'] ?? '';

// Get the invoice
$invResult = $sb->from('invoices')->select('id,student_id,amount,paid_amount,status')
    ->eq('id', $invoiceId)->single()->execute();
$invoice = $invResult['data'][0] ?? null;

if ($invoice && !in_array($invoice['status'], ['paid', 'cancelled'])) {
    $currentPaid   = (float)($invoice['paid_amount'] ?? 0);
    $invoiceTotal  = (float)($invoice['amount'] ?? 0);
    $balanceOwed   = $invoiceTotal - $currentPaid;
    $amountToApply = min($amount, $balanceOwed);
    $overpayment   = max(0, $amount - $balanceOwed);
    $newPaid       = $currentPaid + $amountToApply;
    $newStatus     = $newPaid >= $invoiceTotal ? 'paid' : 'partial';

    // Record payment
    $sb->from('payments')->insert([
        'invoice_id'      => $invoiceId,
        'school_id'       => $schoolId,
        'amount'          => $amount,
        'method'          => 'mpesa',
        'transaction_ref' => $receipt,
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
    if ($overpayment > 0 && !empty($invoice['student_id'])) {
        $stuResult = $sb->from('students')->select('id,credit_balance')
            ->eq('id', $invoice['student_id'])->single()->execute();
        $currentCredit = (float)($stuResult['data'][0]['credit_balance'] ?? 0);
        $sb->from('students')->eq('id', $invoice['student_id'])->update([
            'credit_balance' => $currentCredit + $overpayment,
            'updated_at'     => date('c'),
        ]);
    }

    // Audit log
    try {
        $sb->from('audit_logs')->insert([
            'school_id'   => $schoolId,
            'action'      => 'mpesa_payment',
            'entity_type' => 'invoice',
            'entity_id'   => $invoiceId,
            'payload'     => json_encode([
                'amount' => $amount, 'receipt' => $receipt,
                'phone' => $parsed['phone'] ?? '', 'checkout_id' => $parsed['checkout_id'],
                'overpayment' => $overpayment > 0 ? $overpayment : null,
            ]),
            'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    } catch (\Throwable $e) {}
}

// Update STK request status
$sb->from('mpesa_stk_requests')->eq('id', $stkRequest['id'])->update([
    'status'        => 'completed',
    'mpesa_receipt' => $receipt,
    'result_desc'   => 'Payment received',
    'updated_at'    => date('c'),
]);

// ── Came from the WhatsApp assistant? Confirm back in the chat. ──
// The parent tapped Pay minutes ago, so we're inside the free service
// window and plain text is deliverable. Any failure is logged, never fatal.
if (($stkRequest['source'] ?? '') === 'whatsapp' && !empty($stkRequest['wa_phone'])) {
    try {
        require_once __DIR__ . '/../../includes/whatsapp.php';
        whatsappSchoolContext($schoolId);
        $stuName = '';
        $newBal  = null;
        if ($invoice) {
            $sr = $sb->from('students')->select('first_name,last_name')->eq('id', $invoice['student_id'])->single()->execute()['data'][0] ?? null;
            if ($sr) $stuName = trim(($sr['first_name'] ?? '') . ' ' . ($sr['last_name'] ?? ''));
            $newBal = max(0, (float)($invoice['amount'] ?? 0) - (float)($newPaid ?? $invoice['paid_amount'] ?? 0));
        }
        $t = " Payment received: *" . money($amount) . "*" . ($stuName !== '' ? ' for ' . $stuName : '')
           . ($receipt !== '' ? "\nM-Pesa receipt: " . $receipt : '')
           . ($newBal !== null ? "\nRemaining on this invoice: *" . money($newBal) . "*" : '')
           . (!empty($overpayment) && $overpayment > 0 ? "\n" . money($overpayment) . " over the invoice has been kept as credit." : '')
           . "\n\nThank you. Reply *hi* for the latest balance.";
        whatsappSendFreeText((string)$stkRequest['wa_phone'], $t);
    } catch (\Throwable $e) {
        @file_put_contents($logDir . '/whatsapp_errors_' . date('Y-m-d') . '.log', date('c') . ' | callback confirm: ' . $e->getMessage() . "\n", FILE_APPEND);
    }
}

echo json_encode(['ResultCode' => 0, 'ResultDesc' => 'Success']);
