<?php
/**
 * Analysis — Phase 3 of the examination module.
 *
 * Two views, switched by ?view=:
 *   class    (default) — pick a term + class. Average per subject, average
 *                        per exam, headcount, performance band distribution,
 *                        and most-improved when term-over-term data exists.
 *   student  — pick a student + term. Per-subject per-exam performance and
 *              delta vs class average.
 *
 * Reads from the existing report_cards + report_card_subjects tables, so no
 * migration. Generation must have happened for the term in question — if no
 * cards exist for the (class, term) the page tells the user that.
 */
$pageTitle = 'Analysis';
$sb  = new Supabase();
$sid = schoolId();

$view = input('view') === 'student' ? 'student' : 'class';

$terms       = cachedTerms();
$classes     = cachedClasses();
$classMap    = cachedClassMap();
$currentTerm = cachedCurrentTerm();

$selTerm   = input('term_id') ?: ($currentTerm['id'] ?? '');
$selClass  = input('class_id');
$selStudent = input('student_id');

// ── For per-class view ────────────────────────────────────────
$classCards   = [];
$classRcs     = [];
$examMap      = []; // exam_id => name
$subjectMap   = []; // subject_id => name
$studentNames = []; // student_id => first + last
if ($view === 'class' && $selTerm && $selClass) {
    $cardsRes = $sb->from('report_cards')
        ->select('id,student_id,overall_percentage,overall_grade,class_rank,class_size,status')
        ->eq('school_id', $sid)->eq('term_id', $selTerm)->eq('class_id', $selClass)
        ->execute();
    $classCards = $cardsRes['data'] ?? [];

    if (!empty($classCards)) {
        $cardIds = array_column($classCards, 'id');
        // Chunked IN: a large class across several terms can have >1000 cards,
        // which would make a single ->in() throw (500). fetchByChunkedIn splits
        // it into batches of 250.
        $classRcs = Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('report_card_subjects')
                ->select('report_card_id,exam_id,subject_id,subject_name,percentage,grade'),
            'report_card_id', $cardIds);

        foreach ($classRcs as $r) {
            $subjectMap[$r['subject_id']] = $r['subject_name'] ?? 'Subject';
        }
        asort($subjectMap);

        $stuRows = Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('students')->select('id,first_name,last_name,admission_number'),
            'id', array_column($classCards, 'student_id'));
        foreach ($stuRows as $s) {
            $studentNames[$s['id']] = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''));
        }

        // Exam names for column headers
        $examIds = array_values(array_unique(array_column($classRcs, 'exam_id')));
        if (!empty($examIds)) {
            $exRes = $sb->from('exams')->select('id,name,start_date')
                ->in('id', $examIds)->order('start_date')->execute();
            foreach (($exRes['data'] ?? []) as $e) $examMap[$e['id']] = $e['name'];
        }
    }
}

// ── For per-student view ──────────────────────────────────────
$studentCard   = null;
$studentRcs    = [];
$studentSubs   = []; // subject_id => name
$studentExams  = []; // exam_id => name
$classAvgs     = []; // subject_id => exam_id => class avg percentage
if ($view === 'student' && $selTerm && $selStudent) {
    // The student's card
    $cardRes = $sb->from('report_cards')
        ->select('id,student_id,class_id,overall_percentage,overall_grade,class_rank,class_size,status')
        ->eq('school_id', $sid)->eq('term_id', $selTerm)->eq('student_id', $selStudent)
        ->single()->execute();
    $studentCard = $cardRes['data'][0] ?? null;

    if ($studentCard) {
        $rcsRes = $sb->from('report_card_subjects')
            ->select('exam_id,subject_id,subject_name,percentage,grade')
            ->eq('report_card_id', $studentCard['id'])->execute();
        $studentRcs = $rcsRes['data'] ?? [];

        foreach ($studentRcs as $r) {
            $studentSubs[$r['subject_id']]  = $r['subject_name'] ?? 'Subject';
        }
        asort($studentSubs);

        $examIds = array_values(array_unique(array_column($studentRcs, 'exam_id')));
        if (!empty($examIds)) {
            $exRes = $sb->from('exams')->select('id,name,start_date')
                ->in('id', $examIds)->order('start_date')->execute();
            foreach (($exRes['data'] ?? []) as $e) $studentExams[$e['id']] = $e['name'];
        }

        // Class averages so we can show deltas. Pull every report_card_subjects
        // row for the same (class, term) and average per (subject, exam).
        $cClassRes = $sb->from('report_cards')->select('id')
            ->eq('school_id', $sid)->eq('term_id', $selTerm)->eq('class_id', $studentCard['class_id'])
            ->execute();
        $cardIds = array_column(($cClassRes['data'] ?? []), 'id');
        if (!empty($cardIds)) {
            $aRows = Supabase::fetchByChunkedIn(
                fn($_sb) => $_sb->from('report_card_subjects')->select('exam_id,subject_id,percentage'),
                'report_card_id', $cardIds);
            $bucket = [];
            foreach ($aRows as $r) {
                $bucket[$r['subject_id']][$r['exam_id']][] = (float)($r['percentage'] ?? 0);
            }
            foreach ($bucket as $subId => $byExam) {
                foreach ($byExam as $eid => $pcts) {
                    $classAvgs[$subId][$eid] = !empty($pcts) ? array_sum($pcts) / count($pcts) : 0;
                }
            }
        }
    }
}

// Active students for the student-view dropdown (only when a term/class context
// makes sense — load any active student in the school).
$allActiveStudents = [];
if ($view === 'student') {
    $asRes = $sb->from('students')->select('id,first_name,last_name,current_class_id,admission_number')
        ->eq('school_id', $sid)->eq('status', 'active')->order('first_name')->execute();
    $allActiveStudents = $asRes['data'] ?? [];
}

