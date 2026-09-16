<?php
/**
 * Grade Entry — select exam + class + subject, enter marks.
 */
$pageTitle = 'Grade Entry';
$sb  = new Supabase();
$sid = schoolId();

// Get exams, classes, subjects
$examsResult   = $sb->from('exams')->select('id,name,max_marks')->eq('school_id', $sid)->order('created_at', false)->execute();
$exams    = $examsResult['data'] ?? [];
$classes  = cachedClasses();

$selExam    = input('exam_id');
$selClass   = input('class_id');
$selSubject = input('subject_id');
// Streams: marks are entered per stream where a class has them.
$selSection = input('section_id');
$classSections = $selClass ? ($sb->from('sections')->select('id,name')->eq('class_id', $selClass)->order('name')->execute()['data'] ?? []) : [];
$secNames = []; foreach ($classSections as $cs) $secNames[$cs['id']] = $cs['name'];
if ($selSection !== '' && $selSection !== 'none' && !isset($secNames[$selSection])) $selSection = '';

// Subjects: scope to the chosen class via the class_subjects link table.
// Until a class is picked the dropdown stays empty — the user must choose a
// class first so they only ever see subjects that class actually sits.
$subjects = $selClass ? cachedClassSubjects($selClass) : [];

// ── Teachers are scoped to ONLY the class+subject they're assigned ──
// Head teachers and admins are unrestricted.
$isPlainTeacher = userRole() === 'teacher';
$teacherPairs = [];   // "classId|subjectId" => true
$teacherClassIds = []; // classId => true
if ($isPlainTeacher) {
    foreach (teacherSubjectAssignments(currentUser()['id'] ?? '') as $a) {
        $teacherPairs[$a['class_id'] . '|' . $a['subject_id']] = true;
        $teacherClassIds[$a['class_id']] = true;
    }
    // Limit the class picker to their classes…
    $classes = array_values(array_filter($classes, fn($c) => isset($teacherClassIds[$c['id']])));
    // …and the subject picker to the subjects they teach in the chosen class.
    if ($selClass) {
        $subjects = array_values(array_filter($subjects, fn($s) => isset($teacherPairs[$selClass . '|' . $s['id']])));
    }
    // Block loading another teacher's class/subject via a hand-edited URL.
    if ($selClass && $selSubject && !isset($teacherPairs[$selClass . '|' . $selSubject])) {
        flash('error', 'You can only enter marks for your assigned class and subject.');
        redirect('grades/entry');
    }
}

$students = [];
$existingGrades = [];
$maxMarks = 100;

// Get max marks for selected exam
foreach ($exams as $ex) {
    if ($ex['id'] === $selExam) {
        $maxMarks = (int)($ex['max_marks'] ?? 100);
        break;
    }
}

if ($selExam && $selClass && $selSubject) {
    // Get students in this class
    $sq = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,section_id')
        ->eq('school_id', $sid)
        ->eq('current_class_id', $selClass)
        ->eq('status', 'active');
    if ($selSection === 'none') $sq = $sq->is('section_id', 'null');
    elseif ($selSection !== '') $sq = $sq->eq('section_id', $selSection);
    $studentsResult = $sq->order('first_name')->execute();
    $students = $studentsResult['data'] ?? [];

    // Get existing grades
    if (!empty($students)) {
        $sids = array_column($students, 'id');
        $gradesResult = $sb->from('grades')
            ->select('student_id,marks,grade,remarks')
            ->eq('exam_id', $selExam)
            ->eq('subject_id', $selSubject)
            ->in('student_id', $sids)
            ->execute();
        foreach (($gradesResult['data'] ?? []) as $g) {
            $existingGrades[$g['student_id']] = $g;
        }
    }
}

