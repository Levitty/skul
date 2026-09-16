<?php
/**
 * Fee Schedules — list page.
 * One schedule = one (class × term) tuple in fee_groups.
 *
 * Replaces the old "Fee Groups" UI with the new term-aware mental model:
 *   • Each schedule belongs to one term (enforced by migration 057 unique idx).
 *   • At end of term, accountant clicks "Roll forward" to clone into next term
 *     and edit only what changed. No more retyping the same schedule.
 */
$pageTitle = 'Fee Schedules';
$sb  = new Supabase();
$sid = schoolId();

$classes  = cachedClasses();
$classMap = cachedClassMap();
$terms    = cachedTerms();

// Build term map for fast lookup
$termMap = [];
foreach ($terms as $t) $termMap[$t['id']] = $t;

// Filter: target term (defaults to active term)
$activeTerm   = cachedCurrentTerm();
$filterTerm   = input('term_id') ?: ($activeTerm['id'] ?? '');
$filterClass  = input('class_id');

// ── Fetch schedules ─────────────────────────────────────────────
$query = $sb->from('fee_groups')
    ->select('id,name,description,class_id,term_id,academic_year_id,billing_cycle,is_active,created_at')
    ->eq('school_id', $sid)
    ->order('created_at', false);

if ($filterTerm)  $query = $query->eq('term_id', $filterTerm);
if ($filterClass) $query = $query->eq('class_id', $filterClass);

$schedulesResult = $query->execute();
$schedules = $schedulesResult['data'] ?? [];

// ── Fetch line item counts + totals (one query for all schedules) ─
$itemMap = []; // schedule_id => ['count' => N, 'total' => X]
if (!empty($schedules)) {
    $scheduleIds = array_column($schedules, 'id');
    $itemsResult = $sb->from('fee_group_items')->select('fee_group_id,amount')
        ->in('fee_group_id', $scheduleIds)->execute();
    foreach (($itemsResult['data'] ?? []) as $it) {
        $gid = $it['fee_group_id'];
        if (!isset($itemMap[$gid])) $itemMap[$gid] = ['count' => 0, 'total' => 0];
        $itemMap[$gid]['count']++;
        $itemMap[$gid]['total'] += (float)$it['amount'];
    }
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Fee Schedules</h1>
        <p class="text-sm text-gray-500 mt-1">One schedule per class per term. Edit once, then roll forward at term-end.</p>
    </div>
    <a href="<?= baseUrl('fees/schedules/edit') ?>"
       class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
        + New Schedule
    </a>
</div>

<!-- Filters -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('fees/schedules') ?>" class="flex flex-wrap items-center gap-3">
        <label class="text-sm font-medium text-gray-600">Term:</label>
        <select name="term_id" onchange="this.form.submit()"
                class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <option value="">All terms</option>
            <?php foreach ($terms as $t): ?>
                <option value="<?= e($t['id']) ?>"<?= selectedIf($filterTerm, $t['id']) ?>>
                    <?= e($t['name']) ?><?= !empty($t['is_current']) ? ' (active)' : '' ?>
                </option>
            <?php endforeach; ?>
        </select>

        <label class="text-sm font-medium text-gray-600 ml-2">Class:</label>
        <select name="class_id" onchange="this.form.submit()"
                class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <option value="">All classes</option>
            <?php foreach ($classes as $c): ?>
                <option value="<?= e($c['id']) ?>"<?= selectedIf($filterClass, $c['id']) ?>>
                    <?= e($c['name']) ?>
                </option>
            <?php endforeach; ?>
        </select>

        <span class="text-xs text-gray-400 ml-auto"><?= count($schedules) ?> schedule<?= count($schedules) !== 1 ? 's' : '' ?></span>
    </form>
</div>

<!-- Schedules table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Term</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Items</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($schedules)): ?>
                <tr><td colspan="7" class="px-4 py-12 text-center text-gray-400">
                    No schedules for the selected filters.<br>
                    <a href="<?= baseUrl('fees/schedules/edit') ?>" class="text-emerald-600 hover:underline text-xs mt-2 inline-block">+ Create one</a>
                </td></tr>
            <?php else: ?>
                <?php foreach ($schedules as $s):
                    $items   = $itemMap[$s['id']] ?? ['count' => 0, 'total' => 0];
                    $term    = $termMap[$s['term_id'] ?? ''] ?? null;
                    $isActiveTerm = $term && !empty($term['is_current']);
                ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900">
                            <?= e($classMap[$s['class_id'] ?? ''] ?? '— (unassigned)') ?>
                        </td>
                        <td class="px-4 py-3 text-gray-700">
                            <?php if ($term): ?>
                                <?= e($term['name']) ?>
                                <?php if ($isActiveTerm): ?>
                                    <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 ml-1">active</span>
                                <?php endif; ?>
                            <?php else: ?>
                                <span class="text-amber-600 text-xs">— (no term)</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-gray-700">
                            <?= e($s['name']) ?>
                            <?php if (!empty($s['description'])): ?>
                                <p class="text-xs text-gray-400 mt-0.5"><?= e($s['description']) ?></p>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-center text-gray-600"><?= $items['count'] ?></td>
                        <td class="px-4 py-3 text-right font-medium"><?= money($items['total']) ?></td>
                        <td class="px-4 py-3 text-center">
                            <?php if ($s['is_active']): ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                            <?php else: ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <a href="<?= baseUrl('fees/schedules/edit?id=' . e($s['id'])) ?>"
                               class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Edit</a>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
