<?php
/**
 * Group Reports — compare branches on what decides a school's year.
 *
 *   Collections   billed vs collected per branch per term, side by side
 *   Arrears       what's owed by age, and the biggest balances group-wide
 *   Enrolment     headcount, joined/left this term, a grade × branch grid
 *   Expenses      spend per branch per month, top categories
 *   Attendance    weekly rate per branch
 *
 * All five come from one call (group_report_data, migration 128) so the
 * page is fast on a phone. Every table exports to CSV as shown.
 */
$pageTitle = 'Group Reports';
$sb  = new Supabase();
$uid = currentUser()['id'] ?? '';

$groupId = $_SESSION['group_id'] ?? '';
if ($groupId && $uid) {
    $chk = $sb->from('school_group_admins')->select('group_id')->eq('user_id', $uid)->eq('group_id', $groupId)->single()->execute();
    if (empty($chk['data'][0]['group_id'])) $groupId = '';
}
if (!$groupId) { flash('error', 'You do not have access to a school group.'); redirect('dashboard'); }
$groupName = $_SESSION['group_name'] ?? 'Group';

$tab = in_array(input('tab'), ['collections', 'arrears', 'enrolment', 'expenses', 'attendance'], true) ? input('tab') : 'collections';

$res  = $sb->rpc('group_report_data', ['p_group_id' => $groupId]);
$data = is_array($res['data'] ?? null) ? $res['data'] : null;
$rpcMissing = !empty($res['error']) && stripos((string)$res['error'], 'group_report_data') !== false;

$schools = $data['schools'] ?? [];
$sName = []; foreach ($schools as $s) $sName[$s['id']] = $s['name'];
$palette = ['#8b5cf6', '#14b8a6', '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899'];
$sColor = []; $i = 0; foreach ($schools as $s) $sColor[$s['id']] = $palette[$i++ % count($palette)];
$short = function (float $n): string {
    if ($n >= 1000000) return rtrim(rtrim(number_format($n / 1000000, 1), '0'), '.') . 'M';
    if ($n >= 1000)    return (string)round($n / 1000) . 'K';
    return (string)round($n);
};

// ── Shape each dataset for its table ──────────────────────────────
// Collections: rows = term labels (newest first), cols = branches.
$termRows = []; $termStart = [];
foreach (($data['collections'] ?? []) as $r) {
    $termRows[$r['label']][$r['school_id']] = $r;
    $termStart[$r['label']] = max($termStart[$r['label']] ?? '', (string)$r['start_date']);
}
uksort($termRows, fn($a, $b) => strcmp($termStart[$b], $termStart[$a]));
$termRows = array_slice($termRows, 0, 6, true);

// Arrears: per branch buckets.
$arr = [];
foreach ($schools as $s) $arr[$s['id']] = ['current' => 0.0, 'previous' => 0.0, 'older' => 0.0, 'learners' => 0];
foreach (($data['arrears'] ?? []) as $r) {
    $arr[$r['school_id']][$r['bucket']] = (float)$r['balance'];
    $arr[$r['school_id']]['learners'] += (int)$r['learners'];
}

// Enrolment + grade grid.
$enrol = []; foreach (($data['enrolment'] ?? []) as $r) $enrol[$r['school_id']] = $r;
$gradeGrid = []; $gradeTot = [];
foreach (($data['grades'] ?? []) as $r) { $gradeGrid[$r['grade']][$r['school_id']] = (int)$r['learners']; $gradeTot[$r['grade']] = ($gradeTot[$r['grade']] ?? 0) + (int)$r['learners']; }
$gradeOrder = function (string $g): array {
    if (preg_match('/^PP(\d)/', $g, $m)) return [0, (int)$m[1]];
    if ($g === 'Pre-school') return [0, 0];
    if (preg_match('/^Grade (\d+)/', $g, $m)) return [1, (int)$m[1]];
    if (preg_match('/^Form (\d)/', $g, $m)) return [2, (int)$m[1]];
    return [3, 0];
};
uksort($gradeGrid, fn($a, $b) => $gradeOrder($a) <=> $gradeOrder($b) ?: strcmp($a, $b));

