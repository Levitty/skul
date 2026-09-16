<?php
/**
 * Trial Balance — every account with its debit/credit balance as of a date.
 * Total debits must equal total credits; that equality is the one-glance
 * proof the books balance. Reads the ledger built in migration 090.
 */
require_once __DIR__ . '/../../includes/ledger.php';

$pageTitle = 'Trial Balance';
$sb  = new Supabase();
$sid = schoolId();

$asOf = trim((string)input('as_of')) ?: date('Y-m-d');

$accounts = ledgerAccounts($sb, $sid);
$balances = ledgerBalances($sb, $sid, null, $asOf);

// Build rows in code order; a debit-normal account with a net credit balance
// simply shows in the credit column (and vice-versa).
$rows = [];
$totDebit = $totCredit = 0.0;
foreach ($accounts as $id => $a) {
    $b   = $balances[$id] ?? ['debit' => 0, 'credit' => 0];
    $net = $b['debit'] - $b['credit'];               // signed: +ve = net debit
    if (abs($net) < 0.005) continue;                  // hide zero-balance accounts
    $debit  = $net > 0 ? $net : 0.0;
    $credit = $net < 0 ? -$net : 0.0;
    $rows[] = ['code' => $a['code'], 'name' => $a['name'], 'type' => $a['type'],
               'debit' => $debit, 'credit' => $credit];
    $totDebit  += $debit;
    $totCredit += $credit;
}

// ── CSV export ───────────────────────────────────────────────────
if (input('export') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="trial-balance-' . $asOf . '.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['Code', 'Account', 'Type', 'Debit', 'Credit']);
    foreach ($rows as $r) fputcsv($out, [$r['code'], $r['name'], $r['type'], $r['debit'], $r['credit']]);
    fputcsv($out, ['', 'TOTAL', '', $totDebit, $totCredit]);
    fclose($out);
    exit;
}

$errCount = ledgerPostingErrorCount($sb, $sid);
$balanced = abs($totDebit - $totCredit) < 0.01;

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Trial Balance</h1>
        <p class="text-sm text-gray-500 mt-1">All account balances as of <span class="font-medium text-gray-600"><?= e(date('j M Y', strtotime($asOf))) ?></span></p>
    </div>
    <div class="flex items-end gap-2">
        <form method="GET" action="<?= baseUrl('finance/trial-balance') ?>" class="flex items-end gap-2">            <label class="text-xs text-gray-500">As of
                <input type="date" name="as_of" value="<?= e($asOf) ?>" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg">
            </label>
            <button class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">View</button>
        </form>
        <a href="<?= baseUrl('finance/trial-balance') ?>?as_of=<?= e($asOf) ?>&amp;export=csv" download
           class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Export CSV
        </a>
    </div>
</div>

<?php if ($errCount > 0): ?>
    <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <?= (int)$errCount ?> ledger posting <?= $errCount === 1 ? 'error was' : 'errors were' ?> logged. Some transactions may not be reflected — re-run <code class="text-xs">backfill_ledger()</code> after fixing the cause.
    </div>
<?php endif; ?>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th class="px-5 py-2.5 font-medium">Code</th>
                    <th class="px-3 py-2.5 font-medium">Account</th>
                    <th class="px-3 py-2.5 font-medium text-right">Debit</th>
                    <th class="px-5 py-2.5 font-medium text-right">Credit</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($rows)): ?>
                    <tr><td colspan="4" class="px-5 py-8 text-center text-sm text-gray-500">No ledger activity yet. Once invoices, payments and expenses are recorded (or a backfill is run), balances appear here.</td></tr>
                <?php else: foreach ($rows as $r): ?>
                    <tr class="hover:bg-gray-50">
                        <td class="px-5 py-2.5 text-gray-400 font-mono text-xs"><?= e($r['code']) ?></td>
                        <td class="px-3 py-2.5 text-gray-800"><?= e($r['name']) ?></td>
                        <td class="px-3 py-2.5 text-right tabular-nums text-gray-700"><?= $r['debit'] > 0 ? money($r['debit']) : '' ?></td>
                        <td class="px-5 py-2.5 text-right tabular-nums text-gray-700"><?= $r['credit'] > 0 ? money($r['credit']) : '' ?></td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
            <tfoot>
                <tr class="border-t-2 border-gray-100 font-semibold text-gray-900 bg-gray-50/50">
                    <td class="px-5 py-3" colspan="2">Total</td>
                    <td class="px-3 py-3 text-right tabular-nums"><?= money($totDebit) ?></td>
                    <td class="px-5 py-3 text-right tabular-nums"><?= money($totCredit) ?></td>
                </tr>
            </tfoot>
        </table>
    </div>
    <div class="px-5 py-3 border-t border-gray-100 text-sm <?= $balanced ? 'text-emerald-700' : 'text-red-600' ?>">
        <?php if ($balanced): ?>
            <span class="font-medium"> In balance</span> — total debits equal total credits.
        <?php else: ?>
            <span class="font-medium"> Out of balance</span> by <?= money(abs($totDebit - $totCredit)) ?>. This points to a posting error above.
        <?php endif; ?>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
