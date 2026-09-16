<?php
/**
 * Discounts & Concessions report — who has been granted what.
 *
 * Lists every student_discounts assignment with the discount name, type,
 * configured value, scope (whole invoice vs a single fee head), and status.
 * Read-only; CSV export. Helps answer "how much are we giving away, and to
 * whom?" — the assignment side of the discounts the billing RPC now applies.
 *
 * Note on "value": this shows the discount's CONFIGURED value (e.g. 10% or
 * KES 5,000), not the amount applied to any one invoice (that varies per
 * invoice and is recorded as a line item at generation time).
 */
$pageTitle = 'Discounts & Concessions';
$sb  = new Supabase();
$sid = schoolId();

$classMap = cachedClassMap();

$filterStatus = input('status') ?: 'all';
$filterClass  = input('class_id');
$isExport     = input('export') === 'csv';
$classes      = cachedClasses();

// student_discounts has no school_id — scope via this school's fee_discounts.
$fdRes = $sb->from('fee_discounts')->select('id,name,type,value,is_active')
    ->eq('school_id', $sid)->execute();
$feeDiscounts = [];
foreach (($fdRes['data'] ?? []) as $d) $feeDiscounts[$d['id']] = $d;
$discountIds = array_keys($feeDiscounts);

$assignments = [];
if (!empty($discountIds)) {
    $assignments = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('student_discounts')
            ->select('id,student_id,fee_discount_id,fee_head_id,status,created_at'),
        'fee_discount_id',
        $discountIds
    );
}

// Enrich: students + fee heads.
$studentIds = array_values(array_unique(array_filter(array_column($assignments, 'student_id'))));
$studentDetails = [];
if (!empty($studentIds)) {
    $rows = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('students')
            ->select('id,first_name,last_name,admission_number,current_class_id'),
        'id',
        $studentIds
    );
    foreach ($rows as $s) $studentDetails[$s['id']] = $s;
}

$headIds = array_values(array_unique(array_filter(array_column($assignments, 'fee_head_id'))));
$headMap = [];
if (!empty($headIds)) {
    $rows = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('fee_heads')->select('id,name'),
        'id',
        $headIds
    );
    foreach ($rows as $h) $headMap[$h['id']] = $h['name'];
}

// Build display rows + apply filters.
$rows = [];
$countApproved = 0;
$fixedTotal = 0.0;     // sum of fixed-value discounts (KES) currently approved
$pctCount   = 0;       // count of percentage discounts (can't be summed to KES here)
foreach ($assignments as $a) {
    $fd  = $feeDiscounts[$a['fee_discount_id']] ?? null;
    if (!$fd) continue;
    $stu = $studentDetails[$a['student_id']] ?? null;

    // Class filter
    if ($filterClass && ($stu['current_class_id'] ?? '') !== $filterClass) continue;
    // Status filter
    if ($filterStatus !== 'all' && ($a['status'] ?? '') !== $filterStatus) continue;

    $scope = !empty($a['fee_head_id'])
        ? ('Fee head: ' . ($headMap[$a['fee_head_id']] ?? 'Unknown'))
        : 'Whole invoice';

    $row = [
        'student'   => $stu ? trim(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? '')) : 'Unknown',
        'adm'       => $stu['admission_number'] ?? '',
        'class'     => $classMap[$stu['current_class_id'] ?? ''] ?? '',
        'discount'  => $fd['name'] ?? '',
        'type'      => $fd['type'] ?? '',
        'value'     => (float)($fd['value'] ?? 0),
        'scope'     => $scope,
        'status'    => $a['status'] ?? '',
        'active'    => !empty($fd['is_active']),
        'created'   => $a['created_at'] ?? null,
    ];
    $rows[] = $row;

    if (($a['status'] ?? '') === 'approved' && !empty($fd['is_active'])) {
        $countApproved++;
        if (($fd['type'] ?? '') === 'fixed') $fixedTotal += (float)($fd['value'] ?? 0);
        else $pctCount++;
    }
}

// Sort: by student then discount.
usort($rows, fn($a, $b) => [$a['student'], $a['discount']] <=> [$b['student'], $b['discount']]);

$fmtValue = fn(array $r) => $r['type'] === 'percentage'
    ? rtrim(rtrim(number_format($r['value'], 2), '0'), '.') . '%'
    : money($r['value']);

