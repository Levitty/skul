<?php
/**
 * Group Dashboard — the director's Monday view across every branch.
 *
 * Each branch is its own tenant; this rolls them up for the school group's
 * super-admin and lets them drill into any one. Figures are for each
 * branch's OWN current term (terms are per school), fetched in one call
 * (group_dashboard_stats, migration 127), and read in the same colour
 * language as a school's dashboard so the two feel like one product.
 *
 * Access: a row in school_group_admins for the logged-in user, surfaced as
 * $_SESSION['group_id'] at login — re-checked here against the database.
 */
$pageTitle = 'Group Dashboard';
$sb  = new Supabase();
$uid = currentUser()['id'] ?? '';

// ── Guard: must be an admin of this group ────────────────────────────
$groupId = $_SESSION['group_id'] ?? '';
if ($groupId && $uid) {
    $chk = $sb->from('school_group_admins')->select('group_id')
        ->eq('user_id', $uid)->eq('group_id', $groupId)->single()->execute();
    if (empty($chk['data'][0]['group_id'])) $groupId = '';
}
if (!$groupId) {
    flash('error', 'You do not have access to a school group.');
    redirect('dashboard');
}
$groupName = $_SESSION['group_name'] ?? 'Group';

// ── Drill-in: enter a branch as its admin (keeps group context) ──────
if (isPost() && verifyCsrf() && input('action') === 'enter') {
    $target = input('school_id');
    $mem = $sb->from('school_group_members')->select('school_id')->eq('group_id', $groupId)->eq('school_id', $target)->limit(1)->execute()['data'] ?? [];
    if ($mem) {
        $sch = $sb->from('schools')->select('name')->eq('id', $target)->single()->execute();
        switchSchool($target, 'school_admin', $sch['data'][0]['name'] ?? 'School');
        redirect('dashboard');
    }
    flash('error', 'That branch is not part of your group.');
    redirect('group');
}

// Landing here always drops any branch context so the rollup is group-wide.
if (schoolId() !== '') switchSchool('', 'group_admin', '');

// ── One call for every branch ────────────────────────────────────────
$res = $sb->rpc('group_dashboard_stats', ['p_group_id' => $groupId]);
$branches = is_array($res['data'] ?? null) ? $res['data'] : [];
$rpcMissing = !empty($res['error']) && stripos((string)$res['error'], 'group_dashboard_stats') !== false;

// ── And one more for the trends (mig. 141) ───────────────────────────
$moreRes = $sb->rpc('group_dashboard_more', ['p_group_id' => $groupId]);
$more = is_array($moreRes['data'] ?? null) ? $moreRes['data'] : null;
$moreById = [];
foreach ((array)($more['branches'] ?? []) as $mb) $moreById[$mb['id']] = $mb;

foreach ($branches as &$b) {
    $b['rate'] = (float)$b['billed'] > 0 ? (float)$b['collected'] / (float)$b['billed'] * 100 : 0.0;
}
unset($b);

$tot = ['students' => 0, 'billed' => 0.0, 'collected' => 0.0, 'outstanding' => 0.0, 'arrears' => 0.0,
        'collected_7d' => 0.0, 'expenses_month' => 0.0, 'admissions_pending' => 0, 'reminders_draft' => 0, 'approvals_pending' => 0];
foreach ($branches as $b) foreach ($tot as $k => $_) $tot[$k] += (float)($b[$k] ?? 0);
$tot['rate'] = $tot['billed'] > 0 ? $tot['collected'] / $tot['billed'] * 100 : 0.0;

// Default sort: strongest collection rate first — the comparison a director wants.
usort($branches, fn($a, $b) => $b['rate'] <=> $a['rate']);

