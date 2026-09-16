<?php
/**
 * Accountant Pack — a clean, period-scoped financial summary a non-accountant
 * front office can hand to the school's annual auditor / external accountant.
 *
 * Cash basis (what schools actually run on): income = money RECEIVED in the
 * period (fee payments + other income), expenditure = expenses in the period,
 * and the difference is the surplus/deficit. Plus receipts-by-method, income
 * and expense breakdowns, and the fee/debtors position.
 *
 * On-screen + Print/Save-as-PDF + a single combined CSV. Default period is the
 * current academic year; quick presets switch between years.
 */
$pageTitle = 'Accountant Pack';
$sb  = new Supabase();
$sid = schoolId();

// ── Period ───────────────────────────────────────────────────────
$years = $sb->from('academic_years')->select('id,name,start_date,end_date,is_current')
    ->eq('school_id', $sid)->order('start_date', false)->execute()['data'] ?? [];
$currentYear = null;
foreach ($years as $y) { if (!empty($y['is_current'])) { $currentYear = $y; break; } }

$defFrom = $currentYear['start_date'] ?? (date('Y') . '-01-01');
$defTo   = $currentYear['end_date']   ?? date('Y-m-d');
$from = trim((string)input('from')) ?: $defFrom;
$to   = trim((string)input('to'))   ?: $defTo;
// Guard against reversed range.
if ($from > $to) { $tmp = $from; $from = $to; $to = $tmp; }
$toInclusive = $to . 'T23:59:59';

$school     = cachedSchool() ?? [];
$schoolName = $school['name'] ?? APP_NAME;
$kraPin     = (string) schoolSetting('kra_pin', '');

// ── Money received (cash basis) ──────────────────────────────────
// Completed payments in the period. credit_balance is student credit applied,
// not new cash, so it's reported separately and excluded from cash income.
$payments = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('payments')->select('amount,method,payment_date,status')
        ->eq('school_id', $sid)->eq('status', 'completed')
        ->gte('payment_date', $from)->lte('payment_date', $to)
);
$receiptsByMethod = [];
$feesReceived = 0.0; $creditApplied = 0.0;
foreach ($payments as $p) {
    $m = $p['method'] ?: 'other';
    $amt = (float)($p['amount'] ?? 0);
    $receiptsByMethod[$m] = ($receiptsByMethod[$m] ?? 0) + $amt;
    if ($m === 'credit_balance') $creditApplied += $amt; else $feesReceived += $amt;
}
arsort($receiptsByMethod);

// ── Other income ─────────────────────────────────────────────────
$incomeRows = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('income')->select('amount,category_id,date')->eq('school_id', $sid)
        ->gte('date', $from)->lte('date', $to)
);
$incomeCats = $sb->from('income_categories')->select('id,name')->eq('school_id', $sid)->execute()['data'] ?? [];
$incCatMap = []; foreach ($incomeCats as $c) $incCatMap[$c['id']] = $c['name'];
$incomeByCat = []; $otherIncome = 0.0;
foreach ($incomeRows as $r) {
    $k = $r['category_id'] ?? '_none';
    $amt = (float)($r['amount'] ?? 0);
    $incomeByCat[$k] = ($incomeByCat[$k] ?? 0) + $amt;
    $otherIncome += $amt;
}

// ── Expenditure ──────────────────────────────────────────────────
$expenseRows = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('expenses')->select('amount,category_id,date')->eq('school_id', $sid)
        ->gte('date', $from)->lte('date', $to)
);
$expenseCats = $sb->from('expense_categories')->select('id,name')->eq('school_id', $sid)->execute()['data'] ?? [];
$expCatMap = []; foreach ($expenseCats as $c) $expCatMap[$c['id']] = $c['name'];
$expenseByCat = []; $totalExpenditure = 0.0;
foreach ($expenseRows as $r) {
    $k = $r['category_id'] ?? '_none';
    $amt = (float)($r['amount'] ?? 0);
    $expenseByCat[$k] = ($expenseByCat[$k] ?? 0) + $amt;
    $totalExpenditure += $amt;
}
arsort($expenseByCat);