// ── CSV export ──
if ($isExport) {
    $filename = 'concessions_' . date('Y-m-d') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['Discounts & Concessions']);
    fputcsv($out, ['Generated', date('Y-m-d H:i')]);
    fputcsv($out, ['Status filter', $filterStatus]);
    fputcsv($out, []);
    fputcsv($out, ['Student', 'Adm No.', 'Class', 'Discount', 'Type', 'Value', 'Scope', 'Status', 'Assigned']);
    foreach ($rows as $r) {
        fputcsv($out, [
            $r['student'], $r['adm'], $r['class'], $r['discount'],
            ucfirst($r['type']),
            $r['type'] === 'percentage'
                ? rtrim(rtrim(number_format($r['value'], 2), '0'), '.') . '%'
                : number_format($r['value'], 2, '.', ''),
            $r['scope'], $r['status'],
            $r['created'] ? date('Y-m-d', strtotime($r['created'])) : '',
        ]);
    }
    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Discounts &amp; Concessions</h1>
        <p class="text-sm text-gray-500 mt-1">Every discount assigned to a student. Manage the catalogue on the <a href="<?= baseUrl('fees/discounts') ?>" class="text-emerald-600 hover:underline">Discounts</a> page.</p>
    </div>
    <a href="<?= baseUrl('fees/concessions') ?>?export=csv&status=<?= urlencode($filterStatus) ?>&class_id=<?= urlencode($filterClass) ?>"
       download class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        Export CSV
    </a>
</div>

<!-- Summary -->
<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Assignments shown</p>
        <p class="text-xl font-bold text-gray-900"><?= number_format(count($rows)) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Active &amp; approved</p>
        <p class="text-xl font-bold text-emerald-700"><?= number_format($countApproved) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" title="Sum of fixed-amount discounts that are active &amp; approved. Percentage discounts vary per invoice and aren't summed here.">
        <p class="text-xs text-gray-500">Fixed concessions (KES)</p>
        <p class="text-xl font-bold text-gray-900"><?= money($fixedTotal) ?></p>
        <?php if ($pctCount > 0): ?><p class="text-[11px] text-gray-400 mt-0.5">+ <?= $pctCount ?> percentage discount<?= $pctCount !== 1 ? 's' : '' ?></p><?php endif; ?>
    </div>
</div>

<!-- Filters -->
<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <form method="GET" action="<?= baseUrl('fees/concessions') ?>" class="flex flex-wrap items-end gap-4">
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
            <label class="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select name="status" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm min-w-[150px]">
                <option value="all"<?= selectedIf($filterStatus, 'all') ?>>All</option>
                <option value="approved"<?= selectedIf($filterStatus, 'approved') ?>>Approved</option>
                <option value="pending"<?= selectedIf($filterStatus, 'pending') ?>>Pending</option>
                <option value="rejected"<?= selectedIf($filterStatus, 'rejected') ?>>Rejected</option>
                <option value="expired"<?= selectedIf($filterStatus, 'expired') ?>>Expired</option>
            </select>
        </div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Apply</button>
        <a href="<?= baseUrl('fees/concessions') ?>" class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Reset</a>
    </form>
</div>

<!-- Table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Discount</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Value</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Scope</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Assigned</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($rows)): ?>
                    <tr><td colspan="7" class="px-4 py-12 text-center text-gray-400">No discount assignments match these filters.</td></tr>
                <?php else: ?>
                    <?php
                    $statusBadge = [
                        'approved' => 'bg-emerald-50 text-emerald-700',
                        'pending'  => 'bg-amber-50 text-amber-700',
                        'rejected' => 'bg-red-50 text-red-700',
                        'expired'  => 'bg-gray-100 text-gray-500',
                    ];
                    foreach ($rows as $r): ?>
                        <tr class="hover:bg-gray-50/50 <?= !$r['active'] ? 'opacity-60' : '' ?>">
                            <td class="px-4 py-3 font-medium text-gray-900">
                                <?= e($r['student']) ?>
                                <?php if ($r['adm']): ?><span class="text-gray-400 text-xs ml-1"><?= e($r['adm']) ?></span><?php endif; ?>
                            </td>
                            <td class="px-4 py-3 text-gray-600 text-xs"><?= e($r['class'] ?: '—') ?></td>
                            <td class="px-4 py-3 text-gray-900">
                                <?= e($r['discount']) ?>
                                <?php if (!$r['active']): ?><span class="text-[10px] text-gray-400 ml-1">(inactive)</span><?php endif; ?>
                            </td>
                            <td class="px-4 py-3 text-right font-medium text-gray-900"><?= e($fmtValue($r)) ?></td>
                            <td class="px-4 py-3 text-gray-600 text-xs"><?= e($r['scope']) ?></td>
                            <td class="px-4 py-3">
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium <?= $statusBadge[$r['status']] ?? 'bg-gray-100 text-gray-600' ?>"><?= e(ucfirst($r['status'])) ?></span>
                            </td>
                            <td class="px-4 py-3 text-gray-500 text-xs"><?= $r['created'] ? formatDate($r['created']) : '—' ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
