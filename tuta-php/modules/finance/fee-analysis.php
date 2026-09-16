<?php
/**
 * Fee Analysis — the report the office kept asking for: billed vs collected
 * vs outstanding, sliced BY FEE TYPE and BY CLASS for a chosen term.
 *
 * Data model (Tuta): every invoice is itemised in `invoice_items`
 * (invoice_id, fee_head_id, amount), so billed-by-fee-type is exact. Payments
 * land on the whole invoice (`invoices.paid_amount`), not per line — so
 * collected is attributed to each fee type PRO-RATA by its share of the
 * invoice's billed lines. That's flagged in the UI so the number is honest.
 */
$pageTitle = 'Fee Analysis';
$sb  = new Supabase();
$sid = schoolId();

// ── Filters ──────────────────────────────────────────────────────
$termId  = trim((string)input('term'));
$classId = trim((string)input('class'));

// Four independent fetches in ONE concurrent round-trip (terms, classes,
// students, fee heads) instead of four sequential ones.
$par = Supabase::fetchParallel([
    'terms'    => $sb->from('terms')->select('id,name,is_current,start_date')
        ->eq('school_id', $sid)->order('start_date'),
    'classes'  => $sb->from('classes')->select('id,name,level')->eq('school_id', $sid)->order('level'),
    'students' => $sb->from('students')->select('id,current_class_id')->eq('school_id', $sid)->range(0, 1000),
    'heads'    => $sb->from('fee_heads')->select('id,name,category')->eq('school_id', $sid),
]);
$terms = $par['terms'];
if ($termId === '') {
    foreach ($terms as $t) { if (!empty($t['is_current'])) { $termId = $t['id']; break; } }
    if ($termId === '' && $terms) $termId = $terms[array_key_last($terms)]['id'];
}
$termName = '';
foreach ($terms as $t) if ($t['id'] === $termId) $termName = $t['name'];

$classes  = $par['classes'];
$classMap = [];
foreach ($classes as $c) $classMap[$c['id']] = $c['name'];

// student → class (for grouping + the class filter); continue paging >1000.
$students = $par['students'];
$off = 1000;
while (count($students) === $off) {
    $more = $sb->from('students')->select('id,current_class_id')->eq('school_id', $sid)
        ->range($off, 1000)->execute()['data'] ?? [];
    if (empty($more)) break;
    $students = array_merge($students, $more);
    if (count($more) < 1000) break;
    $off += 1000;
}
$stuClass = [];
foreach ($students as $s) $stuClass[$s['id']] = $s['current_class_id'] ?? null;

// ── Invoices for the term (+ optional class) ─────────────────────
$invoices = Supabase::fetchAllPaged(fn($q) =>
    $q->from('invoices')->select('id,student_id,amount,paid_amount,discount_amount')
      ->eq('school_id', $sid)->eq('term_id', $termId));
if ($classId !== '') {
    $invoices = array_values(array_filter($invoices, fn($i) => ($stuClass[$i['student_id']] ?? null) === $classId));
}
$invById = [];
foreach ($invoices as $i) $invById[$i['id']] = $i;
$invIds = array_keys($invById);

// ── Invoice line items — the IN-filter chunks fetched CONCURRENTLY ──
$items = [];
$chunkQs = [];
foreach (array_chunk($invIds, 250) as $ci => $chunk) {
    if (!$chunk) continue;
    $chunkQs['c' . $ci] = $sb->from('invoice_items')->select('invoice_id,fee_head_id,amount')
        ->in('invoice_id', $chunk)->limit(20000);
}
if ($chunkQs) {
    foreach (Supabase::fetchParallel($chunkQs) as $rows) $items = array_merge($items, $rows);
}

$feeHeads = $par['heads'];
$fhName = $fhCat = [];
foreach ($feeHeads as $f) { $fhName[$f['id']] = $f['name']; $fhCat[$f['id']] = $f['category'] ?? 'other'; }

