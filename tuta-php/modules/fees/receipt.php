<?php
/**
 * Payment Receipt — standalone printable page.
 * Receives ?id=UUID (payment ID) as GET parameter.
 * Uses batch RPC for single-call data loading. Falls back to individual queries.
 */
$pageTitle = 'Payment Receipt';

$sb  = new Supabase();
$sid = schoolId();

// ── Get payment ID ──────────────────────────────────────────
$paymentId = trim($_GET['id'] ?? '');
if (!$paymentId) {
    die('Payment ID is required.');
}

// Void from receipt (same flow as payments list).
if (isPost() && verifyCsrf() && input('action') === 'void_payment') {
    $reason = trim((string)input('void_reason'));
    $payCheck = $sb->from('payments')->select('id,status,payment_date,paid_at,created_at,receipt_number,amount')
        ->eq('id', $paymentId)->eq('school_id', $sid)->single()->execute()['data'][0] ?? null;
    if (!$payCheck) {
        flash('error', 'Payment not found.');
        redirect('fees/payments');
    }
    $sameDayOnly = schoolSetting('payment_void_same_day_only', 'false') === 'true';
    if ($sameDayOnly && !paymentIsVoidableSameDay($payCheck)) {
        flash('error', 'This school only allows same-day voids. Turn that off in Settings to void older payments.');
        redirect('fees/receipt?id=' . urlencode($paymentId));
    }
    if (approvalRequired('require_approval_void_payment', 'true')) {
        $u = currentUser();
        $sb->from('approval_requests')->insert([
            'school_id'       => $sid,
            'action_type'     => 'void_payment',
            'target_type'     => 'payment',
            'target_id'       => $paymentId,
            'payload'         => json_encode([
                'reason' => $reason,
                'amount' => $payCheck['amount'] ?? 0,
                'receipt_number' => $payCheck['receipt_number'] ?? null,
                'same_day_only' => $sameDayOnly,
            ]),
            'status'          => 'pending',
            'requested_by'    => $u['email'] ?? null,
            'requested_by_id' => $u['id'] ?? null,
        ]);
        flash('success', 'Void sent for approval — a school administrator must approve it.');
        redirect('fees/payments');
    }
    $vr = voidInvoicePayment($paymentId, $reason, $sameDayOnly);
    if (!$vr['success']) {
        flash('error', $vr['error']);
        redirect('fees/receipt?id=' . urlencode($paymentId));
    }
    flash('success', 'Payment voided. Record the correct amount on the invoice.');
    redirect('fees/payments');
}

// ── Try batch RPC (1 API call) ──────────────────────────────
$rpcResult = $sb->rpc('get_receipt', [
    'p_payment_id' => $paymentId,
    'p_school_id'  => $sid,
]);

$rpcData = $rpcResult['data'] ?? null;

if ($rpcData && !empty($rpcData['payment'])) {
    $payment     = $rpcData['payment'];
    $invoice     = $rpcData['invoice'];
    $student     = $rpcData['student'];
    $className   = $rpcData['class_name'] ?? '';
    $sectionName = $rpcData['section_name'] ?? '';

    // The get_receipt RPC predates the receipt_number column (added in
    // migration 070). Sidecar-fetch it so receipts always show the school's
    // own sequential number.
    if (!isset($payment['receipt_number']) || !isset($payment['payment_date']) || !isset($payment['status'])) {
        $rnRes = $sb->from('payments')->select('receipt_number,payment_date,status,paid_at,created_at')
            ->eq('id', $payment['id'])->single()->execute();
        $extra = $rnRes['data'][0] ?? [];
        foreach (['receipt_number', 'payment_date', 'status', 'paid_at', 'created_at'] as $k) {
            if (!isset($payment[$k]) && isset($extra[$k])) $payment[$k] = $extra[$k];
        }
    }
} else {
    // Fallback to individual queries
    $payResult = $sb->from('payments')
        ->select('id,invoice_id,amount,method,transaction_ref,paid_at,status,created_at,receipt_number')
        ->eq('id', $paymentId)->single()->execute();
    $payment = $payResult['data'][0] ?? null;
    if (!$payment) die('Payment not found.');

    $invResult = $sb->from('invoices')
        ->select('id,reference,student_id,amount,paid_amount,credit_applied,status,due_date')
        ->eq('id', $payment['invoice_id'])->eq('school_id', $sid)->single()->execute();
    $invoice = $invResult['data'][0] ?? null;
    if (!$invoice) die('Invoice not found.');

    $stuResult = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,current_class_id,section_id,guardian_name,guardian_phone,roll_number')
        ->eq('id', $invoice['student_id'])->single()->execute();
    $student = $stuResult['data'][0] ?? null;

    $className = ''; $sectionName = '';
    if ($student && !empty($student['current_class_id'])) {
        $classMap = cachedClassMap();
        $className = $classMap[$student['current_class_id']] ?? '';
    }
    if ($student && !empty($student['section_id'])) {
        $secResult = $sb->from('sections')->select('id,name')
            ->eq('id', $student['section_id'])->single()->execute();
        $sectionName = $secResult['data'][0]['name'] ?? '';
    }
}

