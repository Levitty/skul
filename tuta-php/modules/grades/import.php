<?php
/**
 * Import marks from a school's own Excel mark sheet.
 *
 * Kenyan schools already keep results in Excel, one sheet per stream, and
 * re-typing 700 pupils × 10 subjects is not a thing anyone will do. This reads
 * the sheet the school already has.
 *
 * The sheet is self-describing: each subject is one or more raw-mark columns
 * followed by a percentage, so what a subject is marked out of can be recovered
 * by division, and the sheet's own TOTAL reveals which subjects the school
 * leaves out of the average. Nothing relies on the column headings, which are
 * not trustworthy — Sabaki's Grade 4T labels the Creative Arts mark "C/A %".
 *
 * The one thing the file cannot supply is identity: there are no admission
 * numbers, only names. So pupils are matched by name within the chosen class
 * and whatever is left over is resolved by a person before anything is written.
 *
 * Four steps: upload → pick the sheet → check the reading → import.
 */
$pageTitle = 'Import marks';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

if (!userCan('results.manage')) {
    flash('error', 'You do not have permission to import marks.');
    redirect('exams');
}

require_once __DIR__ . '/../../includes/xlsx.php';

// ── Where an uploaded workbook waits between steps ────────────────
// Keeping the file on disk and re-reading it each step keeps the session
// small; a mark sheet parses in milliseconds.
$uploadDir = sys_get_temp_dir();
$pathFor   = fn(string $tok) => $uploadDir . '/tuta-marks-' . $tok . '.xlsx';
$token     = preg_replace('/[^a-f0-9]/', '', (string)input('token'));
$step      = input('step') ?: 'upload';

$classMap = cachedClassMap();
$subjects = $sb->from('subjects')->select('id,name,code')->eq('school_id', $sid)
    ->eq('is_active', 'true')->order('name')->execute()['data'] ?? [];
$exams = $sb->from('exams')->select('id,name,term_id')->eq('school_id', $sid)
    ->order('created_at', false)->limit(50)->execute()['data'] ?? [];
$terms = cachedTerms();

/** Short sheet headings → the subject a school would actually name. */
function markSheetSubjectName(string $label): string
{
    $k = strtoupper(preg_replace('/[^A-Z\/ ]/i', '', trim($label)));
    $map = [
        'MATH' => 'Mathematics', 'MATHS' => 'Mathematics', 'MATHEMATICS' => 'Mathematics',
        'ENG' => 'English', 'ENGLISH' => 'English', 'LANG' => 'Language Activities',
        'LANGUAGE' => 'Language Activities', 'LSPEAKING' => 'Language Activities',
        'KIS' => 'Kiswahili', 'KISW' => 'Kiswahili', 'KISWAHILI' => 'Kiswahili',
        'SCIE' => 'Science', 'SCI' => 'Science', 'SCIENCE' => 'Science',
        'AGRI' => 'Agriculture', 'SST' => 'Social Studies',
        'CRE' => 'CRE', 'RELIGIOUS' => 'CRE',
        'C/A' => 'Creative Arts', 'CA' => 'Creative Arts', 'CREATIVE' => 'Creative Arts',
        'MAC' => 'Creative Arts',
        'COMP' => 'Computer', 'COMPUTER' => 'Computer', 'COMPUTE' => 'Computer',
        'FRENCH' => 'French', 'ENV' => 'Environmental Activities',
        'ENVI' => 'Environmental Activities', 'READ' => 'Reading',
    ];
    if (isset($map[$k])) return $map[$k];
    return ucwords(strtolower(trim($label)));
}

/**
 * Stream letters as Kenyan primaries name them. P is deliberately absent —
 * Sabaki uses it in Grades 5 and 6 and nobody has said what it stands for, so
 * the screen asks rather than inventing a name into the register.
 */
function markStreamName(string $letter): string
{
    return [
        'L' => 'Lion', 'J' => 'Jaguar', 'C' => 'Cheetah', 'T' => 'Tiger',
        'E' => 'Eagle', 'F' => 'Falcon', 'H' => 'Hawk', 'A' => 'Antelope',
        'B' => 'Buffalo', 'G' => 'Giraffe', 'Z' => 'Zebra',
    ][strtoupper($letter)] ?? '';
}

