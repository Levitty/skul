<?php
/**
 * Aged Receivables (Debtors Ageing) — who owes, and how overdue.
 *
 * Each invoice's outstanding balance is bucketed by how far past its due
 * date it is: Current / 1–30 / 31–60 / 61–90 / 90+ days. Summed per
 * student so the office can prioritise follow-up (guardian phone shown).
 *
 * Correctness (audit R1): excludes draft, cancelled, and carried_forward
 * invoices. A carried_forward invoice's balance has already been rolled
 * into a newer invoice, so counting it here would double-count arrears.
 *
 * Read-only. CSV export mirrors the on-screen table. Spans ALL terms —
 * "what does this family owe in total" — not a single term.
 */
$pageTitle = 'Aged Receivables';
$sb  = new Supabase();
$sid = schoolId();

$classes  = cachedClasses();
$classMap = cachedClassMap();

// ── Filters ──
$filterClass = input('class_id');
$minBalance  = (float)input('min_balance');
$isExport    = input('export') === 'csv';

$today = new DateTimeImmutable('today');

// ── Resolve class filter → student IDs (scope the invoice query in DB) ──
$classStudentIds = null;
if ($filterClass) {
    $classStudents = $sb->from('students')->select('id')
        ->eq('school_id', $sid)->eq('current_class_id', $filterClass)->execute();
    $classStudentIds = array_column($classStudents['data'] ?? [], 'id');
    if (empty($classStudentIds)) $classStudentIds = ['__none__'];
}

// ── Pull invoices (paged so it's correct above 1000) ──
$invoices = Supabase::fetchAllPaged(function ($_sb) use ($sid, $classStudentIds) {
    $q = $_sb->from('invoices')
        ->select('student_id,amount,paid_amount,status,due_date')
        ->eq('school_id', $sid);
    if ($classStudentIds) $q = $q->in('student_id', $classStudentIds);
    return $q;
});

// ── Bucket each invoice's balance by age, aggregate per student ──
$bucketKeys = ['current', 'b30', 'b60', 'b90', 'b90plus'];
$emptyBuckets = array_fill_keys($bucketKeys, 0.0);
$byStudent = [];            // student_id => buckets + total
$grand = $emptyBuckets;
$grandTotal = 0.0;

foreach ($invoices as $inv) {
    $st = $inv['status'] ?? '';
    if (in_array($st, ['draft', 'cancelled', 'carried_forward'], true)) continue;

    $balance = (float)($inv['amount'] ?? 0) - (float)($inv['paid_amount'] ?? 0);
    if ($balance <= 0.01) continue;

    // Age = days past due. No due date → treat as current (not yet overdue).
    $bucket = 'current';
    $due = $inv['due_date'] ?? null;
    if ($due) {
        $dueDate = date_create_immutable($due);
        if ($dueDate) {
            $age = (int)$today->diff($dueDate)->format('%r%a'); // negative if due in future
            $age = -$age; // days PAST due (positive when overdue)
            if ($age <= 0)       $bucket = 'current';
            elseif ($age <= 30)  $bucket = 'b30';
            elseif ($age <= 60)  $bucket = 'b60';
            elseif ($age <= 90)  $bucket = 'b90';
            else                 $bucket = 'b90plus';
        }
    }

    $k = $inv['student_id'];
    if (!isset($byStudent[$k])) $byStudent[$k] = $emptyBuckets + ['total' => 0.0];
    $byStudent[$k][$bucket] += $balance;
    $byStudent[$k]['total'] += $balance;
    $grand[$bucket] += $balance;
    $grandTotal += $balance;
}

// Drop students under the min-balance threshold.
if ($minBalance > 0) {
    foreach (array_keys($byStudent) as $k) {
        if ($byStudent[$k]['total'] < $minBalance) unset($byStudent[$k]);
    }
}

// Sort by total owed, descending.
uasort($byStudent, fn($a, $b) => $b['total'] <=> $a['total']);

// ── Enrich with student details (chunked-in for >1000) ──
$studentDetails = [];
$studentIds = array_keys($byStudent);
if (!empty($studentIds)) {
    $rows = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('students')
            ->select('id,first_name,last_name,admission_number,current_class_id,guardian_phone'),
        'id',
        $studentIds
    );
    foreach ($rows as $s) $studentDetails[$s['id']] = $s;
}