// ── Donuts, same recipe as the school dashboard ──────────────────────
$palette = ['#8b5cf6', '#14b8a6', '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899'];
$greySeg = '#cbd5e1';
$donut = function (array $rows, string $key) use ($palette, $greySeg): array {
    $segs = []; $total = 0.0; $i = 0;
    foreach ($rows as $r) { $v = (float)($r[$key] ?? 0); if ($v <= 0) continue; $total += $v;
        $segs[] = ['label' => $r['name'], 'value' => $v, 'color' => $palette[$i++ % count($palette)]]; }
    if ($total <= 0) return ['css' => $greySeg, 'segments' => [], 'total' => 0];
    $stops = []; $acc = 0.0;
    foreach ($segs as $s) { $a = $acc / $total * 100; $acc += $s['value']; $stops[] = sprintf('%s %.2f%% %.2f%%', $s['color'], $a, $acc / $total * 100); }
    return ['css' => 'conic-gradient(' . implode(',', $stops) . ')', 'segments' => $segs, 'total' => $total];
};
$shortMoney = function (float $n): string {
    if ($n >= 1000000) return rtrim(rtrim(number_format($n / 1000000, 1), '0'), '.') . 'M';
    if ($n >= 1000)    return (string)round($n / 1000) . 'K';
    return (string)round($n);
};
$byCollected = $branches; usort($byCollected, fn($a, $b) => (float)$b['collected'] <=> (float)$a['collected']);
$byStudents  = $branches; usort($byStudents,  fn($a, $b) => (int)$b['students'] <=> (int)$a['students']);
$feeDonut = $donut($byCollected, 'collected');
$stuDonut = $donut($byStudents, 'students');

// Branch colour = its position in the collected donut, so the table matches the chart.
$branchColor = [];
foreach ($feeDonut['segments'] as $s) $branchColor[$s['label']] = $s['color'];

// ── Needs attention — only real, non-zero things, each pointing somewhere ──
$attention = [];
foreach ($branches as $b) {
    if (empty($b['attend_taken']) && (int)$b['students'] > 0 && date('N') <= 5) $attention[] = ['b' => $b, 'text' => 'No attendance taken today', 'tone' => 'amber'];
    if ((float)$b['billed'] > 0 && $b['rate'] < 40) $attention[] = ['b' => $b, 'text' => 'Collection at ' . number_format($b['rate'], 0) . '% of the term', 'tone' => 'rose'];
    if ((int)$b['admissions_pending'] > 0) $attention[] = ['b' => $b, 'text' => (int)$b['admissions_pending'] . ' admission' . ((int)$b['admissions_pending'] === 1 ? '' : 's') . ' waiting for review', 'tone' => 'blue'];
    if ((int)$b['reminders_draft'] > 0) $attention[] = ['b' => $b, 'text' => (int)$b['reminders_draft'] . ' fee reminder' . ((int)$b['reminders_draft'] === 1 ? '' : 's') . ' drafted, not approved', 'tone' => 'violet'];
    if ((int)$b['approvals_pending'] > 0) $attention[] = ['b' => $b, 'text' => (int)$b['approvals_pending'] . ' approval' . ((int)$b['approvals_pending'] === 1 ? '' : 's') . ' pending', 'tone' => 'amber'];
}
$toneCls = ['amber' => 'bg-amber-100 text-amber-700', 'rose' => 'bg-rose-100 text-rose-700', 'blue' => 'bg-blue-100 text-blue-700', 'violet' => 'bg-violet-100 text-violet-700'];

$hour  = (int)date('G');
$greet = $hour < 12 ? 'Good morning' : ($hour < 17 ? 'Good afternoon' : 'Good evening');
$name  = trim((string)(currentUser()['name'] ?? ''));
if (str_contains($name, '@')) $name = ucfirst(explode('@', $name)[0]);
// Short names ("The Forge") are used whole — a first-word greeting of "The" is worse than none.
$firstName = $name === '' ? 'there' : (str_word_count($name) <= 2 ? $name : explode(' ', $name)[0]);

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="flex items-start justify-between gap-4 mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900"><?= e($greet) ?>, <?= e($firstName) ?></h1>
        <p class="text-sm text-gray-500 mt-1"><?= e($groupName) ?> · <?= count($branches) ?> school<?= count($branches) === 1 ? '' : 's' ?> · each in its own current term · <?= e(date('l j F')) ?></p>
    </div>
    <a href="<?= baseUrl('group/reports') ?>" class="shrink-0 inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V9m4 8V5m4 12v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
        Reports
    </a>
</div>

