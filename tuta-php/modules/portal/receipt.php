<?php
/**
 * Parent portal — receipt view. A parent may open a receipt ONLY for a payment
 * that belongs to one of their own children. After that ownership check we
 * reuse the same branded receipt renderer the office uses.
 */
requireParent();

$sb  = new Supabase();
$sid = schoolId();
$paymentId = trim($_GET['id'] ?? '');
if ($paymentId === '') { flash('error', 'That receipt is not available.'); redirect('portal'); }

// payment → invoice → student, all school-scoped; then verify parent ownership.
$ok = false;
$pay = $sb->from('payments')->select('id,invoice_id')->eq('id', $paymentId)->eq('school_id', $sid)->single()->execute();
$invId = $pay['data'][0]['invoice_id'] ?? null;
if ($invId) {
    $inv = $sb->from('invoices')->select('student_id')->eq('id', $invId)->eq('school_id', $sid)->single()->execute();
    $stuId = $inv['data'][0]['student_id'] ?? null;
    if ($stuId && parentStudent($stuId)) $ok = true;
}
if (!$ok) { flash('error', 'That receipt is not available.'); redirect('portal'); }

// Render the standard receipt (loads by ?id + school and outputs the page).
require __DIR__ . '/../fees/receipt.php';
