<?php
/**
 * M-Pesa STK Push API — sends payment prompt to parent's phone.
 * Called via AJAX from payment forms.
 *
 * POST ?route=api/mpesa/stk-push
 * Body: invoice_id, phone, amount
 */
header('Content-Type: application/json');

if (!isPost()) {
    echo json_encode(['success' => false, 'error' => 'POST required']);
    exit;
}

// CSRF: this triggers a real money prompt, so reject forged cross-site posts.
if (!verifyCsrf()) {
    echo json_encode(['success' => false, 'error' => 'Your session expired. Please refresh and try again.']);
    exit;
}

require_once __DIR__ . '/../../includes/mpesa.php';

$invoiceId = input('invoice_id');
$phone     = input('phone');
$amount    = (float)input('amount');
$sid       = schoolId();

if (!$invoiceId || !$phone || $amount <= 0) {
    echo json_encode(['success' => false, 'error' => 'Invoice ID, phone number, and amount are required.']);
    exit;
}

// Verify invoice exists and belongs to this school
$sb = new Supabase();
$invResult = $sb->from('invoices')->select('id,reference,student_id,amount,paid_amount,status')
    ->eq('id', $invoiceId)->eq('school_id', $sid)->single()->execute();
$invoice = $invResult['data'][0] ?? null;

if (!$invoice) {
    echo json_encode(['success' => false, 'error' => 'Invoice not found.']);
    exit;
}

// A parent may only pay invoices for their own children. Staff (bursar/admin)
// are not parents and skip this check. Generic message avoids leaking which
// invoice IDs exist to a probing parent.
if (isParent() && !parentStudent($invoice['student_id'] ?? '')) {
    echo json_encode(['success' => false, 'error' => 'Invoice not found.']);
    exit;
}

if (in_array($invoice['status'], ['paid', 'cancelled'])) {
    echo json_encode(['success' => false, 'error' => 'Invoice is already ' . $invoice['status'] . '.']);
    exit;
}

$mpesa = new MpesaApi();
$accountRef = $invoice['reference'] ?? ('INV-' . substr($invoiceId, 0, 8));

$result = $mpesa->stkPush($phone, $amount, $accountRef, 'School Fees');

if ($result['success']) {
    // Record the pending STK request so callback can match it
    $sb->from('mpesa_stk_requests')->insert([
        'school_id'             => $sid,
        'invoice_id'            => $invoiceId,
        'phone'                 => $phone,
        'amount'                => $amount,
        'checkout_request_id'   => $result['checkout_id'] ?? '',
        'merchant_request_id'   => $result['merchant_request'] ?? '',
        'status'                => 'pending',
    ]);

    auditLog('mpesa_stk_push', 'invoice', $invoiceId, [
        'phone' => $phone, 'amount' => $amount,
        'checkout_id' => $result['checkout_id'] ?? '',
    ]);
}

echo json_encode([
    'success' => $result['success'],
    'error'   => $result['error'] ?? null,
    'message' => $result['success'] ? 'M-Pesa prompt sent to ' . $phone . '. Ask the parent to enter their PIN.' : null,
]);
