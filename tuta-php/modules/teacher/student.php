<?php
/**
 * Teacher — per-student profile (current term).
 * Subject %s + trend across exams, strengths/weaknesses vs the class average,
 * and a deterministic, copy-ready remark draft. No AI — Horeb adds the
 * competency-level detail later.
 */
$sb  = new Supabase();
$sid = schoolId();
$uid = currentUser()['id'] ?? '';
$studentId = input('id');

$stuRes = $sb->from('students')->select('id,first_name,last_name,admission_number,current_class_id,gender')
    ->eq('id', $studentId)->eq('school_id', $sid)->single()->execute();
$student = $stuRes['data'][0] ?? null;
if (!$student) { flash('error', 'Student not found.'); redirect('dashboard'); }
$classId = $student['current_class_id'] ?? '';

// ── Authorize ──
$canView = isAdmin() || hasRole(['head_teacher']);
if (!$canView) {
    foreach (teacherClassAssignments($uid) as $c) if ($c['id'] === $classId) { $canView = true; break; }
    if (!$canView) foreach (teacherSubjectAssignments($uid) as $a) if ($a['class_id'] === $classId) { $canView = true; break; }
}
if (!$canView) { flash('error', 'You can only view students in classes you teach.'); redirect('dashboard'); }

$classMap = cachedClassMap();
$subjectName = [];
foreach (cachedSubjects() as $s) $subjectName[$s['id']] = $s['name'];
$fullName  = trim($student['first_name'] . ' ' . $student['last_name']);
$pageTitle = $fullName;
$currentTerm   = cachedCurrentTerm();
$currentTermId = $currentTerm['id'] ?? null;

// ── Class peers (for class averages) ──
$peers = $sb->from('students')->select('id')->eq('school_id', $sid)->eq('current_class_id', $classId)->eq('status', 'active')->execute()['data'] ?? [];
$peerIds = array_column($peers, 'id');

// ── Grades for the class (current term), all subjects ──
$grades = [];
if (!empty($peerIds)) {
    $grades = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('grades')->select('exam_id,subject_id,student_id,marks')->eq('school_id', $sid),
        'student_id', $peerIds
    );
}
$examIds = array_values(array_unique(array_filter(array_column($grades, 'exam_id'))));
$exams = [];
if (!empty($examIds)) {
    foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('exams')->select('id,name,max_marks,start_date,term_id'), 'id', $examIds) as $e) {
        if ($currentTermId && !empty($e['term_id']) && $e['term_id'] !== $currentTermId) continue;
        $exams[$e['id']] = $e;
    }
}
uasort($exams, fn($a, $b) => ($a['start_date'] ?? '') <=> ($b['start_date'] ?? ''));
$examOrder = array_keys($exams);
$pct = function ($marks, $eid) use ($exams) {
    $max = (float)($exams[$eid]['max_marks'] ?? 0);
    return $max > 0 ? round((float)$marks / $max * 100, 1) : null;
};

// Build: my[subject][exam]=pct ; classVals[subject]=[pcts]
$mine = []; $classVals = [];
foreach ($grades as $g) {
    $eid = $g['exam_id']; if (!isset($exams[$eid])) continue;
    $p = $pct($g['marks'], $eid); if ($p === null) continue;
    $classVals[$g['subject_id']][] = $p;
    if ($g['student_id'] === $studentId) $mine[$g['subject_id']][$eid] = $p;
}
$classAvgSubj = [];
foreach ($classVals as $subj => $vals) $classAvgSubj[$subj] = round(array_sum($vals) / count($vals), 1);

$latestExam = end($examOrder) ?: null;
$prevExam   = count($examOrder) >= 2 ? $examOrder[count($examOrder) - 2] : null;

// Per-subject summary for this student.
$subjRows = [];
foreach ($mine as $subj => $m) {
    $latest = $latestExam !== null && isset($m[$latestExam]) ? $m[$latestExam] : null;
    if ($latest === null) { // fall back to most recent available
        foreach (array_reverse($examOrder) as $eid) if (isset($m[$eid])) { $latest = $m[$eid]; break; }
    }
    $prev = $prevExam !== null && isset($m[$prevExam]) ? $m[$prevExam] : null;
    $subjRows[] = [
        'subject' => $subjectName[$subj] ?? 'Subject',
        'latest'  => $latest,
        'trend'   => ($latest !== null && $prev !== null) ? round($latest - $prev, 1) : null,
        'classavg'=> $classAvgSubj[$subj] ?? null,
        'band'    => $latest !== null ? gradeBandFor($latest) : null,
    ];
}
usort($subjRows, fn($a, $b) => ($b['latest'] ?? -1) <=> ($a['latest'] ?? -1));

$scored = array_values(array_filter($subjRows, fn($r) => $r['latest'] !== null));
$overall = $scored ? round(array_sum(array_column($scored, 'latest')) / count($scored), 1) : null;
$strongest = $scored[0] ?? null;
$weakest   = $scored ? $scored[count($scored) - 1] : null;
$improving = count(array_filter($subjRows, fn($r) => $r['trend'] !== null && $r['trend'] > 0));
$declining = count(array_filter($subjRows, fn($r) => $r['trend'] !== null && $r['trend'] < 0));