/** Normalised name key — order-independent, punctuation-free. */
function markNameKey(string $s): string
{
    $t = preg_split('/\s+/', trim(preg_replace('/[^A-Za-z ]/', ' ', strtoupper($s))));
    $t = array_values(array_filter($t, fn($x) => $x !== ''));
    sort($t);
    return implode(' ', $t);
}

// ── Step: receive the file ────────────────────────────────────────
if (isPost() && verifyCsrf() && input('step') === 'upload') {
    $f = $_FILES['sheet'] ?? null;
    if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) {
        flash('error', 'Choose an .xlsx file to upload.');
    } elseif (($f['size'] ?? 0) > 12 * 1024 * 1024) {
        flash('error', 'That file is larger than 12 MB.');
    } elseif (strtolower(pathinfo($f['name'] ?? '', PATHINFO_EXTENSION)) !== 'xlsx') {
        flash('error', 'Only .xlsx files can be read. Save the workbook as .xlsx and try again.');
    } else {
        $token = bin2hex(random_bytes(8));
        if (!move_uploaded_file($f['tmp_name'], $pathFor($token))) {
            flash('error', 'The file could not be saved for reading.');
            $token = '';
        } else {
            $step = 'sheet';
        }
    }
}

// Everything past the upload needs the workbook.
$book = null;
if ($token !== '' && is_readable($pathFor($token))) {
    $book = xlsxLoad($pathFor($token));
    if (isset($book['__error'])) {
        flash('error', $book['__error']);
        $book = null; $step = 'upload';
    }
} elseif ($step !== 'upload') {
    flash('error', 'That upload has expired. Please choose the file again.');
    $step = 'upload';
}

// NOT input(): that trims, and real sheet tabs carry trailing spaces
// ("4T MID TERM 1ST TERM "), which would stop the name matching any sheet.
$sheetName = (string)($_POST['sheet_name'] ?? $_GET['sheet_name'] ?? '');
$classId   = (string)input('class_id');
$examId    = (string)input('exam_id');
$detected  = null;

// Fall back to a whitespace-insensitive match if the exact key is gone.
if ($book && $sheetName !== '' && !isset($book[$sheetName])) {
    foreach (array_keys($book) as $k) {
        if (trim($k) === trim($sheetName)) { $sheetName = $k; break; }
    }
}

if ($book && $sheetName !== '' && isset($book[$sheetName])) {
    $detected = xlsxDetectMarkSheet($book[$sheetName]);
    if (isset($detected['error'])) {
        flash('error', $detected['error']);
        $detected = null; $step = 'sheet';
    }
}

// Never leave the page blank: if we cannot read the chosen sheet for any
// reason, go back to the picker and say so rather than rendering nothing.
if (!$detected && $step !== 'upload' && $step !== 'sheet') {
    if ($book) {
        flash('error', $sheetName === ''
            ? 'No sheet was chosen. Please pick one.'
            : 'That sheet could not be read. Please pick it again.');
        $step = 'sheet';
    } else {
        $step = 'upload';
    }
}

// Learners in the chosen class — the only candidates a name can match.
$roster = [];
if ($classId !== '') {
    $roster = $sb->from('students')->select('id,first_name,last_name,admission_number,section_id')
        ->eq('school_id', $sid)->eq('current_class_id', $classId)->eq('status', 'active')
        ->order('first_name')->execute()['data'] ?? [];
}

// Sections already defined for this class, so an existing stream is reused
// rather than duplicated under a second name.
$classSections = [];
if ($classId !== '') {
    $classSections = $sb->from('sections')->select('id,name')
        ->eq('class_id', $classId)->order('name')->execute()['data'] ?? [];
}
$rosterByKey = [];
foreach ($roster as $r) {
    $rosterByKey[markNameKey(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? ''))][] = $r['id'];
}

