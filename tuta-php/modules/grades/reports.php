<?php
/**
 * Report Cards — generate one report card per student per TERM, covering
 * every exam sat that term (Opener, Midterm, End Term…).
 */
$pageTitle = 'Report Cards';
$sb  = new Supabase();
$sid = schoolId();

$terms   = cachedTerms();
$classes = cachedClasses();

$selTerm    = input('term_id');
$selClass   = input('class_id');
$selSection = input('section_id');

// Streams for the chosen class — a school with none simply never sees this.
$classSections = [];
if ($selClass) {
    $classSections = $sb->from('sections')->select('id,name')
        ->eq('class_id', $selClass)->order('name')->execute()['data'] ?? [];
}

$termName = '';
foreach ($terms as $t) {
    if ($t['id'] === $selTerm) { $termName = $t['name']; break; }
}

/* ─────────────────────────────────────────────────────────────
 * POST: generate term report cards / publish them
 * ──────────────────────────────────────────────────────────── */
if (isPost() && verifyCsrf()) {
    $action    = input('action');
    $termId    = input('term_id');
    $classId   = input('class_id');
    $sectionId = input('section_id');

    if (!$termId || !$classId) {
        flash('error', 'Select a term and a class first.');
        redirect('grades/reports');
    }

    if ($action === 'generate') {
        // Exams that belong to this term
        $exRes = $sb->from('exams')
            ->select('id,name,max_marks,start_date,academic_year_id')
            ->eq('school_id', $sid)->eq('term_id', $termId)
            ->order('start_date')->execute();
        $termExams = $exRes['data'] ?? [];
        if (empty($termExams)) {
            flash('error', 'No exams belong to this term. Create them under Exams and set their term first.');
            redirect("grades/reports?term_id=$termId&class_id=$classId" . ($sectionId ? "&section_id=$sectionId" : ""));
        }
        $examIds = array_column($termExams, 'id');
        $examMax = [];
        foreach ($termExams as $ex) {
            $m = (float)($ex['max_marks'] ?? 100);
            $examMax[$ex['id']] = $m > 0 ? $m : 100;
        }
        $academicYearId = $termExams[0]['academic_year_id'] ?? null;

        // What each subject is actually marked out of, per exam (migration 132).
        // exams.max_marks is one figure for the whole paper, which cannot
        // describe a sheet where Maths is /30 and English /50. Where an exam
        // has no exam_subjects rows we fall back to the old behaviour.
        $subjMax    = [];   // exam_id|subject_id => max
        $subjCounts = [];   // exam_id|subject_id => counts toward the average
        $esRes = $sb->from('exam_subjects')->select('exam_id,subject_id,max_marks,counts_total')
            ->eq('school_id', $sid)->in('exam_id', $examIds)->execute();
        foreach (($esRes['data'] ?? []) as $es) {
            $k = $es['exam_id'] . '|' . $es['subject_id'];
            $subjMax[$k]    = (float)($es['max_marks'] ?? 0) ?: null;
            $subjCounts[$k] = !isset($es['counts_total']) || $es['counts_total'];
        }
        $maxFor = function (string $eid, string $subId) use ($subjMax, $examMax) {
            return $subjMax[$eid . '|' . $subId] ?? $examMax[$eid];
        };
        $countsFor = fn(string $eid, string $subId) => $subjCounts[$eid . '|' . $subId] ?? true;

        // Active students in the class, optionally narrowed to one stream.
        $stuQ = $sb->from('students')->select('id,first_name,last_name,section_id')
            ->eq('school_id', $sid)->eq('current_class_id', $classId)->eq('status', 'active');
        if ($sectionId !== '') $stuQ = $stuQ->eq('section_id', $sectionId);
        $stuRes = $stuQ->order('first_name')->execute();
        $genStudents = $stuRes['data'] ?? [];
        if (empty($genStudents)) {
            flash('error', 'No active students in this class.');
            redirect("grades/reports?term_id=$termId&class_id=$classId" . ($sectionId ? "&section_id=$sectionId" : ""));
        }
        $studentIds = array_column($genStudents, 'id');

        // Every grade for this term's exams + these students
        $grRes = $sb->from('grades')->select('exam_id,subject_id,student_id,marks')
            ->in('exam_id', $examIds)->in('student_id', $studentIds)->execute();
        $grades = $grRes['data'] ?? [];

        // Restrict to the subjects this class actually takes (migration 071).
        // Marks recorded earlier for a subject no longer linked to the class
        // are excluded from the regenerated card.
        $classSubs     = cachedClassSubjects($classId);
        $classSubIdSet = [];
        foreach ($classSubs as $cs) $classSubIdSet[$cs['id']] = true;
        if (!empty($classSubIdSet)) {
            $grades = array_values(array_filter(
                $grades,
                fn ($g) => isset($classSubIdSet[$g['subject_id']])
            ));
        }

        if (empty($grades)) {
            flash('error', 'No grades have been entered for this term\'s exams yet (or none are in subjects assigned to this class).');
            redirect("grades/reports?term_id=$termId&class_id=$classId" . ($sectionId ? "&section_id=$sectionId" : ""));
        }

        // Index grades and collect subject sets
        $byStudent    = []; // student_id => exam_id => subject_id => marks
        $examSubjects = []; // exam_id => [subject_id => true]
        $subjIdSet    = [];
        foreach ($grades as $g) {
            $byStudent[$g['student_id']][$g['exam_id']][$g['subject_id']] = (float)$g['marks'];
            $examSubjects[$g['exam_id']][$g['subject_id']] = true;
            $subjIdSet[$g['subject_id']] = true;
        }

        // Subject names
        $subjNames = [];
        if (!empty($subjIdSet)) {
            $snRes = $sb->from('subjects')->select('id,name')->in('id', array_keys($subjIdSet))->execute();
            foreach (($snRes['data'] ?? []) as $s) $subjNames[$s['id']] = $s['name'];
        }

        // Per-student term aggregate = average of the percentage scored in each
        // exam the student actually sat. Within an exam it is the mean of the
        // subject percentages that count — which is exactly how the school's own
        // sheet computes AVG, so our figure matches the teachers'. Subjects
        // flagged as reported-only (Sabaki's Computer and French) are left out.
        // A subject in the exam that the child has no mark for counts as zero.
        $termPct = [];
        foreach ($genStudents as $s) {
            $examPcts = [];
            foreach ($termExams as $ex) {
                $eid  = $ex['id'];
                $subs = array_keys($examSubjects[$eid] ?? []);
                $sat  = $byStudent[$s['id']][$eid] ?? [];
                if (empty($subs) || empty($sat)) continue; // exam had no grades, or student didn't sit it
                $pcts = [];
                foreach ($subs as $subId) {
                    if (!$countsFor($eid, $subId)) continue;
                    $max = $maxFor($eid, $subId);
                    if ($max <= 0) continue;
                    $pcts[] = (($sat[$subId] ?? 0) / $max) * 100;
                }
                if ($pcts) $examPcts[] = array_sum($pcts) / count($pcts);
            }
            $termPct[$s['id']] = !empty($examPcts) ? array_sum($examPcts) / count($examPcts) : 0;
        }

        // Dense rank by term aggregate, over any set of students.
        $rankWithin = function (array $pcts): array {
            arsort($pcts);
            $out = []; $pos = 0; $displayRank = 0; $lastPct = null;
            foreach ($pcts as $stuId => $p) {
                $pos++;
                if ($p !== $lastPct) $displayRank = $pos;
                $out[$stuId] = $displayRank;
                $lastPct = $p;
            }
            return $out;
        };

        $ranks     = $rankWithin($termPct);
        $classSize = count($genStudents);

        // Position within the child's own stream, which is the one a parent
        // reads first. Computed per section over the students being generated.
        $sectionOf = [];
        foreach ($genStudents as $s) $sectionOf[$s['id']] = $s['section_id'] ?? null;
        $bySection = [];
        foreach ($termPct as $stuId => $p) {
            $sec = $sectionOf[$stuId] ?? null;
            if ($sec) $bySection[$sec][$stuId] = $p;
        }
        $secRanks = []; $secSizes = [];
        foreach ($bySection as $sec => $pcts) {
            foreach ($rankWithin($pcts) as $stuId => $r) $secRanks[$stuId] = $r;
            $secSizes[$sec] = count($pcts);
        }

        // Upsert one report_cards row per student (per term).
        // `status` is omitted so a re-generate keeps a published card published.
        $cardRows = [];
        foreach ($genStudents as $s) {
            $p = $termPct[$s['id']];
            $cardRows[] = [
                'school_id'          => $sid,
                'student_id'         => $s['id'],
                'class_id'           => $classId,
                'academic_year_id'   => $academicYearId,
                'term_id'            => $termId,
                'overall_percentage' => round($p, 2),
                'overall_grade'      => gradeFromPercentage($p),
                'class_rank'         => $ranks[$s['id']] ?? null,
                'class_size'         => $classSize,
                'section_id'         => $s['section_id'] ?? null,
                'section_rank'       => $secRanks[$s['id']] ?? null,
                'section_size'       => !empty($s['section_id']) ? ($secSizes[$s['section_id']] ?? null) : null,
                'generated_at'       => date('c'),
                'updated_at'         => date('c'),
            ];
        }
        $upRes = $sb->from('report_cards')->upsert($cardRows, 'student_id,term_id');
        if (!empty($upRes['error'])) {
            flash('error', 'Could not save report cards: ' . $upRes['error']);
            redirect("grades/reports?term_id=$termId&class_id=$classId" . ($sectionId ? "&section_id=$sectionId" : ""));
        }
        $cardIdByStudent = [];
        foreach (($upRes['data'] ?? []) as $rc) {
            if (!empty($rc['student_id']) && !empty($rc['id'])) {
                $cardIdByStudent[$rc['student_id']] = $rc['id'];
            }
        }
        $cardIds = array_values($cardIdByStudent);

        // Replace the subject lines — one row per (card, exam, subject) the
        // student has a mark for. One bulk delete + chunked bulk inserts.
        if (!empty($cardIds)) {
            $sb->from('report_card_subjects')->in('report_card_id', $cardIds)->delete();
            $subjRows = [];
            foreach ($genStudents as $s) {
                $cardId = $cardIdByStudent[$s['id']] ?? null;
                if (!$cardId) continue;
                foreach ($termExams as $ex) {
                    $eid = $ex['id'];
                    foreach (($byStudent[$s['id']][$eid] ?? []) as $subId => $marks) {
                        $emax = $maxFor($eid, $subId);      // this subject's own out-of
                        $pct  = $emax > 0 ? ($marks / $emax) * 100 : 0;
                        $subjRows[] = [
                            'report_card_id' => $cardId,
                            'exam_id'        => $eid,
                            'subject_id'     => $subId,
                            'subject_name'   => $subjNames[$subId] ?? 'Subject',
                            'marks_obtained' => $marks,
                            'max_marks'      => $emax,
                            'percentage'     => round($pct, 2),
                            'grade'          => gradeFromPercentage($pct),
                        ];
                    }
                }
            }
            foreach (array_chunk($subjRows, 500) as $chunk) {
                $insRes = $sb->from('report_card_subjects')->insert($chunk);
                if (!empty($insRes['error'])) {
                    flash('error', 'Report cards saved, but subject details failed: ' . $insRes['error']);
                    redirect("grades/reports?term_id=$termId&class_id=$classId" . ($sectionId ? "&section_id=$sectionId" : ""));
                }
            }
        }

        auditLog('generate', 'report_cards', $termId, [
            'term_id' => $termId, 'class_id' => $classId, 'count' => count($cardRows),
        ]);
        flash('success', count($cardRows) . ' term report card(s) generated as drafts. Review, then publish.');
        redirect("grades/reports?term_id=$termId&class_id=$classId" . ($sectionId ? "&section_id=$sectionId" : ""));
    }

    if ($action === 'publish_all') {
        // Publishing is a leadership action — gate it.
        if (!hasRole(['head_teacher'])) {
            flash('error', 'Only an administrator or head teacher can publish report cards.');
            redirect("grades/reports?term_id=$termId&class_id=$classId" . ($sectionId ? "&section_id=$sectionId" : ""));
        }
        $upd = $sb->from('report_cards')
            ->eq('school_id', $sid)->eq('term_id', $termId)
            ->eq('class_id', $classId)->eq('status', 'draft')
            ->update([
                'status'       => 'published',
                'published_at' => date('c'),
                'updated_at'   => date('c'),
            ]);
        if (!empty($upd['error'])) {
            flash('error', 'Publish failed: ' . $upd['error']);
        } else {
            auditLog('publish', 'report_cards', $termId, ['term_id' => $termId, 'class_id' => $classId]);
            // Notify parents of the cards that just moved draft -> published.
            // $upd['data'] holds exactly those rows (the update filtered on
            // status='draft'), so re-publishing won't re-notify. Best-effort.
            $notified = notifyResultsPublished($upd['data'] ?? []);
            flash('success', 'Report cards published.'
                . ($notified > 0 ? ' ' . $notified . ' parent email(s) sent.' : ''));
        }
        redirect("grades/reports?term_id=$termId&class_id=$classId" . ($sectionId ? "&section_id=$sectionId" : ""));
    }

    redirect("grades/reports?term_id=$termId&class_id=$classId" . ($sectionId ? "&section_id=$sectionId" : ""));
}