// Expenses: rows = months (last 6), cols = branches.
$months = []; for ($k = 5; $k >= 0; $k--) $months[] = date('Y-m', strtotime("first day of -$k month"));
$expGrid = []; foreach (($data['expenses'] ?? []) as $r) $expGrid[$r['month']][$r['school_id']] = (float)$r['amount'];
$expCat = []; foreach (($data['expense_categories'] ?? []) as $r) $expCat[$r['school_id']][] = $r;
foreach ($expCat as &$rows) { usort($rows, fn($a, $b) => (float)$b['amount'] <=> (float)$a['amount']); $rows = array_slice($rows, 0, 4); } unset($rows);

// Attendance: rows = weeks (last 8), cols = branches.
$weeks = []; for ($k = 7; $k >= 0; $k--) $weeks[] = date('Y-m-d', strtotime("monday this week -$k weeks"));
$attGrid = []; foreach (($data['attendance'] ?? []) as $r) $attGrid[$r['week']][$r['school_id']] = $r;

// ── CSV export of the current tab ─────────────────────────────────
if (input('export') === 'csv' && $data) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="group_' . $tab . '_' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF");
    $names = array_values($sName);
    if ($tab === 'collections') {
        fputcsv($out, array_merge(['Term'], array_map(fn($n) => $n . ' billed', $names), array_map(fn($n) => $n . ' collected', $names), ['Group billed', 'Group collected', 'Group rate %']));
        foreach ($termRows as $label => $cols) {
            $b = []; $c = []; $tb = 0; $tc = 0;
            foreach ($schools as $s) { $b[] = $cols[$s['id']]['billed'] ?? ''; $c[] = $cols[$s['id']]['collected'] ?? ''; $tb += (float)($cols[$s['id']]['billed'] ?? 0); $tc += (float)($cols[$s['id']]['collected'] ?? 0); }
            fputcsv($out, array_merge([$label], $b, $c, [$tb, $tc, $tb > 0 ? round($tc / $tb * 100, 1) : '']));
        }
    } elseif ($tab === 'arrears') {
        fputcsv($out, ['School', 'This term', 'Last term', 'Older', 'Total owed', 'Learners owing']);
        foreach ($schools as $s) { $a = $arr[$s['id']]; fputcsv($out, [$s['name'], $a['current'], $a['previous'], $a['older'], $a['current'] + $a['previous'] + $a['older'], $a['learners']]); }
        fputcsv($out, []); fputcsv($out, ['Largest balances', 'School', 'Class', 'Admission', 'Balance', 'Invoices']);
        foreach (($data['debtors'] ?? []) as $d) fputcsv($out, [$d['name'], $sName[$d['school_id']] ?? '', $d['class_name'] ?? '', $d['admission_number'] ?? '', $d['balance'], $d['invoices']]);
    } elseif ($tab === 'enrolment') {
        fputcsv($out, ['School', 'Active', 'Boys', 'Girls', 'Joined this term', 'Left this term']);
        foreach ($schools as $s) { $e = $enrol[$s['id']] ?? []; fputcsv($out, [$s['name'], $e['active'] ?? 0, $e['boys'] ?? 0, $e['girls'] ?? 0, $e['joined_this_term'] ?? 0, $e['left_this_term'] ?? 0]); }
        fputcsv($out, []); fputcsv($out, array_merge(['Grade'], $names, ['Group']));
        foreach ($gradeGrid as $g => $cols) fputcsv($out, array_merge([$g], array_map(fn($s) => $cols[$s['id']] ?? 0, $schools), [$gradeTot[$g]]));
    } elseif ($tab === 'expenses') {
        fputcsv($out, array_merge(['Month'], $names, ['Group']));
        foreach ($months as $m) { $row = []; $t = 0; foreach ($schools as $s) { $v = $expGrid[$m][$s['id']] ?? 0; $row[] = $v; $t += $v; } fputcsv($out, array_merge([$m], $row, [$t])); }
    } else {
        fputcsv($out, array_merge(['Week of'], $names));
        foreach ($weeks as $w) fputcsv($out, array_merge([$w], array_map(fn($s) => isset($attGrid[$w][$s['id']]) && (int)$attGrid[$w][$s['id']]['total'] > 0 ? round((int)$attGrid[$w][$s['id']]['present'] / (int)$attGrid[$w][$s['id']]['total'] * 100, 1) : '', $schools)));
    }
    fclose($out); exit;
}