/** Best guesses for a sheet name, most likely first. */
$suggest = function (string $name) use ($roster, $rosterByKey) {
    $key = markNameKey($name);
    if (count($rosterByKey[$key] ?? []) === 1) return [['id' => $rosterByKey[$key][0], 'exact' => true]];
    $want = array_filter(explode(' ', $key));
    $out  = [];
    foreach ($roster as $r) {
        $have = array_filter(explode(' ', markNameKey(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? ''))));
        $hit  = count(array_intersect($want, $have));
        if ($hit > 0) $out[] = ['id' => $r['id'], 'score' => $hit, 'exact' => false];
    }
    usort($out, fn($a, $b) => $b['score'] <=> $a['score']);
    return array_slice($out, 0, 3);
};

// ── Step: write ───────────────────────────────────────────────────
if (isPost() && verifyCsrf() && input('step') === 'import' && $detected && $examId !== '') {
    $subjIn   = $_POST['subject'] ?? [];     // index → existing subject id, or "new"
    $newName  = $_POST['subject_name'] ?? [];
    $maxIn    = $_POST['max_marks'] ?? [];
    $countsIn = $_POST['counts'] ?? [];
    $matchIn  = $_POST['match'] ?? [];       // pupil index → student id or ''

    $subjectIdFor = [];
    $sectionIdFor = [];
    $sectionsMade = 0;
    $created = 0;
    foreach ($detected['subjects'] as $i => $s) {
        $choice = (string)($subjIn[$i] ?? '');
        if ($choice === 'skip' || $choice === '') continue;
        if ($choice === 'new') {
            $nm = trim((string)($newName[$i] ?? '')) ?: markSheetSubjectName($s['label']);
            $exists = null;
            foreach ($subjects as $sub) if (strcasecmp($sub['name'], $nm) === 0) { $exists = $sub['id']; break; }
            if ($exists) { $subjectIdFor[$i] = $exists; continue; }
            $r = $sb->from('subjects')->insert(['school_id' => $sid, 'name' => $nm, 'is_active' => true]);
            $newId = $r['data'][0]['id'] ?? null;
            if ($newId) { $subjectIdFor[$i] = $newId; $created++; }
        } else {
            $subjectIdFor[$i] = $choice;
        }
    }
    Supabase::clearCache('subjects_' . $sid);

    if (!$subjectIdFor) {
        flash('error', 'No subjects were selected, so there was nothing to import.');
    } else {
        // Each subject's out-of for this exam, and whether it counts.
        // One upsert on (exam_id, subject_id) — re-importing a corrected sheet
        // updates the setup rather than colliding with it.
        $esRows = [];
        foreach ($subjectIdFor as $i => $subId) {
            $esRows[] = [
                'school_id'    => $sid,
                'exam_id'      => $examId,
                'subject_id'   => $subId,
                'max_marks'    => (float)($maxIn[$i] ?? $detected['subjects'][$i]['max']),
                'counts_total' => !empty($countsIn[$i]),
                'sequence'     => $i + 1,
            ];
        }
        $sb->from('exam_subjects')->upsert($esRows, 'exam_id,subject_id');

        $rows = [];
        $skipped = 0;
        $toSection = [];          // section id → [student ids]
        foreach ($detected['pupils'] as $pi => $p) {
            $stu = trim((string)($matchIn[$pi] ?? ''));
            if ($stu === '') { $skipped++; continue; }
            foreach ($subjectIdFor as $i => $subId) {
                $mark = $p['marks'][$i] ?? null;
                if ($mark === null) continue;
                $rows[] = ['student_id' => $stu, 'subject_id' => $subId, 'marks' => $mark];
            }
            // The sheet already says which stream this child is in.
            if (input('assign_sections') === '1' && ($p['stream'] ?? '') !== '') {
                $secKey = $p['stream'];
                if (!isset($sectionIdFor[$secKey])) {
                    $wanted = trim((string)($_POST['section_name'][$secKey] ?? ''));
                    if ($wanted === '') { $sectionIdFor[$secKey] = null; }
                    else {
                        $found = null;
                        foreach ($classSections as $cs) if (strcasecmp($cs['name'], $wanted) === 0) { $found = $cs['id']; break; }
                        if (!$found) {
                            $r = $sb->from('sections')->insert(['class_id' => $classId, 'name' => $wanted]);
                            $found = $r['data'][0]['id'] ?? null;
                            if ($found) $sectionsMade++;
                        }
                        $sectionIdFor[$secKey] = $found;
                    }
                }
                if (!empty($sectionIdFor[$secKey])) $toSection[$sectionIdFor[$secKey]][] = $stu;
            }
        }

        if (!$rows) {
            flash('error', 'No pupils were matched, so there was nothing to import.');
        } else {
            $res = $sb->rpc('import_exam_marks', [
                'p_school_id'  => $sid,
                'p_exam_id'    => $examId,
                'p_rows'       => $rows,
                'p_user_id'    => $me['id'] ?? null,
                'p_user_email' => $me['email'] ?? null,
            ]);
            $p = $res['data'] ?? null;
            if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
                $err = is_array($p) ? ($p['error'] ?? 'The import failed.') : 'The import failed.';
                if (!empty($p['problems'])) $err .= ' ' . implode(' ', (array)$p['problems']);
                flash('error', $err);
            } else {
                // Marks are in. Sections follow — a failure here must not undo
                // the import, so it is reported separately rather than thrown.
                $placed = 0;
                $yearId = cachedCurrentYear()['id'] ?? null;
                foreach ($toSection as $secId => $stuIds) {
                    $stuIds = array_values(array_unique($stuIds));
                    foreach (array_chunk($stuIds, 100) as $chunk) {
                        $r = $sb->from('students')->in('id', $chunk)->eq('school_id', $sid)
                            ->update(['section_id' => $secId, 'updated_at' => date('c')]);
                        if (empty($r['error'])) $placed += count($chunk);
                        // Keep this year's enrolment row in step, as Edit Student does.
                        if ($yearId) {
                            $sb->from('enrollments')->in('student_id', $chunk)
                                ->eq('academic_year_id', $yearId)
                                ->update(['section_id' => $secId, 'updated_at' => date('c')]);
                        }
                    }
                }

                $msg = $p['message'] ?? 'Marks imported.';
                if ($created)      $msg .= " {$created} subject(s) created.";
                if ($sectionsMade) $msg .= " {$sectionsMade} section(s) created.";
                if ($placed)       $msg .= " {$placed} learner(s) placed in a section.";
                if ($skipped)      $msg .= " {$skipped} pupil(s) skipped — not matched.";
                flash('success', $msg);
                @unlink($pathFor($token));
                redirect('grades/reports?exam_id=' . urlencode($examId));
            }
        }
    }
}

