<?php
/**
 * Teacher — Subject performance for one class + subject.
 * Class average, grade-band distribution (latest exam), per-exam trend, and a
 * ranked student list with weak/declining flags. Scoped to the current term.
 * Deterministic; Horeb adds topic-level mastery later.
 */
$sb   = new Supabase();
$sid  = schoolId();
$uid  = currentUser()['id'] ?? '';
$classId   = input('class_id');
$subjectId = input('subject_id');

// ── Authorize: admin/head teacher, or the assigned subject teacher ──
$authorized = isAdmin() || hasRole(['head_teacher']);
if (!$authorized) {
    foreach (teacherSubjectAssignments($uid) as $a) {
        if ($a['class_id'] === $classId && $a['subject_id'] === $subjectId) { $authorized = true; break; }
    }
}
if (!$classId || !$subjectId || !$authorized) {
    flash('error', 'You can only view subjects you teach.');
    redirect('dashboard');
}

$classMap   = cachedClassMap();
$subjectName = [];
foreach (cachedSubjects() as $s) $subjectName[$s['id']] = $s['name'];
$className = $classMap[$classId] ?? 'Class';
$subName   = $subjectName[$subjectId] ?? 'Subject';
$pageTitle = $subName . ' · ' . $className;
$currentTerm   = cachedCurrentTerm();
$currentTermId = $currentTerm['id'] ?? null;

// ── Students in the class ──
$stuRes = $sb->from('students')->select('id,first_name,last_name,admission_number')
    ->eq('school_id', $sid)->eq('current_class_id', $classId)->eq('status', 'active')->order('first_name')->execute();
$students = $stuRes['data'] ?? [];
$stuName = [];
foreach ($students as $s) $stuName[$s['id']] = trim($s['first_name'] . ' ' . $s['last_name']);
$studentIds = array_column($students, 'id');

// ── Grades for this subject (this class's students) ──
$grades = [];
if (!empty($studentIds)) {
    $grades = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('grades')->select('exam_id,student_id,marks')
            ->eq('school_id', $sid)->eq('subject_id', $subjectId),
        'student_id', $studentIds
    );
}
// Exams referenced → name, max_marks, start_date, term.
$examIds = array_values(array_unique(array_filter(array_column($grades, 'exam_id'))));
$exams = [];
if (!empty($examIds)) {
    foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('exams')->select('id,name,max_marks,start_date,term_id'), 'id', $examIds) as $e) {
        if ($currentTermId && !empty($e['term_id']) && $e['term_id'] !== $currentTermId) continue; // current term only
        $exams[$e['id']] = $e;
    }
}
// Order exams by date.
uasort($exams, fn($a, $b) => ($a['start_date'] ?? '') <=> ($b['start_date'] ?? ''));
$examOrder = array_keys($exams);

// pct = marks / max_marks * 100
function pct_of($marks, $max) { $max = (float)$max; return $max > 0 ? round((float)$marks / $max * 100, 1) : null; }

// student_id => [exam_id => pct]
$byStudent = [];
foreach ($grades as $g) {
    $eid = $g['exam_id'];
    if (!isset($exams[$eid])) continue;
    $p = pct_of($g['marks'], $exams[$eid]['max_marks']);
    if ($p === null) continue;
    $byStudent[$g['student_id']][$eid] = $p;
}

// Per-exam class average.
$examAvg = [];
foreach ($examOrder as $eid) {
    $vals = [];
    foreach ($byStudent as $sidx => $m) if (isset($m[$eid])) $vals[] = $m[$eid];
    $examAvg[$eid] = $vals ? round(array_sum($vals) / count($vals), 1) : null;
}
$latestExam = end($examOrder) ?: null;
$prevExam   = count($examOrder) >= 2 ? $examOrder[count($examOrder) - 2] : null;

// Per-student latest %, trend, band.
$rows = [];
foreach ($students as $s) {
    $m = $byStudent[$s['id']] ?? [];
    $latest = $latestExam !== null && isset($m[$latestExam]) ? $m[$latestExam] : null;
    $prev   = $prevExam !== null && isset($m[$prevExam]) ? $m[$prevExam] : null;
    $trend  = ($latest !== null && $prev !== null) ? round($latest - $prev, 1) : null;
    $band   = $latest !== null ? gradeBandFor($latest) : null;
    $rows[] = ['id' => $s['id'], 'name' => $stuName[$s['id']], 'adm' => $s['admission_number'] ?? '',
               'latest' => $latest, 'trend' => $trend, 'band' => $band];
}
// Rank by latest desc (nulls last).
usort($rows, fn($a, $b) => ($b['latest'] ?? -1) <=> ($a['latest'] ?? -1));

