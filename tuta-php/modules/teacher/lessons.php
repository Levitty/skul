<?php
/**
 * Teacher Lesson Plans — a deterministic place to plan, store and organise
 * lessons (scheme of work). Seeded with data-driven "focus areas" (each
 * subject's average + how many students are below 40%) so plans target real
 * gaps. No AI — Horeb generates plan content + CBC mapping later via API.
 */
$pageTitle = 'Lesson Plans';
$sb   = new Supabase();
$sid  = schoolId();
$user = currentUser();
$uid  = $user['id'] ?? '';

$mySubjects = teacherSubjectAssignments($uid);
$myClasses  = teacherClassAssignments($uid);
$classMap   = cachedClassMap();
$subjectName = [];
foreach (cachedSubjects() as $s) $subjectName[$s['id']] = $s['name'];
$currentTerm   = cachedCurrentTerm();
$currentTermId = $currentTerm['id'] ?? null;

$myClassIds = array_values(array_unique(array_merge(
    array_column($myClasses, 'id'), array_column($mySubjects, 'class_id')
)));

// ── POST ──
if (isPost() && verifyCsrf()) {
    $action = input('action');
    if ($action === 'add') {
        $classId = input('class_id');
        $title   = trim((string)input('title'));
        if (!$classId || !in_array($classId, $myClassIds, true)) {
            flash('error', 'Pick one of your classes.');
        } elseif ($title === '') {
            flash('error', 'Give the lesson a title/topic.');
        } else {
            $t = fn($k) => trim((string)input($k)) ?: null;
            $sb->from('lesson_plans')->insert([
                'school_id'           => $sid,
                'class_id'            => $classId,
                'subject_id'          => input('subject_id') ?: null,
                'term_id'             => $currentTermId,
                'title'               => $title,
                'lesson_date'         => input('lesson_date') ?: null,
                'lesson_time'         => $t('lesson_time'),
                'roll'                => $t('roll'),
                'strand'              => $t('strand'),
                'sub_strand'          => $t('sub_strand'),
                'learning_outcomes'   => $t('learning_outcomes'),
                'key_inquiry'         => $t('key_inquiry'),
                'learning_resources'  => $t('learning_resources'),
                'organisation'        => $t('organisation'),
                'introduction'        => $t('introduction'),
                'lesson_dev_1'        => $t('lesson_dev_1'),
                'lesson_dev_2'        => $t('lesson_dev_2'),
                'lesson_dev_3'        => $t('lesson_dev_3'),
                'extended_activities' => $t('extended_activities'),
                'conclusion'          => $t('conclusion'),
                'reflection'          => $t('reflection'),
                'status'              => 'planned',
                'created_by'          => $uid ?: null,
                'created_by_name'     => $user['name'] ?? null,
            ]);
            flash('success', 'Lesson plan saved.');
        }
        redirect('teacher/lessons');
    }
    if (in_array($action, ['taught', 'reopen', 'delete'], true)) {
        $id = input('id');
        if ($action === 'delete') {
            $sb->from('lesson_plans')->eq('id', $id)->eq('school_id', $sid)->delete();
        } else {
            $sb->from('lesson_plans')->eq('id', $id)->eq('school_id', $sid)
                ->update(['status' => $action === 'taught' ? 'taught' : 'planned']);
        }
        redirect('teacher/lessons');
    }
}

// ── Focus areas: per (class+subject) average + below-40 count (2 queries) ──
$pairStats = [];
if (!empty($mySubjects) && $currentTermId) {
    $subjIds = array_values(array_unique(array_column($mySubjects, 'subject_id')));
    $examMax = [];
    foreach (($sb->from('exams')->select('id,max_marks,term_id')->eq('school_id', $sid)->eq('term_id', $currentTermId)->execute()['data'] ?? []) as $e) {
        $examMax[$e['id']] = (float)($e['max_marks'] ?? 0);
    }
    $gr = !empty($subjIds) ? Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('grades')->select('class_id,subject_id,student_id,exam_id,marks')->eq('school_id', $sid),
        'subject_id', $subjIds
    ) : [];
    $tmp = [];
    foreach ($gr as $g) {
        $eid = $g['exam_id'];
        if (empty($examMax[$eid]) || $examMax[$eid] <= 0 || empty($g['class_id'])) continue;
        $tmp[$g['class_id'] . '|' . $g['subject_id']][$g['student_id']][] = (float)$g['marks'] / $examMax[$eid] * 100;
    }
    foreach ($tmp as $key => $studs) {
        $avgs = [];
        foreach ($studs as $pcts) $avgs[] = array_sum($pcts) / count($pcts);
        $pairStats[$key] = ['avg' => $avgs ? round(array_sum($avgs) / count($avgs), 1) : null, 'below' => count(array_filter($avgs, fn($v) => $v < 40))];
    }
}

