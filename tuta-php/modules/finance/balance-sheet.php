<?php
/**
 * Balance Sheet — assets = liabilities + equity, as of a date. Reads the
 * ledger from migration 090.
 *
 * We don't run a formal year-end close yet (that's Phase 5), so the
 * accumulated surplus/deficit — all income less all expense to date — is
 * shown as a line within Equity. With that line, the sheet always balances,
 * because every journal entry balances (Assets = Liabilities + Equity +
 * (Income − Expense)).
 */
require_once __DIR__ . '/../../includes/ledger.php';

$pageTitle = 'Balance Sheet';
$sb  = new Supabase();
$sid = schoolId();

$asOf = trim((string)input('as_of')) ?: date('Y-m-d');

$accounts = ledgerAccounts($sb, $sid);
$balances = ledgerBalances($sb, $sid, null, $asOf);

$assets = $liabilities = $equity = [];
$totAssets = $totLiab = $totEquityAccts = 0.0;
$totIncome = $totExpense = 0.0;
foreach ($accounts as $id => $a) {
    $net = ledgerNet($a, $balances[$id] ?? []);
    switch ($a['type']) {
        case 'asset':
            if (abs($net) >= 0.005) { $assets[] = ['name' => $a['name'], 'code' => $a['code'], 'amt' => $net]; $totAssets += $net; }
            break;
        case 'liability':
            if (abs($net) >= 0.005) { $liabilities[] = ['name' => $a['name'], 'code' => $a['code'], 'amt' => $net]; $totLiab += $net; }
            break;
        case 'equity':
            if (abs($net) >= 0.005) { $equity[] = ['name' => $a['name'], 'code' => $a['code'], 'amt' => $net]; $totEquityAccts += $net; }
            break;
        case 'income':  $totIncome  += $net; break;
        case 'expense': $totExpense += $net; break;
    }
}
$surplus     = $totIncome - $totExpense;             // accumulated result to date
$totEquity   = $totEquityAccts + $surplus;
$totLiabEq   = $totLiab + $totEquity;
$balanced    = abs($totAssets - $totLiabEq) < 0.01;

if (input('export') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="balance-sheet-' . $asOf . '.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['Balance Sheet as of', $asOf]);
    fputcsv($out, []);
    fputcsv($out, ['ASSETS', '']);
    foreach ($assets as $r) fputcsv($out, [$r['name'], $r['amt']]);
    fputcsv($out, ['Total assets', $totAssets]);
    fputcsv($out, []);
    fputcsv($out, ['LIABILITIES', '']);
    foreach ($liabilities as $r) fputcsv($out, [$r['name'], $r['amt']]);
    fputcsv($out, ['Total liabilities', $totLiab]);
    fputcsv($out, []);
    fputcsv($out, ['EQUITY', '']);
    foreach ($equity as $r) fputcsv($out, [$r['name'], $r['amt']]);
    fputcsv($out, ['Accumulated surplus/(deficit)', $surplus]);
    fputcsv($out, ['Total equity', $totEquity]);
    fputcsv($out, []);
    fputcsv($out, ['Total liabilities + equity', $totLiabEq]);
    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';

$panel = function (string $title, array $rows, float $total, ?array $extra = null) {
    ?>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700"><?= e($title) ?></h2></div>
        <table class="w-full text-sm">
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($rows as $r): ?>
                    <tr class="hover:bg-gray-50">
                        <td class="px-5 py-2.5 text-gray-700"><span class="text-gray-400 font-mono text-xs mr-2"><?= e($r['code']) ?></span><?= e($r['name']) ?></td>
                        <td class="px-5 py-2.5 text-right tabular-nums text-gray-800"><?= money($r['amt']) ?></td>
                    </tr>
                <?php endforeach; ?>
                <?php if ($extra): ?>
                    <tr class="hover:bg-gray-50">
                        <td class="px-5 py-2.5 text-gray-700 italic"><?= e($extra['name']) ?></td>
                        <td class="px-5 py-2.5 text-right tabular-nums <?= $extra['amt'] >= 0 ? 'text-gray-800' : 'text-red-600' ?>"><?= money($extra['amt']) ?></td>
                    </tr>
                <?php endif; ?>
                <?php if (empty($rows) && !$extra): ?>
                    <tr><td class="px-5 py-4 text-sm text-gray-400">None.</td></tr>
                <?php endif; ?>
            </tbody>
            <tfoot>
                <tr class="border-t-2 border-gray-100 font-semibold bg-gray-50/50">
                    <td class="px-5 py-3 text-gray-900">Total <?= e(strtolower($title)) ?></td>
                    <td class="px-5 py-3 text-right tabular-nums text-gray-900"><?= money($total) ?></td>
                </tr>
            </tfoot>
        </table>
    </div>
    <?php
};
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Balance Sheet</h1>
        <p class="text-sm text-gray-500 mt-1">Financial position as of <span class="font-medium text-gray-600"><?= e(date('j M Y', strtotime($asOf))) ?></span></p>
    </div>
    <div class="flex items-end gap-2">
        <form method="GET" action="<?= baseUrl('finance/balance-sheet') ?>" class="flex items-end gap-2">            <label class="text-xs text-gray-500">As of<input type="date" name="as_of" value="<?= e($asOf) ?>" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg"></label>
            <button class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">View</button>
        </form>
        <a href="<?= baseUrl('finance/balance-sheet') ?>?as_of=<?= e($asOf) ?>&amp;export=csv" download
           class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Export CSV
        </a>
    </div>
</div>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
    <?php $panel('Assets', $assets, $totAssets); ?>
    <div class="space-y-4">
        <?php $panel('Liabilities', $liabilities, $totLiab); ?>
        <?php $panel('Equity', $equity, $totEquity, ['name' => 'Accumulated surplus / (deficit)', 'amt' => $surplus]); ?>
    </div>
</div>

<div class="mt-4 rounded-xl border px-5 py-4 text-sm <?= $balanced ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700' ?>">
    <div class="flex items-center justify-between flex-wrap gap-2">
        <span class="font-medium"><?= $balanced ? ' Balanced' : ' Does not balance' ?></span>
        <span>Assets <?= money($totAssets) ?> = Liabilities <?= money($totLiab) ?> + Equity <?= money($totEquity) ?> = <?= money($totLiabEq) ?><?= $balanced ? '' : ' (difference ' . money(abs($totAssets - $totLiabEq)) . ')' ?></span>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