// ── Deterministic remark draft ──
$remark = '';
if ($overall !== null) {
    $band = gradeBandFor($overall);
    $bandTxt = $band['label'] ?? $band['code'] ?? '';
    if ($overall >= 70)      $open = 'An excellent term.';
    elseif ($overall >= 50)  $open = 'A good term overall.';
    elseif ($overall >= 40)  $open = 'A fair term, with clear room to grow.';
    else                     $open = 'A challenging term.';
    $parts = [$open, sprintf('Average %.0f%%%s.', $overall, $bandTxt ? ' (' . $bandTxt . ')' : '')];
    if ($strongest && $strongest['latest'] !== null) $parts[] = sprintf('Strongest in %s (%.0f%%).', $strongest['subject'], $strongest['latest']);
    if ($weakest && $weakest !== $strongest && $weakest['latest'] !== null) $parts[] = sprintf('Needs more support in %s (%.0f%%).', $weakest['subject'], $weakest['latest']);
    if ($declining > $improving && $declining > 0)      $parts[] = 'Results have dipped this term — worth a check-in.';
    elseif ($improving > 0 && $improving >= $declining) $parts[] = 'Showing good improvement.';
    $parts[] = $overall >= 50 ? 'Keep it up.' : 'With consistent effort and practice, can improve.';
    $remark = implode(' ', $parts);
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <a href="<?= baseUrl('dashboard') ?>" class="text-xs text-gray-400 hover:text-gray-600">← My Teaching</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-1"><?= e($fullName) ?></h1>
    <p class="text-sm text-gray-500 mt-1"><?= e($classMap[$classId] ?? 'Class') ?><?php if (!empty($student['admission_number'])): ?> · <?= e($student['admission_number']) ?><?php endif; ?><?php if ($currentTerm): ?> · <?= e($currentTerm['name']) ?><?php endif; ?></p>
</div>

<?php if (empty($scored)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">No graded marks for this student this term yet.</div>
<?php else: ?>

<!-- Summary -->
<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Overall average</p>
        <p class="text-2xl font-bold text-gray-900"><?= $overall ?>%</p>
        <p class="text-[11px] text-gray-400 mt-0.5"><?= e(gradeBandFor($overall)['label'] ?? gradeBandFor($overall)['code'] ?? '') ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Strongest</p>
        <p class="text-base font-bold text-emerald-700 truncate"><?= e($strongest['subject'] ?? '—') ?></p>
        <p class="text-[11px] text-gray-400 mt-0.5"><?= $strongest['latest'] !== null ? $strongest['latest'] . '%' : '' ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Weakest</p>
        <p class="text-base font-bold text-red-600 truncate"><?= e($weakest['subject'] ?? '—') ?></p>
        <p class="text-[11px] text-gray-400 mt-0.5"><?= $weakest['latest'] !== null ? $weakest['latest'] . '%' : '' ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Trend</p>
        <p class="text-base font-bold text-gray-900"><?= $improving ?>↑ / <?= $declining ?>↓</p>
        <p class="text-[11px] text-gray-400 mt-0.5">subjects up / down</p>
    </div>
</div>

<!-- Remark draft -->
<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-5">
    <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-semibold text-gray-700">Suggested remark</h2>
        <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('remarkTxt').textContent.trim()).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500);})" class="px-3 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">Copy</button>
    </div>
    <p id="remarkTxt" class="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2.5"><?= e($remark) ?></p>
    <p class="text-[11px] text-gray-400 mt-1.5">Auto-drafted from this term's marks — edit before using on a report card.</p>
</div>

<!-- Per-subject -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">By subject</h2></div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead><tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Subject</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Latest %</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Grade</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Trend</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">vs class</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($subjRows as $r):
                    $delta = ($r['latest'] !== null && $r['classavg'] !== null) ? round($r['latest'] - $r['classavg'], 1) : null; ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-2.5 font-medium text-gray-900"><?= e($r['subject']) ?></td>
                        <td class="px-4 py-2.5 text-right font-semibold <?= $r['latest'] === null ? 'text-gray-300' : ($r['latest'] < 40 ? 'text-red-600' : 'text-gray-900') ?>"><?= $r['latest'] !== null ? $r['latest'] . '%' : '—' ?></td>
                        <td class="px-4 py-2.5 text-gray-600"><?= e($r['band']['code'] ?? $r['band']['label'] ?? '—') ?></td>
                        <td class="px-4 py-2.5 text-right">
                            <?php if ($r['trend'] === null): ?><span class="text-gray-300">—</span>
                            <?php elseif ($r['trend'] > 0): ?><span class="text-emerald-600">▲ <?= $r['trend'] ?></span>
                            <?php elseif ($r['trend'] < 0): ?><span class="text-red-500">▼ <?= abs($r['trend']) ?></span>
                            <?php else: ?><span class="text-gray-400">–</span><?php endif; ?>
                        </td>
                        <td class="px-4 py-2.5 text-right">
                            <?php if ($delta === null): ?><span class="text-gray-300">—</span>
                            <?php elseif ($delta > 0): ?><span class="text-emerald-600">+<?= $delta ?></span>
                            <?php elseif ($delta < 0): ?><span class="text-red-500"><?= $delta ?></span>
                            <?php else: ?><span class="text-gray-400">0</span><?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