require __DIR__ . '/../includes/layout-top.php';
$tabs = ['collections' => 'Collections', 'arrears' => 'Arrears', 'enrolment' => 'Enrolment', 'expenses' => 'Expenses', 'attendance' => 'Attendance'];
$cellBar = function (float $rate, string $color): string {
    return '<div class="flex items-center gap-2"><div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full" style="width:' . (int)min(100, $rate) . '%;background:' . $color . '"></div></div><span class="text-xs tabular-nums w-9 text-right ' . ($rate < 40 ? 'text-rose-600 font-semibold' : 'text-gray-700') . '">' . number_format($rate, 0) . '%</span></div>';
};
?>

<div class="flex items-start justify-between gap-4 mb-5 flex-wrap">
    <div>
        <a href="<?= baseUrl('group') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Group Dashboard</a>
        <h1 class="text-2xl font-bold text-gray-900 mt-1">Group Reports</h1>
        <p class="text-sm text-gray-500 mt-1"><?= e($groupName) ?> · <?= count($schools) ?> schools · as of <?= e(date('j F Y')) ?></p>
    </div>
    <?php if ($data): ?>
    <a href="<?= baseUrl('group/reports') ?>?tab=<?= e($tab) ?>&amp;export=csv" download class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Export CSV</a>
    <?php endif; ?>
</div>

<div class="inline-flex rounded-lg border border-gray-200 bg-white p-1 mb-5 flex-wrap">
    <?php foreach ($tabs as $k => $lbl): ?>
        <a href="<?= baseUrl('group/reports') ?>?tab=<?= $k ?>" class="px-4 py-1.5 text-sm font-medium rounded-md transition <?= $tab === $k ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50' ?>"><?= e($lbl) ?></a>
    <?php endforeach; ?>
</div>

<?php if ($rpcMissing): ?>
<div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"><strong>Migration 128 hasn't been run.</strong> Reports come from <span class="font-mono">group_report_data</span> — run it in Supabase and reload the schema cache.</div>
<?php elseif (!$data || !$schools): ?>
<div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500">No schools in this group yet.</div>
<?php else: ?>

<?php if ($tab === 'collections'): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-700">Collected against billed, term by term</h2>
        <p class="text-[11px] text-gray-400 mt-0.5">Each cell: collected / billed, with the rate. Terms are aligned by name and year, so "Term 2 · 2026" is the same row for every branch even if their dates differ. Last 18 months.</p>
    </div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-5 py-2.5 font-medium">Term</th>
                <?php foreach ($schools as $s): ?><th class="px-3 py-2.5 font-medium min-w-[11rem]"><span class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style="background:<?= $sColor[$s['id']] ?>"></span><?= e($s['name']) ?></th><?php endforeach; ?>
                <th class="px-5 py-2.5 font-medium text-right">Group</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (!$termRows): ?><tr><td colspan="<?= count($schools) + 2 ?>" class="px-5 py-10 text-center text-gray-400">No invoices in the last 18 months.</td></tr><?php endif; ?>
                <?php foreach ($termRows as $label => $cols): $tb = 0; $tc = 0; ?>
                <tr>
                    <td class="px-5 py-3 font-medium text-gray-900 whitespace-nowrap"><?= e($label) ?></td>
                    <?php foreach ($schools as $s): $c = $cols[$s['id']] ?? null; if ($c) { $tb += (float)$c['billed']; $tc += (float)$c['collected']; } ?>
                    <td class="px-3 py-3 align-top">
                        <?php if (!$c): ?><span class="text-gray-300">—</span><?php else: $rate = (float)$c['billed'] > 0 ? (float)$c['collected'] / (float)$c['billed'] * 100 : 0; ?>
                            <div class="text-gray-800 tabular-nums"><span class="font-semibold text-emerald-700"><?= $short((float)$c['collected']) ?></span> <span class="text-gray-400">/ <?= $short((float)$c['billed']) ?></span></div>
                            <?= $cellBar($rate, $sColor[$s['id']]) ?>
                            <div class="text-[11px] text-gray-400"><?= (int)$c['learners'] ?> learners billed</div>
                        <?php endif; ?>
                    </td>
                    <?php endforeach; ?>
                    <td class="px-5 py-3 text-right align-top tabular-nums">
                        <div class="text-gray-900"><span class="font-semibold text-emerald-700"><?= $short($tc) ?></span> <span class="text-gray-400">/ <?= $short($tb) ?></span></div>
                        <div class="text-xs font-semibold <?= ($tb > 0 && $tc / $tb < 0.4) ? 'text-rose-600' : 'text-gray-700' ?>"><?= $tb > 0 ? number_format($tc / $tb * 100, 0) : 0 ?>%</div>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<?php elseif ($tab === 'arrears'): $gt = ['current' => 0, 'previous' => 0, 'older' => 0, 'learners' => 0]; ?>
