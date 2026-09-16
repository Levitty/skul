<?php
/**
 * Teacher home — replaces the admin dashboard for users with role=teacher.
 *
 * Shows the classes and subjects assigned to this teacher, with shortcuts to
 * mark entry and remarks. Admins/head teachers don't pass through here — they
 * see the full admin dashboard.
 */
$pageTitle = 'My Teaching';
$user = currentUser();
$sb   = new Supabase();
$sid  = schoolId();

$myClasses  = teacherClassAssignments($user['id'] ?? '');
$mySubjects = teacherSubjectAssignments($user['id'] ?? '');

$classMap        = cachedClassMap();
$allSubs         = cachedSubjects();
$subjectNameMap  = [];
foreach ($allSubs as $s) $subjectNameMap[$s['id']] = $s['name'];

$currentTerm   = cachedCurrentTerm();
$currentTermId = $currentTerm['id'] ?? '';

// Students for any class this teacher is class-teacher of.
$classStudents = [];
if (!empty($myClasses)) {
    $classIds = array_column($myClasses, 'id');
    $stuRes = $sb->from('students')->select('id,first_name,last_name,admission_number,current_class_id')
        ->eq('school_id', $sid)->in('current_class_id', $classIds)->eq('status', 'active')
        ->order('first_name')->execute();
    foreach (($stuRes['data'] ?? []) as $stu) {
        $classStudents[$stu['current_class_id']][] = $stu;
    }
}

// ── Per (class+subject) term stats: average % + how many below 40% ──
// Two queries total (current-term exams, then grades for my subjects),
// aggregated in PHP. Keyed "classId|subjectId".
$pairStats = [];
if (!empty($mySubjects) && $currentTermId) {
    $subjIds = array_values(array_unique(array_column($mySubjects, 'subject_id')));
    $examMax = [];
    $exRes = $sb->from('exams')->select('id,max_marks,term_id')
        ->eq('school_id', $sid)->eq('term_id', $currentTermId)->execute();
    foreach (($exRes['data'] ?? []) as $e) $examMax[$e['id']] = (float)($e['max_marks'] ?? 0);

    $gr = !empty($subjIds) ? Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('grades')->select('class_id,subject_id,student_id,exam_id,marks')->eq('school_id', $sid),
        'subject_id', $subjIds
    ) : [];
    $tmp = [];
    foreach ($gr as $g) {
        $eid = $g['exam_id'];
        if (empty($examMax[$eid]) || $examMax[$eid] <= 0) continue;
        if (empty($g['class_id'])) continue;
        $tmp[$g['class_id'] . '|' . $g['subject_id']][$g['student_id']][] = (float)$g['marks'] / $examMax[$eid] * 100;
    }
    foreach ($tmp as $key => $studs) {
        $avgs = [];
        foreach ($studs as $pcts) $avgs[] = array_sum($pcts) / count($pcts);
        $pairStats[$key] = [
            'avg'   => $avgs ? round(array_sum($avgs) / count($avgs), 1) : null,
            'below' => count(array_filter($avgs, fn($v) => $v < 40)),
        ];
    }
}

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="mb-6 flex items-start justify-between gap-3 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Welcome back, <?php $dn = trim((string)($user['name'] ?? '')); if (str_contains($dn, '@')) $dn = ucfirst(explode('@', $dn)[0]); echo e($dn !== '' ? $dn : 'Teacher'); ?></h1>
        <p class="text-sm text-gray-500 mt-1">Your classes and subjects, with shortcuts to today's work.</p>
    </div>
    <div class="flex gap-2 flex-shrink-0">
        <a href="<?= baseUrl('teacher/lessons') ?>" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition inline-flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            Lesson Plans
        </a>
        <a href="<?= baseUrl('teacher/homework') ?>" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition inline-flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
            Homework
        </a>
        <a href="<?= baseUrl('teacher/questions') ?>" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition inline-flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Question Bank
        </a>
    </div>
</div>

