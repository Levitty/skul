<?php
/**
 * Expense Report — where the money went over a period.
 *
 * Defaults to the current month. Summary tiles, spend by category (with the
 * dashboard's palette), by payment method, by day, top suppliers, and the
 * full listing underneath — the page a head or an accountant prints at
 * month end. CSV export carries the summary and the listing.
 */
$pageTitle = 'Expense Report';
$sb  = new Supabase();
$sid = schoolId();

$palette = ['#8b5cf6', '#14b8a6', '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899'];
$titleCase = function (string $n): string {
    $n = trim($n);
    if ($n === '' || preg_match('/[a-z]/', $n)) return $n;
    $t = mb_convert_case(mb_strtolower($n), MB_CASE_TITLE);
    return preg_replace_callback('/\(([^)]{2,6})\)/', fn($m) => '(' . mb_strtoupper($m[1]) . ')', $t);
};

$from = trim((string)input('from'));
$to   = trim((string)input('to'));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) $from = date('Y-m-01');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $to))   $to   = date('Y-m-d');
if ($from > $to) { [$from, $to] = [$to, $from]; }

$categories = $sb->from('expense_categories')->select('id,name')->eq('school_id', $sid)->order('name')->execute()['data'] ?? [];
$catMap = []; $catColor = [];
foreach ($categories as $i => $c) { $catMap[$c['id']] = $titleCase($c['name']); $catColor[$c['id']] = $palette[$i % count($palette)]; }

$rows = Supabase::fetchAllPaged(fn($q) => $q->from('expenses')
    ->select('id,category_id,amount,description,expense_date,invoice_number,vendor_name,payment_method')
    ->eq('school_id', $sid)->gte('expense_date', $from)->lte('expense_date', $to)
    ->order('expense_date')->order('created_at'));

$methodLabels = methodLabelMap();
$methodName = fn(string $code): string => $methodLabels[$code] ?? ucfirst(str_replace('_', ' ', $code));

$total = 0.0; $byCat = []; $byMethod = []; $byDay = []; $byVendor = []; $largest = null; $noRef = 0;
foreach ($rows as $r) {
    $amt = (float)($r['amount'] ?? 0);
    $total += $amt;
    $cid = $r['category_id'] ?? '_none';
    $byCat[$cid] = ['amt' => ($byCat[$cid]['amt'] ?? 0) + $amt, 'n' => ($byCat[$cid]['n'] ?? 0) + 1];
    $m = (string)($r['payment_method'] ?? 'cash');
    $byMethod[$m] = ['amt' => ($byMethod[$m]['amt'] ?? 0) + $amt, 'n' => ($byMethod[$m]['n'] ?? 0) + 1];
    $d = (string)($r['expense_date'] ?? '');
    $byDay[$d] = ['amt' => ($byDay[$d]['amt'] ?? 0) + $amt, 'n' => ($byDay[$d]['n'] ?? 0) + 1];
    $v = trim((string)($r['vendor_name'] ?? ''));
    if ($v !== '') $byVendor[$v] = ['amt' => ($byVendor[$v]['amt'] ?? 0) + $amt, 'n' => ($byVendor[$v]['n'] ?? 0) + 1];
    if ($largest === null || $amt > (float)$largest['amount']) $largest = $r;
    if (trim((string)($r['invoice_number'] ?? '')) === '') $noRef++;
}
uasort($byCat, fn($a, $b) => $b['amt'] <=> $a['amt']);
uasort($byMethod, fn($a, $b) => $b['amt'] <=> $a['amt']);
uasort($byVendor, fn($a, $b) => $b['amt'] <=> $a['amt']);
ksort($byDay);
$count  = count($rows);
$days   = max(1, (int)((strtotime($to) - strtotime($from)) / 86400) + 1);
$avgDay = $total / $days;
$maxCat = $byCat ? max(array_column($byCat, 'amt')) : 0.0;
$maxDay = $byDay ? max(array_column($byDay, 'amt')) : 0.0;

// Same span, one period earlier — for the comparison line.
$spanDays  = $days;
$prevTo    = date('Y-m-d', strtotime($from . ' -1 day'));
$prevFrom  = date('Y-m-d', strtotime($prevTo . ' -' . ($spanDays - 1) . ' days'));
$prevRows  = $sb->from('expenses')->select('amount')->eq('school_id', $sid)
    ->gte('expense_date', $prevFrom)->lte('expense_date', $prevTo)->limit(10000)->execute()['data'] ?? [];
