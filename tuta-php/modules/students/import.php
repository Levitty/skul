<?php
/**
 * Bulk-import students from a CSV — safe, three-step flow.
 *
 *   Step 1  upload   — pick a CSV file (built-in template available).
 *   Step 2  preview  — map the file's columns to Tuta fields, then see EVERY
 *                      row validated (errors, warnings, duplicates) BEFORE
 *                      anything is written.
 *   Step 3  result   — the confirmed rows are inserted in ONE atomic batch
 *                      via the import_students_batch RPC (migration 063).
 *
 * Nothing touches the database until the user clicks "Confirm import" on the
 * preview screen. This whole flow lives on the existing students/import route.
 */

/* ── CSV template download — must run before any HTML output ── */
if (($_GET['download'] ?? '') === 'template') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="tuta_students_template.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['first_name','last_name','middle_name','admission_number','gender','date_of_birth','class','student_type','admission_date','guardian_name','guardian_phone','phone','email','address','religion']);
    fputcsv($out, ['Mary','Wanjiku','Akinyi','','female','2015-04-12','Grade 1','day_scholar','2026-01-08','John Wanjiku','0712345678','','john@example.com','Eastleigh, Nairobi','Christian']);
    fputcsv($out, ['Brian','Otieno','','','male','2014-09-30','Grade 2','boarder','2026-01-08','Grace Otieno','0723456789','','','Westlands, Nairobi','']);
    fclose($out);
    exit;
}

$pageTitle = 'Import Students';
$sb  = new Supabase();
$sid = schoolId();
initSession();

$classes = cachedClasses();
$classLookup = [];                       // lower(class name) => class id
foreach ($classes as $c) {
    $classLookup[strtolower(trim($c['name']))] = $c['id'];
}
$currentYear    = cachedCurrentYear();
$academicYearId = $currentYear['id'] ?? null;

/* ── Fields the importer understands ───────────────────────────
 * key => [label, required?, [header aliases for auto-detection]]
 */
$IMPORT_FIELDS = [
    'first_name'       => ['First name',     true,  ['firstname','first','fname','given name','givenname','student first name','learner first name','names']],
    'last_name'        => ['Last name',      true,  ['lastname','last','surname','family name','lname','student last name','learner last name']],
    'middle_name'      => ['Middle name',    false, ['middlename','middle','other name','other names','othernames']],
    'class'            => ['Class',          false, ['classname','class name','grade','form','class/grade','current class','classroom','class/form','stream','grade/class']],
    'admission_number' => ['Admission no.',  false, ['admissionnumber','admission number','admission no','adm no','admno','adm','reg no','registration number','registration no','student id','studentid','index number','index no','upi']],
    'gender'           => ['Gender',         false, ['sex']],
    'date_of_birth'    => ['Date of birth',  false, ['dob','dateofbirth','date of birth','birth date','birthdate','d.o.b','d.o.b.','born']],
    'student_type'     => ['Student type',   false, ['type','boarding status','day/boarder','residence','boarder/day','accommodation','category']],
    'admission_date'   => ['Admission date', false, ['admissiondate','date of admission','date joined','join date','enrollment date','enrolment date','date admitted']],
    'guardian_name'    => ['Guardian name',  false, ['guardianname','guardian','parent name','parent','father name','mother name','contact name','next of kin','parent/guardian','parent name']],
    'guardian_phone'   => ['Guardian phone', false, ['guardianphone','guardian phone','parent phone','parent contact','contact','telephone','tel','parent mobile','guardian mobile','contact number','phone number','mobile number','msisdn','phone','mobile']],
    'phone'            => ['Student phone',  false, ['student phone','studentphone','student mobile','student contact']],
    'email'            => ['Email',          false, ['e-mail','emailaddress','email address','guardian email','parent email']],
    'address'          => ['Address',        false, ['home address','residence','residential address','physical address','location','estate']],
    'religion'         => ['Religion',       false, ['faith']],
];

/* ── Small helpers ─────────────────────────────────────────── */

/** Normalise a header/value for matching: strip BOM, lowercase, collapse spaces. */
function imp_norm(string $s): string {
    $s = preg_replace('/^\xEF\xBB\xBF/', '', $s);
    $s = strtolower(trim($s));
    return preg_replace('/\s+/', ' ', $s);
}

