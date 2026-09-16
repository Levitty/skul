<?php
/**
 * Parent portal — one child: fee statement + published report cards.
 * Receives ?id=UUID (student id). Access is checked: a parent can only
 * open a student that is linked to them.
 */
requireParent();

$sb      = new Supabase();
$childId = trim($_GET['id'] ?? '');
$student = $childId ? parentStudent($childId) : null;

// Isolation: not one of this parent's children -> refuse.
if (!$student) {
    flash('error', 'That page is not available.');
    redirect('portal');
}

$pageTitle       = $student['first_name'] . ' ' . $student['last_name'];
$portalBack      = 'portal';
$portalBackLabel = $pageTitle;

// ── Fee statement ──────────────────────────────────────────
$invRes = $sb->from('invoices')
    ->select('id,reference,amount,paid_amount,status,due_date,created_at')
    ->eq('student_id', $childId)->order('created_at', false)->execute();
// Parents never see drafts (not yet issued by the school) or cancelled invoices.
$invoices = array_values(array_filter(($invRes['data'] ?? []), function ($inv) {
    $st = $inv['status'] ?? '';
    return $st !== 'draft' && $st !== 'cancelled';
}));

$outstanding = 0.0;
$billedTotal = 0.0;
$paidTotal   = 0.0;
foreach ($invoices as $inv) {
    $outstanding += (float)$inv['amount'] - (float)$inv['paid_amount'];
    $billedTotal += (float)$inv['amount'];
    $paidTotal   += (float)$inv['paid_amount'];
}
$outstanding = max(0.0, $outstanding);

// Fee breakdown (Tuition, Transport, etc.) for each invoice. Scoped to this
// child's already-visibility-filtered invoices, so a parent can never read
// items belonging to another student's invoice.
$itemsByInvoice = [];
$invoiceIds = array_column($invoices, 'id');
if (!empty($invoiceIds)) {
    $itemRes = $sb->from('invoice_items')->select('invoice_id,description,amount')
        ->in('invoice_id', $invoiceIds)->execute();
    foreach (($itemRes['data'] ?? []) as $it) {
        $itemsByInvoice[$it['invoice_id']][] = $it;
    }
}

// ── Payments made (for the payments & receipts list) ───────
$payments = [];
if (!empty($invoiceIds)) {
    $payRes = $sb->from('payments')
        ->select('id,invoice_id,amount,method,transaction_ref,paid_at,created_at,receipt_number,status')
        ->in('invoice_id', $invoiceIds)->order('created_at', false)->execute();
    $payments = array_values(array_filter(($payRes['data'] ?? []),
        fn($p) => ($p['status'] ?? 'completed') !== 'cancelled'));
}
$methodLabels = methodLabelMap();

// ── Published report cards ─────────────────────────────────
$rcRes = $sb->from('report_cards')
    ->select('id,term_id,overall_percentage,overall_grade,generated_at,status')
    ->eq('student_id', $childId)->eq('status', 'published')
    ->order('generated_at', false)->execute();
$cards = $rcRes['data'] ?? [];

$classMap = cachedClassMap();
$className = $classMap[$student['current_class_id'] ?? ''] ?? '';
$termMap = [];
foreach (cachedTerms() as $t) $termMap[$t['id']] = $t['name'];

$payNote = trim(schoolSetting('invoice_notes', ''));

// Online payment is available only when the school has configured M-Pesa.
require_once __DIR__ . '/../../includes/mpesa.php';
$mpesaConfigured = (new MpesaApi())->isConfigured();

$statusColors = [
    'paid'      => 'bg-emerald-50 text-emerald-700',
    'partial'   => 'bg-amber-50 text-amber-700',
    'unpaid'    => 'bg-gray-100 text-gray-600',
    'overdue'   => 'bg-red-50 text-red-700',
    'cancelled' => 'bg-gray-100 text-gray-400',
];

require __DIR__ . '/../../includes/portal-top.php';
?>

<?php if ($mpesaConfigured): ?><?= csrfField() ?><?php endif; ?>

<div class="mb-1">
    <h1 class="text-xl font-bold text-gray-900"><?= e($student['first_name'] . ' ' . $student['last_name']) ?></h1>
    <p class="text-sm text-gray-500"><?= e($className ?: 'Class not set') ?><?= !empty($student['admission_number']) ? ' · ' . e($student['admission_number']) : '' ?></p>
</div>