$showRank = schoolSetting('show_class_rank', 'false') === 'true';

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Analysis</h1>
    <p class="text-sm text-gray-500 mt-1">How a class is performing — and how each student sits inside it. Reads from generated report cards.</p>
</div>

<!-- View switcher -->
<div class="inline-flex rounded-lg border border-gray-200 bg-white p-1 mb-4">
    <a href="<?= baseUrl('grades/analysis') ?>?view=class&term_id=<?= e($selTerm) ?>&class_id=<?= e($selClass) ?>"
       class="px-4 py-1.5 text-sm font-medium rounded-md transition <?= $view === 'class' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50' ?>">By Class</a>
    <a href="<?= baseUrl('grades/analysis') ?>?view=student&term_id=<?= e($selTerm) ?>&student_id=<?= e($selStudent) ?>"
       class="px-4 py-1.5 text-sm font-medium rounded-md transition <?= $view === 'student' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50' ?>">By Student</a>
</div>

<!-- Filters -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('grades/analysis') ?>" class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <input type="hidden" name="view" value="<?= e($view) ?>">
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Term</label>
            <select name="term_id" onchange="this.form.submit()" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">Select term</option>
                <?php foreach ($terms as $t): ?>
                    <option value="<?= e($t['id']) ?>"<?= selectedIf($selTerm, $t['id']) ?>><?= e($t['name']) ?><?= !empty($t['is_current']) ? ' (current)' : '' ?></option>
                <?php endforeach; ?>
            </select>
        </div>

        <?php if ($view === 'class'): ?>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Class</label>
                <select name="class_id" onchange="this.form.submit()" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <option value="">Select class</option>
                    <?php foreach ($classes as $c): ?>
                        <option value="<?= e($c['id']) ?>"<?= selectedIf($selClass, $c['id']) ?>><?= e($c['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
        <?php else: ?>
            <div class="sm:col-span-2">
                <label class="block text-xs font-medium text-gray-600 mb-1">Student</label>
                <?php
                $selStuLabel = '';
                if ($selStudent) {
                    foreach ($allActiveStudents as $s) {
                        if ($s['id'] === $selStudent) { $selStuLabel = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? '')) . ' — ' . ($classMap[$s['current_class_id']] ?? 'No class'); break; }
                    }
                }
                ?>
                <div class="stupick relative">
                    <input type="text" id="anStuSearch" autocomplete="off" value="<?= e($selStuLabel) ?>"
                        placeholder="Search student name or admission no…"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <input type="hidden" name="student_id" id="anStuId" value="<?= e($selStudent) ?>">
                    <div id="anStuList" class="hidden absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20 text-left">
                        <?php foreach ($allActiveStudents as $s): ?>
                            <?php
                            $lbl    = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? '')) . ' — ' . ($classMap[$s['current_class_id']] ?? 'No class');
                            $needle = strtolower(trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? '') . ' ' . ($s['admission_number'] ?? '')));
                            ?>
                            <div class="stuopt px-3 py-2 text-sm cursor-pointer hover:bg-emerald-50 text-gray-900 border-b border-gray-50 last:border-0" data-id="<?= e($s['id']) ?>" data-search="<?= e($needle) ?>" data-label="<?= e($lbl) ?>"><?= e($lbl) ?></div>
                        <?php endforeach; ?>
                        <div id="anStuNone" class="hidden px-3 py-3 text-sm text-gray-400">No matching student</div>
                    </div>
                </div>
            </div>
        <?php endif; ?>
    </form>
</div>