/** Guess which uploaded column belongs to each Tuta field. Each column is claimed once. */
function imp_auto_map(array $header, array $fields): array {
    $normHeader = array_map('imp_norm', $header);
    $map  = [];
    $used = [];
    foreach ($fields as $key => $def) {
        $candidates = array_map('imp_norm', array_merge(
            [$key, str_replace('_', ' ', $key), $def[0]], $def[2]
        ));
        $found = null;
        foreach ($normHeader as $idx => $h) {
            if ($h === '' || in_array($idx, $used, true)) continue;
            if (in_array($h, $candidates, true)) { $found = $idx; break; }
        }
        $map[$key] = $found;
        if ($found !== null) $used[] = $found;
    }
    return $map;
}

/** Read an uploaded CSV into [header, rows] — handles BOM, delimiter, Excel files. */
function imp_read_csv(string $path): array {
    $raw = @file_get_contents($path);
    if ($raw === false) return ['error' => 'Could not read the uploaded file.'];
    if (substr($raw, 0, 4) === "PK\x03\x04") {
        return ['error' => 'This looks like an Excel file. Open it, choose File → Save As, pick the "CSV" format, and upload that file instead.'];
    }
    $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);          // strip UTF-8 BOM
    if (trim($raw) === '') return ['error' => 'The file is empty.'];

    // Detect the delimiter from the first line (comma / semicolon / tab).
    $firstLine = strtok($raw, "\r\n");
    $counts = [
        ','  => substr_count($firstLine, ','),
        ';'  => substr_count($firstLine, ';'),
        "\t" => substr_count($firstLine, "\t"),
    ];
    arsort($counts);
    $delim = key($counts);
    if ($counts[$delim] === 0) $delim = ',';

    // Parse through a memory stream so quoted fields with newlines survive.
    $fh = fopen('php://temp', 'r+');
    fwrite($fh, $raw);
    rewind($fh);
    $rows = [];
    while (($r = fgetcsv($fh, 0, $delim)) !== false) {
        if (count($r) === 1 && trim((string)$r[0]) === '') continue;   // blank line
        $rows[] = $r;
    }
    fclose($fh);

    if (count($rows) < 1) return ['error' => 'The file has no readable rows.'];
    $header = array_map(fn($h) => trim((string)$h), array_shift($rows));
    if (count(array_filter($header, fn($h) => $h !== '')) === 0) {
        return ['error' => 'Could not read column headers from the first row.'];
    }
    return ['header' => $header, 'rows' => $rows];
}

/** Parse a date string into Y-m-d using the chosen field order, or null. */
function imp_parse_date(string $raw, string $fmt): ?string {
    $raw = trim($raw);
    if ($raw === '') return null;
    $parts = preg_split('#[/\-.\s]+#', $raw);
    if (count($parts) === 3 && ctype_digit(implode('', $parts))) {
        [$a, $b, $c] = $parts;
        if      ($fmt === 'ymd') { $y = $a; $m = $b; $d = $c; }
        elseif  ($fmt === 'mdy') { $m = $a; $d = $b; $y = $c; }
        else                     { $d = $a; $m = $b; $y = $c; }   // dmy (default)
        if (strlen($y) === 2) $y = ((int)$y > 50 ? '19' : '20') . $y;
        $y = (int)$y; $m = (int)$m; $d = (int)$d;
        if (checkdate($m, $d, $y) && $y >= 1900 && $y <= (int)date('Y')) {
            return sprintf('%04d-%02d-%02d', $y, $m, $d);
        }
        return null;
    }
    $ts = strtotime($raw);                                   // "12 Jan 2015" etc.
    if ($ts !== false) {
        $y = (int)date('Y', $ts);
        if ($y >= 1900 && $y <= (int)date('Y')) return date('Y-m-d', $ts);
    }
    return null;
}

/** Last 9 digits of a phone — makes 0712.., +254712.. and 254712.. all match. */
function imp_norm_phone(string $raw): string {
    $digits = preg_replace('/\D+/', '', $raw);
    return $digits === '' ? '' : substr($digits, -9);
}