<!-- Fee balance -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mt-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <p class="text-xs text-gray-500">Outstanding fee balance</p>
    <p class="text-2xl font-bold mt-1 <?= $outstanding > 0 ? 'text-red-600' : 'text-emerald-600' ?>">
        <?= $outstanding > 0 ? e(money($outstanding)) : 'Fees cleared' ?>
    </p>
    <?php if ($billedTotal > 0): ?>
        <div class="mt-3 flex gap-6">
            <div>
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Billed</p>
                <p class="text-sm font-semibold text-gray-700"><?= e(money($billedTotal)) ?></p>
            </div>
            <div>
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Paid</p>
                <p class="text-sm font-semibold text-emerald-600"><?= e(money($paidTotal)) ?></p>
            </div>
        </div>
    <?php endif; ?>
    <?php if ($outstanding > 0 && $payNote !== ''): ?>
        <div class="mt-3 pt-3 border-t border-gray-100">
            <p class="text-xs font-semibold text-gray-500 mb-1">How to pay</p>
            <p class="text-xs text-gray-600 whitespace-pre-line"><?= e($payNote) ?></p>
        </div>
    <?php endif; ?>
    <a href="<?= baseUrl('portal/statement?id=' . $childId) ?>" target="_blank"
       class="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        View &amp; print full statement
    </a>
</div>

<!-- Invoices -->
<p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-2">Fee statement</p>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?php if (empty($invoices)): ?>
        <p class="p-5 text-sm text-gray-400 text-center">No invoices yet.</p>
    <?php else: ?>
        <?php foreach ($invoices as $inv): ?>
            <?php
            $bal     = (float)$inv['amount'] - (float)$inv['paid_amount'];
            $status  = $inv['status'] ?? 'unpaid';
            $payable = $bal > 0.005 && !in_array($status, ['paid', 'cancelled']);
            $payAmt  = (string)(int)round($bal);
            ?>
            <?php $lineItems = $itemsByInvoice[$inv['id']] ?? []; $paid = (float)$inv['paid_amount']; ?>
            <div class="px-4 py-3 border-b border-gray-50 last:border-0">
                <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-gray-900 truncate"><?= e($inv['reference'] ?? 'Invoice') ?></p>
                        <p class="text-xs text-gray-400"><?= e(formatDate($inv['created_at'] ?? null)) ?></p>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <p class="text-sm font-semibold text-gray-900"><?= e(money((float)$inv['amount'])) ?></p>
                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium <?= $statusColors[$status] ?? $statusColors['unpaid'] ?>">
                            <?= $bal > 0 && $status !== 'cancelled' ? 'Balance ' . e(money($bal)) : ucfirst($status) ?>
                        </span>
                    </div>
                </div>

                <?php if (!empty($lineItems)): ?>
                    <div class="mt-2.5 rounded-lg bg-gray-50/70 px-3 py-2">
                        <?php foreach ($lineItems as $li): ?>
                            <div class="flex items-center justify-between gap-3 py-0.5">
                                <span class="text-xs text-gray-600 truncate"><?= e($li['description'] ?? 'Fee') ?></span>
                                <span class="text-xs text-gray-700 font-medium flex-shrink-0"><?= e(money((float)$li['amount'])) ?></span>
                            </div>
                        <?php endforeach; ?>
                        <div class="flex items-center justify-between gap-3 mt-1 pt-1.5 border-t border-gray-200/70">
                            <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total</span>
                            <span class="text-xs font-bold text-gray-900"><?= e(money((float)$inv['amount'])) ?></span>
                        </div>
                    </div>
                <?php endif; ?>

                <?php if ($paid > 0.005): ?>
                    <div class="mt-1.5 flex items-center justify-between gap-3 px-1">
                        <span class="text-[11px] text-gray-400">Paid to date</span>
                        <span class="text-[11px] font-medium text-emerald-600"><?= e(money($paid)) ?></span>
                    </div>
                <?php endif; ?>

                <?php if ($payable && $mpesaConfigured): ?>
                    <div class="mt-2 flex justify-end">
                        <button type="button" onclick="togglePay('<?= e($inv['id']) ?>')" class="text-xs font-medium text-emerald-600 hover:text-emerald-800">Pay with M-Pesa</button>
                    </div>
                    <div id="pay-<?= e($inv['id']) ?>" class="hidden mt-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                        <label class="block text-[11px] font-medium text-emerald-800 mb-1">M-Pesa phone number</label>
                        <input type="tel" id="phone-<?= e($inv['id']) ?>" placeholder="0712 345 678" class="w-full px-3 py-2 rounded-lg border border-emerald-300 focus:border-emerald-500 outline-none text-sm bg-white mb-2">
                        <label class="block text-[11px] font-medium text-emerald-800 mb-1">Amount (KES)</label>
                        <input type="number" id="amt-<?= e($inv['id']) ?>" value="<?= e($payAmt) ?>" min="1" max="<?= e($payAmt) ?>" step="1" class="w-full px-3 py-2 rounded-lg border border-emerald-300 focus:border-emerald-500 outline-none text-sm bg-white mb-2">
                        <button type="button" onclick="sendStk('<?= e($inv['id']) ?>')" id="btn-<?= e($inv['id']) ?>" class="w-full px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Send PIN prompt to my phone</button>
                        <div id="res-<?= e($inv['id']) ?>" class="hidden mt-2 p-2 rounded text-xs"></div>
                    </div>
                <?php endif; ?>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>

