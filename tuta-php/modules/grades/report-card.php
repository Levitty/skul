<?php
/**
 * Printable Term Report Card — one student, one term, every exam side by side.
 * Receives ?id=UUID (report_cards row id).
 *
 * Also handles inline edits: teacher / principal remarks, and the
 * draft <-> published status toggle. Those controls are hidden when printing.
 */
$pageTitle = 'Report Card';

$sb  = new Supabase();
$sid = schoolId();

$cardId = trim($_GET['id'] ?? '');
if (!$cardId) {
    die('Report card ID is required.');
}

// ── Load the report card (tenant-scoped) ───────────────────
$rcRes = $sb->from('report_cards')
    ->select('id,school_id,student_id,class_id,academic_year_id,term_id,'
           . 'overall_percentage,overall_grade,class_rank,class_size,'
           . 'attendance_present,attendance_total,attendance_percentage,'
           . 'teacher_remarks,principal_remarks,status,generated_at,published_at')
    ->eq('id', $cardId)->eq('school_id', $sid)->single()->execute();
$card = $rcRes['data'][0] ?? null;
if (!$card) {
    die('Report card not found.');
}

$canPublish = hasRole(['head_teacher']); // admin auto-passes

// ── Handle inline edits ────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'save_remarks') {
        $sb->from('report_cards')->eq('id', $cardId)->eq('school_id', $sid)->update([
            'teacher_remarks'   => input('teacher_remarks') !== '' ? input('teacher_remarks') : null,
            'principal_remarks' => input('principal_remarks') !== '' ? input('principal_remarks') : null,
            'updated_at'        => date('c'),
        ]);
        auditLog('update', 'report_cards', $cardId, ['field' => 'remarks']);
        flash('success', 'Remarks saved.');
        redirect('grades/report-card?id=' . urlencode($cardId));
    }

    if ($action === 'set_status') {
        if (!$canPublish) {
            flash('error', 'Only an administrator or head teacher can publish report cards.');
            redirect('grades/report-card?id=' . urlencode($cardId));
        }
        $newStatus = input('status') === 'published' ? 'published' : 'draft';
        $wasPublished = ($card['status'] ?? '') === 'published';
        $patch = ['status' => $newStatus, 'updated_at' => date('c')];
        if ($newStatus === 'published') $patch['published_at'] = date('c');
        $sb->from('report_cards')->eq('id', $cardId)->eq('school_id', $sid)->update($patch);
        auditLog($newStatus === 'published' ? 'publish' : 'unpublish', 'report_cards', $cardId);

        // Notify the student's parents only on a real draft -> published
        // transition (not when re-saving an already-published card). Best-effort.
        $notified = 0;
        if ($newStatus === 'published' && !$wasPublished) {
            $notified = notifyResultsPublished([[
                'student_id' => $card['student_id'] ?? '',
                'term_id'    => $card['term_id'] ?? '',
            ]]);
        }
        flash('success', $newStatus === 'published'
            ? 'Report card published.' . ($notified > 0 ? ' Parent notified by email.' : '')
            : 'Report card moved back to draft.');
        redirect('grades/report-card?id=' . urlencode($cardId));
    }
}

// ── The term's exams (the columns) ─────────────────────────
$examRows = $sb->from('exams')->select('id,name,max_marks,start_date')
    ->eq('school_id', $sid)->eq('term_id', $card['term_id'] ?? '')
    ->order('start_date')->execute()['data'] ?? [];

// ── Subject lines, pivoted into a grid ─────────────────────
$rcsRows = $sb->from('report_card_subjects')
    ->select('exam_id,subject_id,subject_name,marks_obtained,max_marks,percentage,grade,teacher_remarks')
    ->eq('report_card_id', $cardId)->execute()['data'] ?? [];

$grid = [];            // subject_id => exam_id => row
$subjectsInCard = [];  // subject_id => subject_name
$subjectRemarks = [];  // subject_id => first non-empty subject-teacher remark
foreach ($rcsRows as $r) {
    $grid[$r['subject_id']][$r['exam_id']] = $r;
    $subjectsInCard[$r['subject_id']] = $r['subject_name'] ?? 'Subject';
    // Same remark is stamped on every exam row for (card, subject); the first
    // non-empty wins.
    if (!isset($subjectRemarks[$r['subject_id']]) && !empty($r['teacher_remarks'])) {
        $subjectRemarks[$r['subject_id']] = $r['teacher_remarks'];
    }
}
asort($subjectsInCard);

