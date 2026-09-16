<?php
/**
 * Ledger helpers — thin read layer over the double-entry tables created in
 * migration 090 (chart_of_accounts, journal_entries, journal_lines).
 *
 * All posting happens in Postgres triggers; PHP only reads. These helpers
 * fetch the chart and aggregate journal_lines in PHP (matching the app's
 * REST-then-sum style, e.g. modules/group.php), which is plenty for MSME
 * transaction volumes.
 */

/** All accounts for a school, ordered by code, keyed by id. */
function ledgerAccounts(Supabase $sb, string $sid): array
{
    $rows = $sb->from('ledger_accounts')
        ->select('id,code,name,type,normal_side,is_active,is_system')
        ->eq('school_id', $sid)->order('code', true)->limit(1000)->execute()['data'] ?? [];
    $out = [];
    foreach ($rows as $r) $out[$r['id']] = $r;
    return $out;
}

/**
 * Sum debits/credits per account from journal_lines, optionally within a
 * date range (inclusive). Returns account_id => ['debit'=>float,'credit'=>float].
 *
 * $from / $to are 'YYYY-MM-DD' strings or null. A null $from means "from the
 * beginning" (used for balance-sheet / trial-balance-as-of); a range is used
 * for the income statement.
 */
function ledgerBalances(Supabase $sb, string $sid, ?string $from, ?string $to): array
{
    $lines = Supabase::fetchAllPaged(function ($q) use ($sid, $from, $to) {
        $b = $q->from('ledger_lines')->select('account_id,debit,credit')->eq('school_id', $sid);
        if ($from) $b = $b->gte('entry_date', $from);
        if ($to)   $b = $b->lte('entry_date', $to);
        return $b->order('id', true);
    });

    $bal = [];
    foreach ($lines as $l) {
        $aid = $l['account_id'];
        if (!isset($bal[$aid])) $bal[$aid] = ['debit' => 0.0, 'credit' => 0.0];
        $bal[$aid]['debit']  += (float)($l['debit']  ?? 0);
        $bal[$aid]['credit'] += (float)($l['credit'] ?? 0);
    }
    return $bal;
}

/** Signed balance of an account given its normal side (debit accounts positive on debit). */
function ledgerNet(array $acct, array $bal): float
{
    $d = $bal['debit'] ?? 0.0;
    $c = $bal['credit'] ?? 0.0;
    return ($acct['normal_side'] === 'debit') ? ($d - $c) : ($c - $d);
}

/** Count of unresolved ledger posting errors (surfaced as a warning on reports). */
function ledgerPostingErrorCount(Supabase $sb, string $sid): int
{
    $r = $sb->from('ledger_errors')->select('id')->eq('school_id', $sid)
        ->limit(1)->executeWithCount();
    return (int)($r['count'] ?? 0);
}
