<?php
/**
 * Timetable builder — head teacher / admin.
 *
 * Two layers:
 *  1. A school-wide BELL SCHEDULE (periods: P1, P2, Break, …) defined once.
 *  2. Per-class lessons that snap into those periods. The teacher is taken
 *     automatically from the subject-teacher assignment.
 *
 * CLASH DETECTION: a teacher can't be in two classes in the same period, and a
 * class can't hold two lessons in one period — both are blocked on add, and
 * any pre-existing clash is flagged in the grid.
 */
$pageTitle = 'Timetable';
$sb  = new Supabase();
$sid = schoolId();

if (!isAdmin() && !hasRole(['head_teacher'])) {
    flash('error', 'Only head teachers and admins can edit the timetable.');
    redirect('dashboard');
}

$classes  = cachedClasses();
$classMap = cachedClassMap();
$subjectName = [];
foreach (cachedSubjects() as $s) $subjectName[$s['id']] = $s['name'];

$classId = input('class_id') ?: ($classes[0]['id'] ?? '');

$DAYS = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday'];
$fmt  = fn($t) => $t ? date('g:i A', strtotime($t)) : '';

// ── POST ─────────────────────────────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // Seed a typical bell schedule so setup is one click.
    if ($action === 'seed_periods') {
        $starter = [
            ['P1', '08:00', '08:40', false], ['P2', '08:40', '09:20', false],
            ['P3', '09:20', '10:00', false], ['Break', '10:00', '10:20', true],
            ['P4', '10:20', '11:00', false], ['P5', '11:00', '11:40', false],
            ['P6', '11:40', '12:20', false], ['Lunch', '12:20', '13:40', true],
            ['P7', '13:40', '14:20', false], ['P8', '14:20', '15:00', false],
        ];
        foreach ($starter as $i => [$lbl, $st, $et, $brk]) {
            $sb->from('timetable_periods')->insert([
                'school_id' => $sid, 'position' => $i, 'label' => $lbl,
                'start_time' => $st, 'end_time' => $et, 'is_break' => $brk,
            ]);
        }
        flash('success', 'Starter bell schedule created — tweak it to match your school.');
        redirect('timetable?class_id=' . urlencode($classId));
    }

    if ($action === 'add_period') {
        $lbl = trim((string)input('label'));
        if ($lbl === '') {
            flash('error', 'Give the period a label (e.g. P1 or Break).');
        } else {
            // Append to the end of the schedule.
            $last = $sb->from('timetable_periods')->select('position')
                ->eq('school_id', $sid)->order('position', false)->limit(1)->execute();
            $pos = (int)($last['data'][0]['position'] ?? -1) + 1;
            $sb->from('timetable_periods')->insert([
                'school_id'  => $sid, 'position' => $pos, 'label' => $lbl,
                'start_time' => input('start_time') ?: null,
                'end_time'   => input('end_time') ?: null,
                'is_break'   => input('is_break') ? true : false,
            ]);
            flash('success', 'Period added.');
        }
        redirect('timetable?class_id=' . urlencode($classId));
    }

    if ($action === 'delete_period') {
        $pid = input('period_id');
        // Remove the period and any lessons that were placed in it.
        $sb->from('timetable_slots')->eq('school_id', $sid)->eq('period_id', $pid)->delete();
        $sb->from('timetable_periods')->eq('id', $pid)->eq('school_id', $sid)->delete();
        flash('success', 'Period removed.');
        redirect('timetable?class_id=' . urlencode($classId));
    }

    if ($action === 'add') {
        $cid  = input('class_id');
        $day  = (int)input('day_of_week');
        $pid  = input('period_id');
        $subj = input('subject_id') ?: null;

        if (!$cid || $day < 1 || $day > 6) {
            flash('error', 'Pick a class and a day.');
            redirect('timetable?class_id=' . urlencode($cid));
        }
        // Validate the period belongs to this school and isn't a break.
        $per = $sb->from('timetable_periods')->select('id,label,start_time,end_time,is_break')
            ->eq('id', $pid)->eq('school_id', $sid)->single()->execute();
        $period = $per['data'][0] ?? null;
        if (!$period || !empty($period['is_break'])) {
            flash('error', 'Pick a valid teaching period.');
            redirect('timetable?class_id=' . urlencode($cid));
        }

        // Teacher = the assigned subject teacher for this class+subject.
        $tid = $tname = null;
        if ($subj) {
            $st = $sb->from('subject_teachers')->select('user_id')
                ->eq('school_id', $sid)->eq('class_id', $cid)->eq('subject_id', $subj)->single()->execute();
            $tid = $st['data'][0]['user_id'] ?? null;
            if ($tid) {
                $pr = $sb->from('user_profiles')->select('full_name')->eq('id', $tid)->single()->execute();
                $tname = $pr['data'][0]['full_name'] ?? null;
            }
        }

        // ── Clash checks (hard constraints) ──
        // 1. This class already has a lesson in that day+period?
        $dupe = $sb->from('timetable_slots')->select('id')
            ->eq('school_id', $sid)->eq('class_id', $cid)
            ->eq('day_of_week', $day)->eq('period_id', $pid)->limit(1)->execute();
        if (!empty($dupe['data'])) {
            flash('error', ($classMap[$cid] ?? 'This class') . ' already has a lesson in ' . $period['label'] . ' on ' . $DAYS[$day] . '. Remove it first.');
            redirect('timetable?class_id=' . urlencode($cid));
        }
        // 2. The teacher is already teaching another class in that day+period?
        if ($tid) {
            $busy = $sb->from('timetable_slots')->select('class_id')
                ->eq('school_id', $sid)->eq('day_of_week', $day)->eq('period_id', $pid)
                ->eq('teacher_id', $tid)->neq('class_id', $cid)->limit(1)->execute();
            $clashClass = $busy['data'][0]['class_id'] ?? null;
            if ($clashClass) {
                flash('error', ($tname ?: 'That teacher') . ' is already teaching ' . ($classMap[$clashClass] ?? 'another class')
                    . ' in ' . $period['label'] . ' on ' . $DAYS[$day] . '. Pick another period.');
                redirect('timetable?class_id=' . urlencode($cid));
            }
        }

        $sb->from('timetable_slots')->insert([
            'school_id'    => $sid,
            'class_id'     => $cid,
            'day_of_week'  => $day,
            'period_id'    => $pid,
            'start_time'   => $period['start_time'] ?: null,
            'end_time'     => $period['end_time'] ?: null,
            'subject_id'   => $subj,
            'teacher_id'   => $tid,
            'teacher_name' => $tname,
            'room'         => trim((string)input('room')) ?: null,
        ]);
        flash('success', 'Lesson added.');
        redirect('timetable?class_id=' . urlencode($cid));
    }

    if ($action === 'delete') {
        $sb->from('timetable_slots')->eq('id', input('id'))->eq('school_id', $sid)->delete();
        redirect('timetable?class_id=' . urlencode(input('class_id')));
    }
}