require __DIR__ . '/../../includes/layout-top.php';
$fieldCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none';
?>

<div class="mb-6 flex items-start justify-between gap-4">
    <div>
        <a href="<?= baseUrl('exams') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Exams</a>
        <h1 class="text-2xl font-bold text-gray-900 mt-2">Import marks</h1>
        <p class="text-sm text-gray-500 mt-1">Read a class mark sheet straight from the school's own Excel file.</p>
    </div>
</div>

<!-- Progress -->
<?php $steps = ['upload' => 'Upload', 'sheet' => 'Pick the class', 'review' => 'Check the reading', 'import' => 'Check the reading'];
      $order = ['upload' => 1, 'sheet' => 2, 'review' => 3, 'import' => 3]; $cur = $order[$step] ?? 1; ?>
<div class="flex items-center gap-2 mb-6 text-xs">
    <?php foreach (['Upload', 'Pick the class', 'Check the reading'] as $i => $lbl): ?>
        <span class="px-2.5 py-1 rounded-full font-medium <?= $cur === $i + 1 ? 'bg-emerald-600 text-white' : ($cur > $i + 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500') ?>">
            <?= ($i + 1) ?>. <?= e($lbl) ?>
        </span>
        <?php if ($i < 2): ?><span class="text-gray-300">&rarr;</span><?php endif; ?>
    <?php endforeach; ?>
</div>

<?php if ($step === 'upload'): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-2xl">
        <form method="POST" enctype="multipart/form-data" class="space-y-4">
            <?= csrfField() ?>
            <input type="hidden" name="step" value="upload">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Mark sheet (.xlsx)</label>
                <input type="file" name="sheet" accept=".xlsx" required
                       class="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100">
                <p class="text-xs text-gray-400 mt-1.5">One workbook, any number of class sheets. Nothing is saved until you have checked the reading.</p>
            </div>
            <button type="submit" class="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Read the file</button>
        </form>
    </div>