$bucketLabels = [
    'current'  => 'Current',
    'b30'      => '1–30 days',
    'b60'      => '31–60 days',
    'b90'      => '61–90 days',
    'b90plus'  => '90+ days',
];

// ── CSV export (before any HTML) ──
if ($isExport) {
    $safe = fn($s) => preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string)$s, ' -'));
    $classLabel = $filterClass ? ($classMap[$filterClass] ?? 'class') : 'all-classes';
    $filename = 'aged_receivables_' . $safe($classLabel) . '_' . date('Y-m-d') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");

    fputcsv($out, ['Aged Receivables']);
    fputcsv($out, ['Generated', date('Y-m-d H:i')]);
    fputcsv($out, ['Class', $classLabel]);
    fputcsv($out, []);
    fputcsv($out, ['#', 'Student', 'Adm No.', 'Class', 'Phone',
                   'Current', '1-30', '31-60', '61-90', '90+', 'Total Owed']);
    $n = 0;
    foreach ($byStudent as $stuId => $b) {
        $n++;
        $stu = $studentDetails[$stuId] ?? null;
        fputcsv($out, [
            $n,
            $stu ? trim(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? '')) : 'Unknown',
            $stu['admission_number'] ?? '',
            $classMap[$stu['current_class_id'] ?? ''] ?? '',
            $stu['guardian_phone'] ?? '',
            number_format($b['current'], 2, '.', ''),
            number_format($b['b30'], 2, '.', ''),
            number_format($b['b60'], 2, '.', ''),
            number_format($b['b90'], 2, '.', ''),
            number_format($b['b90plus'], 2, '.', ''),
            number_format($b['total'], 2, '.', ''),
        ]);
    }
    fputcsv($out, []);
    fputcsv($out, ['', '', '', '', 'TOTALS',
        number_format($grand['current'], 2, '.', ''),
        number_format($grand['b30'], 2, '.', ''),
        number_format($grand['b60'], 2, '.', ''),
        number_format($grand['b90'], 2, '.', ''),
        number_format($grand['b90plus'], 2, '.', ''),
        number_format($grandTotal, 2, '.', ''),
    ]);
    fclose($out);
    exit;
}

// Paginate the on-screen table (CSV above is the full set).
$page    = currentPage();
$perPage = 50;
$total   = count($byStudent);
$paged   = array_slice($byStudent, ($page - 1) * $perPage, $perPage, true);

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Aged Receivables</h1>
        <p class="text-sm text-gray-500 mt-1">Outstanding balances by how overdue they are — across all terms.</p>
    </div>
    <a href="<?= baseUrl('fees/aging') ?>?export=csv&class_id=<?= urlencode($filterClass) ?>&min_balance=<?= urlencode((string)$minBalance) ?>"
       download class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        Export CSV
    </a>
</div>