$classAvgLatest = $latestExam !== null ? $examAvg[$latestExam] : null;
// Grade-band distribution (latest exam).
$dist = [];
foreach ($rows as $r) {
    if ($r['latest'] === null) continue;
    $code = $r['band']['code'] ?? $r['band']['label'] ?? '—';
    $dist[$code] = ($dist[$code] ?? 0) + 1;
}
$needsAttention = array_filter($rows, fn($r) => $r['latest'] !== null && $r['latest'] < 40);
$declining      = array_filter($rows, fn($r) => $r['trend'] !== null && $r['trend'] <= -10);

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6 flex items-start justify-between gap-3 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900"><?= e($subName) ?> <span class="text-gray-400 font-normal">· <?= e($className) ?></span></h1>
        <p class="text-sm text-gray-500 mt-1"><?= $currentTerm ? e($currentTerm['name']) : 'All exams' ?> · <?= count($students) ?> students</p>
    </div>
    <a href="<?= baseUrl('grades/entry?class_id=' . urlencode($classId) . '&subject_id=' . urlencode($subjectId)) ?>" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Enter marks</a>
</div>

<?php if (empty($examOrder)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">No marks recorded for this subject this term yet. Click <strong>Enter marks</strong> to start.</div>
<?php else: ?>

<!-- Stat cards -->
<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Class average</p>
        <p class="text-2xl font-bold text-gray-900"><?= $classAvgLatest !== null ? $classAvgLatest . '%' : '—' ?></p>
        <p class="text-[11px] text-gray-400 mt-0.5">latest exam</p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Exams this term</p>
        <p class="text-2xl font-bold text-gray-900"><?= count($examOrder) ?></p>
    </div>
    <div class="bg-white rounded-xl border <?= count($needsAttention) ? 'border-red-200' : 'border-gray-100' ?> p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Below 40%</p>
        <p class="text-2xl font-bold <?= count($needsAttention) ? 'text-red-600' : 'text-gray-900' ?>"><?= count($needsAttention) ?></p>
        <p class="text-[11px] text-gray-400 mt-0.5">need attention</p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Declining</p>
        <p class="text-2xl font-bold <?= count($declining) ? 'text-amber-600' : 'text-gray-900' ?>"><?= count($declining) ?></p>
        <p class="text-[11px] text-gray-400 mt-0.5">dropped ≥10%</p>
    </div>
</div>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
    <!-- Per-exam trend -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:col-span-2">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">Class average per exam</h2>
        <div class="space-y-2">
            <?php foreach ($examOrder as $eid): $a = $examAvg[$eid]; ?>
                <div class="flex items-center gap-3">
                    <div class="w-32 text-xs text-gray-500 truncate flex-shrink-0"><?= e($exams[$eid]['name'] ?? 'Exam') ?></div>
                    <div class="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                        <div class="h-full <?= $a >= 50 ? 'bg-emerald-500' : ($a >= 40 ? 'bg-amber-500' : 'bg-red-500') ?>" style="width: <?= $a !== null ? min(100, $a) : 0 ?>%"></div>
                    </div>
                    <div class="w-12 text-right text-xs font-semibold text-gray-700"><?= $a !== null ? $a . '%' : '—' ?></div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>
    <!-- Grade distribution (latest) -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">Grades (latest exam)</h2>
        <?php if (empty($dist)): ?><p class="text-xs text-gray-400">No graded scores.</p><?php else: ?>
        <div class="space-y-1.5">
            <?php arsort($dist); foreach ($dist as $code => $n): ?>
                <div class="flex items-center justify-between text-sm">
                    <span class="font-medium text-gray-700"><?= e($code) ?></span>
                    <span class="text-gray-500"><?= $n ?> student<?= $n === 1 ? '' : 's' ?></span>
                </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>
</div>

<!-- Ranked students -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Students <span class="text-gray-400 font-normal">(ranked by latest exam)</span></h2></div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead><tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Latest %</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Grade</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Trend</th>
                <th class="px-4 py-3"></th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($rows as $i => $r): ?>
                    <tr class="hover:bg-gray-50/50 <?= ($r['latest'] !== null && $r['latest'] < 40) ? 'bg-red-50/30' : '' ?>">
                        <td class="px-4 py-2.5 text-gray-400 text-xs"><?= $i + 1 ?></td>
                        <td class="px-4 py-2.5 font-medium text-gray-900"><?= e($r['name']) ?> <span class="text-gray-400 text-xs ml-1"><?= e($r['adm']) ?></span></td>
                        <td class="px-4 py-2.5 text-right font-semibold <?= $r['latest'] === null ? 'text-gray-300' : ($r['latest'] < 40 ? 'text-red-600' : 'text-gray-900') ?>"><?= $r['latest'] !== null ? $r['latest'] . '%' : '—' ?></td>
                        <td class="px-4 py-2.5 text-gray-600"><?= e($r['band']['code'] ?? $r['band']['label'] ?? '—') ?></td>
                        <td class="px-4 py-2.5 text-right">
                            <?php if ($r['trend'] === null): ?><span class="text-gray-300">—</span>
                            <?php elseif ($r['trend'] > 0): ?><span class="text-emerald-600">▲ <?= $r['trend'] ?></span>
                            <?php elseif ($r['trend'] < 0): ?><span class="text-red-500">▼ <?= abs($r['trend']) ?></span>
                            <?php else: ?><span class="text-gray-400">–</span><?php endif; ?>
                        </td>
                        <td class="px-4 py-2.5 text-right"><a href="<?= baseUrl('teacher/student?id=' . urlencode($r['id'])) ?>" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Profile →</a></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