// ── Load bell schedule ────────────────────────────────────────────────
$periods = $sb->from('timetable_periods')->select('id,position,label,start_time,end_time,is_break')
    ->eq('school_id', $sid)->order('position')->limit(50)->execute()['data'] ?? [];
$teachingPeriods = array_values(array_filter($periods, fn($p) => empty($p['is_break'])));

// Subjects offered to this class (fallback: all subjects).
$classSubjectIds = [];
if ($classId) {
    $cs = $sb->from('class_subjects')->select('subject_id')->eq('class_id', $classId)->execute()['data'] ?? [];
    $classSubjectIds = array_column($cs, 'subject_id');
}
$subjectOptions = $classSubjectIds ?: array_keys($subjectName);

// Slots for the selected class: cell[day][period_id] = slot.
$cell = [];
$usesSaturday = false;
if ($classId) {
    $rows = $sb->from('timetable_slots')
        ->select('id,day_of_week,period_id,start_time,end_time,subject_id,teacher_id,teacher_name,room')
        ->eq('school_id', $sid)->eq('class_id', $classId)->limit(400)->execute()['data'] ?? [];
    foreach ($rows as $r) {
        $cell[(int)$r['day_of_week']][$r['period_id'] ?? 'none'] = $r;
        if ((int)$r['day_of_week'] === 6) $usesSaturday = true;
    }
}

// School-wide clash map: day|period|teacher => [class_id,…] (flags existing clashes).
$busyMap = [];
$allRows = $sb->from('timetable_slots')->select('day_of_week,period_id,teacher_id,class_id')
    ->eq('school_id', $sid)->limit(2000)->execute()['data'] ?? [];
foreach ($allRows as $r) {
    if (empty($r['teacher_id']) || empty($r['period_id'])) continue;
    $k = $r['day_of_week'] . '|' . $r['period_id'] . '|' . $r['teacher_id'];
    $busyMap[$k][$r['class_id']] = true;
}
$isClash = function ($day, $pid, $tid) use ($busyMap) {
    if (!$tid || !$pid) return false;
    return count($busyMap[$day . '|' . $pid . '|' . $tid] ?? []) > 1;
};