<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100">
            <h2 class="text-sm font-semibold text-gray-700">What is still owed, by how old it is</h2>
            <p class="text-[11px] text-gray-400 mt-0.5">This term is normal in-term debt. Last term and older are the money that needs a decision — a payment plan, or writing it off.</p>
        </div>
        <table class="w-full text-sm">
            <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-5 py-2.5 font-medium">School</th><th class="px-3 py-2.5 font-medium text-right">This term</th><th class="px-3 py-2.5 font-medium text-right">Last term</th><th class="px-3 py-2.5 font-medium text-right">Older</th><th class="px-3 py-2.5 font-medium text-right">Total</th><th class="px-5 py-2.5 font-medium text-right">Learners</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($schools as $s): $a = $arr[$s['id']]; $t = $a['current'] + $a['previous'] + $a['older']; foreach (['current', 'previous', 'older', 'learners'] as $k) $gt[$k] += $a[$k]; ?>
                <tr>
                    <td class="px-5 py-3 font-medium text-gray-900"><span class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style="background:<?= $sColor[$s['id']] ?>"></span><?= e($s['name']) ?></td>
                    <td class="px-3 py-3 text-right text-gray-700 tabular-nums"><?= $a['current'] > 0 ? $short($a['current']) : '—' ?></td>
                    <td class="px-3 py-3 text-right tabular-nums <?= $a['previous'] > 0 ? 'text-amber-700' : 'text-gray-300' ?>"><?= $a['previous'] > 0 ? $short($a['previous']) : '—' ?></td>
                    <td class="px-3 py-3 text-right tabular-nums <?= $a['older'] > 0 ? 'text-rose-600 font-semibold' : 'text-gray-300' ?>"><?= $a['older'] > 0 ? $short($a['older']) : '—' ?></td>
                    <td class="px-3 py-3 text-right font-semibold text-gray-900 tabular-nums"><?= $t > 0 ? $short($t) : '—' ?></td>
                    <td class="px-5 py-3 text-right text-gray-600 tabular-nums"><?= (int)$a['learners'] ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
            <tfoot><tr class="border-t-2 border-gray-100 font-semibold bg-gray-50/50 text-gray-900">
                <td class="px-5 py-3">Group</td><td class="px-3 py-3 text-right tabular-nums"><?= $short($gt['current']) ?></td><td class="px-3 py-3 text-right tabular-nums text-amber-700"><?= $short($gt['previous']) ?></td><td class="px-3 py-3 text-right tabular-nums text-rose-600"><?= $short($gt['older']) ?></td><td class="px-3 py-3 text-right tabular-nums"><?= $short($gt['current'] + $gt['previous'] + $gt['older']) ?></td><td class="px-5 py-3 text-right tabular-nums"><?= (int)$gt['learners'] ?></td>
            </tr></tfoot>
        </table>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Largest balances across the group</h2></div>
        <div class="divide-y divide-gray-50">
            <?php foreach (($data['debtors'] ?? []) as $d): ?>
            <div class="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div class="min-w-0"><span class="font-medium text-gray-900"><?= e($d['name']) ?></span><p class="text-[11px] text-gray-400 truncate"><?= e($sName[$d['school_id']] ?? '') ?><?= !empty($d['class_name']) ? ' · ' . e($d['class_name']) : '' ?><?= !empty($d['admission_number']) ? ' · ' . e($d['admission_number']) : '' ?> · <?= (int)$d['invoices'] ?> invoice<?= (int)$d['invoices'] === 1 ? '' : 's' ?></p></div>
                <span class="font-semibold text-rose-600 tabular-nums flex-none"><?= money((float)$d['balance']) ?></span>
            </div>
            <?php endforeach; ?>
            <?php if (empty($data['debtors'])): ?><p class="px-5 py-8 text-center text-sm text-gray-400">Nobody owes anything.</p><?php endif; ?>
        </div>
    </div>
