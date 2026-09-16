<?php
/**
 * General Ledger / Journal viewer — the audit trail. Lists journal entries
 * (each a balanced set of debit/credit lines) with date, memo, source and
 * amounts. Filterable by date range and account. CSV export gives a flat
 * general-ledger dump for an accountant. Reads migration 090.
 */
require_once __DIR__ . '/../../includes/ledger.php';

$pageTitle = 'General Ledger';
$sb  = new Supabase();
$sid = schoolId();

$from      = trim((string)input('from'));
$to        = trim((string)input('to')) ?: date('Y-m-d');
$acctId    = trim((string)input('account'));
$accounts  = ledgerAccounts($sb, $sid);

// ── CSV export: flat general ledger over the filtered range ──────
if (input('export') === 'csv') {
    $lines = Supabase::fetchAllPaged(function ($q) use ($sid, $from, $to, $acctId) {
        $b = $q->from('ledger_lines')->select('account_id,entry_date,debit,credit,memo')
            ->eq('school_id', $sid)->lte('entry_date', $to);
        if ($from)   $b = $b->gte('entry_date', $from);
        if ($acctId) $b = $b->eq('account_id', $acctId);
        return $b->order('entry_date', true);
    });
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="general-ledger.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['Date', 'Code', 'Account', 'Memo', 'Debit', 'Credit']);
    foreach ($lines as $l) {
        $a = $accounts[$l['account_id']] ?? ['code' => '', 'name' => ''];
        fputcsv($out, [$l['entry_date'], $a['code'], $a['name'], $l['memo'], $l['debit'], $l['credit']]);
    }
    fclose($out);
    exit;
}

// ── Page of entries ──────────────────────────────────────────────
$pageSize = 40;
$page     = max(1, (int)input('p'));
$offset   = ($page - 1) * $pageSize;

// If filtering by account, find the entry_ids that touch it first.
$entryFilterIds = null;
if ($acctId) {
    $al = Supabase::fetchAllPaged(function ($q) use ($sid, $acctId, $from, $to) {
        $b = $q->from('ledger_lines')->select('entry_id')->eq('school_id', $sid)
            ->eq('account_id', $acctId)->lte('entry_date', $to);
        if ($from) $b = $b->gte('entry_date', $from);
        return $b->order('entry_id', true);
    });
    $entryFilterIds = array_values(array_unique(array_column($al, 'entry_id')));
    if (empty($entryFilterIds)) $entryFilterIds = ['00000000-0000-0000-0000-000000000000'];
}

$eq = $sb->from('ledger_entries')->select('id,entry_date,memo,source_type,source_id')
    ->eq('school_id', $sid)->lte('entry_date', $to);
if ($from) $eq = $eq->gte('entry_date', $from);
if ($entryFilterIds !== null) $eq = $eq->in('id', array_slice($entryFilterIds, 0, 1000));
$entResp  = $eq->order('entry_date', false)->range($offset, $pageSize)->executeWithCount();
$entries  = $entResp['data'] ?? [];
$total    = (int)($entResp['count'] ?? 0);

// Fetch the lines for the entries on this page.
$entryIds = array_column($entries, 'id');
$linesByEntry = [];
if ($entryIds) {
    $ll = $sb->from('ledger_lines')->select('entry_id,account_id,debit,credit,memo')
        ->eq('school_id', $sid)->in('entry_id', $entryIds)->limit(2000)->execute()['data'] ?? [];
    foreach ($ll as $l) $linesByEntry[$l['entry_id']][] = $l;
}

$sourceLabels = [
    'invoice'        => ['Invoice', 'bg-blue-50 text-blue-700'],
    'invoice_cancel' => ['Cancellation', 'bg-red-50 text-red-700'],
    'payment'        => ['Payment', 'bg-emerald-50 text-emerald-700'],
    'expense'        => ['Expense', 'bg-amber-50 text-amber-700'],
    'income'         => ['Income', 'bg-teal-50 text-teal-700'],
    'payroll'        => ['Payroll', 'bg-purple-50 text-purple-700'],
    'manual'         => ['Manual', 'bg-gray-100 text-gray-600'],
];
$totalPages = max(1, (int)ceil($total / $pageSize));

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">General Ledger</h1>
        <p class="text-sm text-gray-500 mt-1"><?= number_format($total) ?> journal entr<?= $total === 1 ? 'y' : 'ies' ?> · every posting behind the numbers</p>
    </div>
    <a href="<?= baseUrl('finance/ledger') ?>?from=<?= e($from) ?>&amp;to=<?= e($to) ?>&amp;account=<?= e($acctId) ?>&amp;export=csv" download
       class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        Export CSV
    </a>