$showDays = $DAYS;
if (!$usesSaturday) unset($showDays[6]);

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Timetable</h1>
    <p class="text-sm text-gray-500 mt-1">Set the bell schedule once, then place lessons. The teacher fills in from who's assigned the subject — and clashes are blocked.</p>
</div>

<!-- Bell schedule -->
<details class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6 group" <?= empty($periods) ? 'open' : '' ?>>
    <summary class="px-5 py-3 cursor-pointer select-none flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-700">Bell schedule <span class="text-gray-400 font-normal">· <?= count($periods) ?> period<?= count($periods) === 1 ? '' : 's' ?></span></span>
        <span class="text-xs text-gray-400 group-open:hidden">Edit</span>
    </summary>
    <div class="px-5 pb-5 border-t border-gray-50 pt-4">
        <?php if (empty($periods)): ?>
            <p class="text-sm text-gray-500 mb-3">No periods yet. Lessons snap into periods, so start by defining your school day.</p>
            <form method="POST" class="inline">
                <?= csrfField() ?><input type="hidden" name="action" value="seed_periods"><input type="hidden" name="class_id" value="<?= e($classId) ?>">
                <button class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Load a starter schedule (P1–P8 + breaks)</button>
            </form>
            <p class="text-xs text-gray-400 mt-2">Or add periods one by one below.</p>
        <?php else: ?>
            <div class="flex flex-wrap gap-2 mb-4">
                <?php foreach ($periods as $p): ?>
                    <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs <?= !empty($p['is_break']) ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700' ?>">
                        <span class="font-semibold"><?= e($p['label']) ?></span>
                        <?php if ($p['start_time']): ?><span class="opacity-70"><?= e($fmt($p['start_time'])) ?><?= $p['end_time'] ? '–' . e($fmt($p['end_time'])) : '' ?></span><?php endif; ?>
                        <form method="POST" onsubmit="return confirm('Remove <?= e($p['label']) ?> and any lessons in it?')" class="inline">
                            <?= csrfField() ?><input type="hidden" name="action" value="delete_period"><input type="hidden" name="period_id" value="<?= e($p['id']) ?>"><input type="hidden" name="class_id" value="<?= e($classId) ?>">
                            <button class="text-gray-300 hover:text-red-500"></button>
                        </form>
                    </span>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <form method="POST" class="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
            <?= csrfField() ?><input type="hidden" name="action" value="add_period"><input type="hidden" name="class_id" value="<?= e($classId) ?>">
            <?php $fc = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none'; ?>
            <div><label class="block text-xs font-medium text-gray-500 mb-1">Label</label><input name="label" placeholder="P1 / Break" class="<?= $fc ?>"></div>
            <div><label class="block text-xs font-medium text-gray-500 mb-1">Start</label><input type="time" name="start_time" class="<?= $fc ?>"></div>
            <div><label class="block text-xs font-medium text-gray-500 mb-1">End</label><input type="time" name="end_time" class="<?= $fc ?>"></div>
            <label class="flex items-center gap-2 text-xs text-gray-600 pb-2"><input type="checkbox" name="is_break" value="1" class="rounded border-gray-300 text-emerald-600"> Break / lunch</label>
            <button class="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">Add period</button>
        </form>
    </div>
</details>

<!-- Class picker -->
<form method="GET" action="<?= baseUrl('timetable') ?>" class="mb-6 flex items-end gap-3">
    <div>
        <label class="block text-xs font-medium text-gray-500 mb-1">Class</label>
        <select name="class_id" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none min-w-[180px]">
            <?php foreach ($classes as $c): ?><option value="<?= e($c['id']) ?>"<?= selectedIf($classId, $c['id']) ?>><?= e($c['name']) ?></option><?php endforeach; ?>
        </select>
    </div>
</form>