<!-- Filters -->
<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <form method="GET" action="<?= baseUrl('fees/aging') ?>" class="flex flex-wrap items-end gap-4">
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select name="class_id" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm min-w-[160px]">
                <option value="">All Classes</option>
                <?php foreach ($classes as $c): ?>
                    <option value="<?= e($c['id']) ?>"<?= selectedIf($filterClass, $c['id']) ?>><?= e($c['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Min. balance</label>
            <input type="number" name="min_balance" step="1" min="0" value="<?= $minBalance > 0 ? e((string)$minBalance) : '' ?>" placeholder="0"
                class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm w-32">
        </div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Apply</button>
        <a href="<?= baseUrl('fees/aging') ?>" class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Reset</a>
    </form>
</div>

<!-- Bucket summary cards -->
<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
    <?php
    $cardColors = [
        'current' => 'text-gray-900', 'b30' => 'text-amber-600', 'b60' => 'text-amber-700',
        'b90' => 'text-red-600', 'b90plus' => 'text-red-700',
    ];
    foreach ($bucketKeys as $bk): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-[11px] text-gray-500"><?= e($bucketLabels[$bk]) ?></p>
            <p class="text-base font-bold <?= $cardColors[$bk] ?>"><?= money($grand[$bk]) ?></p>
        </div>
    <?php endforeach; ?>
    <div class="bg-gray-900 rounded-xl p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <p class="text-[11px] text-gray-300">Total owed</p>
        <p class="text-base font-bold text-white"><?= money($grandTotal) ?></p>
    </div>
</div>

<!-- Table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-700">
            Debtors <span class="text-gray-400 font-normal">(<?= number_format($total) ?>)</span>
        </h2>
    </div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Phone</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Current</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">1–30</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">31–60</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">61–90</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">90+</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($byStudent)): ?>
                    <tr><td colspan="10" class="px-4 py-12 text-center text-gray-400">No outstanding balances match these filters.</td></tr>
                <?php else: ?>
                    <?php $n = ($page - 1) * $perPage; foreach ($paged as $stuId => $b): $n++;
                        $stu = $studentDetails[$stuId] ?? null; ?>
                        <tr class="hover:bg-gray-50/50">
                            <td class="px-4 py-3 text-gray-400 text-xs"><?= $n ?></td>
                            <td class="px-4 py-3 font-medium text-gray-900">
                                <?php if ($stu): ?>
                                    <a href="<?= baseUrl('students/view?id=' . e($stuId)) ?>" class="hover:text-emerald-600 transition"><?= e(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? '')) ?></a>
                                    <?php if (!empty($stu['admission_number'])): ?><span class="text-gray-400 text-xs ml-1"><?= e($stu['admission_number']) ?></span><?php endif; ?>
                                <?php else: ?><span class="text-gray-400">Unknown</span><?php endif; ?>
                            </td>
                            <td class="px-4 py-3 text-gray-600 text-xs"><?= e($classMap[$stu['current_class_id'] ?? ''] ?? '—') ?></td>
                            <td class="px-4 py-3 text-gray-500 text-xs"><?= e($stu['guardian_phone'] ?? '—') ?></td>
                            <td class="px-4 py-3 text-right text-gray-700"><?= $b['current'] > 0 ? money($b['current']) : '—' ?></td>
                            <td class="px-4 py-3 text-right <?= $b['b30'] > 0 ? 'text-amber-600' : 'text-gray-300' ?>"><?= $b['b30'] > 0 ? money($b['b30']) : '—' ?></td>
                            <td class="px-4 py-3 text-right <?= $b['b60'] > 0 ? 'text-amber-700' : 'text-gray-300' ?>"><?= $b['b60'] > 0 ? money($b['b60']) : '—' ?></td>
                            <td class="px-4 py-3 text-right <?= $b['b90'] > 0 ? 'text-red-600' : 'text-gray-300' ?>"><?= $b['b90'] > 0 ? money($b['b90']) : '—' ?></td>
                            <td class="px-4 py-3 text-right <?= $b['b90plus'] > 0 ? 'text-red-700 font-semibold' : 'text-gray-300' ?>"><?= $b['b90plus'] > 0 ? money($b['b90plus']) : '—' ?></td>
                            <td class="px-4 py-3 text-right font-bold text-gray-900"><?= money($b['total']) ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
            <?php if (!empty($byStudent)): ?>
            <tfoot>
                <tr class="bg-gray-50 border-t border-gray-200 font-bold text-gray-800">
                    <td colspan="4" class="px-4 py-3">Totals</td>
                    <td class="px-4 py-3 text-right"><?= money($grand['current']) ?></td>
                    <td class="px-4 py-3 text-right text-amber-600"><?= money($grand['b30']) ?></td>
                    <td class="px-4 py-3 text-right text-amber-700"><?= money($grand['b60']) ?></td>
                    <td class="px-4 py-3 text-right text-red-600"><?= money($grand['b90']) ?></td>
                    <td class="px-4 py-3 text-right text-red-700"><?= money($grand['b90plus']) ?></td>
                    <td class="px-4 py-3 text-right text-gray-900"><?= money($grandTotal) ?></td>
                </tr>
            </tfoot>
            <?php endif; ?>
        </table>
    </div>
    <?php
    $pagBase = baseUrl('fees/aging');
    $qs = [];
    if ($filterClass) $qs[] = 'class_id=' . urlencode($filterClass);
    if ($minBalance > 0) $qs[] = 'min_balance=' . urlencode((string)$minBalance);
    if (!empty($qs)) $pagBase .= '?' . implode('&', $qs);
    echo paginationControls($page, $total, $perPage, $pagBase);
    ?>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