/** Normalise gender. Returns 'male'/'female', '' for blank, or false for unrecognised. */
function imp_norm_gender(string $raw) {
    $g = strtolower(trim($raw));
    if ($g === '') return '';
    if (in_array($g, ['m','male','boy','b','man'], true))    return 'male';
    if (in_array($g, ['f','female','girl','g','woman'], true)) return 'female';
    return false;
}

/** Normalise student type to 'boarder' or 'day_scholar'. */
function imp_norm_type(string $raw): string {
    $t = strtolower(trim($raw));
    return (strpos($t, 'board') !== false) ? 'boarder' : 'day_scholar';
}

/**
 * Validate every CSV row against the chosen mapping. No database writes here.
 * Returns a list of ['n','status','msgs','student','class_raw','class_label'].
 * status: ready | warning (both import) · error | duplicate (both skipped).
 */
function imp_process(array $rows, array $mapping, string $dateFmt, array $classLookup, array $existingByAdm): array {
    $out     = [];
    $seenAdm = [];        // admission numbers already seen in this file
    $rowNum  = 1;         // header counted as row 1
    foreach ($rows as $r) {
        $rowNum++;
        $get = function (string $field) use ($mapping, $r) {
            $idx = $mapping[$field] ?? null;
            if ($idx === null || $idx === '') return '';
            return trim((string)($r[$idx] ?? ''));
        };

        $first = $get('first_name');
        $last  = $get('last_name');
        if ($first === '' && $last === '') continue;     // wholly blank row — skip

        $msgs   = [];
        $status = 'ready';

        if ($first === '') { $msgs[] = 'Missing first name'; $status = 'error'; }
        if ($last  === '') { $msgs[] = 'Missing last name';  $status = 'error'; }

        // Class — unmatched names still import (without a class), but are flagged.
        $classRaw   = $get('class');
        $classId    = '';
        $classLabel = '';
        if ($classRaw !== '') {
            $classId = $classLookup[strtolower(trim($classRaw))] ?? '';
            if ($classId === '') {
                $msgs[] = 'Class "' . $classRaw . '" not found — will import without a class';
                if ($status !== 'error') $status = 'warning';
            } else {
                $classLabel = $classRaw;
            }
        }

        // Gender.
        $genderRaw = $get('gender');
        $gender    = imp_norm_gender($genderRaw);
        if ($gender === false) {
            $msgs[] = 'Gender "' . $genderRaw . '" not recognised — left blank';
            if ($status !== 'error') $status = 'warning';
            $gender = '';
        }

        // Date of birth.
        $dobRaw = $get('date_of_birth');
        $dob    = '';
        if ($dobRaw !== '') {
            $parsed = imp_parse_date($dobRaw, $dateFmt);
            if ($parsed === null) {
                $msgs[] = 'Date of birth "' . $dobRaw . '" could not be read — left blank';
                if ($status !== 'error') $status = 'warning';
            } else {
                $dob = $parsed;
            }
        }

        // Admission date (no warning if unreadable — it just defaults to today).
        $admDate    = '';
        $admDateRaw = $get('admission_date');
        if ($admDateRaw !== '') {
            $parsed = imp_parse_date($admDateRaw, $dateFmt);
            if ($parsed !== null) $admDate = $parsed;
        }

        // Admission number — duplicates within the file or against existing students.
        $adm = $get('admission_number');
        if ($adm !== '') {
            $admKey = strtolower($adm);
            if (isset($seenAdm[$admKey])) {
                $msgs[]  = 'Admission number "' . $adm . '" is repeated in this file (also row ' . $seenAdm[$admKey] . ')';
                $status  = 'error';
            } elseif (isset($existingByAdm[$admKey])) {
                $msgs[] = 'Admission number "' . $adm . '" already belongs to ' . $existingByAdm[$admKey];
                if ($status !== 'error') $status = 'duplicate';
            }
            $seenAdm[$admKey] = $rowNum;
        }

        $out[] = [
            'n'           => $rowNum,
            'status'      => $status,
            'msgs'        => $msgs,
            'class_raw'   => $classRaw,
            'class_label' => $classLabel,
            'student'     => [
                'first_name'       => $first,
                'last_name'        => $last,
                'middle_name'      => $get('middle_name'),
                'admission_number' => $adm,
                'gender'           => $gender,
                'dob'              => $dob,
                'current_class_id' => $classId,
                'student_type'     => imp_norm_type($get('student_type')),
                'admission_date'   => $admDate,
                'guardian_name'    => $get('guardian_name'),
                'guardian_phone'   => $get('guardian_phone'),
                'phone'            => $get('phone'),
                'email'            => $get('email'),
                'address'          => $get('address'),
                'religion'         => $get('religion'),
                'roll_number'      => '',
                'family_id'        => '',
            ],
        ];
    }
    return $out;
}