$prevTotal = array_sum(array_map(fn($x) => (float)($x['amount'] ?? 0), $prevRows));

$school = cachedSchool();
$periodLabel = ($from === date('Y-m-01', strtotime($from)) && $to === date('Y-m-t', strtotime($from)))
    ? date('F Y', strtotime($from))
    : date('j M Y', strtotime($from)) . ' – ' . date('j M Y', strtotime($to));

if (input('export') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="expenses_' . $from . '_to_' . $to . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, [($school['name'] ?? 'School') . ' — Expense Report', $periodLabel]);
    fputcsv($out, []);
    fputcsv($out, ['BY CATEGORY', 'Entries', 'Amount', '% of total']);
    foreach ($byCat as $cid => $st) fputcsv($out, [$catMap[$cid] ?? 'Uncategorised', $st['n'], number_format($st['amt'], 2, '.', ''), $total > 0 ? number_format($st['amt'] / $total * 100, 1) : '0']);
    fputcsv($out, ['Total', $count, number_format($total, 2, '.', ''), '100']);
    fputcsv($out, []);
    fputcsv($out, ['BY METHOD', 'Entries', 'Amount']);
    foreach ($byMethod as $m => $st) fputcsv($out, [$methodName((string)$m), $st['n'], number_format($st['amt'], 2, '.', '')]);
    fputcsv($out, []);
    fputcsv($out, ['LISTING']);
    fputcsv($out, ['Date', 'Description', 'Category', 'Supplier', 'Method', 'Reference', 'Amount']);
    foreach ($rows as $r) {
        fputcsv($out, [$r['expense_date'] ?? '', $r['description'] ?? '', $catMap[$r['category_id'] ?? ''] ?? 'Uncategorised',
            $r['vendor_name'] ?? '', $methodName((string)($r['payment_method'] ?? '')), $r['invoice_number'] ?? '',
            number_format((float)($r['amount'] ?? 0), 2, '.', '')]);
    }
    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';
$rangeQs = 'from=' . e($from) . '&amp;to=' . e($to);
?>

<style>
@media print {
    aside, nav, header, .no-print { display: none !important; }
    main, .main, body { background: #fff !important; }
    .print-full { max-width: 100% !important; }
    .rpt-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; page-break-inside: avoid; }
}
</style>

<div class="flex items-start justify-between mb-5 gap-4 flex-wrap">
    <div>
        <a href="<?= baseUrl('finance/expenses') ?>?month=<?= e(substr($from, 0, 7)) ?>" class="no-print text-sm text-gray-500 hover:text-emerald-600">&larr; Expenses</a>
        <h1 class="text-2xl font-bold text-gray-900 mt-1">Expense Report</h1>
        <p class="text-sm text-gray-500 mt-1"><?= e($school['name'] ?? '') ?> · <span class="font-medium text-gray-700"><?= e($periodLabel) ?></span></p>
    </div>
    <div class="no-print flex items-end gap-2 flex-wrap">
        <form method="GET" action="<?= baseUrl('finance/expense-report') ?>" class="flex items-end gap-2">
            <label class="text-xs text-gray-500">From<input type="date" name="from" value="<?= e($from) ?>" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg"></label>
            <label class="text-xs text-gray-500">To<input type="date" name="to" value="<?= e($to) ?>" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg"></label>
            <button class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">View</button>
        </form>
        <div class="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            <?php $tm = date('Y-m'); $lm = date('Y-m', strtotime('-1 month')); ?>
            <a href="<?= baseUrl('finance/expense-report') ?>?from=<?= $tm ?>-01&amp;to=<?= date('Y-m-t') ?>" class="px-3 py-1.5 text-sm rounded-md text-gray-600 hover:bg-gray-50">This month</a>
            <a href="<?= baseUrl('finance/expense-report') ?>?from=<?= $lm ?>-01&amp;to=<?= date('Y-m-t', strtotime($lm . '-01')) ?>" class="px-3 py-1.5 text-sm rounded-md text-gray-600 hover:bg-gray-50">Last month</a>
            <a href="<?= baseUrl('finance/expense-report') ?>?from=<?= date('Y') ?>-01-01&amp;to=<?= date('Y-m-d') ?>" class="px-3 py-1.5 text-sm rounded-md text-gray-600 hover:bg-gray-50">This year</a>
        </div>
        <a href="<?= baseUrl('finance/expense-report') ?>?<?= $rangeQs ?>&amp;export=csv" download class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Export CSV</a>
        <button type="button" onclick="window.print()" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Print</button>
    </div>
</div>

<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <?php $tiles = [
        ['bg-violet-500', money($total), 'Total spent' . ($prevTotal > 0 ? ' · ' . ($total >= $prevTotal ? '▲' : '▼') . ' ' . number_format(abs($total - $prevTotal) / $prevTotal * 100, 0) . '% vs prior ' . $spanDays . ' days' : '')],
        ['bg-teal-500',   number_format($count), 'Entries · ' . money($avgDay) . ' a day'],
        ['bg-rose-500',   $largest ? money((float)$largest['amount']) : '—', 'Largest' . ($largest ? ' · ' . mb_strimwidth((string)$largest['description'], 0, 28, '…') : '')],
        ['bg-amber-500',  number_format($noRef), 'Without a reference'],
    ];
    foreach ($tiles as [$bg, $val, $lbl]): ?>
    <div class="rpt-card bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl <?= $bg ?> flex items-center justify-center flex-shrink-0"><span class="w-2.5 h-2.5 rounded-full bg-white/90"></span></div>
        <div class="min-w-0">
            <p class="text-lg font-bold text-gray-900 leading-tight tabular-nums truncate"><?= e($val) ?></p>
            <p class="text-xs text-gray-500 mt-0.5 truncate"><?= e($lbl) ?></p>
        </div>
    </div>
    <?php endforeach; ?>
</div>

<?php if ($count === 0): ?>
<div class="rpt-card bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-400 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">No expenses recorded between <?= e(date('j M Y', strtotime($from))) ?> and <?= e(date('j M Y', strtotime($to))) ?>.</div>
<?php else: ?>

<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 mb-4 items-start">
    <div class="rpt-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">By category</h2></div>
        <table class="w-full text-sm">
            <thead><tr class="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="text-left px-5 py-2 font-medium">Category</th><th class="text-right px-3 py-2 font-medium">Entries</th><th class="text-right px-3 py-2 font-medium">Amount</th><th class="text-right px-5 py-2 font-medium w-40">Share</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($byCat as $cid => $st): $col = $catColor[$cid] ?? '#9ca3af'; $pct = $total > 0 ? $st['amt'] / $total * 100 : 0; ?>
                <tr>
                    <td class="px-5 py-2.5 text-gray-800"><span class="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style="background:<?= e($col) ?>"></span><?= e($catMap[$cid] ?? 'Uncategorised') ?></td>
                    <td class="px-3 py-2.5 text-right text-gray-500 tabular-nums"><?= (int)$st['n'] ?></td>
                    <td class="px-3 py-2.5 text-right font-medium text-gray-900 tabular-nums"><?= money($st['amt']) ?></td>
                    <td class="px-5 py-2.5"><div class="flex items-center gap-2 justify-end"><div class="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full" style="width:<?= $maxCat > 0 ? (int)($st['amt'] / $maxCat * 100) : 0 ?>%;background:<?= e($col) ?>"></div></div><span class="text-xs text-gray-500 tabular-nums w-10 text-right"><?= number_format($pct, 0) ?>%</span></div></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
            <tfoot><tr class="border-t-2 border-gray-100 font-semibold bg-gray-50/50"><td class="px-5 py-2.5 text-gray-900">Total</td><td class="px-3 py-2.5 text-right tabular-nums"><?= $count ?></td><td class="px-3 py-2.5 text-right tabular-nums text-gray-900"><?= money($total) ?></td><td></td></tr></tfoot>
        </table>
    </div>

    <div class="space-y-4">
        <div class="rpt-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">By payment method</h2></div>
            <table class="w-full text-sm"><tbody class="divide-y divide-gray-50">
                <?php $mi = 0; foreach ($byMethod as $m => $st): ?>
                <tr><td class="px-5 py-2.5 text-gray-800"><span class="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style="background:<?= e($palette[$mi++ % count($palette)]) ?>"></span><?= e($methodName((string)$m)) ?> <span class="text-gray-400 text-xs">· <?= (int)$st['n'] ?></span></td>
                    <td class="px-5 py-2.5 text-right font-medium text-gray-900 tabular-nums"><?= money($st['amt']) ?></td></tr>
                <?php endforeach; ?>
            </tbody></table>
        </div>
        <?php if (!empty($byVendor)): ?>
        <div class="rpt-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Top suppliers</h2></div>
            <table class="w-full text-sm"><tbody class="divide-y divide-gray-50">
                <?php foreach (array_slice($byVendor, 0, 8, true) as $v => $st): ?>
                <tr><td class="px-5 py-2.5 text-gray-800 truncate max-w-[14rem]"><?= e($v) ?> <span class="text-gray-400 text-xs">· <?= (int)$st['n'] ?></span></td>
                    <td class="px-5 py-2.5 text-right font-medium text-gray-900 tabular-nums"><?= money($st['amt']) ?></td></tr>
                <?php endforeach; ?>
            </tbody></table>
        </div>
        <?php endif; ?>
    </div>
</div>

<div class="rpt-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
    <div class="px-5 py-3 border-b border-gray-100 flex items-baseline justify-between"><h2 class="text-sm font-semibold text-gray-700">By day</h2><span class="text-xs text-gray-400"><?= count($byDay) ?> days with spend</span></div>
    <div class="px-5 py-4 flex items-end gap-1 overflow-x-auto" style="height:120px">
        <?php foreach ($byDay as $d => $st): $h = $maxDay > 0 ? max(4, (int)($st['amt'] / $maxDay * 88)) : 4; ?>
            <div class="flex flex-col items-center justify-end flex-none" style="width:22px;height:100%" title="<?= e(date('D j M', strtotime($d))) ?> · <?= e(money($st['amt'])) ?> · <?= (int)$st['n'] ?> entries">
                <div class="w-3.5 rounded-t" style="height:<?= $h ?>px;background:#8b5cf6"></div>
                <span class="text-[9px] text-gray-400 mt-1 tabular-nums"><?= e(date('j', strtotime($d))) ?></span>
            </div>
        <?php endforeach; ?>
    </div>
</div>

<div class="rpt-card bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Listing</h2></div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead><tr class="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="text-left px-5 py-2 font-medium">Date</th><th class="text-left px-3 py-2 font-medium">Description</th><th class="text-left px-3 py-2 font-medium">Category</th><th class="text-left px-3 py-2 font-medium">Method · Ref</th><th class="text-right px-5 py-2 font-medium">Amount</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($rows as $r): $cid = $r['category_id'] ?? ''; $col = $catColor[$cid] ?? '#9ca3af'; ?>
                <tr>
                    <td class="px-5 py-2 text-gray-500 whitespace-nowrap tabular-nums"><?= e(date('j M', strtotime((string)$r['expense_date']))) ?></td>
                    <td class="px-3 py-2 text-gray-900"><?= e($r['description'] ?? '') ?><?= trim((string)($r['vendor_name'] ?? '')) !== '' ? ' <span class="text-gray-400">· ' . e($r['vendor_name']) . '</span>' : '' ?></td>
                    <td class="px-3 py-2"><span class="inline-block text-[11.5px] font-medium rounded-md px-2 py-0.5 whitespace-nowrap" style="color:<?= e($col) ?>;background:<?= e($col) ?>18"><?= e($catMap[$cid] ?? 'Uncategorised') ?></span></td>
                    <td class="px-3 py-2 text-xs text-gray-600 whitespace-nowrap"><?= e($methodName((string)($r['payment_method'] ?? ''))) ?><?= trim((string)($r['invoice_number'] ?? '')) !== '' ? ' <span class="font-mono text-gray-500">' . e($r['invoice_number']) . '</span>' : '' ?></td>
                    <td class="px-5 py-2 text-right font-medium text-gray-900 tabular-nums"><?= money((float)($r['amount'] ?? 0)) ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
            <tfoot><tr class="border-t-2 border-gray-100 font-semibold bg-gray-50/50"><td colspan="4" class="px-5 py-2.5 text-gray-900">Total · <?= $count ?> entries</td><td class="px-5 py-2.5 text-right tabular-nums text-gray-900"><?= money($total) ?></td></tr></tfoot>
        </table>
    </div>
</div>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