<?php if (!$classId): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">Create a class first.</div>
<?php elseif (empty($teachingPeriods)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">Set up your bell schedule above before placing lessons.</div>
<?php else: ?>

<!-- Add lesson -->
<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <h2 class="text-sm font-semibold text-gray-700 mb-3">Add a lesson to <?= e($classMap[$classId] ?? 'class') ?></h2>
    <?php $fc = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none'; ?>
    <form method="POST" action="<?= baseUrl('timetable') ?>" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="add">
        <input type="hidden" name="class_id" value="<?= e($classId) ?>">
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Day</label>
            <select name="day_of_week" class="<?= $fc ?>"><?php foreach ($DAYS as $n => $lbl): ?><option value="<?= $n ?>"><?= $lbl ?></option><?php endforeach; ?></select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Period</label>
            <select name="period_id" class="<?= $fc ?>"><?php foreach ($teachingPeriods as $p): ?><option value="<?= e($p['id']) ?>"><?= e($p['label']) ?><?= $p['start_time'] ? ' (' . e($fmt($p['start_time'])) . ')' : '' ?></option><?php endforeach; ?></select>
        </div>
        <div class="col-span-2 sm:col-span-1">
            <label class="block text-xs font-medium text-gray-500 mb-1">Subject</label>
            <select name="subject_id" class="<?= $fc ?>"><option value="">—</option><?php foreach ($subjectOptions as $sidx): ?><option value="<?= e($sidx) ?>"><?= e($subjectName[$sidx] ?? 'Subject') ?></option><?php endforeach; ?></select>
        </div>
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Room</label><input type="text" name="room" class="<?= $fc ?>"></div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition col-span-2 sm:col-span-1">Add lesson</button>
    </form>
</div>

<!-- Weekly matrix -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto">
    <table class="w-full text-sm border-collapse">
        <thead>
            <tr class="border-b border-gray-100">
                <th class="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide text-gray-400 font-medium w-28">Period</th>
                <?php foreach ($showDays as $n => $lbl): ?><th class="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide text-gray-400 font-medium"><?= $lbl ?></th><?php endforeach; ?>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($periods as $p): ?>
                <?php if (!empty($p['is_break'])): ?>
                    <tr class="bg-gray-50/60">
                        <td class="px-3 py-1.5 text-xs text-gray-400"><?= e($p['label']) ?></td>
                        <td colspan="<?= count($showDays) ?>" class="px-3 py-1.5 text-xs text-gray-400 italic"><?= e($p['label']) ?><?= $p['start_time'] ? ' · ' . e($fmt($p['start_time'])) . '–' . e($fmt($p['end_time'])) : '' ?></td>
                    </tr>
                <?php else: ?>
                    <tr class="border-b border-gray-50">
                        <td class="px-3 py-2 align-top">
                            <p class="text-xs font-semibold text-gray-700"><?= e($p['label']) ?></p>
                            <?php if ($p['start_time']): ?><p class="text-[10px] text-gray-400"><?= e($fmt($p['start_time'])) ?></p><?php endif; ?>
                        </td>
                        <?php foreach ($showDays as $n => $lbl): $s = $cell[$n][$p['id']] ?? null; ?>
                            <td class="px-2 py-1.5 align-top border-l border-gray-50 min-w-[130px]">
                                <?php if ($s): $clash = $isClash($n, $p['id'], $s['teacher_id'] ?? null); ?>
                                    <div class="rounded-lg px-2 py-1.5 <?= $clash ? 'bg-red-50 border border-red-200' : 'bg-emerald-50/60' ?>">
                                        <div class="flex items-start justify-between gap-1">
                                            <p class="text-xs font-medium text-gray-900 leading-tight"><?= e($subjectName[$s['subject_id']] ?? 'Lesson') ?></p>
                                            <form method="POST" action="<?= baseUrl('timetable') ?>" onsubmit="return confirm('Remove this lesson?')"><?= csrfField() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= e($s['id']) ?>"><input type="hidden" name="class_id" value="<?= e($classId) ?>"><button class="text-gray-300 hover:text-red-500 text-[11px] leading-none"></button></form>
                                        </div>
                                        <?php if (!empty($s['teacher_name'])): ?><p class="text-[10px] text-gray-500 leading-tight mt-0.5"><?= e($s['teacher_name']) ?></p><?php endif; ?>
                                        <?php if (!empty($s['room'])): ?><p class="text-[10px] text-gray-400 leading-tight"><?= e($s['room']) ?></p><?php endif; ?>
                                        <?php if ($clash): ?><p class="text-[10px] text-red-600 font-semibold mt-0.5"> Teacher clash</p><?php endif; ?>
                                    </div>
                                <?php else: ?>
                                    <span class="text-gray-200 text-xs">·</span>
                                <?php endif; ?>
                            </td>
                        <?php endforeach; ?>
                    </tr>
                <?php endif; ?>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>
<p class="text-[11px] text-gray-400 mt-3">Lessons are blocked if they'd double-book a teacher or a class. Any clash already in the data is flagged red above.</p>

<?php endif; ?>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