/* ── State machine ─────────────────────────────────────────── */

$view          = 'upload';     // upload | preview | result
$error         = '';           // upload-stage error
$importError   = '';           // RPC / confirm error
$rawHeader     = [];
$rawRows       = [];
$mapping       = [];
$dateFmt       = 'dmy';
$groupFamilies = true;
$processed     = [];
$importedCount = 0;
$familiesLinked = 0;

if (isPost() && verifyCsrf()) {
    $step = $_POST['step'] ?? '';

    if ($step === 'upload') {
        if (!isset($_FILES['csv_file']) || $_FILES['csv_file']['error'] !== UPLOAD_ERR_OK) {
            $error = 'File upload failed. Please choose a CSV file and try again.';
        } else {
            $parsed = imp_read_csv($_FILES['csv_file']['tmp_name']);
            if (isset($parsed['error'])) {
                $error = $parsed['error'];
            } elseif (count($parsed['rows']) === 0) {
                $error = 'The file has a header row but no student rows.';
            } elseif (count($parsed['rows']) > 1500) {
                $error = 'This file has ' . count($parsed['rows']) . ' rows. Please split it into files of 1500 rows or fewer and import them one at a time.';
            } else {
                $_SESSION['stu_import'] = [
                    'header' => $parsed['header'],
                    'rows'   => $parsed['rows'],
                    'file'   => $_FILES['csv_file']['name'] ?? 'upload.csv',
                    'ts'     => time(),
                ];
                $rawHeader = $parsed['header'];
                $rawRows   = $parsed['rows'];
                $mapping   = imp_auto_map($rawHeader, $IMPORT_FIELDS);
                $view      = 'preview';
            }
        }
    } elseif ($step === 'preview' || $step === 'confirm') {
        if (empty($_SESSION['stu_import'])) {
            $error = 'Your upload expired. Please upload the file again.';
        } else {
            $rawHeader = $_SESSION['stu_import']['header'];
            $rawRows   = $_SESSION['stu_import']['rows'];
            foreach ($IMPORT_FIELDS as $key => $_def) {
                $v = $_POST['map'][$key] ?? '';
                $mapping[$key] = ($v === '' ? null : (int)$v);
            }
            $dateFmt       = in_array($_POST['date_fmt'] ?? '', ['dmy','mdy','ymd'], true) ? $_POST['date_fmt'] : 'dmy';
            $groupFamilies = !empty($_POST['group_families']);
            $view          = 'preview';
        }
    }
}

/* ── Build preview / run import ─────────────────────────────── */

$cReady = $cWarn = $cErr = $cDup = 0;
$unmatchedClasses = [];

