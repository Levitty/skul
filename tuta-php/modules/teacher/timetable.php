<?php
/**
 * My Timetable — a teacher's own weekly lesson slots, grouped by day.
 * Reads timetable_slots where teacher_id = the logged-in teacher.
 */
$pageTitle = 'My Timetable';
$sb  = new Supabase();
$sid = schoolId();
$uid = currentUser()['id'] ?? '';

$classMap = cachedClassMap();
$subjectName = [];
foreach (cachedSubjects() as $s) $subjectName[$s['id']] = $s['name'];

$DAYS = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];

$slots = [];
if ($uid) {
    $rows = $sb->from('timetable_slots')
        ->select('day_of_week,start_time,end_time,subject_id,class_id,room')
        ->eq('school_id', $sid)->eq('teacher_id', $uid)->limit(300)->execute()['data'] ?? [];
    foreach ($rows as $r) $slots[(int)$r['day_of_week']][] = $r;
    foreach ($slots as $d => &$list) usort($list, fn($a, $b) => ($a['start_time'] ?? '') <=> ($b['start_time'] ?? ''));
    unset($list);
}
$fmt = fn($t) => $t ? date('g:i A', strtotime($t)) : '';
$totalLessons = array_sum(array_map('count', $slots));

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">My Timetable</h1>
    <p class="text-sm text-gray-500 mt-1"><?= $totalLessons ?> lesson<?= $totalLessons === 1 ? '' : 's' ?> across the week.</p>
</div>

<?php if ($totalLessons === 0): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        Your timetable hasn't been set yet. Once the head teacher adds your lessons, they'll appear here.
    </div>
<?php else: ?>
<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    <?php foreach ($DAYS as $n => $lbl): $daySlots = $slots[$n] ?? []; if ($n > 6 && empty($daySlots)) continue; ?>
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden <?= empty($daySlots) ? 'opacity-60' : '' ?>">
            <div class="px-4 py-3 border-b border-gray-100 bg-gray-50"><h3 class="text-sm font-semibold text-gray-700"><?= $lbl ?></h3></div>
            <?php if (empty($daySlots)): ?>
                <p class="px-4 py-5 text-xs text-gray-400 text-center">Free</p>
            <?php else: ?>
                <div class="divide-y divide-gray-50">
                    <?php foreach ($daySlots as $s): ?>
                        <div class="px-4 py-2.5">
                            <p class="text-sm font-medium text-gray-900"><?= e($subjectName[$s['subject_id']] ?? 'Lesson') ?></p>
                            <p class="text-[11px] text-gray-500">
                                <?= e($fmt($s['start_time'])) ?><?= $s['end_time'] ? '–' . e($fmt($s['end_time'])) : '' ?>
                                · <?= e($classMap[$s['class_id']] ?? 'Class') ?><?php if (!empty($s['room'])): ?> · <?= e($s['room']) ?><?php endif; ?>
                            </p>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
