<?php
/**
 * Income & Expenditure (the school's P&L) — income accounts less expense
 * accounts over a date range = surplus or deficit. Reads the ledger from
 * migration 090. The contra-revenue account (4900 Discounts) nets against
 * income automatically via its debit normal side.
 */
require_once __DIR__ . '/../../includes/ledger.php';

$pageTitle = 'Income & Expenditure';
$sb  = new Supabase();
$sid = schoolId();

$from = trim((string)input('from'));                 // '' = from the beginning
$to   = trim((string)input('to')) ?: date('Y-m-d');

$accounts = ledgerAccounts($sb, $sid);
$balances = ledgerBalances($sb, $sid, $from ?: null, $to);

$income = $expense = [];
$totIncome = $totExpense = 0.0;
foreach ($accounts as $id => $a) {
    if (!in_array($a['type'], ['income', 'expense'], true)) continue;
    $net = ledgerNet($a, $balances[$id] ?? []);
    if (abs($net) < 0.005) continue;
    if ($a['type'] === 'income') { $income[]  = ['name' => $a['name'], 'code' => $a['code'], 'amt' => $net]; $totIncome  += $net; }
    else                         { $expense[] = ['name' => $a['name'], 'code' => $a['code'], 'amt' => $net]; $totExpense += $net; }
}
$surplus = $totIncome - $totExpense;

if (input('export') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="income-expenditure.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['Income & Expenditure', ($from ?: 'beginning') . ' to ' . $to]);
    fputcsv($out, []);
    fputcsv($out, ['INCOME', '']);
    foreach ($income as $r) fputcsv($out, [$r['name'], $r['amt']]);
    fputcsv($out, ['Total income', $totIncome]);
    fputcsv($out, []);
    fputcsv($out, ['EXPENDITURE', '']);
    foreach ($expense as $r) fputcsv($out, [$r['name'], $r['amt']]);
    fputcsv($out, ['Total expenditure', $totExpense]);
    fputcsv($out, []);
    fputcsv($out, [$surplus >= 0 ? 'Surplus' : 'Deficit', abs($surplus)]);
    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';

$section = function (string $title, array $rows, float $total, string $totalCls) {
    ?>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700"><?= e($title) ?></h2></div>
        <table class="w-full text-sm">
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($rows)): ?>
                    <tr><td class="px-5 py-4 text-sm text-gray-400">None in this period.</td></tr>
                <?php else: foreach ($rows as $r): ?>
                    <tr class="hover:bg-gray-50">
                        <td class="px-5 py-2.5 text-gray-700"><span class="text-gray-400 font-mono text-xs mr-2"><?= e($r['code']) ?></span><?= e($r['name']) ?></td>
                        <td class="px-5 py-2.5 text-right tabular-nums text-gray-800"><?= money($r['amt']) ?></td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
            <tfoot>
                <tr class="border-t-2 border-gray-100 font-semibold bg-gray-50/50">
                    <td class="px-5 py-3 text-gray-900"><?= e($title === 'Income' ? 'Total income' : 'Total expenditure') ?></td>
                    <td class="px-5 py-3 text-right tabular-nums <?= $totalCls ?>"><?= money($total) ?></td>
                </tr>
            </tfoot>
        </table>
    </div>
    <?php
};
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Income &amp; Expenditure</h1>
        <p class="text-sm text-gray-500 mt-1"><?= $from ? e(date('j M Y', strtotime($from))) : 'From the beginning' ?> — <span class="font-medium text-gray-600"><?= e(date('j M Y', strtotime($to))) ?></span></p>
    </div>
    <div class="flex items-end gap-2">
        <form method="GET" action="<?= baseUrl('finance/income-statement') ?>" class="flex items-end gap-2">            <label class="text-xs text-gray-500">From<input type="date" name="from" value="<?= e($from) ?>" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg"></label>
            <label class="text-xs text-gray-500">To<input type="date" name="to" value="<?= e($to) ?>" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg"></label>
            <button class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">View</button>
        </form>
        <a href="<?= baseUrl('finance/income-statement') ?>?from=<?= e($from) ?>&amp;to=<?= e($to) ?>&amp;export=csv" download
           class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Export CSV
        </a>
    </div>
</div>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
    <?php $section('Income', $income, $totIncome, 'text-emerald-700'); ?>
    <?php $section('Expenditure', $expense, $totExpense, 'text-red-600'); ?>
</div>

<div class="mt-4 rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-white bg-gradient-to-br <?= $surplus >= 0 ? 'from-emerald-500 to-teal-600' : 'from-red-500 to-rose-600' ?>">
    <div class="flex items-center justify-between">
        <div>
            <p class="text-sm opacity-80"><?= $surplus >= 0 ? 'Net Surplus' : 'Net Deficit' ?></p>
            <p class="text-3xl font-bold mt-1"><?= money(abs($surplus)) ?></p>
        </div>
        <p class="text-sm opacity-80">Income <?= money($totIncome) ?> − Expenditure <?= money($totExpense) ?></p>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