if ($view === 'preview' && !empty($rawHeader)) {
    // One batched read of existing students — powers duplicate detection,
    // roll-number numbering and family reuse. No per-row queries.
    $existingByAdm         = [];
    $classCount            = [];
    $existingFamilyByPhone = [];
    $existing = Supabase::fetchAllPaged(
        fn($q) => $q->from('students')
            ->select('id,first_name,last_name,admission_number,current_class_id,guardian_phone,family_id,status')
            ->eq('school_id', $sid)
    );
    foreach ($existing as $s) {
        if (!empty($s['admission_number'])) {
            $existingByAdm[strtolower($s['admission_number'])] =
                trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''));
        }
        if (!empty($s['current_class_id']) && ($s['status'] ?? '') === 'active') {
            $classCount[$s['current_class_id']] = ($classCount[$s['current_class_id']] ?? 0) + 1;
        }
        if (!empty($s['guardian_phone']) && !empty($s['family_id'])) {
            $k = imp_norm_phone($s['guardian_phone']);
            if ($k !== '' && !isset($existingFamilyByPhone[$k])) {
                $existingFamilyByPhone[$k] = $s['family_id'];
            }
        }
    }

    $processed = imp_process($rawRows, $mapping, $dateFmt, $classLookup, $existingByAdm);

    foreach ($processed as $p) {
        if     ($p['status'] === 'ready')     $cReady++;
        elseif ($p['status'] === 'warning')   $cWarn++;
        elseif ($p['status'] === 'duplicate') $cDup++;
        else                                  $cErr++;
        if ($p['class_raw'] !== '' && $p['student']['current_class_id'] === '') {
            $unmatchedClasses[strtolower($p['class_raw'])] = $p['class_raw'];
        }
    }
    $importableCount = $cReady + $cWarn;

    // ── Confirm: assign roll numbers, group families, insert atomically ──
    if (($_POST['step'] ?? '') === 'confirm') {
        if ($importableCount === 0) {
            $importError = 'There are no valid rows to import. Fix the file and re-check.';
        } else {
            // Roll numbers — sequential within each class, continuing from existing.
            $rollCounter = $classCount;
            foreach ($processed as &$p) {
                if (!in_array($p['status'], ['ready','warning'], true)) continue;
                $cid = $p['student']['current_class_id'];
                if ($cid === '') continue;
                $rollCounter[$cid] = ($rollCounter[$cid] ?? 0) + 1;
                $p['student']['roll_number'] = (string)$rollCounter[$cid];
            }
            unset($p);

            // Family grouping — students sharing a guardian phone become siblings.
            if ($groupFamilies) {
                $phoneGroups = [];
                foreach ($processed as $i => $p) {
                    if (!in_array($p['status'], ['ready','warning'], true)) continue;
                    $ph = imp_norm_phone($p['student']['guardian_phone']);
                    if ($ph !== '') $phoneGroups[$ph][] = $i;
                }
                foreach ($phoneGroups as $ph => $idxs) {
                    $existingFam = $existingFamilyByPhone[$ph] ?? '';
                    if (count($idxs) >= 2 || $existingFam !== '') {
                        $famId = $existingFam !== '' ? $existingFam
                               : 'FAM-' . strtoupper(bin2hex(random_bytes(3)));
                        foreach ($idxs as $i) $processed[$i]['student']['family_id'] = $famId;
                        $familiesLinked++;
                    }
                }
            }

            // Build the payload and insert in one atomic RPC call.
            $payload = [];
            foreach ($processed as $p) {
                if (in_array($p['status'], ['ready','warning'], true)) {
                    $payload[] = $p['student'];
                }
            }
            $res = $sb->rpc('import_students_batch', [
                'p_school_id'        => $sid,
                'p_academic_year_id' => $academicYearId,
                'p_students'         => $payload,
            ]);
            if (!empty($res['error'])) {
                $importError = 'Import failed — nothing was saved. ' . $res['error'];
            } else {
                $importedCount = (int)($res['data']['imported'] ?? count($payload));
                auditLog('bulk_import', 'student', null, [
                    'imported'  => $importedCount,
                    'skipped'   => $cErr + $cDup,
                    'file'      => $_SESSION['stu_import']['file'] ?? '',
                ]);
                unset($_SESSION['stu_import']);
                $view = 'result';
            }
        }
    }
}

$importableCount = $importableCount ?? 0;

$badge = [
    'ready'     => ['Ready',     'bg-emerald-50 text-emerald-700 border-emerald-200'],
    'warning'   => ['Warning',   'bg-amber-50 text-amber-700 border-amber-200'],
    'error'     => ['Error',     'bg-red-50 text-red-700 border-red-200'],
    'duplicate' => ['Duplicate', 'bg-gray-100 text-gray-600 border-gray-300'],
];

// Separator-safe template download URL.
$templateUrl = baseUrl('students/import');
$templateUrl .= (strpos($templateUrl, '?') !== false ? '&' : '?') . 'download=template';

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <a href="<?= baseUrl('students') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to Students</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">Import Students from CSV</h1>
</div>