<?php elseif ($step === 'sheet' && $book): ?>
    <form method="POST" class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <?= csrfField() ?>
        <input type="hidden" name="step" value="review">
        <input type="hidden" name="token" value="<?= e($token) ?>">

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Which exam are these marks for?</label>
                <select name="exam_id" required class="<?= $fieldCls ?>">
                    <option value="">Choose an exam&hellip;</option>
                    <?php foreach ($exams as $x): ?>
                        <option value="<?= e($x['id']) ?>"><?= e($x['name']) ?></option>
                    <?php endforeach; ?>
                </select>
                <?php if (!$exams): ?>
                    <p class="text-xs text-amber-600 mt-1">No exams yet — <a href="<?= baseUrl('exams/add') ?>" class="underline">create one first</a>.</p>
                <?php endif; ?>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Which class is this sheet?</label>
                <select name="class_id" required class="<?= $fieldCls ?>">
                    <option value="">Choose a class&hellip;</option>
                    <?php foreach ($classMap as $cid => $cname): ?>
                        <option value="<?= e($cid) ?>"><?= e($cname) ?></option>
                    <?php endforeach; ?>
                </select>
                <p class="text-xs text-gray-400 mt-1">Names are matched against this class only.</p>
            </div>
        </div>

        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sheet</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[26rem] overflow-y-auto pr-1">
            <?php $first = true; foreach ($book as $nm => $rows): if ($nm === '__error') continue;
                $d = xlsxDetectMarkSheet($rows); $ok = !isset($d['error']); ?>
                <label class="flex items-start gap-2 p-3 rounded-lg border <?= $ok ? 'border-gray-200 hover:bg-gray-50 cursor-pointer' : 'border-gray-100 bg-gray-50 opacity-60' ?>">
                    <input type="radio" name="sheet_name" value="<?= e($nm) ?>" <?= $ok && $first ? 'checked' : '' ?> <?= $ok ? '' : 'disabled' ?>
                           required class="mt-0.5 w-4 h-4 border-gray-300 text-emerald-600">
                    <span class="min-w-0">
                        <span class="block text-sm font-medium text-gray-900 truncate"><?= e($nm) ?></span>
                        <span class="block text-xs text-gray-500">
                            <?= $ok ? count($d['pupils']) . ' pupils · ' . count($d['subjects']) . ' subjects' : 'cannot be read' ?>
                        </span>
                        <?php if ($ok && !empty($d['title'])): ?>
                            <span class="block text-[11px] text-gray-400 truncate"><?= e($d['title']) ?></span>
                        <?php endif; ?>
                    </span>
                </label>
            <?php $first = $first && !$ok; endforeach; ?>
        </div>

        <div class="mt-5 flex gap-2">
            <button type="submit" class="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Read this sheet</button>
            <a href="<?= baseUrl('grades/import') ?>" class="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Start over</a>
        </div>
    </form>