<?php if ($view === 'class'): ?>
    <?php if (!$selTerm || !$selClass): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-sm text-gray-500">Pick a term and class to see the analysis.</div>
    <?php elseif (empty($classCards)): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-sm text-gray-500">No report cards have been generated for this class in the selected term.</p>
            <p class="text-xs text-gray-400 mt-1">Generate them in <strong>Grades &rarr; Reports</strong> first.</p>
        </div>
    <?php else: ?>

        <?php
        // Roll up averages.
        $overallPcts = array_filter(array_map(fn($c) => (float)($c['overall_percentage'] ?? 0), $classCards), fn($p) => $p > 0);
        $classAvgOverall  = !empty($overallPcts) ? array_sum($overallPcts) / count($overallPcts) : 0;
        $classMaxOverall  = !empty($overallPcts) ? max($overallPcts) : 0;
        $classMinOverall  = !empty($overallPcts) ? min($overallPcts) : 0;

        // Subject avg (across all exams + students)
        $subjBucket = []; // subject_id => [pcts]
        $subjByExam = []; // subject_id => exam_id => [pcts]
        $examBucket = []; // exam_id => [pcts]
        foreach ($classRcs as $r) {
            $p = (float)($r['percentage'] ?? 0);
            $subjBucket[$r['subject_id']][] = $p;
            $examBucket[$r['exam_id']][] = $p;
            $subjByExam[$r['subject_id']][$r['exam_id']][] = $p;
        }
        $subjAvgs = [];
        foreach ($subjBucket as $sub => $pcts) $subjAvgs[$sub] = array_sum($pcts) / count($pcts);
        arsort($subjAvgs);

        // Best and worst subject
        $bestSubject  = !empty($subjAvgs) ? array_key_first($subjAvgs) : null;
        $worstSubject = !empty($subjAvgs) ? array_key_last($subjAvgs)  : null;

        // Performance band distribution by school grading scheme
        $bands = [];
        foreach ($classCards as $c) {
            $g = $c['overall_grade'] ?? '—';
            $bands[$g] = ($bands[$g] ?? 0) + 1;
        }
        ?>

        <!-- Summary cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Students</p>
                <p class="text-2xl font-bold text-gray-900 tracking-tight mt-1"><?= count($classCards) ?></p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Class Average</p>
                <p class="text-2xl font-bold text-emerald-600 tracking-tight mt-1"><?= number_format($classAvgOverall, 1) ?>%</p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Highest</p>
                <p class="text-2xl font-bold text-gray-900 tracking-tight mt-1"><?= number_format($classMaxOverall, 1) ?>%</p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Lowest</p>
                <p class="text-2xl font-bold text-gray-900 tracking-tight mt-1"><?= number_format($classMinOverall, 1) ?>%</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <!-- Subject performance -->
            <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div class="px-5 py-4 border-b border-gray-100">
                    <h2 class="text-sm font-semibold text-gray-700">Subject Performance</h2>
                    <p class="text-[11px] text-gray-400">Class average per subject (across all exams in the term)</p>
                </div>
                <div class="divide-y divide-gray-50">
                    <?php foreach ($subjAvgs as $sub => $avg): ?>
                        <?php
                        $label = $subjectMap[$sub] ?? 'Subject';
                        $barW  = max(2, min(100, (int)round($avg)));
                        $color = $avg >= 70 ? 'bg-emerald-500' : ($avg >= 50 ? 'bg-amber-500' : 'bg-red-500');
                        ?>
                        <div class="px-5 py-3">
                            <div class="flex items-center justify-between mb-1.5">
                                <span class="text-sm text-gray-800 font-medium"><?= e($label) ?></span>
                                <span class="text-sm font-semibold <?= $avg >= 70 ? 'text-emerald-600' : ($avg >= 50 ? 'text-amber-600' : 'text-red-600') ?>"><?= number_format($avg, 1) ?>%</span>
                            </div>
                            <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div class="h-full <?= $color ?>" style="width: <?= $barW ?>%"></div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>

            <!-- Exam performance + band distribution -->
            <div class="space-y-4">
                <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div class="px-5 py-4 border-b border-gray-100">
                        <h2 class="text-sm font-semibold text-gray-700">Per-Exam Class Average</h2>
                        <p class="text-[11px] text-gray-400">Trend within the term, with the change from the previous exam.</p>
                    </div>
                    <div class="divide-y divide-gray-50">
                        <?php
                        // Preserve the order from $examMap (which came from exams.order('start_date')).
                        $ordered = [];
                        foreach ($examMap as $eid => $ename) {
                            if (isset($examBucket[$eid])) {
                                $ordered[$eid] = ['name' => $ename, 'avg' => array_sum($examBucket[$eid]) / count($examBucket[$eid])];
                            }
                        }
                        $prevAvg = null;
                        foreach ($ordered as $eid => $row):
                            $exAvg = $row['avg'];
                            $delta = $prevAvg === null ? null : $exAvg - $prevAvg;
                        ?>
                            <div class="px-5 py-3 flex items-center justify-between">
                                <span class="text-sm text-gray-800"><?= e($row['name']) ?></span>
                                <span class="flex items-center gap-2">
                                    <?php if ($delta !== null): ?>
                                        <span class="text-[11px] <?= $delta > 0.05 ? 'text-emerald-600' : ($delta < -0.05 ? 'text-red-500' : 'text-gray-400') ?>">
                                            <?= $delta > 0.05 ? '&#9650; +' : ($delta < -0.05 ? '&#9660; ' : '&#9654; ') ?><?= number_format(abs($delta), 1) ?>
                                        </span>
                                    <?php endif; ?>
                                    <span class="text-sm font-semibold <?= $exAvg >= 70 ? 'text-emerald-600' : ($exAvg >= 50 ? 'text-amber-600' : 'text-red-600') ?>"><?= number_format($exAvg, 1) ?>%</span>
                                </span>
                            </div>
                            <?php $prevAvg = $exAvg; ?>
                        <?php endforeach; ?>
                    </div>
                </div>

                <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div class="px-5 py-4 border-b border-gray-100">
                        <h2 class="text-sm font-semibold text-gray-700">Grade Distribution</h2>
                        <p class="text-[11px] text-gray-400">Number of students per overall grade</p>
                    </div>
                    <div class="divide-y divide-gray-50">
                        <?php foreach ($bands as $g => $count): ?>
                            <div class="px-5 py-3 flex items-center justify-between">
                                <span class="text-sm text-gray-800 font-medium"><?= e($g) ?></span>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"><?= (int)$count ?> student<?= $count === 1 ? '' : 's' ?></span>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>
        </div>

        <?php
        // ── Term-over-term for this class ─────────────────────────
        // Pull every report card this class has ever had (any term), group by
        // term, average. Order chronologically by term start_date. Empty when
        // it's the first term.
        $totRes = $sb->from('report_cards')->select('term_id,overall_percentage')
            ->eq('school_id', $sid)->eq('class_id', $selClass)->execute();
        $perTerm = [];
        foreach (($totRes['data'] ?? []) as $r) {
            $tid = $r['term_id'];
            if (!$tid) continue;
            $perTerm[$tid][] = (float)($r['overall_percentage'] ?? 0);
        }
        $termRows = [];
        foreach ($terms as $t) {
            if (!empty($perTerm[$t['id']])) {
                $termRows[] = [
                    'id'    => $t['id'],
                    'name'  => $t['name'],
                    'avg'   => array_sum($perTerm[$t['id']]) / count($perTerm[$t['id']]),
                    'count' => count($perTerm[$t['id']]),
                ];
            }
        }

        // ── Most improved / biggest drops ─────────────────────────
        // Compare each student's selected-term overall to the previous carded
        // term for this class. Only students with a card in both terms count.
        $movers = [];
        $prevTermName = null;
        $chronCardedTermIds = array_column($termRows, 'id');
        $selPos = array_search($selTerm, $chronCardedTermIds, true);
        $prevTermId = ($selPos !== false && $selPos > 0) ? $chronCardedTermIds[$selPos - 1] : null;
        if ($prevTermId) {
            foreach ($termRows as $tr) { if ($tr['id'] === $prevTermId) { $prevTermName = $tr['name']; break; } }
            $prevRes = $sb->from('report_cards')->select('student_id,overall_percentage')
                ->eq('school_id', $sid)->eq('term_id', $prevTermId)->eq('class_id', $selClass)->execute();
            $prevByStu = [];
            foreach (($prevRes['data'] ?? []) as $r) $prevByStu[$r['student_id']] = (float)($r['overall_percentage'] ?? 0);
            foreach ($classCards as $c) {
                $stu = $c['student_id'];
                if (!isset($prevByStu[$stu])) continue;
                $now = (float)($c['overall_percentage'] ?? 0);
                $movers[] = ['student_id' => $stu, 'now' => $now, 'then' => $prevByStu[$stu], 'delta' => $now - $prevByStu[$stu]];
            }
            usort($movers, fn($a, $b) => $b['delta'] <=> $a['delta']);
        }
        $improved = array_values(array_filter($movers, fn($m) => $m['delta'] > 0.05));
        $declined = array_values(array_filter($movers, fn($m) => $m['delta'] < -0.05));
        $topImproved = array_slice($improved, 0, 5);
        $topDeclined = array_slice(array_reverse($declined), 0, 5);
        ?>

        <?php if (!empty($movers) && (!empty($topImproved) || !empty($topDeclined))): ?>
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="text-sm font-semibold text-gray-700">Biggest Movers</h2>
                <p class="text-[11px] text-gray-400">Change in overall average since <?= e($prevTermName ?? 'the previous term') ?>. Only students with a card in both terms.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                <div>
                    <div class="px-5 py-2.5 bg-emerald-50/40">
                        <p class="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Most Improved</p>
                    </div>
                    <?php if (empty($topImproved)): ?>
                        <p class="px-5 py-4 text-xs text-gray-400">No students improved since <?= e($prevTermName ?? 'last term') ?>.</p>
                    <?php else: ?>
                        <div class="divide-y divide-gray-50">
                            <?php foreach ($topImproved as $m): ?>
                                <div class="px-5 py-3 flex items-center justify-between">
                                    <span class="text-sm text-gray-800 font-medium"><?= e($studentNames[$m['student_id']] ?? 'Student') ?></span>
                                    <span class="flex items-center gap-2">
                                        <span class="text-[11px] text-gray-400"><?= number_format($m['then'], 1) ?>% &rarr; <?= number_format($m['now'], 1) ?>%</span>
                                        <span class="text-sm font-semibold text-emerald-600">&#9650; +<?= number_format($m['delta'], 1) ?></span>
                                    </span>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
                <div>
                    <div class="px-5 py-2.5 bg-red-50/40">
                        <p class="text-[11px] font-semibold text-red-600 uppercase tracking-wider">Biggest Drops</p>
                    </div>
                    <?php if (empty($topDeclined)): ?>
                        <p class="px-5 py-4 text-xs text-gray-400">No students dropped since <?= e($prevTermName ?? 'last term') ?>.</p>
                    <?php else: ?>
                        <div class="divide-y divide-gray-50">
                            <?php foreach ($topDeclined as $m): ?>
                                <div class="px-5 py-3 flex items-center justify-between">
                                    <span class="text-sm text-gray-800 font-medium"><?= e($studentNames[$m['student_id']] ?? 'Student') ?></span>
                                    <span class="flex items-center gap-2">
                                        <span class="text-[11px] text-gray-400"><?= number_format($m['then'], 1) ?>% &rarr; <?= number_format($m['now'], 1) ?>%</span>
                                        <span class="text-sm font-semibold text-red-500">&#9660; <?= number_format($m['delta'], 1) ?></span>
                                    </span>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <?php endif; ?>
        <?php

        // ── Per-subject term-over-term ────────────────────────────
        // Subjects this class has taken in any term, with average percentage
        // per term. Tells you "Math improved from 62 to 71 this term" at a
        // glance.
        $subjPerTerm = []; // subject_id => [name, terms => term_id => [pct1, pct2, ...]]
        if (count($termRows) >= 2) {
            $cardIdsT = [];
            foreach (($totRes['data'] ?? []) as $r) {} // we need ids; re-query
            $cardRes2 = $sb->from('report_cards')->select('id,term_id')
                ->eq('school_id', $sid)->eq('class_id', $selClass)->execute();
            $cardTermMap = [];
            foreach (($cardRes2['data'] ?? []) as $r) $cardTermMap[$r['id']] = $r['term_id'];
            $cardIds = array_keys($cardTermMap);
            if (!empty($cardIds)) {
                $rcsAllRows = Supabase::fetchByChunkedIn(
                    fn($_sb) => $_sb->from('report_card_subjects')->select('report_card_id,subject_id,subject_name,percentage'),
                    'report_card_id', $cardIds);
                foreach ($rcsAllRows as $r) {
                    $cid = $r['report_card_id'];
                    $tid = $cardTermMap[$cid] ?? null;
                    if (!$tid) continue;
                    $subId = $r['subject_id'];
                    if (!isset($subjPerTerm[$subId])) {
                        $subjPerTerm[$subId] = ['name' => $r['subject_name'] ?? 'Subject', 'terms' => []];
                    }
                    $subjPerTerm[$subId]['terms'][$tid][] = (float)($r['percentage'] ?? 0);
                }
                // Sort subjects by name
                uasort($subjPerTerm, fn($a, $b) => strcasecmp($a['name'], $b['name']));
            }
        }
        ?>

        <?php if (count($termRows) >= 2): ?>
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="text-sm font-semibold text-gray-700">Term-over-Term</h2>
                <p class="text-[11px] text-gray-400">How this class has performed across terms with generated cards.</p>
            </div>
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50 border-b border-gray-100">
                        <th class="text-left px-4 py-2.5 font-semibold text-gray-600">Term</th>
                        <th class="text-right px-3 py-2.5 font-semibold text-gray-600">Class Avg</th>
                        <th class="text-right px-3 py-2.5 font-semibold text-gray-600">Change</th>
                        <th class="text-right px-4 py-2.5 font-semibold text-gray-600">Cards</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    <?php $prevAvg = null; foreach ($termRows as $tr): ?>
                        <?php $delta = $prevAvg === null ? null : $tr['avg'] - $prevAvg; ?>
                        <tr>
                            <td class="px-4 py-2.5 text-gray-800 font-medium"><?= e($tr['name']) ?></td>
                            <td class="px-3 py-2.5 text-right font-semibold <?= $tr['avg'] >= 70 ? 'text-emerald-600' : ($tr['avg'] >= 50 ? 'text-amber-600' : 'text-red-600') ?>"><?= number_format($tr['avg'], 1) ?>%</td>
                            <td class="px-3 py-2.5 text-right text-xs <?= $delta === null ? 'text-gray-400' : ($delta > 0 ? 'text-emerald-600' : ($delta < 0 ? 'text-red-500' : 'text-gray-500')) ?>">
                                <?php if ($delta === null): ?>
                                    baseline
                                <?php else: ?>
                                    <?= $delta > 0 ? '&#9650; +' : ($delta < 0 ? '&#9660; ' : '&#9654; ') ?><?= number_format(abs($delta), 1) ?>%
                                <?php endif; ?>
                            </td>
                            <td class="px-4 py-2.5 text-right text-gray-500"><?= (int)$tr['count'] ?></td>
                        </tr>
                        <?php $prevAvg = $tr['avg']; ?>
                    <?php endforeach; ?>
                </tbody>
            </table>

            <?php if (!empty($subjPerTerm)): ?>
            <div class="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Per subject</p>
            </div>
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50/40 border-b border-gray-100">
                        <th class="text-left px-4 py-2.5 font-semibold text-gray-600">Subject</th>
                        <?php foreach ($termRows as $tr): ?>
                            <th class="text-right px-3 py-2.5 font-semibold text-gray-600"><?= e($tr['name']) ?></th>
                        <?php endforeach; ?>
                        <th class="text-right px-4 py-2.5 font-semibold text-gray-600">Trend</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    <?php foreach ($subjPerTerm as $subId => $sd): ?>
                        <?php
                        $latestPrev = null; $firstAvg = null; $lastAvg = null;
                        ?>
                        <tr>
                            <td class="px-4 py-2.5 text-gray-800"><?= e($sd['name']) ?></td>
                            <?php foreach ($termRows as $tr): ?>
                                <?php
                                $pcts = $sd['terms'][$tr['id']] ?? [];
                                $avg  = !empty($pcts) ? array_sum($pcts) / count($pcts) : null;
                                if ($avg !== null) {
                                    if ($firstAvg === null) $firstAvg = $avg;
                                    $lastAvg = $avg;
                                }
                                ?>
                                <td class="px-3 py-2.5 text-right">
                                    <?php if ($avg !== null): ?>
                                        <span class="font-medium <?= $avg >= 70 ? 'text-emerald-600' : ($avg >= 50 ? 'text-amber-600' : 'text-red-600') ?>"><?= number_format($avg, 1) ?>%</span>
                                    <?php else: ?>
                                        <span class="text-gray-300">—</span>
                                    <?php endif; ?>
                                </td>
                            <?php endforeach; ?>
                            <td class="px-4 py-2.5 text-right text-xs">
                                <?php if ($firstAvg !== null && $lastAvg !== null && $firstAvg !== $lastAvg): ?>
                                    <?php $diff = $lastAvg - $firstAvg; ?>
                                    <span class="<?= $diff > 0 ? 'text-emerald-600' : 'text-red-500' ?>">
                                        <?= $diff > 0 ? '&#9650; +' : '&#9660; ' ?><?= number_format(abs($diff), 1) ?>%
                                    </span>
                                <?php else: ?>
                                    <span class="text-gray-300">—</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php endif; ?>
        </div>
        <?php endif; ?>

        <!-- All students table -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <h2 class="text-sm font-semibold text-gray-700">All Students</h2>
                <div class="flex items-center gap-3 flex-wrap">
                    <?php if ($bestSubject !== null && $worstSubject !== null && $bestSubject !== $worstSubject): ?>
                        <p class="text-xs text-gray-500">Strongest subject: <strong class="text-emerald-700"><?= e($subjectMap[$bestSubject] ?? '') ?></strong> &middot; Weakest: <strong class="text-red-600"><?= e($subjectMap[$worstSubject] ?? '') ?></strong></p>
                    <?php endif; ?>
                    <?php if (!$showRank && isAdmin()): ?>
                        <p class="text-[11px] text-gray-400">Ranking hidden &middot; <a href="<?= baseUrl('settings?tab=grading') ?>" class="text-emerald-600 hover:text-emerald-800 font-medium">enable</a></p>
                    <?php endif; ?>
                </div>
            </div>
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50 border-b border-gray-100">
                        <?php if ($showRank): ?><th class="text-left px-4 py-2.5 font-semibold text-gray-600">Rank</th><?php endif; ?>
                        <th class="text-left px-4 py-2.5 font-semibold text-gray-600">Student</th>
                        <th class="text-right px-3 py-2.5 font-semibold text-gray-600">Term Avg</th>
                        <th class="text-center px-3 py-2.5 font-semibold text-gray-600">Grade</th>
                        <th class="text-right px-3 py-2.5 font-semibold text-gray-600">vs Class</th>
                        <th class="text-right px-4 py-2.5 font-semibold text-gray-600">Card</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    <?php
                    usort($classCards, fn($a, $b) => (float)($b['overall_percentage'] ?? 0) <=> (float)($a['overall_percentage'] ?? 0));
                    foreach ($classCards as $c):
                        $pct  = (float)($c['overall_percentage'] ?? 0);
                        $diff = $pct - $classAvgOverall;
                    ?>
                        <tr class="hover:bg-gray-50/50">
                            <?php if ($showRank): ?>
                                <td class="px-4 py-2.5 text-gray-700 font-semibold"><?= $c['class_rank'] !== null ? (int)$c['class_rank'] : '—' ?><?php if (!empty($c['class_size'])): ?><span class="text-gray-400 font-normal"> / <?= (int)$c['class_size'] ?></span><?php endif; ?></td>
                            <?php endif; ?>
                            <td class="px-4 py-2.5 text-gray-800 font-medium"><?= e($studentNames[$c['student_id']] ?? 'Student') ?></td>
                            <td class="px-3 py-2.5 text-right font-semibold <?= $pct >= 70 ? 'text-emerald-600' : ($pct >= 50 ? 'text-amber-600' : 'text-red-600') ?>"><?= number_format($pct, 1) ?>%</td>
                            <td class="px-3 py-2.5 text-center text-gray-700"><?= e($c['overall_grade'] ?? '—') ?></td>
                            <td class="px-3 py-2.5 text-right text-xs <?= $diff >= 0 ? 'text-emerald-600' : 'text-red-500' ?>">
                                <?= $diff >= 0 ? '+' : '' ?><?= number_format($diff, 1) ?>%
                            </td>
                            <td class="px-4 py-2.5 text-right">
                                <a href="<?= baseUrl('grades/report-card?id=' . urlencode($c['id'])) ?>" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Open</a>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

    <?php endif; ?>