$totalIncome = $feesReceived + $otherIncome;
$surplus     = $totalIncome - $totalExpenditure;

// ── Fee position ─────────────────────────────────────────────────
// Invoiced in the period (accrual context).
$invoicedRows = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('invoices')->select('amount,status,created_at')->eq('school_id', $sid)
        ->gte('created_at', $from)->lte('created_at', $toInclusive)
);
$invoicedInPeriod = 0.0;
foreach ($invoicedRows as $inv) {
    if (in_array($inv['status'] ?? '', ['draft', 'cancelled'], true)) continue;
    $invoicedInPeriod += (float)($inv['amount'] ?? 0);
}
// Outstanding as a snapshot (all-time). Excludes draft/cancelled AND
// carried_forward — a carried_forward balance has been rolled into a newer
// invoice, so counting it here would double-count arrears (audit R1).
$openInv = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('invoices')->select('amount,paid_amount,status')->eq('school_id', $sid)
);
$outstanding = 0.0; $debtorInvoices = 0;
foreach ($openInv as $inv) {
    if (in_array($inv['status'] ?? '', ['draft', 'cancelled', 'carried_forward'], true)) continue;
    $bal = (float)($inv['amount'] ?? 0) - (float)($inv['paid_amount'] ?? 0);
    if ($bal > 0.01) { $outstanding += $bal; $debtorInvoices++; }
}

$methodLabels = methodLabelMap();
$catName = fn($map, $k) => $k === '_none' ? 'Uncategorized' : ($map[$k] ?? 'Unknown');

// ── CSV export (before any HTML) ─────────────────────────────────
if (input('export') === 'csv') {
    $safe = fn($s) => preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string)$s, ' -'));
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="accountant_pack_' . $safe($schoolName) . '_' . $from . '_to_' . $to . '.csv"');
    header('Cache-Control: no-store');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    $n = fn($v) => number_format((float)$v, 2, '.', '');

    fputcsv($out, [$schoolName . ' — Accountant Pack']);
    if ($kraPin) fputcsv($out, ['KRA PIN', $kraPin]);
    fputcsv($out, ['Period', $from . ' to ' . $to]);
    fputcsv($out, ['Generated', date('Y-m-d H:i')]);
    fputcsv($out, ['Basis', 'Cash (money received vs money spent)']);
    fputcsv($out, []);
    fputcsv($out, ['INCOME & EXPENDITURE']);
    fputcsv($out, ['Fees received (cash)', $n($feesReceived)]);
    fputcsv($out, ['Other income', $n($otherIncome)]);
    fputcsv($out, ['Total income', $n($totalIncome)]);
    fputcsv($out, ['Total expenditure', $n($totalExpenditure)]);
    fputcsv($out, ['Surplus/(Deficit)', $n($surplus)]);
    fputcsv($out, []);
    fputcsv($out, ['RECEIPTS BY METHOD']);
    foreach ($receiptsByMethod as $m => $amt) fputcsv($out, [$methodLabels[$m] ?? ucfirst((string)$m), $n($amt)]);
    fputcsv($out, []);
    fputcsv($out, ['OTHER INCOME BY CATEGORY']);
    foreach ($incomeByCat as $k => $amt) fputcsv($out, [$catName($incCatMap, $k), $n($amt)]);
    fputcsv($out, []);
    fputcsv($out, ['EXPENDITURE BY CATEGORY']);
    foreach ($expenseByCat as $k => $amt) fputcsv($out, [$catName($expCatMap, $k), $n($amt)]);
    fputcsv($out, []);
    fputcsv($out, ['FEE POSITION']);
    fputcsv($out, ['Invoiced in period', $n($invoicedInPeriod)]);
    fputcsv($out, ['Fees received in period', $n($feesReceived)]);
    fputcsv($out, ['Total outstanding (as at ' . $to . ')', $n($outstanding)]);
    fputcsv($out, ['Student credit applied (non-cash)', $n($creditApplied)]);
    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';