// ── Related data ───────────────────────────────────────────
$student = null;
if (!empty($card['student_id'])) {
    $stuRes = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,roll_number')
        ->eq('id', $card['student_id'])->eq('school_id', $sid)->single()->execute();
    $student = $stuRes['data'][0] ?? null;
}

$classMap  = cachedClassMap();
$className = $classMap[$card['class_id'] ?? ''] ?? '';

$termName = '';
foreach (cachedTerms() as $t) {
    if ($t['id'] === ($card['term_id'] ?? '')) { $termName = $t['name']; break; }
}
$yearName = '';
foreach (cachedYears() as $y) {
    if ($y['id'] === ($card['academic_year_id'] ?? '')) { $yearName = $y['name']; break; }
}

$school    = cachedSchool();
$showRank  = schoolSetting('show_class_rank', 'false') === 'true';

$overallPct   = (float)($card['overall_percentage'] ?? 0);
$overallGrade = $card['overall_grade'] ?? '—';
$status       = $card['status'] ?? 'draft';
$attTotal     = (int)($card['attendance_total'] ?? 0);

function gradeColor(string $g): string
{
    $g = strtoupper(trim($g));
    if (in_array($g, ['EE', 'A'], true))            return 'text-emerald-600';
    if (in_array($g, ['BE', 'E', 'F'], true))       return 'text-red-600';
    return 'text-gray-700';
}
function numFmt($n): string
{
    return rtrim(rtrim(number_format((float)$n, 1), '0'), '.');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Report Card — <?= e($student ? $student['first_name'] . ' ' . $student['last_name'] : 'Student') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        @media print {
            .no-print { display: none !important; }
            body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-card { box-shadow: none !important; border: none !important; }
        }
        @page { margin: 12mm; }
        .watermark {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 5rem; font-weight: 900; pointer-events: none;
            z-index: 0; letter-spacing: 0.2em; white-space: nowrap;
        }
    </style>
</head>
<body class="bg-gray-100 min-h-screen flex items-start justify-center py-8 px-4">

    <!-- Toolbar (hidden when printing) -->
    <div class="no-print fixed top-4 right-4 flex gap-3 z-50">
        <button onclick="window.print()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg shadow-lg font-medium transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print
        </button>
        <button onclick="history.back()" class="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg shadow-lg font-medium border border-gray-200 transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Back
        </button>
    </div>

    <div class="w-full max-w-4xl space-y-4">

        <!-- Editing panel (hidden when printing) -->
        <div class="no-print bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-sm font-semibold text-gray-700">Report Card Controls</h2>
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold <?= $status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700' ?>">
                    <?= strtoupper($status) ?>
                </span>
            </div>

            <form method="POST" class="space-y-3">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="save_remarks">
                <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Class Teacher's Remarks</label>
                    <textarea name="teacher_remarks" rows="2" placeholder="Optional"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"><?= e($card['teacher_remarks'] ?? '') ?></textarea>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Head Teacher's Remarks</label>
                    <textarea name="principal_remarks" rows="2" placeholder="Optional"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"><?= e($card['principal_remarks'] ?? '') ?></textarea>
                </div>
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save Remarks</button>
            </form>

            <div class="border-t border-gray-100 mt-4 pt-4 flex items-center gap-2">
                <?php if (!$canPublish): ?>
                    <span class="text-xs text-gray-400 italic">Only an administrator or head teacher can publish this report card.</span>
                <?php elseif ($status === 'published'): ?>
                    <form method="POST">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="set_status">
                        <input type="hidden" name="status" value="draft">
                        <button type="submit" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Move back to Draft</button>
                    </form>
                    <span class="text-xs text-gray-400">Published cards are final — move to draft to edit.</span>
                <?php else: ?>
                    <form method="POST">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="set_status">
                        <input type="hidden" name="status" value="published">
                        <button type="submit" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">Publish</button>
                    </form>
                    <span class="text-xs text-gray-400">Review, then publish before printing for parents.</span>
                <?php endif; ?>
            </div>
        </div>

        <!-- The report card itself -->
        <div class="print-card bg-white w-full rounded-xl shadow-lg border border-gray-200 overflow-hidden relative">

            <?php if ($status !== 'published'): ?>
                <div class="watermark" style="color: rgba(245, 158, 11, 0.10);">DRAFT</div>
            <?php endif; ?>

            <?php
            $documentTitle  = 'TERM REPORT CARD';
            $documentNumber = trim($termName . ($termName && $yearName ? ' · ' : '') . $yearName);
            require __DIR__ . '/../../includes/print-header.php';
            ?>

            <div class="px-8 py-6 space-y-5 relative z-10">

                <!-- Student details -->
                <div>
                    <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Student</h3>
                    <div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <div class="flex"><span class="text-gray-500 w-28 flex-shrink-0">Name:</span><span class="text-gray-900 font-medium"><?= $student ? e($student['first_name'] . ' ' . $student['last_name']) : '—' ?></span></div>
                        <div class="flex"><span class="text-gray-500 w-28 flex-shrink-0">Adm No:</span><span class="text-gray-900 font-medium"><?= e($student['admission_number'] ?? 'N/A') ?></span></div>
                        <?php if ($className): ?>
                        <div class="flex"><span class="text-gray-500 w-28 flex-shrink-0">Class:</span><span class="text-gray-900 font-medium"><?= e($className) ?></span></div>
                        <?php endif; ?>
                        <div class="flex"><span class="text-gray-500 w-28 flex-shrink-0">Term:</span><span class="text-gray-900 font-medium"><?= e(trim($termName . ' ' . $yearName)) ?: '—' ?></span></div>
                    </div>
                </div>

                <div class="border-t border-gray-200"></div>

                <!-- Results grid: subjects x exams -->
                <div>
                    <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Results</h3>
                    <div class="rounded-lg border border-gray-200 overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="bg-gray-50 border-b border-gray-200">
                                    <th class="text-left px-4 py-2.5 font-semibold text-gray-600">Subject</th>
                                    <?php foreach ($examRows as $ex): ?>
                                        <th class="text-center px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap">
                                            <?= e($ex['name']) ?>
                                            <span class="block text-xs font-normal text-gray-400">out of <?= numFmt($ex['max_marks'] ?? 100) ?></span>
                                        </th>
                                    <?php endforeach; ?>
                                    <th class="text-center px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">Average</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($subjectsInCard)): ?>
                                    <tr><td colspan="<?= count($examRows) + 2 ?>" class="px-4 py-6 text-center text-gray-400">No results recorded for this term.</td></tr>
                                <?php else: ?>
                                    <?php foreach ($subjectsInCard as $subId => $subName): ?>
                                        <?php
                                        // subject average across the exams it appears in
                                        $pcts = [];
                                        foreach ($examRows as $ex) {
                                            $cell = $grid[$subId][$ex['id']] ?? null;
                                            if ($cell !== null && $cell['percentage'] !== null) {
                                                $pcts[] = (float)$cell['percentage'];
                                            }
                                        }
                                        $subAvg = !empty($pcts) ? array_sum($pcts) / count($pcts) : null;
                                        ?>
                                        <tr class="border-b border-gray-100 align-top">
                                            <td class="px-4 py-2.5 text-gray-800 font-medium">
                                                <span class="whitespace-nowrap"><?= e($subName) ?></span>
                                                <?php if (!empty($subjectRemarks[$subId])): ?>
                                                    <p class="text-[11px] text-gray-500 italic font-normal mt-0.5 whitespace-normal max-w-[260px] leading-snug"><?= e($subjectRemarks[$subId]) ?></p>
                                                <?php endif; ?>
                                            </td>
                                            <?php foreach ($examRows as $ex): ?>
                                                <?php $cell = $grid[$subId][$ex['id']] ?? null; ?>
                                                <td class="px-3 py-2.5 text-center">
                                                    <?php if ($cell !== null): ?>
                                                        <span class="font-semibold text-gray-900"><?= numFmt($cell['marks_obtained'] ?? 0) ?></span>
                                                        <span class="text-xs ml-0.5 <?= gradeColor($cell['grade'] ?? '') ?>"><?= e($cell['grade'] ?? '') ?></span>
                                                    <?php else: ?>
                                                        <span class="text-gray-300">—</span>
                                                    <?php endif; ?>
                                                </td>
                                            <?php endforeach; ?>
                                            <td class="px-3 py-2.5 text-center font-semibold <?= $subAvg !== null ? gradeColor(gradeFromPercentage($subAvg)) : 'text-gray-300' ?>">
                                                <?= $subAvg !== null ? number_format($subAvg, 1) . '%' : '—' ?>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Summary -->
                <div class="grid grid-cols-2 <?= $showRank ? 'sm:grid-cols-4' : 'sm:grid-cols-3' ?> gap-3">
                    <div class="rounded-lg border border-gray-200 p-3 text-center">
                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">Exams Covered</p>
                        <p class="text-lg font-bold text-gray-900"><?= count($examRows) ?></p>
                    </div>
                    <div class="rounded-lg border border-gray-200 p-3 text-center">
                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">Term Average</p>
                        <p class="text-lg font-bold <?= $overallPct >= 70 ? 'text-emerald-600' : ($overallPct >= 50 ? 'text-amber-600' : 'text-red-600') ?>"><?= number_format($overallPct, 1) ?>%</p>
                    </div>
                    <div class="rounded-lg border border-gray-200 p-3 text-center">
                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">Overall Grade</p>
                        <p class="text-lg font-bold <?= gradeColor($overallGrade) ?>"><?= e($overallGrade) ?></p>
                    </div>
                    <?php if ($showRank): ?>
                    <div class="rounded-lg border border-gray-200 p-3 text-center">
                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">Class Position</p>
                        <p class="text-lg font-bold text-gray-900"><?= $card['class_rank'] !== null ? (int)$card['class_rank'] : '—' ?><span class="text-sm text-gray-400"><?= $card['class_size'] ? ' / ' . (int)$card['class_size'] : '' ?></span></p>
                    </div>
                    <?php endif; ?>
                </div>

                <?php if ($attTotal > 0): ?>
                <div class="rounded-lg border border-gray-200 p-3 text-sm flex items-center justify-between">
                    <span class="text-gray-500">Attendance</span>
                    <span class="text-gray-900 font-medium"><?= (int)$card['attendance_present'] ?> / <?= $attTotal ?> days (<?= number_format((float)($card['attendance_percentage'] ?? 0), 0) ?>%)</span>
                </div>
                <?php endif; ?>

                <!-- Remarks -->
                <?php if (!empty($card['teacher_remarks']) || !empty($card['principal_remarks'])): ?>
                <div class="space-y-3">
                    <?php if (!empty($card['teacher_remarks'])): ?>
                    <div>
                        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Class Teacher's Remarks</h3>
                        <p class="text-sm text-gray-700 whitespace-pre-line"><?= e($card['teacher_remarks']) ?></p>
                    </div>
                    <?php endif; ?>
                    <?php if (!empty($card['principal_remarks'])): ?>
                    <div>
                        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Head Teacher's Remarks</h3>
                        <p class="text-sm text-gray-700 whitespace-pre-line"><?= e($card['principal_remarks']) ?></p>
                    </div>
                    <?php endif; ?>
                </div>
                <?php endif; ?>

                <!-- Signatures -->
                <div class="grid grid-cols-2 gap-8 pt-6">
                    <div class="text-center">
                        <div class="border-t border-gray-300 pt-1.5 text-xs text-gray-500">Class Teacher</div>
                    </div>
                    <div class="text-center">
                        <div class="border-t border-gray-300 pt-1.5 text-xs text-gray-500">Head Teacher</div>
                    </div>
                </div>

                <div class="text-center text-xs text-gray-400 pt-1 pb-1">
                    <p>Generated <?= e(formatDate($card['generated_at'] ?? null)) ?> · This is a computer-generated report card.</p>
                </div>

            </div>
        </div>
    </div>
</body>
</html>