</div>

<?php elseif ($tab === 'enrolment'): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
    <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Headcount and movement this term</h2></div>
    <table class="w-full text-sm">
        <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th class="px-5 py-2.5 font-medium">School</th><th class="px-3 py-2.5 font-medium text-right">Active</th><th class="px-3 py-2.5 font-medium text-right">Boys</th><th class="px-3 py-2.5 font-medium text-right">Girls</th><th class="px-3 py-2.5 font-medium text-right">Joined this term</th><th class="px-5 py-2.5 font-medium text-right">Left this term</th>
        </tr></thead>
        <tbody class="divide-y divide-gray-50">
            <?php $et = ['active' => 0, 'boys' => 0, 'girls' => 0, 'joined_this_term' => 0, 'left_this_term' => 0];
            foreach ($schools as $s): $e = $enrol[$s['id']] ?? []; foreach ($et as $k => $_) $et[$k] += (int)($e[$k] ?? 0); ?>
            <tr>
                <td class="px-5 py-3 font-medium text-gray-900"><span class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style="background:<?= $sColor[$s['id']] ?>"></span><?= e($s['name']) ?><p class="text-[11px] text-gray-400"><?= e($s['term_name'] ?: 'No current term set') ?></p></td>
                <td class="px-3 py-3 text-right font-semibold text-gray-900 tabular-nums"><?= number_format((int)($e['active'] ?? 0)) ?></td>
                <td class="px-3 py-3 text-right text-gray-600 tabular-nums"><?= number_format((int)($e['boys'] ?? 0)) ?></td>
                <td class="px-3 py-3 text-right text-gray-600 tabular-nums"><?= number_format((int)($e['girls'] ?? 0)) ?></td>
                <td class="px-3 py-3 text-right text-emerald-700 tabular-nums"><?= (int)($e['joined_this_term'] ?? 0) > 0 ? '+' . (int)$e['joined_this_term'] : '—' ?></td>
                <td class="px-5 py-3 text-right text-rose-600 tabular-nums"><?= (int)($e['left_this_term'] ?? 0) > 0 ? '−' . (int)$e['left_this_term'] : '—' ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
        <tfoot><tr class="border-t-2 border-gray-100 font-semibold bg-gray-50/50 text-gray-900"><td class="px-5 py-3">Group</td><td class="px-3 py-3 text-right tabular-nums"><?= number_format($et['active']) ?></td><td class="px-3 py-3 text-right tabular-nums"><?= number_format($et['boys']) ?></td><td class="px-3 py-3 text-right tabular-nums"><?= number_format($et['girls']) ?></td><td class="px-3 py-3 text-right tabular-nums text-emerald-700">+<?= $et['joined_this_term'] ?></td><td class="px-5 py-3 text-right tabular-nums text-rose-600">−<?= $et['left_this_term'] ?></td></tr></tfoot>
    </table>