?>
<style>
@media print {
    #sidebar, #sidebarOverlay, .no-print { display: none !important; }
    main { margin: 0 !important; padding: 0 !important; }
    body { background: #fff !important; }
}
.pack-card { break-inside: avoid; }
</style>

<!-- Controls (hidden when printing) -->
<div class="no-print mb-6">
    <div class="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">Accountant Pack</h1>
            <p class="text-sm text-gray-500 mt-1">A clean financial summary for your accountant or auditor. Pick a period, then print or export.</p>
        </div>
        <div class="flex gap-2">
            <a href="<?= baseUrl('finance/accountant-pack') ?>?export=csv&from=<?= urlencode($from) ?>&to=<?= urlencode($to) ?>" download
               class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Export CSV</a>
            <button type="button" onclick="window.print()" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Print / Save PDF</button>
        </div>
    </div>
    <form method="GET" action="<?= baseUrl('finance/accountant-pack') ?>" class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-wrap items-end gap-4">
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" name="from" value="<?= e($from) ?>" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" name="to" value="<?= e($to) ?>" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
        </div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Apply</button>
        <?php if (!empty($years)): ?>
        <div class="flex items-end gap-1.5 flex-wrap">
            <span class="text-xs text-gray-400 mb-2">Years:</span>
            <?php foreach (array_slice($years, 0, 5) as $y): if (empty($y['start_date'])) continue; ?>
                <a href="<?= baseUrl('finance/accountant-pack') ?>?from=<?= urlencode($y['start_date']) ?>&to=<?= urlencode($y['end_date'] ?? date('Y-m-d')) ?>"
                   class="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"><?= e($y['name']) ?></a>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </form>
</div>

<!-- The pack itself -->
<div class="max-w-3xl">
    <div class="mb-6">
        <h2 class="text-xl font-bold text-gray-900"><?= e($schoolName) ?></h2>
        <p class="text-sm text-gray-600">Financial Summary — <?= e(date('j M Y', strtotime($from))) ?> to <?= e(date('j M Y', strtotime($to))) ?></p>
        <p class="text-xs text-gray-400 mt-0.5">
            Cash basis · Generated <?= date('j M Y') ?>
            <?php if ($kraPin): ?> · KRA PIN <?= e($kraPin) ?><?php endif; ?>
        </p>
    </div>

    <!-- Income & Expenditure -->
    <div class="pack-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-4">
        <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Income &amp; Expenditure</h3>
        <table class="w-full text-sm">
            <tbody class="divide-y divide-gray-50">
                <tr><td class="py-2 text-gray-600">Fees received (cash)</td><td class="py-2 text-right font-medium text-gray-900"><?= money($feesReceived) ?></td></tr>
                <tr><td class="py-2 text-gray-600">Other income</td><td class="py-2 text-right font-medium text-gray-900"><?= money($otherIncome) ?></td></tr>
                <tr><td class="py-2 font-semibold text-gray-800">Total income</td><td class="py-2 text-right font-bold text-emerald-700"><?= money($totalIncome) ?></td></tr>
                <tr><td class="py-2 text-gray-600">Total expenditure</td><td class="py-2 text-right font-medium text-red-600">(<?= money($totalExpenditure) ?>)</td></tr>
            </tbody>
            <tfoot>
                <tr class="border-t-2 border-gray-200"><td class="py-2.5 font-bold text-gray-900"><?= $surplus >= 0 ? 'Surplus' : 'Deficit' ?></td><td class="py-2.5 text-right font-bold text-base <?= $surplus >= 0 ? 'text-emerald-700' : 'text-red-600' ?>"><?= money(abs($surplus)) ?></td></tr>
            </tfoot>
        </table>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <!-- Receipts by method -->
        <div class="pack-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Receipts by Method</h3>
            <table class="w-full text-sm"><tbody class="divide-y divide-gray-50">
                <?php if (empty($receiptsByMethod)): ?><tr><td class="py-2 text-gray-400">No receipts in period</td></tr><?php endif; ?>
                <?php foreach ($receiptsByMethod as $m => $amt): ?>
                    <tr><td class="py-2 text-gray-600"><?= e($methodLabels[$m] ?? ucfirst((string)$m)) ?></td><td class="py-2 text-right font-medium text-gray-900"><?= money($amt) ?></td></tr>
                <?php endforeach; ?>
            </tbody></table>
        </div>
        <!-- Other income by category -->
        <div class="pack-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Other Income by Category</h3>
            <table class="w-full text-sm"><tbody class="divide-y divide-gray-50">
                <?php if (empty($incomeByCat)): ?><tr><td class="py-2 text-gray-400">No other income in period</td></tr><?php endif; ?>
                <?php foreach ($incomeByCat as $k => $amt): ?>
                    <tr><td class="py-2 text-gray-600"><?= e($catName($incCatMap, $k)) ?></td><td class="py-2 text-right font-medium text-gray-900"><?= money($amt) ?></td></tr>
                <?php endforeach; ?>
            </tbody></table>
        </div>
    </div>

    <!-- Expenditure by category -->
    <div class="pack-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-4">
        <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Expenditure by Category</h3>
        <table class="w-full text-sm"><tbody class="divide-y divide-gray-50">
            <?php if (empty($expenseByCat)): ?><tr><td class="py-2 text-gray-400">No expenses in period</td></tr><?php endif; ?>
            <?php foreach ($expenseByCat as $k => $amt): ?>
                <tr><td class="py-2 text-gray-600"><?= e($catName($expCatMap, $k)) ?></td><td class="py-2 text-right font-medium text-gray-900"><?= money($amt) ?></td></tr>
            <?php endforeach; ?>
        </tbody>
        <?php if (!empty($expenseByCat)): ?><tfoot><tr class="border-t border-gray-200"><td class="py-2 font-bold text-gray-800">Total</td><td class="py-2 text-right font-bold text-gray-900"><?= money($totalExpenditure) ?></td></tr></tfoot><?php endif; ?>
        </table>
    </div>

    <!-- Fee position -->
    <div class="pack-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-4">
        <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Fee Position</h3>
        <table class="w-full text-sm"><tbody class="divide-y divide-gray-50">
            <tr><td class="py-2 text-gray-600">Invoiced in period</td><td class="py-2 text-right font-medium text-gray-900"><?= money($invoicedInPeriod) ?></td></tr>
            <tr><td class="py-2 text-gray-600">Fees received in period</td><td class="py-2 text-right font-medium text-emerald-700"><?= money($feesReceived) ?></td></tr>
            <tr><td class="py-2 text-gray-600">Total outstanding <span class="text-gray-400">(as at <?= e(date('j M Y', strtotime($to))) ?>, <?= (int)$debtorInvoices ?> invoices)</span></td><td class="py-2 text-right font-medium text-amber-700"><?= money($outstanding) ?></td></tr>
            <?php if ($creditApplied > 0): ?><tr><td class="py-2 text-gray-500 text-xs">Student credit applied (non-cash)</td><td class="py-2 text-right text-gray-500 text-xs"><?= money($creditApplied) ?></td></tr><?php endif; ?>
        </tbody></table>
    </div>

    <p class="text-xs text-gray-400 no-print">Cash basis: income is money actually received in the period; student credit applied is shown separately as it isn't new cash. Outstanding is a current snapshot. For management use / to hand to your accountant — not audited financial statements.</p>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