<?php elseif ($detected): ?>
    <?php
    $examName = '';
    foreach ($exams as $x) if ($x['id'] === $examId) $examName = $x['name'];
    $matchedCount = 0;
    $picks = [];
    foreach ($detected['pupils'] as $pi => $p) {
        $s = $suggest($p['name']);
        $picks[$pi] = $s;
        if (!empty($s[0]['exact'])) $matchedCount++;
    }
    $counted = array_values(array_filter($detected['subjects'], fn($s) => $s['counts']));
    ?>
    <form method="POST">
        <?= csrfField() ?>
        <input type="hidden" name="step" value="import">
        <input type="hidden" name="token" value="<?= e($token) ?>">
        <input type="hidden" name="sheet_name" value="<?= e($sheetName) ?>">
        <input type="hidden" name="class_id" value="<?= e($classId) ?>">
        <input type="hidden" name="exam_id" value="<?= e($examId) ?>">

        <!-- What the file says -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <?php
            $tiles = [
                ['Pupils on the sheet', count($detected['pupils']), 'bg-blue-50 text-blue-700', 'text-blue-600'],
                ['Matched by name', $matchedCount . ' of ' . count($detected['pupils']), 'bg-emerald-50 text-emerald-700', 'text-emerald-600'],
                ['Subjects found', count($detected['subjects']) . ' (' . count($counted) . ' counted)', 'bg-violet-50 text-violet-700', 'text-violet-600'],
                ['Marks read', $detected['checked'], 'bg-amber-50 text-amber-700', 'text-amber-600'],
            ];
            foreach ($tiles as $t): ?>
                <div class="rounded-xl p-4 <?= $t[2] ?>">
                    <p class="text-xs <?= $t[3] ?>"><?= e($t[0]) ?></p>
                    <p class="text-xl font-bold mt-0.5"><?= e((string)$t[1]) ?></p>
                </div>
            <?php endforeach; ?>
        </div>

        <p class="text-sm text-gray-500 mb-5">
            <?= e($detected['title'] ?: $sheetName) ?> &middot; importing into
            <strong class="text-gray-700"><?= e($examName ?: 'the chosen exam') ?></strong>,
            class <strong class="text-gray-700"><?= e($classMap[$classId] ?? '—') ?></strong>.
        </p>

        <!-- Subjects -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6 overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="text-sm font-semibold text-gray-700">Subjects</h2>
                <p class="text-xs text-gray-500 mt-0.5">The mark each subject is out of was worked out from the sheet's own percentages. Change anything that looks wrong.</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th class="text-left px-5 py-2.5 font-semibold">On the sheet</th>
                            <th class="text-left px-3 py-2.5 font-semibold">Subject in Tuta</th>
                            <th class="text-left px-3 py-2.5 font-semibold">Out of</th>
                            <th class="text-left px-3 py-2.5 font-semibold">Counts to total</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                    <?php foreach ($detected['subjects'] as $i => $s):
                        $guess = markSheetSubjectName($s['label']);
                        $existing = null;
                        foreach ($subjects as $sub) if (strcasecmp($sub['name'], $guess) === 0) { $existing = $sub['id']; break; } ?>
                        <tr>
                            <td class="px-5 py-2.5">
                                <span class="font-medium text-gray-900"><?= e($s['label']) ?></span>
                                <span class="block text-[11px] text-gray-400">column<?= count($s['cols']) > 1 ? 's' : '' ?> <?= e(implode(' + ', array_map(fn($c) => $c + 1, $s['cols']))) ?></span>
                            </td>
                            <td class="px-3 py-2.5">
                                <div class="flex items-center gap-2">
                                    <select name="subject[<?= $i ?>]" class="<?= $fieldCls ?> min-w-[11rem]" onchange="this.nextElementSibling.classList.toggle('hidden', this.value !== 'new')">
                                        <?php foreach ($subjects as $sub): ?>
                                            <option value="<?= e($sub['id']) ?>" <?= $existing === $sub['id'] ? 'selected' : '' ?>><?= e($sub['name']) ?></option>
                                        <?php endforeach; ?>
                                        <option value="new" <?= $existing ? '' : 'selected' ?>>+ Create new&hellip;</option>
                                        <option value="skip">Do not import</option>
                                    </select>
                                    <input type="text" name="subject_name[<?= $i ?>]" value="<?= e($guess) ?>"
                                           class="<?= $fieldCls ?> min-w-[9rem] <?= $existing ? 'hidden' : '' ?>" placeholder="New subject name">
                                </div>
                            </td>
                            <td class="px-3 py-2.5">
                                <input type="number" step="0.01" min="0.01" name="max_marks[<?= $i ?>]" value="<?= e((string)$s['max']) ?>"
                                       class="<?= $fieldCls ?> w-24">
                            </td>
                            <td class="px-3 py-2.5">
                                <label class="inline-flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox" name="counts[<?= $i ?>]" value="1" <?= $s['counts'] ? 'checked' : '' ?>
                                           class="w-4 h-4 rounded border-gray-300 text-emerald-600">
                                    <span class="<?= $s['counts'] ? 'text-gray-700' : 'text-amber-600' ?>"><?= $s['counts'] ? 'Yes' : 'No — reported only' ?></span>
                                </label>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Sections, taken from the stream column -->
        <?php $streams = $detected['streams'] ?? []; if ($streams): ?>
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6 overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
                <div>
                    <h2 class="text-sm font-semibold text-gray-700">Sections</h2>
                    <p class="text-xs text-gray-500 mt-0.5">The sheet records each pupil's stream, so they can be placed while the marks go in.</p>
                </div>
                <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" name="assign_sections" value="1" checked
                           class="w-4 h-4 rounded border-gray-300 text-emerald-600">
                    Place them
                </label>
            </div>
            <div class="px-5 py-4 space-y-3">
                <?php foreach ($streams as $letter => $n):
                    $guess = markStreamName($letter);
                    $existing = null;
                    foreach ($classSections as $cs) if ($guess !== '' && strcasecmp($cs['name'], $guess) === 0) { $existing = $cs; break; } ?>
                    <div class="flex flex-wrap items-center gap-3">
                        <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-sm font-bold text-gray-700"><?= e($letter) ?></span>
                        <span class="text-sm text-gray-500 w-20"><?= (int)$n ?> pupil<?= $n == 1 ? '' : 's' ?></span>
                        <input type="text" name="section_name[<?= e($letter) ?>]" value="<?= e($existing['name'] ?? $guess) ?>"
                               placeholder="Name this stream, or leave blank to skip"
                               class="<?= $fieldCls ?> max-w-xs" list="secList">
                        <?php if ($existing): ?>
                            <span class="text-xs text-emerald-600">exists already — pupils will be added to it</span>
                        <?php elseif ($guess === ''): ?>
                            <span class="text-xs text-amber-600">unknown letter — type the name your school uses</span>
                        <?php else: ?>
                            <span class="text-xs text-gray-400">will be created under <?= e($classMap[$classId] ?? 'this class') ?></span>
                        <?php endif; ?>
                    </div>
                <?php endforeach; ?>
                <?php if ($classSections): ?>
                    <datalist id="secList"><?php foreach ($classSections as $cs): ?><option value="<?= e($cs['name']) ?>"><?php endforeach; ?></datalist>
                <?php endif; ?>
            </div>
        </div>
        <?php endif; ?>

        <!-- Pupils -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="text-sm font-semibold text-gray-700">Pupils</h2>
                <p class="text-xs text-gray-500 mt-0.5">
                    The sheet has no admission numbers, so each name is matched against <?= count($roster) ?> learners in <?= e($classMap[$classId] ?? 'this class') ?>.
                    Anything left as <em>not matched</em> is skipped, not guessed.
                </p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th class="text-left px-5 py-2.5 font-semibold">On the sheet</th>
                            <th class="text-left px-3 py-2.5 font-semibold">Learner in Tuta</th>
                            <th class="text-left px-3 py-2.5 font-semibold">Marks</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                    <?php foreach ($detected['pupils'] as $pi => $p):
                        $s = $picks[$pi]; $exact = !empty($s[0]['exact']);
                        $ids = array_column($s, 'id');
                        $got = count(array_filter($p['marks'], fn($m) => $m !== null)); ?>
                        <tr class="<?= $exact ? '' : 'bg-amber-50/40' ?>">
                            <td class="px-5 py-2">
                                <span class="font-medium text-gray-900"><?= e($p['name']) ?></span>
                                <?php if (!$exact): ?><span class="ml-2 text-[11px] text-amber-600">needs checking</span><?php endif; ?>
                            </td>
                            <td class="px-3 py-2">
                                <select name="match[<?= $pi ?>]" class="<?= $fieldCls ?> min-w-[13rem]">
                                    <option value="">— not matched, skip —</option>
                                    <?php foreach ($roster as $r):
                                        $full = trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? ''));
                                        $sel  = (!empty($ids) && $ids[0] === $r['id']) ? 'selected' : ''; ?>
                                        <option value="<?= e($r['id']) ?>" <?= $sel ?>>
                                            <?= e($full) ?><?= $r['admission_number'] ? ' · ' . e($r['admission_number']) : '' ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </td>
                            <td class="px-3 py-2 text-xs text-gray-500"><?= $got ?> of <?= count($detected['subjects']) ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            <div class="px-5 py-4 border-t border-gray-100 flex items-center gap-2">
                <button type="submit" class="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Import marks</button>
                <a href="<?= baseUrl('grades/import') ?>" class="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Start over</a>
                <span class="text-xs text-gray-400 ml-1">Nothing is written unless every mark passes its checks.</span>
            </div>
        </div>
    </form>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