</div>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-700">Learners by grade, across branches</h2>
        <p class="text-[11px] text-gray-400 mt-0.5">Class names are normalised to a grade ("Grade 5A" and "GRADE 5" both count as Grade 5) so branches line up. Where a class has no grade in its name it's listed as-is.</p>
    </div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-5 py-2.5 font-medium">Grade</th>
                <?php foreach ($schools as $s): ?><th class="px-3 py-2.5 font-medium text-right"><?= e($s['name']) ?></th><?php endforeach; ?>
                <th class="px-5 py-2.5 font-medium text-right">Group</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($gradeGrid as $g => $cols): ?>
                <tr>
                    <td class="px-5 py-2.5 font-medium text-gray-900"><?= e($g) ?></td>
                    <?php foreach ($schools as $s): $v = $cols[$s['id']] ?? 0; ?><td class="px-3 py-2.5 text-right tabular-nums <?= $v ? 'text-gray-800' : 'text-gray-300' ?>"><?= $v ?: '—' ?></td><?php endforeach; ?>
                    <td class="px-5 py-2.5 text-right font-semibold text-gray-900 tabular-nums"><?= $gradeTot[$g] ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<?php elseif ($tab === 'expenses'): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
    <div class="px-5 py-3 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-700">Spend per month, last six months</h2>
        <p class="text-[11px] text-gray-400 mt-0.5">Only as real as what each branch records. A dash means nothing logged, not zero spend.</p>
    </div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-5 py-2.5 font-medium">Month</th>
                <?php foreach ($schools as $s): ?><th class="px-3 py-2.5 font-medium text-right"><?= e($s['name']) ?></th><?php endforeach; ?>
                <th class="px-5 py-2.5 font-medium text-right">Group</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($months as $m): $t = 0; ?>
                <tr>
                    <td class="px-5 py-2.5 font-medium text-gray-900"><?= e(date('M Y', strtotime($m . '-01'))) ?></td>
                    <?php foreach ($schools as $s): $v = $expGrid[$m][$s['id']] ?? 0; $t += $v; ?><td class="px-3 py-2.5 text-right tabular-nums <?= $v > 0 ? 'text-gray-800' : 'text-gray-300' ?>"><?= $v > 0 ? $short($v) : '—' ?></td><?php endforeach; ?>
                    <td class="px-5 py-2.5 text-right font-semibold text-gray-900 tabular-nums"><?= $t > 0 ? $short($t) : '—' ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php if ($expCat): ?>
<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    <?php foreach ($schools as $s): if (empty($expCat[$s['id']])) continue; ?>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <h3 class="text-sm font-semibold text-gray-800 mb-2"><?= e($s['name']) ?> <span class="text-gray-400 font-normal">· top categories, 3 months</span></h3>
        <?php $mx = (float)$expCat[$s['id']][0]['amount']; foreach ($expCat[$s['id']] as $c): ?>
        <div class="mb-1.5">
            <div class="flex justify-between text-xs"><span class="text-gray-700 truncate"><?= e(mb_convert_case(mb_strtolower($c['category']), MB_CASE_TITLE)) ?></span><span class="font-semibold text-gray-900 tabular-nums"><?= $short((float)$c['amount']) ?></span></div>
            <div class="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-0.5"><div class="h-full rounded-full" style="width:<?= $mx > 0 ? (int)((float)$c['amount'] / $mx * 100) : 0 ?>%;background:<?= $sColor[$s['id']] ?>"></div></div>
        </div>
        <?php endforeach; ?>
    </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>

<?php else: ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-700">Weekly attendance rate, last eight weeks</h2>
        <p class="text-[11px] text-gray-400 mt-0.5">Present and late over everyone marked, per branch per week. A dash means no register was taken that week.</p>
    </div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-5 py-2.5 font-medium">Week of</th>
                <?php foreach ($schools as $s): ?><th class="px-3 py-2.5 font-medium min-w-[9rem]"><?= e($s['name']) ?></th><?php endforeach; ?>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($weeks as $w): ?>
                <tr>
                    <td class="px-5 py-2.5 font-medium text-gray-900 whitespace-nowrap"><?= e(date('j M', strtotime($w))) ?></td>
                    <?php foreach ($schools as $s): $r = $attGrid[$w][$s['id']] ?? null; ?>
                    <td class="px-3 py-2.5">
                        <?php if ($r && (int)$r['total'] > 0): $pct = (int)$r['present'] / (int)$r['total'] * 100; ?>
                            <div class="flex items-center gap-2"><div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full" style="width:<?= (int)$pct ?>%;background:<?= $pct < 85 ? '#f59e0b' : $sColor[$s['id']] ?>"></div></div><span class="text-xs tabular-nums w-9 text-right <?= $pct < 85 ? 'text-amber-600 font-semibold' : 'text-gray-700' ?>"><?= number_format($pct, 0) ?>%</span></div>
                            <div class="text-[11px] text-gray-400"><?= (int)$r['sessions'] ?> register<?= (int)$r['sessions'] === 1 ? '' : 's' ?></div>
                        <?php else: ?><span class="text-gray-300">—</span><?php endif; ?>
                    </td>
                    <?php endforeach; ?>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php endif; ?>

<?php endif; ?>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