<!-- Ask across the group -->
<form method="GET" action="<?= baseUrl('ask') ?>" class="mb-5 bg-white rounded-xl border border-emerald-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3 flex items-center gap-2 flex-wrap">
    <span class="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-none"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg></span>
    <input type="text" name="q" maxlength="600" autocomplete="off" placeholder="Ask across every branch — e.g. Which branch is furthest behind on fees, and by how much?" class="flex-1 min-w-[240px] px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
    <button class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Ask</button>
    <div class="w-full flex flex-wrap gap-1.5 pl-11">
        <?php foreach (['Which branch is behind on collections?', 'Who are the ten largest debtors in the group?', 'Which branches are recording expenses?', 'How many children joined and left each branch this term?'] as $ex): ?>
            <button type="submit" name="q" value="<?= e($ex) ?>" class="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"><?= e($ex) ?></button>
        <?php endforeach; ?>
    </div>
</form>

<?php if ($rpcMissing): ?>
<div class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
    <strong>Migration 127 hasn't been run.</strong> The group figures come from <span class="font-mono">group_dashboard_stats</span> — run it in Supabase and reload the schema cache.
</div>
<?php elseif (empty($branches)): ?>
<div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    No schools are attached to this group yet. Branches appear here once they're added to <?= e($groupName) ?>.
</div>
<?php else: ?>