// per-invoice sum of item lines (denominator for pro-rata allocation)
$invItemTotal = [];
foreach ($items as $it) $invItemTotal[$it['invoice_id']] = ($invItemTotal[$it['invoice_id']] ?? 0) + (float)$it['amount'];

// ── BY FEE TYPE (billed exact; collected pro-rata) ───────────────
// Grouped by fee-head NAME, not id: schools price each class separately, so
// "Tuition Fee" exists once per class — by id the school-wide view would show
// twelve identical "Tuition Fee" rows. By name it's one line; the per-class
// split is what the class filter is for.
$byType = [];
foreach ($items as $it) {
    $inv = $invById[$it['invoice_id']] ?? null; if (!$inv) continue;
    $fid = $it['fee_head_id'] ?? null;
    $nm  = $fid ? ($fhName[$fid] ?? 'Unitemised') : 'Unitemised';
    $key = mb_strtolower(trim($nm));
    $amt = (float)$it['amount'];
    $tot = $invItemTotal[$it['invoice_id']] ?? 0;
    $coll = $tot > 0 ? ((float)$inv['paid_amount']) * ($amt / $tot) : 0.0;
    if (!isset($byType[$key])) $byType[$key] = ['name' => $nm, 'cat' => $fid ? ($fhCat[$fid] ?? 'other') : 'other', 'billed' => 0.0, 'collected' => 0.0, 'n' => 0];
    $byType[$key]['billed'] += $amt;
    $byType[$key]['collected'] += $coll;
    $byType[$key]['n']++;
}
uasort($byType, fn($a, $b) => $b['billed'] <=> $a['billed']);

// ── BY CLASS (invoice-level) ─────────────────────────────────────
$byClass = [];
foreach ($invoices as $i) {
    $cid = $stuClass[$i['student_id']] ?? '_none';
    if (!isset($byClass[$cid])) $byClass[$cid] = ['name' => $classMap[$cid] ?? 'Unassigned', 'billed' => 0.0, 'collected' => 0.0, 'stu' => []];
    $byClass[$cid]['billed'] += (float)$i['amount'];
    $byClass[$cid]['collected'] += (float)$i['paid_amount'];
    $byClass[$cid]['stu'][$i['student_id']] = 1;
}
// order by class level
$levelOf = [];
foreach ($classes as $c) $levelOf[$c['id']] = (int)($c['level'] ?? 999);
uksort($byClass, fn($a, $b) => ($levelOf[$a] ?? 999) <=> ($levelOf[$b] ?? 999));

// ── Totals ───────────────────────────────────────────────────────
$totBilled    = array_sum(array_map(fn($i) => (float)$i['amount'], $invoices));
$totCollected = array_sum(array_map(fn($i) => (float)$i['paid_amount'], $invoices));
$totOutstanding = $totBilled - $totCollected;
$collRate = $totBilled > 0 ? ($totCollected / $totBilled) * 100 : 0;
$nStudents = count(array_unique(array_column($invoices, 'student_id')));

// ── Per-student drill-down (only when a class is chosen) ─────────
$perStudent = [];
if ($classId !== '' && $invoices) {
    $sids = array_values(array_unique(array_column($invoices, 'student_id')));
    $nameMap = []; $nameQs = [];
    foreach (array_chunk($sids, 300) as $ci => $chunk) {
        if (!$chunk) continue;
        $nameQs['n' . $ci] = $sb->from('students')->select('id,first_name,last_name,admission_number')
            ->in('id', $chunk)->limit(5000);
    }
    if ($nameQs) {
        foreach (Supabase::fetchParallel($nameQs) as $rows) {
            foreach ($rows as $s) $nameMap[$s['id']] = $s;
        }
    }
    $agg = [];   // student_id => [billed, collected]  (a student may hold >1 invoice)
    foreach ($invoices as $i) {
        $k = $i['student_id'];
        if (!isset($agg[$k])) $agg[$k] = [0.0, 0.0];
        $agg[$k][0] += (float)$i['amount'];
        $agg[$k][1] += (float)$i['paid_amount'];
    }
    foreach ($agg as $k => [$b, $c]) {
        $nm = $nameMap[$k] ?? [];
        $out = $b - $c;
        $perStudent[] = [
            'name'   => trim(($nm['first_name'] ?? '') . ' ' . ($nm['last_name'] ?? '')) ?: 'Student',
            'adm'    => $nm['admission_number'] ?? '',
            'billed' => $b, 'collected' => $c, 'out' => $out,
            'status' => $out <= 0.5 ? 'Paid' : ($c > 0.5 ? 'Partial' : 'Unpaid'),
        ];
    }
    usort($perStudent, fn($x, $y) => $y['out'] <=> $x['out']);   // defaulters first
}