/* ─────────────────────────────────────────────────────────────
 * GET: load students + existing cards
 * ──────────────────────────────────────────────────────────── */
$students    = [];
$cardMap     = []; // student_id => report_cards row
$termExams   = [];

if ($selTerm && $selClass) {
    $exRes = $sb->from('exams')->select('id,name')
        ->eq('school_id', $sid)->eq('term_id', $selTerm)->order('start_date')->execute();
    $termExams = $exRes['data'] ?? [];

    $stuQ2 = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,section_id')
        ->eq('school_id', $sid)->eq('current_class_id', $selClass)->eq('status', 'active');
    if ($selSection) $stuQ2 = $stuQ2->eq('section_id', $selSection);
    $studentsResult = $stuQ2->order('first_name')->execute();
    $students = $studentsResult['data'] ?? [];

    $rcResult = $sb->from('report_cards')
        ->select('id,student_id,status,overall_percentage,overall_grade,class_rank,class_size,section_id,section_rank,section_size')
        ->eq('school_id', $sid)->eq('term_id', $selTerm)->eq('class_id', $selClass)
        ->execute();
    foreach (($rcResult['data'] ?? []) as $rc) {
        $cardMap[$rc['student_id']] = $rc;
    }
}

$cardCount  = count($cardMap);
$draftCount = 0;
foreach ($cardMap as $rc) {
    if (($rc['status'] ?? 'draft') === 'draft') $draftCount++;
}
$canPublish  = hasRole(['head_teacher']); // admin auto-passes
$showRank    = schoolSetting('show_class_rank', 'false') === 'true';

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Report Cards</h1>
    <p class="text-sm text-gray-500 mt-1">Generate a term report card for each student — covering every exam that term</p>