// Handle grade submission
if (isPost() && verifyCsrf()) {
    $examId    = input('exam_id');
    $classId   = input('class_id');
    $subjectId = input('subject_id');
    $marks     = $_POST['marks'] ?? [];
    $remarks   = $_POST['remarks'] ?? [];

    // A teacher can only save marks for a class+subject they're assigned to.
    if ($isPlainTeacher && !isset($teacherPairs[$classId . '|' . $subjectId])) {
        flash('error', 'You can only save marks for your assigned class and subject.');
        redirect('grades/entry');
    }

    // ── Tenant + integrity validation (defense-in-depth) ─────────────
    // exam_id, subject_id and each student_id arrive from the POST body, and
    // the grades UNIQUE key is (exam_id, subject_id, student_id) with NO
    // school_id. Without this guard a head-teacher/admin could upsert onto
    // another school's grade row and re-tenant it. Prove all three components
    // belong to THIS school before building any rows.
    $validExam = false;
    foreach ($exams as $ex) { if ($ex['id'] === $examId) { $validExam = true; break; } }
    $validClass = false;
    foreach ($classes as $c) { if ($c['id'] === $classId) { $validClass = true; break; } }
    $validSubject = false;
    foreach (($classId ? cachedClassSubjects($classId) : []) as $su) {
        if ($su['id'] === $subjectId) { $validSubject = true; break; }
    }
    if (!$validExam || !$validClass || !$validSubject) {
        flash('error', 'Invalid exam, class, or subject for this school.');
        redirect('grades/entry');
    }
    // Only accept marks for students on THIS school's roster for the class.
    $rosterRes = $sb->from('students')->select('id')
        ->eq('school_id', $sid)->eq('current_class_id', $classId)->execute();
    $validStudents = array_flip(array_column($rosterRes['data'] ?? [], 'id'));

    // Build every row first, then write them all in ONE batched upsert.
    // The old code ran a SELECT + an INSERT/UPDATE per student — 80+ sequential
    // round trips for a class of 40, which is painfully slow on a 3G/4G link.
    // The grades table has UNIQUE(exam_id, subject_id, student_id), so a single
    // upsert keyed on those columns does the whole class in one request.
    $rows    = [];
    $clamped = 0;
    foreach ($marks as $studentId => $mark) {
        if ($mark === '') continue;
        // Skip any student_id not on this school's roster for the class —
        // blocks cross-tenant grade writes via forged POST keys.
        if (!isset($validStudents[$studentId])) continue;

        $markVal = (float)$mark;
        // Guard against out-of-range marks. The form has a client-side max,
        // but a stray value like 150/100 would otherwise push a report-card
        // percentage above 100%. Clamp into [0, maxMarks].
        if ($markVal < 0) { $markVal = 0; $clamped++; }
        if ($maxMarks > 0 && $markVal > $maxMarks) { $markVal = $maxMarks; $clamped++; }

        $grade = ($maxMarks > 0) ? gradeFromPercentage(($markVal / $maxMarks) * 100) : '';
        $rk    = trim((string)($remarks[$studentId] ?? ''));

        $rows[] = [
            'school_id'  => $sid,
            'exam_id'    => $examId,
            'subject_id' => $subjectId,
            'student_id' => $studentId,
            'class_id'   => $classId ?: null,
            'marks'      => $markVal,
            'grade'      => $grade,
            'remarks'    => ($rk !== '') ? $rk : null,
            'updated_at' => date('c'),
        ];
    }

    if (empty($rows)) {
        flash('error', 'No marks were entered.');
    } else {
        $result = $sb->from('grades')->upsert($rows, 'exam_id,subject_id,student_id');
        if (!empty($result['error'])) {
            flash('error', 'Could not save grades: ' . $result['error']);
        } else {
            $msg = count($rows) . ' grade(s) saved.';
            if ($clamped > 0) {
                $msg .= " ($clamped mark(s) fell outside 0–$maxMarks and were adjusted to fit.)";
            }
            flash('success', $msg);
            auditLog('save', 'grades', $examId, [
                'exam_id'    => $examId,
                'class_id'   => $classId,
                'subject_id' => $subjectId,
                'count'      => count($rows),
            ]);
        }
    }

    redirect("grades/entry?exam_id=$examId&class_id=$classId&subject_id=$subjectId" . (input('section_id') !== '' ? '&section_id=' . urlencode(input('section_id')) : ''));
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Grade Entry</h1>
    <p class="text-sm text-gray-500 mt-1">Select exam, class and subject to enter marks</p>
</div>

<!-- Selection Form -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('grades/entry') ?>" class="grid grid-cols-1 sm:grid-cols-<?= $classSections ? 5 : 4 ?> gap-3 items-end">
        <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Exam</label>
            <select name="exam_id" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">Select exam</option>
                <?php foreach ($exams as $ex): ?>
                    <option value="<?= e($ex['id']) ?>"<?= selectedIf($selExam, $ex['id']) ?>><?= e($ex['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Class</label>
            <select name="class_id" onchange="this.form.submit()" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">Select class</option>
                <?php foreach ($classes as $c): ?>
                    <option value="<?= e($c['id']) ?>"<?= selectedIf($selClass, $c['id']) ?>><?= e($c['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php if ($classSections): ?>
        <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Stream</label>
            <select name="section_id" onchange="this.form.submit()" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">Whole class</option>
                <?php foreach ($classSections as $cs): ?>
                    <option value="<?= e($cs['id']) ?>"<?= selectedIf($selSection, $cs['id']) ?>><?= e($cs['name']) ?></option>
                <?php endforeach; ?>
                <option value="none"<?= selectedIf($selSection, 'none') ?>>Not yet in a stream</option>
            </select>
        </div>
        <?php endif; ?>
        <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Subject</label>
            <select name="subject_id" <?= !$selClass ? 'disabled' : '' ?> class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none disabled:bg-gray-50 disabled:text-gray-400">
                <option value=""><?= $selClass ? 'Select subject' : 'Pick a class first' ?></option>
                <?php foreach ($subjects as $sub): ?>
                    <option value="<?= e($sub['id']) ?>"<?= selectedIf($selSubject, $sub['id']) ?>><?= e($sub['name']) ?></option>
                <?php endforeach; ?>
            </select>
            <?php if ($selClass && empty($subjects)): ?>
                <p class="text-[11px] text-amber-600 mt-1">No subjects assigned to this class yet. Open Classes → Subjects to set them.</p>
            <?php endif; ?>
        </div>
        <div>
            <button type="submit" class="w-full py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Load Students</button>
        </div>
    </form>
</div>

<?php if ($selExam && $selClass && $selSubject && !empty($students)): ?>
<!-- Grade Entry Table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <form method="POST">
        <?= csrfField() ?>
        <input type="hidden" name="exam_id" value="<?= e($selExam) ?>">
        <input type="hidden" name="class_id" value="<?= e($selClass) ?>">
        <input type="hidden" name="subject_id" value="<?= e($selSubject) ?>">
        <input type="hidden" name="section_id" value="<?= e($selSection) ?>">

        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Adm No.</th>
                    <th class="text-center px-4 py-3 font-semibold text-gray-600">Marks (out of <?= $maxMarks ?>)</th>
                    <th class="text-center px-4 py-3 font-semibold text-gray-600">Grade</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Remarks</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php $i = 0; foreach ($students as $s): $i++; ?>
                    <?php $eg = $existingGrades[$s['id']] ?? null; ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-2 text-gray-400"><?= $i ?></td>
                        <td class="px-4 py-2 font-medium text-gray-900"><?= e($s['first_name'] . ' ' . $s['last_name']) ?></td>
                        <td class="px-4 py-2 text-gray-500"><?= e($s['admission_number'] ?? '') ?></td>
                        <td class="px-4 py-2 text-center">
                            <input type="number" name="marks[<?= e($s['id']) ?>]" value="<?= e($eg['marks'] ?? '') ?>"
                                min="0" max="<?= $maxMarks ?>" step="0.5"
                                class="w-20 px-2 py-1 rounded border border-gray-200 text-center text-sm focus:border-emerald-400 outline-none">
                        </td>
                        <td class="px-4 py-2 text-center font-medium <?= ($eg['grade'] ?? '') === 'A' ? 'text-emerald-600' : (($eg['grade'] ?? '') === 'F' ? 'text-red-600' : 'text-gray-600') ?>">
                            <?= e($eg['grade'] ?? '—') ?>
                        </td>
                        <td class="px-4 py-2">
                            <input type="text" name="remarks[<?= e($s['id']) ?>]" value="<?= e($eg['remarks'] ?? '') ?>"
                                placeholder="Optional"
                                class="w-full px-2 py-1 rounded border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <div class="px-4 py-3 border-t border-gray-100">
            <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                Save Grades
            </button>
        </div>
    </form>
</div>
<?php elseif ($selExam && $selClass && $selSubject): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        No students found in this class.
    </div>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