// ── School (cached) ─────────────────────────────────────────
$school = cachedSchool();

// ── Derived values ──────────────────────────────────────────
// Receipt number is the SCHOOL's own sequential reference (RCP-YYYY-NNNN),
// assigned automatically when the payment row was inserted. It is NEVER the
// payer's transaction_ref (M-Pesa code, bank slip number, etc.) — that is
// shown separately below as "Payment Reference".
$receiptNumber = !empty($payment['receipt_number'])
    ? $payment['receipt_number']
    : 'RCP-' . strtoupper(substr($payment['id'], 0, 8)); // legacy fallback
$paymentDate   = $payment['payment_date']
    ?? ($payment['paid_at'] ? substr($payment['paid_at'], 0, 10) : substr($payment['created_at'] ?? '', 0, 10));
$invoiceTotal  = (float)($invoice['amount'] ?? 0);
$invoicePaid   = (float)($invoice['paid_amount'] ?? 0);
$invoiceBalance = $invoiceTotal - $invoicePaid;
$isFullyPaid   = ($invoice['status'] ?? '') === 'paid';
$creditApplied = (float)($invoice['credit_applied'] ?? 0);
$isVoided      = ($payment['status'] ?? '') === 'voided';
$canVoidHere   = !$isVoided
    && ($payment['status'] ?? 'completed') === 'completed'
    && userCan('fees.manage')
    && (schoolSetting('payment_void_same_day_only', 'false') !== 'true' || paymentIsVoidableSameDay($payment));

$methodLabels = methodLabelMap();
$methodDisplay = $methodLabels[$payment['method'] ?? ''] ?? ucfirst($payment['method'] ?? 'Cash');

// Fetch live student credit balance so the parent sees it on the receipt.
// Done as a tiny separate query so it works regardless of whether the
// get_receipt RPC included credit_balance.
$studentCredit = 0.0;
if (!empty($student['id'])) {
    $cr = $sb->from('students')->select('credit_balance')
        ->eq('id', $student['id'])->single()->execute();
    $studentCredit = (float)(($cr['data'][0]['credit_balance'] ?? 0));
}

// "Received by" — who recorded this payment. The payment row stores user_id
// + user_email; resolve to the staff member's full name (same lookup the
// login uses), falling back to the email.
$receiverName = '';
$recUserId = $payment['user_id']    ?? null;
$recEmail  = $payment['user_email'] ?? null;
if (!$recUserId && !$recEmail) {
    $rp = $sb->from('payments')->select('user_id,user_email')->eq('id', $payment['id'])->single()->execute();
    $recUserId = $rp['data'][0]['user_id']    ?? null;
    $recEmail  = $rp['data'][0]['user_email'] ?? null;
}
if ($recUserId) {
    $pn = $sb->from('user_profiles')->select('full_name')->eq('id', $recUserId)->single()->execute();
    $receiverName = trim((string)($pn['data'][0]['full_name'] ?? ''));
}
if ($receiverName === '' && $recEmail) $receiverName = $recEmail;