<?php if ($error): ?>
    <div class="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"><?= e($error) ?></div>
<?php endif; ?>

<?php if ($view === 'upload'): ?>
<!-- ════════════════ STEP 1 — UPLOAD ════════════════ -->
<div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-2xl">
    <div class="flex items-center gap-2 mb-4 text-xs text-gray-400 font-medium">
        <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">1. Upload</span>
        <span>&rarr;</span><span>2. Check &amp; map</span>
        <span>&rarr;</span><span>3. Confirm</span>
    </div>

    <div class="mb-5 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
        <p class="font-medium mb-1">Coming from another school system?</p>
        <p>Export your students as a <strong>CSV file</strong> — the column names don't need to match ours.
           You'll line them up on the next screen, and review every row before anything is saved.</p>
        <a href="<?= e($templateUrl) ?>" class="inline-flex items-center gap-1 mt-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Download a blank template
        </a>
    </div>

    <form method="POST" enctype="multipart/form-data">
        <?= csrfField() ?>
        <input type="hidden" name="step" value="upload">
        <label class="block text-sm font-medium text-gray-700 mb-1">CSV file</label>
        <input type="file" name="csv_file" accept=".csv,text/csv" required
            class="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100">
        <p class="text-xs text-gray-400 mt-2">Up to 1,500 students per file. If your file is in Excel, save it as CSV first.</p>
        <button type="submit" class="mt-4 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
            Upload &amp; continue
        </button>
    </form>
</div>

<?php elseif ($view === 'preview'): ?>
<!-- ════════════════ STEP 2 — MAP & PREVIEW ════════════════ -->
<?php
    $reqUnmapped = [];
    foreach ($IMPORT_FIELDS as $k => $d) {
        if ($d[1] && ($mapping[$k] ?? null) === null) $reqUnmapped[] = $d[0];
    }
?>
<div class="flex items-center gap-2 mb-4 text-xs text-gray-400 font-medium">
    <span>1. Upload</span><span>&rarr;</span>
    <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">2. Check &amp; map</span>
    <span>&rarr;</span><span>3. Confirm</span>
</div>

<?php if ($importError): ?>
    <div class="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
        <p class="font-medium"><?= e($importError) ?></p>
        <p class="mt-1 text-xs opacity-80">No students were imported. Adjust the file or mapping and try again.</p>
    </div>
<?php endif; ?>