</div>

<!-- Selection -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('grades/reports') ?>" class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Term</label>
            <select name="term_id" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">Select term</option>
                <?php foreach ($terms as $t): ?>
                    <option value="<?= e($t['id']) ?>"<?= selectedIf($selTerm, $t['id']) ?>><?= e($t['name']) ?><?= ($t['is_current'] ?? false) ? ' (current)' : '' ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Class</label>
            <select name="class_id" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">Select class</option>
                <?php foreach ($classes as $c): ?>
                    <option value="<?= e($c['id']) ?>"<?= selectedIf($selClass, $c['id']) ?>><?= e($c['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Stream</label>
            <select name="section_id" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"
                    <?= empty($classSections) ? 'disabled' : '' ?>>
                <option value="">Whole class</option>
                <?php foreach ($classSections as $cs): ?>
                    <option value="<?= e($cs['id']) ?>"<?= selectedIf($selSection, $cs['id']) ?>><?= e($cs['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <button type="submit" class="w-full py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">View Class</button>
        </div>
    </form>
    <?php if ($selClass && empty($classSections)): ?>
        <p class="text-xs text-gray-400 mt-2">This class has no streams. Add them under Sections, or let the marks import create them.</p>
    <?php endif; ?>
</div>

<?php if ($selTerm && $selClass && !empty($students)): ?>

<!-- Action bar -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm text-gray-600">
            <?php if (empty($termExams)): ?>
                <span class="text-amber-600">No exams in this term yet — add them under Exams first.</span>
            <?php else: ?>
                <span class="font-medium text-gray-900"><?= count($termExams) ?></span> exam<?= count($termExams) !== 1 ? 's' : '' ?> this term:
                <?= e(implode(', ', array_map(fn($x) => $x['name'], $termExams))) ?>
                <?php if ($cardCount > 0): ?>
                    · <span class="font-medium text-gray-900"><?= $cardCount ?></span> report card<?= $cardCount !== 1 ? 's' : '' ?>
                    <?php if ($draftCount > 0): ?>
                        · <span class="text-amber-600 font-medium"><?= $draftCount ?> draft</span>
                    <?php else: ?>
                        · <span class="text-emerald-600 font-medium">all published</span>
                    <?php endif; ?>
                <?php endif; ?>
            <?php endif; ?>
        </div>
        <div class="flex gap-2">
            <?php if (!empty($termExams)): ?>
            <form method="POST" onsubmit="return confirm('Generate term report cards for this class? This rebuilds any existing cards for the term.')">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="generate">
                <input type="hidden" name="term_id" value="<?= e($selTerm) ?>">
                <input type="hidden" name="class_id" value="<?= e($selClass) ?>">
                <input type="hidden" name="section_id" value="<?= e($selSection) ?>">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                    <?= $cardCount === 0 ? 'Generate Report Cards' : 'Regenerate' ?>
                </button>
            </form>
            <?php endif; ?>
            <?php if ($draftCount > 0 && $canPublish): ?>
            <form method="POST" onsubmit="return confirm('Publish all draft report cards for this class?')">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="publish_all">
                <input type="hidden" name="term_id" value="<?= e($selTerm) ?>">
                <input type="hidden" name="class_id" value="<?= e($selClass) ?>">
                <input type="hidden" name="section_id" value="<?= e($selSection) ?>">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                    Publish All
                </button>
            </form>
            <?php elseif ($draftCount > 0 && !$canPublish): ?>
                <span class="px-3 py-2 text-xs text-gray-400 italic">Only an administrator or head teacher can publish</span>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- Students -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Adm No.</th>
                <?php if (!empty($classSections)): ?><th class="text-left px-4 py-3 font-semibold text-gray-600">Stream</th><?php endif; ?>
                <th class="text-center px-4 py-3 font-semibold text-gray-900">Term Avg</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-900">Grade</th>
                <?php if ($showRank): ?><th class="text-center px-4 py-3 font-semibold text-gray-900">Position</th><?php endif; ?>
                <th class="text-center px-4 py-3 font-semibold text-gray-900">Report Card</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php $i = 0; foreach ($students as $s): $i++; $card = $cardMap[$s['id']] ?? null; ?>
                <tr class="hover:bg-gray-50/50">
                    <td class="px-4 py-2 text-gray-400"><?= $i ?></td>
                    <td class="px-4 py-2 font-medium text-gray-900 whitespace-nowrap"><?= e($s['first_name'] . ' ' . $s['last_name']) ?></td>
                    <td class="px-4 py-2 text-gray-500"><?= e($s['admission_number'] ?? '') ?></td>
                    <?php if (!empty($classSections)):
                        $secName = '';
                        foreach ($classSections as $cs) if (($s['section_id'] ?? '') === $cs['id']) $secName = $cs['name']; ?>
                        <td class="px-4 py-2 text-gray-600"><?= $secName !== '' ? e($secName) : '<span class="text-gray-300">—</span>' ?></td>
                    <?php endif; ?>
                    <td class="px-4 py-2 text-center font-medium <?php if ($card): $p = (float)$card['overall_percentage']; echo $p >= 70 ? 'text-emerald-600' : ($p >= 50 ? 'text-amber-600' : 'text-red-600'); endif; ?>">
                        <?= $card ? number_format((float)$card['overall_percentage'], 1) . '%' : '<span class="text-gray-300">—</span>' ?>
                    </td>
                    <td class="px-4 py-2 text-center font-semibold text-gray-700"><?= $card ? e($card['overall_grade'] ?? '—') : '<span class="text-gray-300">—</span>' ?></td>
                    <?php if ($showRank): ?>
                        <td class="px-4 py-2 text-center font-bold text-gray-900">
                            <?php if ($card && $card['class_rank'] !== null): ?>
                                <?= (int)$card['class_rank'] ?><span class="text-xs font-normal text-gray-400">/<?= (int)($card['class_size'] ?? 0) ?></span>
                                <?php if (!empty($card['section_rank'])): ?>
                                    <span class="block text-[11px] font-normal text-gray-500"><?= (int)$card['section_rank'] ?> in stream</span>
                                <?php endif; ?>
                            <?php else: ?><span class="text-gray-300">—</span><?php endif; ?>
                        </td>
                    <?php endif; ?>
                    <td class="px-4 py-2 text-center whitespace-nowrap">
                        <?php if ($card): ?>
                            <?php $cStatus = $card['status'] ?? 'draft'; ?>
                            <a href="<?= baseUrl('grades/report-card?id=' . $card['id']) ?>" target="_blank"
                               class="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-800 font-medium">
                                <span class="inline-block w-1.5 h-1.5 rounded-full <?= $cStatus === 'published' ? 'bg-emerald-500' : 'bg-amber-400' ?>"></span>
                                Open
                            </a>
                        <?php else: ?>
                            <span class="text-gray-300">—</span>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>
<?php elseif ($selTerm && $selClass): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        No active students in this class.
    </div>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
