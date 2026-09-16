<?php
/**
 * Parent portal — printable term report card (view only).
 * Receives ?id=UUID. A parent may only open a PUBLISHED report card that
 * belongs to one of their own children.
 */
requireParent();

$sb  = new Supabase();
$sid = schoolId();

$cardId = trim($_GET['id'] ?? '');
if (!$cardId) {
    die('Report card not found.');
}

$rcRes = $sb->from('report_cards')
    ->select('id,student_id,class_id,academic_year_id,term_id,'
           . 'overall_percentage,overall_grade,class_rank,class_size,'
           . 'teacher_remarks,principal_remarks,status,generated_at')
    ->eq('id', $cardId)->eq('school_id', $sid)->single()->execute();
$card = $rcRes['data'][0] ?? null;
if (!$card) {
    die('Report card not found.');
}

// Isolation: the card's student must be one of this parent's children.
if (!parentStudent($card['student_id'] ?? '')) {
    die('This report card is not available to you.');
}
// Parents only ever see published report cards.
if (($card['status'] ?? '') !== 'published') {
    die('This report card has not been published yet.');
}

// The term's exams (columns)
$examRows = $sb->from('exams')->select('id,name,max_marks,start_date')
    ->eq('school_id', $sid)->eq('term_id', $card['term_id'] ?? '')
    ->order('start_date')->execute()['data'] ?? [];

// Subject lines, pivoted
$rcsRows = $sb->from('report_card_subjects')
    ->select('exam_id,subject_id,subject_name,marks_obtained,max_marks,percentage,grade,teacher_remarks')
    ->eq('report_card_id', $cardId)->execute()['data'] ?? [];

$grid = [];
$subjectsInCard = [];
$subjectRemarks = []; // subject_id => first non-empty subject-teacher remark
foreach ($rcsRows as $r) {
    $grid[$r['subject_id']][$r['exam_id']] = $r;
    $subjectsInCard[$r['subject_id']] = $r['subject_name'] ?? 'Subject';
    if (!isset($subjectRemarks[$r['subject_id']]) && !empty($r['teacher_remarks'])) {
        $subjectRemarks[$r['subject_id']] = $r['teacher_remarks'];
    }
}
asort($subjectsInCard);

$student = null;
if (!empty($card['student_id'])) {
    $stuRes = $sb->from('students')->select('id,first_name,last_name,admission_number')
        ->eq('id', $card['student_id'])->eq('school_id', $sid)->single()->execute();
    $student = $stuRes['data'][0] ?? null;
}

$classMap  = cachedClassMap();
$className = $classMap[$card['class_id'] ?? ''] ?? '';
$termName  = '';
foreach (cachedTerms() as $t) {
    if ($t['id'] === ($card['term_id'] ?? '')) { $termName = $t['name']; break; }
}
$yearName = '';
foreach (cachedYears() as $y) {
    if ($y['id'] === ($card['academic_year_id'] ?? '')) { $yearName = $y['name']; break; }
}

$school   = cachedSchool();
$showRank = schoolSetting('show_class_rank', 'false') === 'true';

$overallPct   = (float)($card['overall_percentage'] ?? 0);
$overallGrade = $card['overall_grade'] ?? '—';

function gradeColor(string $g): string
{
    $g = strtoupper(trim($g));
    if (in_array($g, ['EE', 'A'], true))      return 'text-emerald-600';
    if (in_array($g, ['BE', 'E', 'F'], true)) return 'text-red-600';
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
    </style>
</head>
<body class="bg-gray-100 min-h-screen flex items-start justify-center py-8 px-4">

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

    <div class="print-card bg-white w-full max-w-4xl rounded-xl shadow-lg border border-gray-200 overflow-hidden relative">

        <?php
        $documentTitle  = 'TERM REPORT CARD';
        $documentNumber = trim($termName . ($termName && $yearName ? ' · ' : '') . $yearName);
        require __DIR__ . '/../../includes/print-header.php';
        ?>

        <div class="px-8 py-6 space-y-5">

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
                                    $pcts = [];
                                    foreach ($examRows as $ex) {
                                        $cell = $grid[$subId][$ex['id']] ?? null;
                                        if ($cell !== null && $cell['percentage'] !== null) $pcts[] = (float)$cell['percentage'];
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

            <div class="grid grid-cols-2 gap-8 pt-6">
                <div class="text-center"><div class="border-t border-gray-300 pt-1.5 text-xs text-gray-500">Class Teacher</div></div>
                <div class="text-center"><div class="border-t border-gray-300 pt-1.5 text-xs text-gray-500">Head Teacher</div></div>
            </div>

            <div class="text-center text-xs text-gray-400 pt-1 pb-1">
                <p>Generated <?= e(formatDate($card['generated_at'] ?? null)) ?> · This is a computer-generated report card.</p>
            </div>

        </div>
    </div>
</body>
</html>