</div>

<form method="GET" action="<?= baseUrl('finance/ledger') ?>" class="flex items-end gap-2 flex-wrap mb-4">    <label class="text-xs text-gray-500">From<input type="date" name="from" value="<?= e($from) ?>" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg"></label>
    <label class="text-xs text-gray-500">To<input type="date" name="to" value="<?= e($to) ?>" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg"></label>
    <label class="text-xs text-gray-500">Account
        <select name="account" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg">
            <option value="">All accounts</option>
            <?php foreach ($accounts as $id => $a): ?>
                <option value="<?= e($id) ?>" <?= $acctId === $id ? 'selected' : '' ?>><?= e($a['code'] . ' · ' . $a['name']) ?></option>
            <?php endforeach; ?>
        </select>
    </label>
    <button class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Filter</button>
    <?php if ($from || $acctId): ?><a href="<?= baseUrl('finance/ledger') ?>" class="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Clear</a><?php endif; ?>
</form>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-5 py-2.5 font-medium">Date</th>
                <th class="px-3 py-2.5 font-medium">Entry</th>
                <th class="px-3 py-2.5 font-medium">Account</th>
                <th class="px-3 py-2.5 font-medium text-right">Debit</th>
                <th class="px-5 py-2.5 font-medium text-right">Credit</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
            <?php if (empty($entries)): ?>
                <tr><td colspan="5" class="px-5 py-8 text-center text-sm text-gray-500">No journal entries in this range yet.</td></tr>
            <?php else: foreach ($entries as $ent):
                $lines = $linesByEntry[$ent['id']] ?? [];
                [$slabel, $scls] = $sourceLabels[$ent['source_type']] ?? [$ent['source_type'], 'bg-gray-100 text-gray-600'];
                $n = count($lines); $i = 0;
                foreach ($lines as $l):
                    $a = $accounts[$l['account_id']] ?? ['code' => '', 'name' => '?'];
                    $i++;
            ?>
                <tr class="<?= $i === 1 ? 'border-t border-gray-100' : '' ?> hover:bg-gray-50/60">
                    <td class="px-5 py-2 align-top text-gray-500 <?= $i > 1 ? 'text-transparent' : '' ?>"><?= e(date('j M Y', strtotime($ent['entry_date']))) ?></td>
                    <td class="px-3 py-2 align-top">
                        <?php if ($i === 1): ?>
                            <span class="inline-block text-[10px] px-1.5 py-0.5 rounded <?= $scls ?> font-medium"><?= e($slabel) ?></span>
                            <div class="text-xs text-gray-500 mt-0.5 max-w-[220px] truncate"><?= e($ent['memo'] ?? '') ?></div>
                        <?php endif; ?>
                    </td>
                    <td class="px-3 py-2 text-gray-700"><span class="text-gray-400 font-mono text-xs mr-1.5"><?= e($a['code']) ?></span><?= e($a['name']) ?></td>
                    <td class="px-3 py-2 text-right tabular-nums text-gray-700"><?= (float)$l['debit']  > 0 ? money($l['debit'])  : '' ?></td>
                    <td class="px-5 py-2 text-right tabular-nums text-gray-700"><?= (float)$l['credit'] > 0 ? money($l['credit']) : '' ?></td>
                </tr>
            <?php endforeach; endforeach; endif; ?>
        </tbody>
    </table>
</div>

<?php if ($totalPages > 1): ?>
    <div class="flex items-center justify-between mt-4 text-sm">
        <span class="text-gray-500">Page <?= $page ?> of <?= $totalPages ?></span>
        <div class="flex gap-2">
            <?php $qs = 'from=' . urlencode($from) . '&to=' . urlencode($to) . '&account=' . urlencode($acctId); ?>
            <?php if ($page > 1): ?><a href="<?= baseUrl('finance/ledger') ?>?<?= $qs ?>&p=<?= $page - 1 ?>" class="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">← Prev</a><?php endif; ?>
            <?php if ($page < $totalPages): ?><a href="<?= baseUrl('finance/ledger') ?>?<?= $qs ?>&p=<?= $page + 1 ?>" class="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Next →</a><?php endif; ?>
        </div>
    </div>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