// ── Load lesson plans for the teacher's classes ──
$rows = [];
if (!empty($myClassIds)) {
    $rows = $sb->from('lesson_plans')
        ->select('id,class_id,subject_id,title,lesson_date,lesson_time,roll,strand,sub_strand,learning_outcomes,key_inquiry,learning_resources,organisation,introduction,lesson_dev_1,lesson_dev_2,lesson_dev_3,extended_activities,conclusion,reflection,status')
        ->eq('school_id', $sid)->in('class_id', $myClassIds)
        ->order('lesson_date', false)->limit(200)->execute()['data'] ?? [];
}
$planned = array_filter($rows, fn($r) => ($r['status'] ?? '') === 'planned');
$taught  = array_filter($rows, fn($r) => ($r['status'] ?? '') === 'taught');
usort($planned, fn($a, $b) => ($a['lesson_date'] ?? '9999') <=> ($b['lesson_date'] ?? '9999'));

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6 flex items-start justify-between gap-3 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Lesson Plans</h1>
        <p class="text-sm text-gray-500 mt-1">Plan, store and organise your lessons. Focus areas below come from your classes' marks.</p>
    </div>
    <a href="<?= baseUrl('teacher/homework') ?>" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Homework →</a>
</div>

<?php if (empty($myClassIds)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">You're not assigned to any class or subject yet.</div>
<?php else: ?>

<!-- Focus areas (data-driven seed) -->
<?php if (!empty($pairStats)): ?>
<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <h2 class="text-sm font-semibold text-gray-700 mb-3">Focus areas <span class="text-gray-400 font-normal">— where your classes need the most work this term</span></h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <?php foreach ($mySubjects as $a): $ps = $pairStats[$a['class_id'] . '|' . $a['subject_id']] ?? null; if (!$ps || $ps['avg'] === null) continue; ?>
            <a href="<?= baseUrl('teacher/subject?class_id=' . urlencode($a['class_id']) . '&subject_id=' . urlencode($a['subject_id'])) ?>"
               class="block p-3 rounded-lg border <?= $ps['below'] > 0 ? 'border-red-100 bg-red-50/40' : 'border-gray-100 bg-gray-50' ?> hover:bg-gray-100/60 transition">
                <p class="text-sm font-medium text-gray-900"><?= e($subjectName[$a['subject_id']] ?? 'Subject') ?> <span class="text-gray-400 font-normal">· <?= e($classMap[$a['class_id']] ?? '') ?></span></p>
                <p class="text-xs mt-0.5"><span class="font-semibold <?= $ps['avg'] < 50 ? 'text-amber-700' : 'text-gray-700' ?>">Avg <?= $ps['avg'] ?>%</span><?php if ($ps['below'] > 0): ?> <span class="text-red-500">· <?= $ps['below'] ?> below 40%</span><?php endif; ?></p>
            </a>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<!-- Add lesson plan -->
<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <h2 class="text-sm font-semibold text-gray-700 mb-3">New lesson plan</h2>
    <form method="POST" action="<?= baseUrl('teacher/lessons') ?>" class="space-y-3">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="add">
        <?php $fc = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none'; $lc = 'block text-xs font-medium text-gray-500 mb-1'; ?>
        <!-- Header row -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div class="col-span-2 sm:col-span-1">
                <label class="<?= $lc ?>">Class *</label>
                <select name="class_id" required class="<?= $fc ?>">
                    <option value="">—</option>
                    <?php foreach ($myClassIds as $cid): ?><option value="<?= e($cid) ?>"><?= e($classMap[$cid] ?? 'Class') ?></option><?php endforeach; ?>
                </select>
            </div>
            <div class="col-span-2">
                <label class="<?= $lc ?>">Learning area (subject)</label>
                <select name="subject_id" class="<?= $fc ?>">
                    <option value="">General</option>
                    <?php foreach ($mySubjects as $a): ?><option value="<?= e($a['subject_id']) ?>"><?= e($subjectName[$a['subject_id']] ?? 'Subject') ?> · <?= e($classMap[$a['class_id']] ?? '') ?></option><?php endforeach; ?>
                </select>
            </div>
            <div><label class="<?= $lc ?>">Date</label><input type="date" name="lesson_date" class="<?= $fc ?>"></div>
            <div><label class="<?= $lc ?>">Time</label><input type="text" name="lesson_time" placeholder="8:00–8:40" class="<?= $fc ?>"></div>
            <div><label class="<?= $lc ?>">Roll</label><input type="text" name="roll" placeholder="No." class="<?= $fc ?>"></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label class="<?= $lc ?>">Strand</label><input type="text" name="strand" class="<?= $fc ?>"></div>
            <div><label class="<?= $lc ?>">Sub-strand</label><input type="text" name="sub_strand" class="<?= $fc ?>"></div>
        </div>
        <div><label class="<?= $lc ?>">Topic / lesson title *</label><input type="text" name="title" required placeholder="e.g. Adding fractions with like denominators" class="<?= $fc ?>"></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label class="<?= $lc ?>">Specific learning outcomes</label><textarea name="learning_outcomes" rows="3" placeholder="By the end of the lesson the learner should be able to:&#10;(a) …&#10;(b) …" class="<?= $fc ?>"></textarea></div>
            <div><label class="<?= $lc ?>">Key inquiry question(s)</label><textarea name="key_inquiry" rows="3" class="<?= $fc ?>"></textarea></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label class="<?= $lc ?>">Learning resources</label><textarea name="learning_resources" rows="2" class="<?= $fc ?>"></textarea></div>
            <div><label class="<?= $lc ?>">Organisation of learning</label><textarea name="organisation" rows="2" class="<?= $fc ?>"></textarea></div>
        </div>
        <div><label class="<?= $lc ?>">Introduction / getting started</label><textarea name="introduction" rows="2" class="<?= $fc ?>"></textarea></div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label class="<?= $lc ?>">Lesson development — Step 1</label><textarea name="lesson_dev_1" rows="3" class="<?= $fc ?>"></textarea></div>
            <div><label class="<?= $lc ?>">Step 2</label><textarea name="lesson_dev_2" rows="3" class="<?= $fc ?>"></textarea></div>
            <div><label class="<?= $lc ?>">Step 3</label><textarea name="lesson_dev_3" rows="3" class="<?= $fc ?>"></textarea></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label class="<?= $lc ?>">Extended activities</label><textarea name="extended_activities" rows="2" class="<?= $fc ?>"></textarea></div>
            <div><label class="<?= $lc ?>">Conclusion</label><textarea name="conclusion" rows="2" class="<?= $fc ?>"></textarea></div>
        </div>
        <div><label class="<?= $lc ?>">Reflection (after teaching)</label><textarea name="reflection" rows="2" class="<?= $fc ?>"></textarea></div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save lesson plan</button>
    </form>
</div>

<!-- Planned -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
    <div class="px-5 py-4 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Planned <span class="text-gray-400 font-normal">(<?= count($planned) ?>)</span></h2></div>
    <?php if (empty($planned)): ?>
        <div class="px-5 py-10 text-center text-gray-400 text-sm">No lesson plans yet.</div>
    <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($planned as $p): ?>
                <div class="px-5 py-3">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900"><?= e($p['title']) ?></p>
                            <p class="text-xs text-gray-500 mt-0.5">
                                <?= e($classMap[$p['class_id']] ?? 'Class') ?>
                                <?php if (!empty($p['subject_id'])): ?><span class="text-gray-300 mx-1">·</span><?= e($subjectName[$p['subject_id']] ?? '') ?><?php endif; ?>
                                <?php if (!empty($p['lesson_date'])): ?><span class="text-gray-300 mx-1">·</span><?= e(date('j M', strtotime($p['lesson_date']))) ?><?php endif; ?>
                            </p>
                        </div>
                        <div class="flex gap-1.5 flex-shrink-0">
                            <form method="POST" action="<?= baseUrl('teacher/lessons') ?>"><?= csrfField() ?><input type="hidden" name="action" value="taught"><input type="hidden" name="id" value="<?= e($p['id']) ?>"><button class="px-3 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">Mark taught</button></form>
                            <form method="POST" action="<?= baseUrl('teacher/lessons') ?>" onsubmit="return confirm('Delete this lesson plan?')"><?= csrfField() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= e($p['id']) ?>"><button class="px-2.5 py-1 text-xs font-medium text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition"></button></form>
                        </div>
                    </div>
                    <?php
                    $cbc = ['strand'=>'Strand','sub_strand'=>'Sub-strand','learning_outcomes'=>'Learning outcomes','key_inquiry'=>'Key inquiry','learning_resources'=>'Learning resources','organisation'=>'Organisation','introduction'=>'Introduction','lesson_dev_1'=>'Development — Step 1','lesson_dev_2'=>'Step 2','lesson_dev_3'=>'Step 3','extended_activities'=>'Extended activities','conclusion'=>'Conclusion','reflection'=>'Reflection'];
                    $present = array_filter($cbc, fn($lbl, $k) => !empty($p[$k]), ARRAY_FILTER_USE_BOTH);
                    if ($present): ?>
                    <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                        <?php foreach ($present as $k => $lbl): ?>
                            <div class="bg-gray-50 rounded-lg px-3 py-2"><span class="text-gray-400 uppercase tracking-wider text-[10px]"><?= $lbl ?></span><p class="whitespace-pre-line mt-0.5"><?= e($p[$k]) ?></p></div>
                        <?php endforeach; ?>
                    </div>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php if (!empty($taught)): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Taught <span class="text-gray-400 font-normal">(<?= count($taught) ?>)</span></h2></div>
    <div class="divide-y divide-gray-50">
        <?php foreach (array_slice($taught, 0, 40) as $p): ?>
            <div class="px-5 py-2.5 flex items-center justify-between gap-3 opacity-70">
                <p class="text-sm text-gray-600 truncate"><?= e($p['title']) ?> <span class="text-xs text-gray-400">· <?= e($classMap[$p['class_id']] ?? '') ?></span></p>
                <form method="POST" action="<?= baseUrl('teacher/lessons') ?>"><?= csrfField() ?><input type="hidden" name="action" value="reopen"><input type="hidden" name="id" value="<?= e($p['id']) ?>"><button class="text-xs text-gray-400 hover:text-gray-600">reopen</button></form>
            </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