<!-- Payments & receipts -->
<p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-2">Payments &amp; receipts</p>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?php if (empty($payments)): ?>
        <p class="p-5 text-sm text-gray-400 text-center">No payments recorded yet.</p>
    <?php else: foreach ($payments as $p): ?>
        <a href="<?= baseUrl('portal/receipt?id=' . $p['id']) ?>" target="_blank"
           class="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition">
            <div class="min-w-0">
                <p class="text-sm font-semibold text-emerald-700"><?= e(money((float)$p['amount'])) ?></p>
                <p class="text-xs text-gray-500 truncate">
                    <?= e($methodLabels[$p['method'] ?? ''] ?? ucfirst((string)($p['method'] ?? 'Payment'))) ?>
                    · <?= e(formatDate($p['paid_at'] ?: ($p['created_at'] ?? null))) ?><?= !empty($p['receipt_number']) ? ' · ' . e($p['receipt_number']) : '' ?>
                </p>
            </div>
            <span class="text-xs font-medium text-emerald-600 flex items-center gap-1 flex-shrink-0">
                Receipt
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </span>
        </a>
    <?php endforeach; endif; ?>
</div>

<!-- Report cards -->
<p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-2">Report cards</p>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?php if (empty($cards)): ?>
        <p class="p-5 text-sm text-gray-400 text-center">No report cards have been published yet.</p>
    <?php else: ?>
        <?php foreach ($cards as $rc): ?>
            <a href="<?= baseUrl('portal/report-card?id=' . $rc['id']) ?>"
               class="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition">
                <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-900"><?= e($termMap[$rc['term_id'] ?? ''] ?? 'Term') ?></p>
                    <p class="text-xs text-gray-500"><?= number_format((float)$rc['overall_percentage'], 1) ?>% · <?= e($rc['overall_grade'] ?? '') ?></p>
                </div>
                <svg class="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </a>
        <?php endforeach; ?>
    <?php endif; ?>
</div>

<?php if ($mpesaConfigured): ?>
<script>
function togglePay(id) {
    document.getElementById('pay-' + id).classList.toggle('hidden');
}
function payShowRes(el, ok, msg) {
    el.className = 'mt-2 p-2 rounded text-xs ' + (ok
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'bg-red-50 text-red-700 border border-red-200');
    el.textContent = msg;
    el.classList.remove('hidden');
}
function sendStk(id) {
    const phone  = document.getElementById('phone-' + id).value.trim();
    const amount = parseFloat(document.getElementById('amt-' + id).value) || 0;
    const res    = document.getElementById('res-' + id);
    const btn    = document.getElementById('btn-' + id);
    if (!phone)     { payShowRes(res, false, 'Please enter your M-Pesa phone number.'); return; }
    if (amount <= 0) { payShowRes(res, false, 'Please enter a valid amount.'); return; }

    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Sending prompt...';

    const fd = new FormData();
    fd.append('invoice_id', id);
    fd.append('phone', phone);
    fd.append('amount', amount);
    fd.append('_token', document.querySelector('input[name=_token]').value);

    fetch('<?= baseUrl('api/mpesa/stk-push') ?>', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                payShowRes(res, true, (d.message || 'Prompt sent. Enter your M-Pesa PIN on your phone.') + ' Once you have paid, refresh this page to see the updated balance.');
            } else {
                payShowRes(res, false, d.error || 'Could not send the prompt. Please try again.');
            }
        })
        .catch(() => payShowRes(res, false, 'Network error. Please try again.'))
        .finally(() => { btn.disabled = false; btn.textContent = orig; });
}
</script>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/portal-bottom.php'; ?>