<form method="POST">
    <?= csrfField() ?>

    <!-- Column mapping -->
    <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4">
        <h3 class="text-base font-semibold text-gray-800">Match your columns</h3>
        <p class="text-sm text-gray-500 mt-0.5 mb-4">
            We've guessed these from <span class="font-medium text-gray-700"><?= e($_SESSION['stu_import']['file'] ?? 'your file') ?></span>.
            Fix any that look wrong, then click <em>Re-check preview</em>.
        </p>
        <?php if ($reqUnmapped): ?>
            <div class="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                Required field<?= count($reqUnmapped) > 1 ? 's' : '' ?> not matched to a column: <strong><?= e(implode(', ', $reqUnmapped)) ?></strong>. Pick the right column below.
            </div>
        <?php endif; ?>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <?php foreach ($IMPORT_FIELDS as $key => $def): ?>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">
                        <?= e($def[0]) ?><?php if ($def[1]): ?> <span class="text-red-500">*</span><?php endif; ?>
                    </label>
                    <select name="map[<?= $key ?>]" class="w-full px-2 py-1.5 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-xs bg-white">
                        <option value="">— not in my file —</option>
                        <?php foreach ($rawHeader as $idx => $col): ?>
                            <option value="<?= $idx ?>"<?= selectedIf((string)($mapping[$key] ?? ''), (string)$idx) ?>>
                                <?= e($col !== '' ? $col : 'Column ' . ($idx + 1)) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            <?php endforeach; ?>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 pt-4 border-t border-gray-100">
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Date format in your file</label>
                <select name="date_fmt" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white">
                    <option value="dmy"<?= selectedIf($dateFmt, 'dmy') ?>>Day / Month / Year (e.g. 25/12/2015)</option>
                    <option value="mdy"<?= selectedIf($dateFmt, 'mdy') ?>>Month / Day / Year (e.g. 12/25/2015)</option>
                    <option value="ymd"<?= selectedIf($dateFmt, 'ymd') ?>>Year - Month - Day (e.g. 2015-12-25)</option>
                </select>
                <p class="text-[11px] text-gray-400 mt-1">Check the Date of birth column in the preview to confirm it read correctly.</p>
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Siblings</label>
                <label class="flex items-start gap-2 cursor-pointer mt-1.5">
                    <input type="checkbox" name="group_families" value="1"<?= checkedIf($groupFamilies) ?>
                           class="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-xs text-gray-600">Group students sharing the same guardian phone into one family (for combined billing).</span>
                </label>
            </div>
        </div>
    </div>

    <!-- Summary -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span class="font-semibold text-gray-800"><?= count($processed) ?> rows read</span>
            <span class="text-emerald-700"><span class="font-bold"><?= $cReady ?></span> ready</span>
            <span class="text-amber-700"><span class="font-bold"><?= $cWarn ?></span> with warnings</span>
            <span class="text-red-600"><span class="font-bold"><?= $cErr ?></span> errors</span>
            <span class="text-gray-500"><span class="font-bold"><?= $cDup ?></span> duplicates</span>
        </div>
        <p class="text-xs text-gray-500 mt-2">
            <strong><?= $importableCount ?></strong> student<?= $importableCount === 1 ? '' : 's' ?> will be imported
            (ready + warnings). Errors and duplicates are skipped — nothing is saved until you confirm.
        </p>
        <?php if ($unmatchedClasses): ?>
            <div class="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                These class names didn't match any class: <strong><?= e(implode(', ', $unmatchedClasses)) ?></strong>.
                Create them in <a href="<?= baseUrl('classes') ?>" target="_blank" class="underline font-medium">Classes</a> then re-check, or import now and assign classes later.
            </div>
        <?php endif; ?>
    </div>

    <!-- Action buttons -->
    <div class="flex flex-wrap gap-3 mb-4">
        <button type="submit" name="step" value="preview"
                class="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            Re-check preview
        </button>
        <button type="submit" name="step" value="confirm"
                onclick="return confirm('Import <?= $importableCount ?> student(s) now? This cannot be undone in bulk.');"
                <?= $importableCount === 0 ? 'disabled' : '' ?>
                class="px-5 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition <?= $importableCount === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700' ?>">
            Confirm import (<?= $importableCount ?>)
        </button>
        <a href="<?= baseUrl('students/import') ?>" class="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            Upload a different file
        </a>
    </div>
</form>