<?php if (empty($myClasses) && empty($mySubjects)): ?>
<div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-3">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>
    </div>
    <p class="text-sm font-medium text-gray-900">No assignments yet</p>
    <p class="text-xs text-gray-500 mt-1 max-w-md mx-auto">You haven't been assigned to any class or subject yet. Ask the school administrator to assign you in <strong>Settings &rarr; Teachers</strong>.</p>
</div>
<?php endif; ?>

<?php if (!empty($myClasses)): ?>
<div class="space-y-4 mb-6">
    <?php foreach ($myClasses as $cls): ?>
    <?php
    $kids = $classStudents[$cls['id']] ?? [];
    $kidCount = count($kids);
    ?>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div class="min-w-0">
                <p class="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">My Class</p>
                <h2 class="text-lg font-bold text-gray-900"><?= e($cls['name']) ?></h2>
                <p class="text-xs text-gray-500"><?= $kidCount ?> active student<?= $kidCount === 1 ? '' : 's' ?></p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <?php if ($currentTermId && $kidCount > 0): ?>
                <a href="<?= baseUrl('grades/class-remarks?class_id=' . urlencode($cls['id']) . '&term_id=' . urlencode($currentTermId)) ?>"
                   class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">
                    Write class remarks
                </a>
                <?php endif; ?>
            </div>
        </div>
        <?php if ($kidCount === 0): ?>
            <p class="px-5 py-6 text-sm text-gray-400 text-center">No active students in this class yet.</p>
        <?php else: ?>
        <div class="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">
            <?php foreach ($kids as $i => $stu): ?>
            <a href="<?= baseUrl('teacher/student?id=' . urlencode($stu['id'])) ?>" class="px-5 py-2 flex items-center gap-3 text-sm hover:bg-gray-50 transition">
                <span class="text-xs text-gray-400 w-6 text-right"><?= $i + 1 ?>.</span>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-gray-900 truncate"><?= e($stu['first_name'] . ' ' . $stu['last_name']) ?></p>
                </div>
                <span class="text-[11px] text-gray-400"><?= e($stu['admission_number'] ?? '') ?></span>
                <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </a>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>

<?php if (!empty($mySubjects)): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100">
        <p class="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">My Subjects</p>
        <h2 class="text-lg font-bold text-gray-900">Subjects I teach</h2>
        <p class="text-xs text-gray-500"><?= count($mySubjects) ?> assignment<?= count($mySubjects) === 1 ? '' : 's' ?></p>
    </div>
    <div class="divide-y divide-gray-50">
        <?php foreach ($mySubjects as $a): ?>
        <?php
        $clsName = $classMap[$a['class_id']] ?? 'Class';
        $subName = $subjectNameMap[$a['subject_id']] ?? 'Subject';
        ?>
        <div class="px-5 py-3 flex items-center justify-between flex-wrap gap-3">
            <div class="min-w-0">
                <p class="text-sm font-medium text-gray-900"><?= e($subName) ?></p>
                <p class="text-xs text-gray-500"><?= e($clsName) ?></p>
                <?php $ps = $pairStats[$a['class_id'] . '|' . $a['subject_id']] ?? null; if ($ps && $ps['avg'] !== null): ?>
                <p class="text-[11px] mt-0.5"><span class="font-semibold text-gray-700">Avg <?= $ps['avg'] ?>%</span><?php if ($ps['below'] > 0): ?> <span class="text-red-500">· <?= $ps['below'] ?> below 40%</span><?php endif; ?></p>
                <?php endif; ?>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <a href="<?= baseUrl('teacher/subject?class_id=' . urlencode($a['class_id']) . '&subject_id=' . urlencode($a['subject_id'])) ?>"
                   class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Performance</a>
                <a href="<?= baseUrl('grades/entry?class_id=' . urlencode($a['class_id']) . '&subject_id=' . urlencode($a['subject_id'])) ?>"
                   class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                    Enter marks
                </a>
                <?php if ($currentTermId): ?>
                <a href="<?= baseUrl('grades/subject-remarks?class_id=' . urlencode($a['class_id']) . '&subject_id=' . urlencode($a['subject_id']) . '&term_id=' . urlencode($currentTermId)) ?>"
                   class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                    Remarks
                </a>
                <?php endif; ?>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