// Plain-English label for what this pays toward (matches the paper receipt book).
$invoiceTitle = 'School Fees';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt <?= e($receiptNumber) ?> — <?= e($school['name'] ?? 'School') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        /* No forced page size — the receipt fills WHATEVER paper the printer is
           set to (A4 or A5), so it never lands as a narrow strip on a wider
           sheet. Just a small margin all round. */
        @page { margin: 8mm; }
        @media print {
            .no-print { display: none !important; }
            body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
            /* Compact receipt (small header + small fonts baked into the markup) —
               fills the page width and occupies just the top of the sheet. */
            .print-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; border-radius: 0 !important; max-width: 100% !important; width: 100% !important; margin: 0 !important; page-break-inside: avoid; }
        }
        .watermark {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 5rem; font-weight: 900; color: rgba(16, 185, 129, 0.07);
            pointer-events: none; z-index: 0; letter-spacing: 0.2em; white-space: nowrap;
        }
    </style>
</head>
<body class="bg-gray-100 min-h-screen flex flex-col items-center py-8 px-4 gap-4">

    <div class="no-print fixed top-4 right-4 flex gap-3 z-50 flex-wrap justify-end">
        <?php if ($canVoidHere): ?>
        <form method="POST" class="inline" onsubmit="var r=prompt('Reason for voiding this payment (required):'); if(!r||!r.trim()){alert('A reason is required.');return false;} this.querySelector('[name=void_reason]').value=r.trim(); return confirm('Void this payment?');">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="void_payment">
            <input type="hidden" name="void_reason" value="">
            <button type="submit" class="inline-flex items-center gap-2 bg-white hover:bg-red-50 text-red-600 px-5 py-2.5 rounded-lg shadow-lg font-medium border border-red-200 transition text-sm">Void</button>
        </form>
        <?php endif; ?>
        <button onclick="window.print()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg shadow-lg font-medium transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print Receipt
        </button>
        <button onclick="if(window.history.length>1){history.back()}else{window.close()};setTimeout(function(){window.location.href='<?= baseUrl('fees/payments') ?>'},150)" class="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg shadow-lg font-medium border border-gray-200 transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Back
        </button>
    </div>

    <?php if ($isVoided): ?>
    <div class="no-print w-full max-w-2xl bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">This payment has been voided.</div>
    <?php endif; ?>

    <div class="print-card bg-white w-full max-w-2xl rounded-xl shadow-lg border border-gray-200 overflow-hidden relative">

        <?php if ($isFullyPaid): ?>
            <div class="watermark">PAID</div>
        <?php endif; ?>

        <?php
        // Compact inline header — deliberately smaller than the shared
        // print-header.php (which invoices use), so the whole receipt fits the
        // top of an A5 sheet without a bulky top block.
        $rcBrand = schoolSetting('brand_color', '#059669');
        if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $rcBrand)) $rcBrand = '#059669';
        $rcBits = array_filter([$school['address'] ?? '', $school['phone'] ?? '', $school['email'] ?? '']);
        ?>
        <div class="flex items-center gap-3 px-5 py-2.5 relative z-10" style="border-bottom: 2px solid <?= e($rcBrand) ?>;">
            <?php if (!empty($school['logo_url'])): ?>
                <img src="<?= e($school['logo_url']) ?>" alt="" class="w-10 h-10 object-contain rounded flex-shrink-0">
            <?php else: ?>
                <div class="w-10 h-10 rounded flex items-center justify-center flex-shrink-0" style="background: <?= e($rcBrand) ?>;">
                    <span class="text-white text-sm font-bold"><?= e(strtoupper(substr($school['name'] ?? 'S', 0, 2))) ?></span>
                </div>
            <?php endif; ?>
            <div class="min-w-0">
                <h1 class="text-sm font-bold text-gray-900 uppercase tracking-wide leading-tight"><?= e($school['name'] ?? 'School') ?></h1>
                <?php if ($rcBits): ?><p class="text-[10px] text-gray-500 leading-tight"><?= e(implode('  ·  ', $rcBits)) ?></p><?php endif; ?>
            </div>
        </div>
        <div class="flex items-center justify-between px-5 py-1.5 relative z-10" style="background: <?= e($rcBrand) ?>;">
            <h2 class="text-xs font-bold text-white uppercase tracking-widest">Payment Receipt</h2>
            <span class="text-[11px] font-mono text-white" style="opacity: .9;"><?= e($receiptNumber) ?></span>
        </div>

        <div class="px-5 py-3 relative z-10">
            <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] text-gray-500 min-w-0 truncate"><?= e($invoiceTitle) ?> · <?= e($invoice['reference'] ?? '') ?></span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700 flex-shrink-0 ml-2"><?= $isFullyPaid ? 'Paid in full' : 'Payment received' ?></span>
            </div>

            <!-- Ruled detail table: full-width, a line under every field like a receipt book -->
            <div class="rounded-lg border border-gray-300 overflow-hidden">
                <table class="w-full text-xs">
                    <tbody>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 w-40 border-r border-gray-200 align-top">Invoice Title</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= e($invoiceTitle) ?><span class="text-gray-400"> · <?= e($invoice['reference'] ?? '') ?></span></td>
                        </tr>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200 align-top">Student Name</td>
                            <td class="px-3 py-1.5 text-gray-900 font-semibold"><?= e(trim(($student['first_name'] ?? '') . ' ' . ($student['last_name'] ?? ''))) ?><?php if (!empty($student['admission_number'])): ?> <span class="font-normal text-gray-400">· Adm <?= e($student['admission_number']) ?></span><?php endif; ?></td>
                        </tr>
                        <?php if ($className): ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Class</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= e($className) ?><?= $sectionName ? ' — ' . e($sectionName) : '' ?></td>
                        </tr>
                        <?php endif; ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Total Amount</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= money($invoiceTotal) ?></td>
                        </tr>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Amount Paid (this receipt)</td>
                            <td class="px-3 py-1.5 text-gray-900 font-semibold"><?= money((float)$payment['amount']) ?></td>
                        </tr>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Balance Due</td>
                            <td class="px-3 py-1.5 font-semibold <?= $invoiceBalance > 0.005 ? 'text-gray-900' : 'text-emerald-700' ?>"><?= $invoiceBalance > 0.005 ? money($invoiceBalance) : 'Cleared' ?></td>
                        </tr>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Payment Method</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= e($methodDisplay) ?></td>
                        </tr>
                        <?php if (!empty($payment['transaction_ref'])): ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Transaction ID</td>
                            <td class="px-3 py-1.5 text-gray-800 font-mono"><?= e($payment['transaction_ref']) ?></td>
                        </tr>
                        <?php endif; ?>
                        <?php if ($receiverName !== ''): ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Received By</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= e($receiverName) ?></td>
                        </tr>
                        <?php endif; ?>
                        <tr>
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Date</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= e(date('j M Y', strtotime($paymentDate))) ?></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <?php if ($studentCredit > 0): ?>
            <p class="text-[10px] text-cyan-800 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-1.5 mt-2">
                Credit on file: <span class="font-semibold"><?= money($studentCredit) ?></span> — held for the next invoice.
            </p>
            <?php endif; ?>

            <?php
            // Customizable receipt note (Settings → Receipt note). Use it for
            // e.g. "Kindly note that fees once paid are non-refundable".
            $rcNote = trim((string)schoolSetting('receipt_note', ''));
            if ($rcNote !== ''):
            ?>
            <p class="text-center text-[11px] font-semibold text-gray-700 mt-3">NB: <?= e($rcNote) ?></p>
            <?php endif; ?>

            <div class="text-center text-[9px] text-gray-400 mt-2 leading-relaxed">
                <p>For enquiries, contact <?= e($school['phone'] ?? 'the school office') ?><?= !empty($school['email']) ? ' or ' . e($school['email']) : '' ?>.</p>
                <?php $rcKraPin = trim((string)schoolSetting('kra_pin', '')); if ($rcKraPin !== ''): ?>
                    <p>KRA PIN: <?= e($rcKraPin) ?></p>
                <?php endif; ?>
                <p class="font-mono text-gray-300 pt-1">Receipt ID: <?= e($payment['id']) ?></p>
            </div>
        </div>
    </div>
</body>
</html>