<?php else: /* student view */ ?>

    <?php if (!$selTerm || !$selStudent): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-sm text-gray-500">Pick a term and a student to see their breakdown.</div>
    <?php elseif (!$studentCard): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-sm text-gray-500">No report card has been generated for this student in the selected term.</p>
            <p class="text-xs text-gray-400 mt-1">Generate it in <strong>Grades &rarr; Reports</strong>.</p>
        </div>
    <?php else: ?>

        <?php $studentName = $allActiveStudents ? null : null; ?>
        <?php
        // Pull the name from allActiveStudents.
        foreach ($allActiveStudents as $s) {
            if ($s['id'] === $selStudent) {
                $studentName = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''));
                break;
            }
        }
        ?>

        <!-- Header -->
        <div class="grid grid-cols-2 <?= $showRank ? 'lg:grid-cols-5' : 'lg:grid-cols-4' ?> gap-3 mb-6">
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Student</p>
                <p class="text-sm font-bold text-gray-900 mt-1 truncate"><?= e($studentName ?? 'Student') ?></p>
                <p class="text-[11px] text-gray-500"><?= e($classMap[$studentCard['class_id']] ?? '') ?></p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Term Average</p>
                <p class="text-2xl font-bold text-emerald-600 tracking-tight mt-1"><?= number_format((float)($studentCard['overall_percentage'] ?? 0), 1) ?>%</p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Overall Grade</p>
                <p class="text-2xl font-bold text-gray-900 tracking-tight mt-1"><?= e($studentCard['overall_grade'] ?? '—') ?></p>
            </div>
            <?php if ($showRank): ?>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Class Position</p>
                <p class="text-2xl font-bold text-gray-900 tracking-tight mt-1"><?= $studentCard['class_rank'] !== null ? (int)$studentCard['class_rank'] : '—' ?><?php if (!empty($studentCard['class_size'])): ?><span class="text-sm text-gray-400 font-normal"> / <?= (int)$studentCard['class_size'] ?></span><?php endif; ?></p>
            </div>
            <?php endif; ?>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] text-gray-400 uppercase tracking-wider">Card Status</p>
                <p class="text-sm font-bold mt-1 <?= ($studentCard['status'] ?? '') === 'published' ? 'text-emerald-600' : 'text-amber-600' ?>"><?= e(ucfirst($studentCard['status'] ?? 'draft')) ?></p>
            </div>
        </div>

        <!-- Per-subject per-exam grid with class delta -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="text-sm font-semibold text-gray-700">Per-Subject Breakdown</h2>
                <p class="text-[11px] text-gray-400">Each cell shows the student's percentage and how it compares to the class average for that subject + exam.</p>
            </div>
            <?php
            // Build student grid: subject_id => exam_id => pct
            $stuGrid = [];
            foreach ($studentRcs as $r) {
                $stuGrid[$r['subject_id']][$r['exam_id']] = (float)($r['percentage'] ?? 0);
            }
            ?>
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50 border-b border-gray-100">
                        <th class="text-left px-4 py-2.5 font-semibold text-gray-600">Subject</th>
                        <?php foreach ($studentExams as $eid => $ename): ?>
                            <th class="text-center px-3 py-2.5 font-semibold text-gray-600"><?= e($ename) ?></th>
                        <?php endforeach; ?>
                        <th class="text-right px-3 py-2.5 font-semibold text-gray-600">Subject Avg</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    <?php foreach ($studentSubs as $sid_ => $sname): ?>
                        <?php
                        $rowPcts = [];
                        foreach ($studentExams as $eid => $_n) {
                            if (isset($stuGrid[$sid_][$eid])) $rowPcts[] = $stuGrid[$sid_][$eid];
                        }
                        $rowAvg = !empty($rowPcts) ? array_sum($rowPcts) / count($rowPcts) : null;
                        ?>
                        <tr>
                            <td class="px-4 py-2.5 text-gray-800 font-medium"><?= e($sname) ?></td>
                            <?php foreach ($studentExams as $eid => $_n): ?>
                                <?php
                                $stuPct = $stuGrid[$sid_][$eid] ?? null;
                                $clsAvg = $classAvgs[$sid_][$eid] ?? null;
                                $delta  = ($stuPct !== null && $clsAvg !== null) ? $stuPct - $clsAvg : null;
                                ?>
                                <td class="px-3 py-2.5 text-center">
                                    <?php if ($stuPct !== null): ?>
                                        <span class="font-semibold text-gray-900"><?= number_format($stuPct, 1) ?>%</span>
                                        <?php if ($delta !== null): ?>
                                            <span class="block text-[10px] <?= $delta >= 0 ? 'text-emerald-600' : 'text-red-500' ?>"><?= $delta >= 0 ? '+' : '' ?><?= number_format($delta, 1) ?> vs class</span>
                                        <?php endif; ?>
                                    <?php else: ?>
                                        <span class="text-gray-300">—</span>
                                    <?php endif; ?>
                                </td>
                            <?php endforeach; ?>
                            <td class="px-3 py-2.5 text-right">
                                <?php if ($rowAvg !== null): ?>
                                    <span class="font-semibold <?= $rowAvg >= 70 ? 'text-emerald-600' : ($rowAvg >= 50 ? 'text-amber-600' : 'text-red-600') ?>"><?= number_format($rowAvg, 1) ?>%</span>
                                <?php else: ?>
                                    <span class="text-gray-300">—</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <?php
        // ── Term-over-term for this student ───────────────────────
        // Every report card this student has ever had, grouped by term, ordered
        // by term start_date. Trend arrows between consecutive terms.
        $stuTermsRes = $sb->from('report_cards')->select('id,term_id,overall_percentage,overall_grade')
            ->eq('school_id', $sid)->eq('student_id', $selStudent)->execute();
        $byTerm = [];
        foreach (($stuTermsRes['data'] ?? []) as $r) {
            $byTerm[$r['term_id']] = $r;
        }
        $stuTermRows = [];
        foreach ($terms as $t) {
            if (isset($byTerm[$t['id']])) {
                $stuTermRows[] = [
                    'id'    => $t['id'],
                    'name'  => $t['name'],
                    'pct'   => (float)($byTerm[$t['id']]['overall_percentage'] ?? 0),
                    'grade' => $byTerm[$t['id']]['overall_grade'] ?? '—',
                    'card_id' => $byTerm[$t['id']]['id'] ?? null,
                ];
            }
        }

        // Per-subject term-over-term — fetch every report_card_subjects across
        // this student's cards.
        $stuSubjPerTerm = []; // subject_id => ['name', 'terms' => term_id => avg pct]
        if (count($stuTermRows) >= 2) {
            $cardIds = array_filter(array_column($stuTermRows, 'card_id'));
            if (!empty($cardIds)) {
                $cardTermMap = [];
                foreach ($stuTermRows as $row) {
                    if (!empty($row['card_id'])) $cardTermMap[$row['card_id']] = $row['id'];
                }
                $rcsRows2 = Supabase::fetchByChunkedIn(
                    fn($_sb) => $_sb->from('report_card_subjects')->select('report_card_id,subject_id,subject_name,percentage'),
                    'report_card_id', $cardIds);
                $bucket = [];
                foreach ($rcsRows2 as $r) {
                    $tid = $cardTermMap[$r['report_card_id']] ?? null;
                    if (!$tid) continue;
                    $subId = $r['subject_id'];
                    if (!isset($stuSubjPerTerm[$subId])) {
                        $stuSubjPerTerm[$subId] = ['name' => $r['subject_name'] ?? 'Subject', 'terms' => []];
                    }
                    $stuSubjPerTerm[$subId]['terms'][$tid][] = (float)($r['percentage'] ?? 0);
                }
                // Reduce each term's list to a single average
                foreach ($stuSubjPerTerm as $subId => &$sd) {
                    foreach ($sd['terms'] as $tid => $pcts) {
                        $sd['terms'][$tid] = array_sum($pcts) / count($pcts);
                    }
                }
                unset($sd);
                uasort($stuSubjPerTerm, fn($a, $b) => strcasecmp($a['name'], $b['name']));
            }
        }
        ?>

        <?php if (count($stuTermRows) >= 2): ?>
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mt-6">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="text-sm font-semibold text-gray-700">Term-over-Term</h2>
                <p class="text-[11px] text-gray-400">This student's progress across every term we have a card for.</p>
            </div>
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50 border-b border-gray-100">
                        <th class="text-left px-4 py-2.5 font-semibold text-gray-600">Term</th>
                        <th class="text-right px-3 py-2.5 font-semibold text-gray-600">Average</th>
                        <th class="text-center px-3 py-2.5 font-semibold text-gray-600">Grade</th>
                        <th class="text-right px-3 py-2.5 font-semibold text-gray-600">Change</th>
                        <th class="text-right px-4 py-2.5 font-semibold text-gray-600">Card</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    <?php $prevPct = null; foreach ($stuTermRows as $tr): ?>
                        <?php $delta = $prevPct === null ? null : $tr['pct'] - $prevPct; ?>
                        <tr>
                            <td class="px-4 py-2.5 text-gray-800 font-medium"><?= e($tr['name']) ?></td>
                            <td class="px-3 py-2.5 text-right font-semibold <?= $tr['pct'] >= 70 ? 'text-emerald-600' : ($tr['pct'] >= 50 ? 'text-amber-600' : 'text-red-600') ?>"><?= number_format($tr['pct'], 1) ?>%</td>
                            <td class="px-3 py-2.5 text-center text-gray-700"><?= e($tr['grade']) ?></td>
                            <td class="px-3 py-2.5 text-right text-xs <?= $delta === null ? 'text-gray-400' : ($delta > 0 ? 'text-emerald-600' : ($delta < 0 ? 'text-red-500' : 'text-gray-500')) ?>">
                                <?php if ($delta === null): ?>
                                    baseline
                                <?php else: ?>
                                    <?= $delta > 0 ? '&#9650; +' : ($delta < 0 ? '&#9660; ' : '&#9654; ') ?><?= number_format(abs($delta), 1) ?>%
                                <?php endif; ?>
                            </td>
                            <td class="px-4 py-2.5 text-right">
                                <?php if (!empty($tr['card_id'])): ?>
                                    <a href="<?= baseUrl('grades/report-card?id=' . urlencode($tr['card_id'])) ?>" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Open</a>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php $prevPct = $tr['pct']; ?>
                    <?php endforeach; ?>
                </tbody>
            </table>

            <?php if (!empty($stuSubjPerTerm)): ?>
            <div class="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Per subject</p>
            </div>
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50/40 border-b border-gray-100">
                        <th class="text-left px-4 py-2.5 font-semibold text-gray-600">Subject</th>
                        <?php foreach ($stuTermRows as $tr): ?>
                            <th class="text-right px-3 py-2.5 font-semibold text-gray-600"><?= e($tr['name']) ?></th>
                        <?php endforeach; ?>
                        <th class="text-right px-4 py-2.5 font-semibold text-gray-600">Trend</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    <?php foreach ($stuSubjPerTerm as $subId => $sd): ?>
                        <?php $firstAvg = null; $lastAvg = null; ?>
                        <tr>
                            <td class="px-4 py-2.5 text-gray-800"><?= e($sd['name']) ?></td>
                            <?php foreach ($stuTermRows as $tr): ?>
                                <?php
                                $avg = $sd['terms'][$tr['id']] ?? null;
                                if ($avg !== null) {
                                    if ($firstAvg === null) $firstAvg = $avg;
                                    $lastAvg = $avg;
                                }
                                ?>
                                <td class="px-3 py-2.5 text-right">
                                    <?php if ($avg !== null): ?>
                                        <span class="font-medium <?= $avg >= 70 ? 'text-emerald-600' : ($avg >= 50 ? 'text-amber-600' : 'text-red-600') ?>"><?= number_format($avg, 1) ?>%</span>
                                    <?php else: ?>
                                        <span class="text-gray-300">—</span>
                                    <?php endif; ?>
                                </td>
                            <?php endforeach; ?>
                            <td class="px-4 py-2.5 text-right text-xs">
                                <?php if ($firstAvg !== null && $lastAvg !== null && $firstAvg !== $lastAvg): ?>
                                    <?php $diff = $lastAvg - $firstAvg; ?>
                                    <span class="<?= $diff > 0 ? 'text-emerald-600' : 'text-red-500' ?>">
                                        <?= $diff > 0 ? '&#9650; +' : '&#9660; ' ?><?= number_format(abs($diff), 1) ?>%
                                    </span>
                                <?php else: ?>
                                    <span class="text-gray-300">—</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php endif; ?>
        </div>
        <?php elseif (count($stuTermRows) === 1): ?>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mt-6 text-xs text-gray-500 text-center">
                Term-over-term comparison appears once this student has a second term's report card generated.
            </div>
        <?php endif; ?>

        <div class="mt-4">
            <a href="<?= baseUrl('grades/report-card?id=' . urlencode($studentCard['id'])) ?>" target="_blank" rel="noopener" class="text-sm text-emerald-600 hover:text-emerald-800 font-medium">Open this student's report card &rarr;</a>
        </div>

    <?php endif; ?>

<?php endif; ?>

<script>
(function(){
  var s=document.getElementById('anStuSearch'),l=document.getElementById('anStuList'),
      h=document.getElementById('anStuId'),n=document.getElementById('anStuNone');
  if(!s) return;
  var opts=[].slice.call(l.querySelectorAll('.stuopt'));
  function open(){ l.classList.remove('hidden'); flt(); }
  function close(){ l.classList.add('hidden'); }
  function flt(){ var q=s.value.trim().toLowerCase(),c=0; opts.forEach(function(o){ var ok=!q||o.getAttribute('data-search').indexOf(q)>-1; o.classList.toggle('hidden',!ok); if(ok)c++; }); n.classList.toggle('hidden',c>0); }
  s.addEventListener('focus',function(){ s.select(); open(); });
  s.addEventListener('input',open);
  opts.forEach(function(o){ o.addEventListener('click',function(){ h.value=o.getAttribute('data-id'); s.value=o.getAttribute('data-label'); close(); if(h.form) h.form.submit(); }); });
  document.addEventListener('click',function(e){ if(!e.target.closest('.stupick')) close(); });
})();
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