<!-- Stat tiles -->
<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-5">
    <?php // Compact figures in the tiles (6 across); the exact amount is in the tooltip.
    $tiles = [
        ['bg-violet-500', number_format($tot['students']), '', 'Students', 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'],
        ['bg-blue-500',   'KES ' . $shortMoney($tot['billed']), money($tot['billed']), 'Billed this term', 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'],
        ['bg-teal-500',   'KES ' . $shortMoney($tot['collected']), money($tot['collected']), 'Collected this term', 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
        ['bg-rose-500',   'KES ' . $shortMoney($tot['outstanding']), money($tot['outstanding']), 'Outstanding this term', 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'],
        ['bg-amber-500',  number_format($tot['rate'], 0) . '%', '', 'Collection rate', 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'],
        ['bg-pink-500',   'KES ' . $shortMoney($tot['expenses_month']), money($tot['expenses_month']), 'Spent in ' . date('F'), 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z'],
    ];
    foreach ($tiles as [$bg, $val, $full, $lbl, $path]): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5" <?= $full !== '' ? 'title="' . e($full) . '"' : '' ?>>
        <div class="w-11 h-11 rounded-xl <?= $bg ?> flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="<?= $path ?>"/></svg>
        </div>
        <div class="min-w-0">
            <p class="text-lg font-bold text-gray-900 leading-tight truncate tabular-nums"><?= e($val) ?></p>
            <p class="text-xs text-gray-500 mt-0.5 truncate"><?= e($lbl) ?></p>
        </div>
    </div>
    <?php endforeach; ?>
</div>

<!-- Donuts -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
    <?php foreach ([['Fee collection by school', 'This term, each school\'s own term', $feeDonut, fn($v) => 'KES ' . $shortMoney($v), $shortMoney($feeDonut['total']), 'collected'],
                    ['Students by school', 'Active learners', $stuDonut, fn($v) => number_format($v), number_format($stuDonut['total']), 'students']] as [$title, $sub, $d, $fmt, $centre, $unit]): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="mb-5">
            <h3 class="text-base font-semibold text-gray-900"><?= e($title) ?></h3>
            <p class="text-xs text-gray-500 mt-0.5"><?= e($sub) ?></p>
        </div>
        <div class="flex items-center gap-6 flex-wrap">
            <div class="relative w-[140px] h-[140px] rounded-full shrink-0" style="background:<?= $d['css'] ?>">
                <div class="absolute inset-0 m-[24px] rounded-full bg-white flex flex-col items-center justify-center">
                    <div class="text-lg font-bold text-gray-900 leading-none tabular-nums"><?= e($centre) ?></div>
                    <div class="text-[10px] text-gray-400 mt-0.5"><?= $unit ?></div>
                </div>
            </div>
            <ul class="flex-1 min-w-[12rem] space-y-2">
                <?php foreach ($d['segments'] as $s): ?>
                <li class="flex items-center justify-between gap-3 text-sm">
                    <span class="flex items-center gap-2 min-w-0"><span class="w-2.5 h-2.5 rounded-full flex-none" style="background:<?= $s['color'] ?>"></span><span class="text-gray-700 truncate"><?= e($s['label']) ?></span></span>
                    <span class="font-semibold text-gray-900 tabular-nums flex-none"><?= e($fmt($s['value'])) ?></span>
                </li>
                <?php endforeach; ?>
                <?php if (!$d['segments']): ?><li class="text-sm text-gray-400">Nothing yet.</li><?php endif; ?>
            </ul>
        </div>
    </div>
    <?php endforeach; ?>
</div>

<?php if ($more): $weeks = (array)$more['weeks']; $nW = count($weeks);
    // Stacked weekly bars: one column per week, one colour per branch.
    $weekTot = array_fill(0, $nW, 0.0); $wMax = 0.0;
    foreach ($more['branches'] as $mb) foreach ((array)$mb['weekly'] as $i => $v) $weekTot[$i] += (float)$v;
    $wMax = $weekTot ? max($weekTot) : 0.0; ?>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
    <!-- Weekly collections -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-baseline justify-between mb-4">
            <div><h3 class="text-base font-semibold text-gray-900">Collections, last 8 weeks</h3><p class="text-xs text-gray-500 mt-0.5">Every branch stacked, Monday to Sunday</p></div>
            <span class="text-xs text-gray-500 tabular-nums">This week <strong class="text-gray-900">KES <?= $shortMoney($weekTot[$nW - 1] ?? 0) ?></strong></span>
        </div>
        <div class="flex items-end gap-2 h-40">
            <?php for ($i = 0; $i < $nW; $i++): $tot = $weekTot[$i]; ?>
            <div class="flex-1 flex flex-col justify-end h-full group relative" title="Week of <?= e(date('j M', strtotime($weeks[$i]))) ?> · KES <?= e(number_format($tot)) ?>">
                <div class="flex flex-col-reverse rounded-t overflow-hidden" style="height:<?= $wMax > 0 ? max(2, (int)round($tot / $wMax * 100)) : 2 ?>%">
                    <?php foreach ($more['branches'] as $mb): $v = (float)(((array)$mb['weekly'])[$i] ?? 0); if ($v <= 0 || $tot <= 0) continue; ?>
                        <div style="height:<?= round($v / $tot * 100, 2) ?>%;background:<?= $branchColor[$mb['name']] ?? '#cbd5e1' ?>"></div>
                    <?php endforeach; ?>
                </div>
                <span class="text-[10px] text-gray-400 mt-1 text-center truncate"><?= e(date('j M', strtotime($weeks[$i]))) ?></span>
            </div>
            <?php endfor; ?>
        </div>
    </div>

    <!-- Movement -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="text-base font-semibold text-gray-900">Movement this term</h3><p class="text-xs text-gray-500 mt-0.5">Learners in and out, enquiries, riders</p></div>
        <div class="overflow-x-auto"><table class="w-full text-sm">
            <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-5 py-2 font-medium">School</th><th class="px-3 py-2 font-medium text-right">Joined</th><th class="px-3 py-2 font-medium text-right">Left</th>
                <th class="px-3 py-2 font-medium text-right">Enq. 30d</th><th class="px-3 py-2 font-medium text-right">Open</th><th class="px-3 py-2 font-medium text-right">Riders</th></tr></thead>
            <tbody class="divide-y divide-gray-50">
            <?php $mv = ['joined' => 0, 'left' => 0, 'enquiries_new' => 0, 'enquiries_open' => 0, 'riders' => 0];
            foreach ($branches as $b): $mb = $moreById[$b['id']] ?? null; if (!$mb) continue; foreach ($mv as $k => $_) $mv[$k] += (int)$mb[$k]; ?>
                <tr class="hover:bg-gray-50/60">
                    <td class="px-5 py-2"><span class="inline-block w-2 h-2 rounded-full mr-2 align-middle" style="background:<?= $branchColor[$b['name']] ?? '#cbd5e1' ?>"></span><span class="text-gray-900"><?= e($b['name']) ?></span></td>
                    <td class="px-3 py-2 text-right tabular-nums text-emerald-700"><?= (int)$mb['joined'] ?: '<span class="text-gray-300">—</span>' ?></td>
                    <td class="px-3 py-2 text-right tabular-nums <?= (int)$mb['left'] > 0 ? 'text-rose-600' : 'text-gray-300' ?>"><?= (int)$mb['left'] ?: '—' ?></td>
                    <td class="px-3 py-2 text-right tabular-nums text-gray-700"><?= (int)$mb['enquiries_new'] ?: '<span class="text-gray-300">—</span>' ?></td>
                    <td class="px-3 py-2 text-right tabular-nums <?= (int)$mb['enquiries_open'] > 0 ? 'text-amber-700 font-medium' : 'text-gray-300' ?>"><?= (int)$mb['enquiries_open'] ?: '—' ?></td>
                    <td class="px-3 py-2 text-right tabular-nums text-gray-700"><?= (int)$mb['riders'] ?: '<span class="text-gray-300">—</span>' ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
            <tfoot><tr class="border-t-2 border-gray-100 font-semibold text-gray-900 bg-gray-50/50">
                <td class="px-5 py-2">Group</td><td class="px-3 py-2 text-right tabular-nums"><?= $mv['joined'] ?></td><td class="px-3 py-2 text-right tabular-nums"><?= $mv['left'] ?></td>
                <td class="px-3 py-2 text-right tabular-nums"><?= $mv['enquiries_new'] ?></td><td class="px-3 py-2 text-right tabular-nums"><?= $mv['enquiries_open'] ?></td><td class="px-3 py-2 text-right tabular-nums"><?= $mv['riders'] ?></td></tr></tfoot>
        </table></div>
    </div>
</div>

<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
    <!-- Spend by heading -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="mb-4"><h3 class="text-base font-semibold text-gray-900">Where the money went in <?= e(date('F')) ?></h3><p class="text-xs text-gray-500 mt-0.5">All branches, by heading — only where a branch records its spending</p></div>
        <?php $sh = (array)$more['spend_by_heading']; if (!$sh): ?><p class="text-sm text-gray-400">No expenses recorded this month anywhere in the group.</p>
        <?php else: $shMax = max(array_map(fn($r) => (float)$r['amount'], $sh)); $shTot = array_sum(array_map(fn($r) => (float)$r['amount'], $sh)); ?>
        <ul class="space-y-2.5">
            <?php foreach (array_slice($sh, 0, 8) as $i => $r): ?>
            <li>
                <div class="flex justify-between text-[12.5px]"><span class="text-gray-800"><?= e($r['heading']) ?> <span class="text-gray-400">· <?= (int)$r['entries'] ?></span></span><span class="font-semibold tabular-nums"><?= number_format((float)$r['amount']) ?> <span class="text-gray-400 font-normal"><?= $shTot > 0 ? (int)round((float)$r['amount'] / $shTot * 100) : 0 ?>%</span></span></div>
                <div class="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden"><div class="h-full rounded-full" style="width:<?= $shMax > 0 ? (int)((float)$r['amount'] / $shMax * 100) : 0 ?>%;background:<?= $palette[$i % count($palette)] ?>"></div></div>
            </li>
            <?php endforeach; ?>
        </ul>
        <p class="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100">Total KES <?= number_format($shTot) ?>. Branches logging nothing are not "spending nothing".</p>
        <?php endif; ?>
    </div>

    <!-- Top debtors -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="text-base font-semibold text-gray-900">Largest balances in the group</h3><p class="text-xs text-gray-500 mt-0.5">Active learners, all terms, every branch</p></div>
        <?php $td = (array)$more['top_debtors']; if (!$td): ?><p class="px-5 py-8 text-sm text-gray-400 text-center">No balances outstanding.</p>
        <?php else: ?>
        <div class="overflow-x-auto"><table class="w-full text-sm">
            <tbody class="divide-y divide-gray-50">
            <?php foreach ($td as $r): ?>
                <tr class="hover:bg-gray-50/60">
                    <td class="px-5 py-2"><span class="text-gray-900 font-medium"><?= e($r['learner']) ?></span><span class="block text-[11px] text-gray-400"><?= e($r['class'] ?: '—') ?> · <span class="inline-block w-1.5 h-1.5 rounded-full align-middle" style="background:<?= $branchColor[$r['school']] ?? '#cbd5e1' ?>"></span> <?= e($r['school']) ?></span></td>
                    <td class="px-5 py-2 text-right tabular-nums font-semibold text-rose-600">KES <?= number_format((float)$r['balance']) ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody></table></div>
        <?php endif; ?>
    </div>
</div>
<?php elseif (!empty($moreRes['error']) && stripos((string)$moreRes['error'], 'group_dashboard_more') !== false): ?>
<div class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800"><strong>Migration 141 hasn't been run.</strong> It adds the weekly collections, movement, spend-by-heading and largest-balances panels here, and lets Ask work across the group.</div>
<?php endif; ?>

<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">

<!-- Branch comparison -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100 flex items-baseline justify-between">
        <h2 class="text-sm font-semibold text-gray-700">School comparison</h2>
        <span class="text-[11px] text-gray-400">Sorted by collection rate</span>
    </div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th class="px-5 py-2.5 font-medium">School</th>
                    <th class="px-3 py-2.5 font-medium text-right">Students</th>
                    <th class="px-3 py-2.5 font-medium text-right">Billed</th>
                    <th class="px-3 py-2.5 font-medium text-right">Collected</th>
                    <th class="px-3 py-2.5 font-medium w-36">Rate</th>
                    <th class="px-3 py-2.5 font-medium text-right">Outstanding</th>
                    <th class="px-3 py-2.5 font-medium text-right">Arrears</th>
                    <th class="px-3 py-2.5 font-medium text-right">7 days</th>
                    <th class="px-3 py-2.5 font-medium text-right">Attend.</th>
                    <th class="px-3 py-2.5 font-medium text-right">Spend</th>
                    <th class="px-5 py-2.5"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($branches as $b): $col = $branchColor[$b['name']] ?? '#cbd5e1'; ?>
                <tr class="hover:bg-gray-50/60">
                    <td class="px-5 py-3">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="w-2.5 h-2.5 rounded-full flex-none" style="background:<?= $col ?>"></span>
                            <div class="min-w-0">
                                <span class="font-medium text-gray-900"><?= e($b['name']) ?></span>
                                <?php if (empty($b['is_active'])): ?><span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">inactive</span><?php endif; ?>
                                <p class="text-[11px] text-gray-400"><?= e($b['term_name'] ?: 'No current term set') ?><?= $b['code'] ? ' · ' . e($b['code']) : '' ?></p>
                            </div>
                        </div>
                    </td>
                    <td class="px-3 py-3 text-right text-gray-700 tabular-nums"><?= number_format((int)$b['students']) ?></td>
                    <td class="px-3 py-3 text-right text-gray-700 tabular-nums"><?= $shortMoney((float)$b['billed']) ?></td>
                    <td class="px-3 py-3 text-right text-emerald-700 font-medium tabular-nums"><?= $shortMoney((float)$b['collected']) ?></td>
                    <td class="px-3 py-3">
                        <div class="flex items-center gap-2">
                            <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full" style="width:<?= (int)min(100, $b['rate']) ?>%;background:<?= $col ?>"></div></div>
                            <span class="text-xs tabular-nums w-9 text-right <?= $b['rate'] < 40 ? 'text-rose-600 font-semibold' : 'text-gray-700' ?>"><?= number_format($b['rate'], 0) ?>%</span>
                        </div>
                    </td>
                    <td class="px-3 py-3 text-right text-amber-700 tabular-nums"><?= $shortMoney((float)$b['outstanding']) ?></td>
                    <td class="px-3 py-3 text-right tabular-nums <?= (float)$b['arrears'] > 0 ? 'text-rose-600' : 'text-gray-400' ?>"><?= (float)$b['arrears'] > 0 ? $shortMoney((float)$b['arrears']) : '—' ?></td>
                    <td class="px-3 py-3 text-right text-gray-700 tabular-nums"><?= (float)$b['collected_7d'] > 0 ? $shortMoney((float)$b['collected_7d']) : '—' ?></td>
                    <td class="px-3 py-3 text-right tabular-nums">
                        <?php if (!empty($b['attend_taken'])): $ap = (float)$b['attend_pct']; ?>
                            <span class="<?= $ap < 85 ? 'text-amber-600 font-semibold' : 'text-gray-700' ?>"><?= number_format($ap, 0) ?>%</span>
                        <?php else: ?><span class="text-gray-300" title="No attendance taken today">—</span><?php endif; ?>
                    </td>
                    <td class="px-3 py-3 text-right text-gray-700 tabular-nums"><?= (float)$b['expenses_month'] > 0 ? $shortMoney((float)$b['expenses_month']) : '—' ?></td>
                    <td class="px-5 py-3 text-right">
                        <form method="POST" action="<?= baseUrl('group') ?>">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="enter">
                            <input type="hidden" name="school_id" value="<?= e($b['id']) ?>">
                            <button class="text-xs font-medium text-emerald-600 hover:text-emerald-700 whitespace-nowrap">Open →</button>
                        </form>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
            <tfoot>
                <tr class="border-t-2 border-gray-100 font-semibold text-gray-900 bg-gray-50/50">
                    <td class="px-5 py-3">Group total</td>
                    <td class="px-3 py-3 text-right tabular-nums"><?= number_format($tot['students']) ?></td>
                    <td class="px-3 py-3 text-right tabular-nums"><?= $shortMoney($tot['billed']) ?></td>
                    <td class="px-3 py-3 text-right text-emerald-700 tabular-nums"><?= $shortMoney($tot['collected']) ?></td>
                    <td class="px-3 py-3 text-xs tabular-nums"><?= number_format($tot['rate'], 0) ?>%</td>
                    <td class="px-3 py-3 text-right text-amber-700 tabular-nums"><?= $shortMoney($tot['outstanding']) ?></td>
                    <td class="px-3 py-3 text-right text-rose-600 tabular-nums"><?= $tot['arrears'] > 0 ? $shortMoney($tot['arrears']) : '—' ?></td>
                    <td class="px-3 py-3 text-right tabular-nums"><?= $shortMoney($tot['collected_7d']) ?></td>
                    <td class="px-3 py-3"></td>
                    <td class="px-3 py-3 text-right tabular-nums"><?= $shortMoney($tot['expenses_month']) ?></td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    </div>
    <p class="px-5 py-3 text-[11px] text-gray-400 border-t border-gray-50">Billed, collected and outstanding are each school's current term. Arrears is what's still owed from earlier terms. Spend is expenses logged this month — only meaningful where a school records them.</p>
</div>

<!-- Needs attention -->
<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <h2 class="text-sm font-semibold text-gray-700 mb-3">Needs attention</h2>
    <?php if (!$attention): ?>
        <p class="text-sm text-gray-400">Nothing waiting across the group.</p>
    <?php else: ?>
    <ul class="space-y-2">
        <?php foreach (array_slice($attention, 0, 12) as $a): ?>
        <li>
            <form method="POST" action="<?= baseUrl('group') ?>" class="w-full">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="enter">
                <input type="hidden" name="school_id" value="<?= e($a['b']['id']) ?>">
                <button class="w-full text-left flex items-start gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50 transition">
                    <span class="mt-1.5 w-2 h-2 rounded-full flex-none" style="background:<?= ['amber' => '#f59e0b', 'rose' => '#f43f5e', 'blue' => '#3b82f6', 'violet' => '#8b5cf6'][$a['tone']] ?>"></span>
                    <span class="min-w-0">
                        <span class="block text-sm text-gray-800"><?= e($a['text']) ?></span>
                        <span class="block text-[11px] text-gray-400"><?= e($a['b']['name']) ?> · open →</span>
                    </span>
                </button>
            </form>
        </li>
        <?php endforeach; ?>
        <?php if (count($attention) > 12): ?><li class="text-[11px] text-gray-400"><?= count($attention) - 12 ?> more</li><?php endif; ?>
    </ul>
    <?php endif; ?>
</div>
</div>

<?php endif; ?>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