// ── CSV export ───────────────────────────────────────────────────
if (input('export') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="fee-analysis-' . preg_replace('/\W+/', '-', $termName) . '.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['Fee Analysis', $termName, ($classId ? ($classMap[$classId] ?? '') : 'All classes')]);
    fputcsv($out, []);
    fputcsv($out, ['BY FEE TYPE', 'Category', 'Billed', 'Collected (pro-rata)', 'Outstanding', 'Collection %']);
    foreach ($byType as $r) {
        $o = $r['billed'] - $r['collected'];
        fputcsv($out, [$r['name'], $r['cat'], round($r['billed'], 2), round($r['collected'], 2), round($o, 2), $r['billed'] > 0 ? round($r['collected'] / $r['billed'] * 100, 1) : 0]);
    }
    fputcsv($out, []);
    fputcsv($out, ['BY CLASS', 'Students', 'Billed', 'Collected', 'Outstanding', 'Collection %']);
    foreach ($byClass as $r) {
        $o = $r['billed'] - $r['collected'];
        fputcsv($out, [$r['name'], count($r['stu']), round($r['billed'], 2), round($r['collected'], 2), round($o, 2), $r['billed'] > 0 ? round($r['collected'] / $r['billed'] * 100, 1) : 0]);
    }
    fputcsv($out, []);
    fputcsv($out, ['TOTAL', $nStudents, round($totBilled, 2), round($totCollected, 2), round($totOutstanding, 2), round($collRate, 1)]);
    if ($classId !== '' && $perStudent) {
        fputcsv($out, []);
        fputcsv($out, ['STUDENTS — ' . ($classMap[$classId] ?? ''), 'Adm #', 'Billed', 'Collected', 'Outstanding', 'Status']);
        foreach ($perStudent as $s) {
            fputcsv($out, [$s['name'], $s['adm'], round($s['billed'], 2), round($s['collected'], 2), round($s['out'], 2), $s['status']]);
        }
    }
    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';

$pct = fn($c, $b) => $b > 0 ? round($c / $b * 100, 1) : 0;
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Fee Analysis</h1>
        <p class="text-sm text-gray-500 mt-1">Billed vs collected by fee type and class · <span class="font-medium text-gray-600"><?= e($termName ?: '—') ?></span></p>
    </div>
    <a href="<?= baseUrl('finance/fee-analysis') ?>?term=<?= e($termId) ?>&amp;class=<?= e($classId) ?>&amp;export=csv" download
       class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        Export CSV
    </a>
</div>

<form method="GET" action="<?= baseUrl('finance/fee-analysis') ?>" class="flex items-end gap-2 flex-wrap mb-5">
    <label class="text-xs text-gray-500">Term
        <select name="term" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg">
            <?php foreach ($terms as $t): ?>
                <option value="<?= e($t['id']) ?>" <?= $t['id'] === $termId ? 'selected' : '' ?>><?= e($t['name']) ?><?= !empty($t['is_current']) ? ' (current)' : '' ?></option>
            <?php endforeach; ?>
        </select>
    </label>
    <label class="text-xs text-gray-500">Class
        <select name="class" class="mt-1 block px-3 py-2 text-sm border border-gray-200 rounded-lg">
            <option value="">All classes</option>
            <?php foreach ($classes as $c): ?>
                <option value="<?= e($c['id']) ?>" <?= $c['id'] === $classId ? 'selected' : '' ?>><?= e($c['name']) ?></option>
            <?php endforeach; ?>
        </select>
    </label>
    <button class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">View</button>
    <?php if ($classId): ?><a href="<?= baseUrl('finance/fee-analysis') ?>?term=<?= e($termId) ?>" class="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Clear class</a><?php endif; ?>
</form>

<!-- Key figures -->
<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
    <?php
    $kpis = [
        ['Students', number_format($nStudents), 'text-gray-900'],
        ['Billed', money($totBilled), 'text-gray-900'],
        ['Collected', money($totCollected), 'text-emerald-700'],
        ['Outstanding', money($totOutstanding), 'text-red-600'],
        ['Collection', round($collRate, 1) . '%', $collRate >= 75 ? 'text-emerald-700' : 'text-amber-600'],
    ];
    foreach ($kpis as [$label, $val, $cls]): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-xs text-gray-400"><?= e($label) ?></p>
            <p class="text-lg font-bold mt-0.5 tabular-nums <?= $cls ?>"><?= $val ?></p>
        </div>
    <?php endforeach; ?>
</div>

<?php if (empty($invoices)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500">
        No invoices for this term<?= $classId ? ' in the selected class' : '' ?> yet.
    </div>
<?php else: ?>

<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">

    <!-- BY FEE TYPE -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-700">By Fee Type</h2>
            <span class="text-[11px] text-gray-400">collected = pro-rata of invoice payments</span>
        </div>
        <table class="w-full text-sm">
            <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-5 py-2 font-medium">Fee type</th>
                <th class="px-3 py-2 font-medium text-right">Billed</th>
                <th class="px-3 py-2 font-medium text-right">Collected</th>
                <th class="px-3 py-2 font-medium text-right">Outstanding</th>
                <th class="px-5 py-2 font-medium text-right">%</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($byType as $r): $o = $r['billed'] - $r['collected']; $p = $pct($r['collected'], $r['billed']); ?>
                    <tr class="hover:bg-gray-50">
                        <td class="px-5 py-2 text-gray-700"><?= e($r['name']) ?><span class="ml-1.5 text-[10px] text-gray-400"><?= e($r['cat']) ?></span></td>
                        <td class="px-3 py-2 text-right tabular-nums text-gray-800"><?= money($r['billed']) ?></td>
                        <td class="px-3 py-2 text-right tabular-nums text-emerald-700"><?= money($r['collected']) ?></td>
                        <td class="px-3 py-2 text-right tabular-nums <?= $o > 0.5 ? 'text-red-600' : 'text-gray-400' ?>"><?= money($o) ?></td>
                        <td class="px-5 py-2 text-right tabular-nums <?= $p >= 75 ? 'text-emerald-700' : 'text-amber-600' ?>"><?= $p ?>%</td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
            <tfoot><tr class="border-t-2 border-gray-100 font-semibold bg-gray-50/60">
                <td class="px-5 py-2.5 text-gray-900">Total</td>
                <td class="px-3 py-2.5 text-right tabular-nums"><?= money($totBilled) ?></td>
                <td class="px-3 py-2.5 text-right tabular-nums text-emerald-700"><?= money($totCollected) ?></td>
                <td class="px-3 py-2.5 text-right tabular-nums text-red-600"><?= money($totOutstanding) ?></td>
                <td class="px-5 py-2.5 text-right tabular-nums"><?= round($collRate, 1) ?>%</td>
            </tr></tfoot>
        </table>
    </div>

    <!-- BY CLASS -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">By Class</h2></div>
        <table class="w-full text-sm">
            <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-5 py-2 font-medium">Class</th>
                <th class="px-3 py-2 font-medium text-right">Students</th>
                <th class="px-3 py-2 font-medium text-right">Billed</th>
                <th class="px-3 py-2 font-medium text-right">Collected</th>
                <th class="px-5 py-2 font-medium text-right">%</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($byClass as $cid => $r): $p = $pct($r['collected'], $r['billed']); $isReal = isset($classMap[$cid]); ?>
                    <tr class="hover:bg-gray-50">
                        <td class="px-5 py-2 text-gray-700">
                            <?php if ($isReal): ?>
                                <a href="<?= baseUrl('finance/fee-analysis') ?>?term=<?= e($termId) ?>&amp;class=<?= e($cid) ?>" class="text-emerald-700 hover:underline"><?= e($r['name']) ?></a>
                            <?php else: ?><?= e($r['name']) ?><?php endif; ?>
                        </td>
                        <td class="px-3 py-2 text-right tabular-nums text-gray-500"><?= count($r['stu']) ?></td>
                        <td class="px-3 py-2 text-right tabular-nums text-gray-800"><?= money($r['billed']) ?></td>
                        <td class="px-3 py-2 text-right tabular-nums text-emerald-700"><?= money($r['collected']) ?></td>
                        <td class="px-5 py-2 text-right tabular-nums <?= $p >= 75 ? 'text-emerald-700' : 'text-amber-600' ?>"><?= $p ?>%</td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
            <tfoot><tr class="border-t-2 border-gray-100 font-semibold bg-gray-50/60">
                <td class="px-5 py-2.5 text-gray-900">Total</td>
                <td class="px-3 py-2.5 text-right tabular-nums text-gray-500"><?= $nStudents ?></td>
                <td class="px-3 py-2.5 text-right tabular-nums"><?= money($totBilled) ?></td>
                <td class="px-3 py-2.5 text-right tabular-nums text-emerald-700"><?= money($totCollected) ?></td>
                <td class="px-5 py-2.5 text-right tabular-nums"><?= round($collRate, 1) ?>%</td>
            </tr></tfoot>
        </table>
    </div>

</div>

<?php if ($classId !== '' && $perStudent): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mt-4">
    <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-700"><?= e($classMap[$classId] ?? 'Class') ?> — Students</h2>
        <span class="text-[11px] text-gray-400">highest balance first</span>
    </div>
    <table class="w-full text-sm">
        <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th class="px-5 py-2 font-medium">Student</th>
            <th class="px-3 py-2 font-medium">Adm #</th>
            <th class="px-3 py-2 font-medium text-right">Billed</th>
            <th class="px-3 py-2 font-medium text-right">Collected</th>
            <th class="px-3 py-2 font-medium text-right">Outstanding</th>
            <th class="px-5 py-2 font-medium text-center">Status</th>
        </tr></thead>
        <tbody class="divide-y divide-gray-50">
            <?php foreach ($perStudent as $s):
                $badge = $s['status'] === 'Paid' ? 'bg-emerald-50 text-emerald-700'
                       : ($s['status'] === 'Partial' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'); ?>
                <tr class="hover:bg-gray-50">
                    <td class="px-5 py-2 text-gray-700"><?= e($s['name']) ?></td>
                    <td class="px-3 py-2 text-gray-400 font-mono text-xs"><?= e($s['adm']) ?></td>
                    <td class="px-3 py-2 text-right tabular-nums text-gray-800"><?= money($s['billed']) ?></td>
                    <td class="px-3 py-2 text-right tabular-nums text-emerald-700"><?= money($s['collected']) ?></td>
                    <td class="px-3 py-2 text-right tabular-nums <?= $s['out'] > 0.5 ? 'text-red-600 font-medium' : 'text-gray-400' ?>"><?= money($s['out']) ?></td>
                    <td class="px-5 py-2 text-center"><span class="inline-block px-2 py-0.5 rounded text-[11px] font-medium <?= $badge ?>"><?= e($s['status']) ?></span></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>
<?php endif; ?>

<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