<!-- Preview table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto">
    <table class="w-full text-sm whitespace-nowrap">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100 text-left">
                <th class="px-3 py-2.5 font-semibold text-gray-600">Row</th>
                <th class="px-3 py-2.5 font-semibold text-gray-600">Status</th>
                <th class="px-3 py-2.5 font-semibold text-gray-600">First name</th>
                <th class="px-3 py-2.5 font-semibold text-gray-600">Last name</th>
                <th class="px-3 py-2.5 font-semibold text-gray-600">Class</th>
                <th class="px-3 py-2.5 font-semibold text-gray-600">Adm no.</th>
                <th class="px-3 py-2.5 font-semibold text-gray-600">Gender</th>
                <th class="px-3 py-2.5 font-semibold text-gray-600">Date of birth</th>
                <th class="px-3 py-2.5 font-semibold text-gray-600">Guardian</th>
                <th class="px-3 py-2.5 font-semibold text-gray-600">Notes</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($processed)): ?>
                <tr><td colspan="10" class="px-3 py-10 text-center text-gray-400">No student rows found. Check the column mapping above.</td></tr>
            <?php else: ?>
                <?php foreach (array_slice($processed, 0, 100) as $p): $s = $p['student']; $b = $badge[$p['status']]; ?>
                    <tr class="<?= in_array($p['status'], ['error','duplicate'], true) ? 'bg-red-50/30' : '' ?>">
                        <td class="px-3 py-2 text-gray-400"><?= $p['n'] ?></td>
                        <td class="px-3 py-2"><span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border <?= $b[1] ?>"><?= $b[0] ?></span></td>
                        <td class="px-3 py-2 text-gray-800"><?= e($s['first_name']) ?: '<span class="text-red-400">—</span>' ?></td>
                        <td class="px-3 py-2 text-gray-800"><?= e($s['last_name']) ?: '<span class="text-red-400">—</span>' ?></td>
                        <td class="px-3 py-2">
                            <?php if ($s['current_class_id'] !== ''): ?>
                                <span class="text-gray-700"><?= e($p['class_label']) ?></span>
                            <?php elseif ($p['class_raw'] !== ''): ?>
                                <span class="text-amber-600"><?= e($p['class_raw']) ?> ?</span>
                            <?php else: ?>
                                <span class="text-gray-300">—</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-3 py-2 text-gray-500"><?= e($s['admission_number']) ?: '<span class="text-gray-300">auto</span>' ?></td>
                        <td class="px-3 py-2 text-gray-600"><?= e(ucfirst($s['gender'])) ?: '<span class="text-gray-300">—</span>' ?></td>
                        <td class="px-3 py-2 text-gray-600"><?= e($s['dob']) ?: '<span class="text-gray-300">—</span>' ?></td>
                        <td class="px-3 py-2 text-gray-600"><?= e(trim($s['guardian_name'] . ' ' . $s['guardian_phone'])) ?: '<span class="text-gray-300">—</span>' ?></td>
                        <td class="px-3 py-2 text-xs <?= $p['msgs'] ? 'text-amber-700' : 'text-gray-300' ?>"><?= e($p['msgs'] ? implode('; ', $p['msgs']) : '—') ?></td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
    <?php if (count($processed) > 100): ?>
        <p class="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-50">Showing the first 100 of <?= count($processed) ?> rows. All <?= count($processed) ?> will be processed on import.</p>
    <?php endif; ?>
</div>

<?php elseif ($view === 'result'): ?>
<!-- ════════════════ STEP 3 — RESULT ════════════════ -->
<?php $skipped = array_filter($processed, fn($p) => in_array($p['status'], ['error','duplicate'], true)); ?>
<div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-2xl">
    <div class="flex items-center gap-3 mb-2">
        <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        </div>
        <div>
            <h2 class="text-lg font-bold text-gray-900"><?= $importedCount ?> student<?= $importedCount === 1 ? '' : 's' ?> imported</h2>
            <p class="text-sm text-gray-500">
                <?php if ($familiesLinked > 0): ?><?= $familiesLinked ?> sibling group<?= $familiesLinked === 1 ? '' : 's' ?> linked. <?php endif; ?>
                <?= count($skipped) ?> row<?= count($skipped) === 1 ? '' : 's' ?> skipped.
            </p>
        </div>
    </div>
    <p class="text-sm text-gray-600 mt-3">
        Students were added to the current academic year<?= $currentYear ? ' (' . e($currentYear['name']) . ')' : '' ?>.
        To bill them, go to <a href="<?= baseUrl('fees/invoices/generate') ?>" class="text-emerald-600 hover:underline font-medium">Fees → Bulk Generate</a>.
    </p>
    <div class="flex gap-3 mt-5">
        <a href="<?= baseUrl('students') ?>" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">View Students</a>
        <a href="<?= baseUrl('students/import') ?>" class="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Import another file</a>
    </div>
</div>

<?php if (!empty($skipped)): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mt-4 overflow-x-auto max-w-2xl">
    <p class="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100">Skipped rows (<?= count($skipped) ?>)</p>
    <table class="w-full text-sm">
        <tbody class="divide-y divide-gray-50">
            <?php foreach ($skipped as $p): ?>
                <tr>
                    <td class="px-4 py-2 text-gray-400 w-14">Row <?= $p['n'] ?></td>
                    <td class="px-4 py-2 text-gray-800"><?= e(trim($p['student']['first_name'] . ' ' . $p['student']['last_name'])) ?: '—' ?></td>
                    <td class="px-4 py-2 text-xs text-red-600"><?= e(implode('; ', $p['msgs'])) ?></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>
<?php endif; ?>

<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
