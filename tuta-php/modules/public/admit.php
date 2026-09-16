<?php
/**
 * Public Digital Admission — front-facing, no login. Reached via QR / link:
 *   ?route=admit&school=<school_id>
 *
 * Five steps on one form, one screen each (parents fill this on phones):
 *   1 Rules & photo consent · 2 Student · 3 Parents · 4 Emergency & medical · 5 Declare
 * The whole thing posts once; every step is validated again on the server.
 * It lands in the staff admissions queue for review; admit_applicant (mig. 124)
 * carries all of it onto the learner.
 *
 * Which identity numbers are asked is the school's choice (Admissions →
 * "What to ask for"): Grade 6 assessment number, birth certificate number,
 * NEMIS/UPI.
 *
 * Built for the front-office iPad too: on success it offers "Start another
 * admission" to reset for the next family.
 */
require_once __DIR__ . '/../../includes/public-forms.php';

$sb     = new Supabase();
$school = publicResolveSchool($sb);

$error = '';
$success = false;

$rulesText    = $school ? (string)publicSchoolSetting($sb, $school['id'], 'admission_rules', '') : '';
$rulesVersion = $school ? (int)publicSchoolSetting($sb, $school['id'], 'admission_rules_version', '1') : 1;
$rulesFile    = $school ? (string)publicSchoolSetting($sb, $school['id'], 'admission_rules_file', '') : '';

// A Word document can't be shown inline by a browser, so its text is read
// out once (cached against the file URL) and shown in the same box a typed
// rules text uses. PDFs and images embed directly below.
$rulesDocText = '';
if ($school && $rulesFile !== '' && preg_match('/\.docx?(\?|$)/i', $rulesFile)) {
    if ((string)publicSchoolSetting($sb, $school['id'], 'admission_rules_file_text_for', '') === $rulesFile) {
        $rulesDocText = (string)publicSchoolSetting($sb, $school['id'], 'admission_rules_file_text', '');
    } else {
        require_once __DIR__ . '/../../includes/docx.php';
        $rulesDocText = docxExtractText($rulesFile);
        if ($rulesDocText !== '') {
            foreach (['admission_rules_file_text' => $rulesDocText, 'admission_rules_file_text_for' => $rulesFile] as $k => $v) {
                $ex = $sb->from('school_settings')->select('id')->eq('school_id', $school['id'])->eq('key', $k)->single()->execute()['data'][0]['id'] ?? null;
                if ($ex) $sb->from('school_settings')->eq('id', $ex)->update(['value' => $v]);
                else     $sb->from('school_settings')->insert(['school_id' => $school['id'], 'key' => $k, 'value' => $v]);
            }
        }
    }
}
$turnstileSiteKey = $school ? publicSchoolSetting($sb, $school['id'], 'turnstile_site_key', '') : '';
$askAssessment = $school ? publicSchoolSetting($sb, $school['id'], 'admit_ask_assessment_no', 'false') === 'true' : false;
$askBirthCert  = $school ? publicSchoolSetting($sb, $school['id'], 'admit_ask_birth_cert', 'true')    === 'true' : true;
$askNemis      = $school ? publicSchoolSetting($sb, $school['id'], 'admit_ask_nemis', 'true')         === 'true' : true;

$clip = fn($s, $n) => mb_substr(trim((string)$s), 0, $n);
$parentKinds = ['father' => 'Father', 'mother' => 'Mother', 'guardian' => 'Guardian'];
$conditions  = ['asthma' => 'Asthma', 'diabetes' => 'Diabetes', 'hearing' => 'Hearing impairment', 'visual' => 'Visual impairment'];
$severities  = ['none' => 'No', 'mild' => 'Mild', 'moderate' => 'Moderate', 'severe' => 'Severe'];

/** Read the parent blocks as posted: parent[father][name] … */
$readParents = function () use ($parentKinds, $clip): array {
    $raw = $_POST['parent'] ?? [];
    $primary = (string)($_POST['primary_parent'] ?? '');
    $out = [];
    foreach ($parentKinds as $k => $label) {
        $p = is_array($raw[$k] ?? null) ? $raw[$k] : [];
        $name = $clip($p['name'] ?? '', 120);
        if ($name === '') continue;
        $out[] = [
            'relation'   => $label,
            'name'       => $name,
            'id_number'  => $clip($p['id_number'] ?? '', 40),
            'phone'      => $clip($p['phone'] ?? '', 30),
            'email'      => $clip($p['email'] ?? '', 160),
            'occupation' => $clip($p['occupation'] ?? '', 120),
            'address'    => $clip($p['address'] ?? '', 200),
            'is_primary' => ($primary === $k),
        ];
    }
    if ($out && !array_filter($out, fn($p) => $p['is_primary'])) $out[0]['is_primary'] = true;
    return $out;
};

if ($school && isPost()) {
    if (!verifyCsrf()) {
        $error = 'Your session expired. Please refresh and try again.';
    } elseif (publicIsBot((string)input('website'), input('form_ts'))) {
        $success = true; // bot → silent no-op
    } elseif ($turnstileSiteKey && !publicTurnstilePass($sb, $school['id'], (string)($_POST['cf-turnstile-response'] ?? ''))) {
        $error = 'Could not verify you are human. Please try again.';
    } else {
        $first = $clip(input('first_name'), 80);
        $last  = $clip(input('last_name'), 80);
        $grade = $clip(input('grade_applying'), 60);
        $cName = $clip(input('consent_name'), 120);
        $accept= input('consent_accept') ? true : false;
        $media = (string)input('media_consent');
        $parents = $readParents();
        $primary = null;
        foreach ($parents as $p) if ($p['is_primary']) { $primary = $p; break; }
        $second = null;
        foreach ($parents as $p) if (!$p['is_primary']) { $second = $p; break; }

        $emerg = [];
        foreach ([1, 2] as $n) {
            $en = $clip($_POST['emergency'][$n]['name'] ?? '', 120);
            $ep = $clip($_POST['emergency'][$n]['phone'] ?? '', 30);
            if ($en !== '' || $ep !== '') {
                $emerg[] = ['name' => $en, 'relationship' => $clip($_POST['emergency'][$n]['relationship'] ?? '', 60), 'phone' => $ep];
            }
        }

        $conds = [];
        foreach ($conditions as $ck => $_l) {
            $v = (string)($_POST['cond'][$ck] ?? 'none');
            $conds[$ck] = isset($severities[$v]) ? $v : 'none';
        }
        $yn = fn($k) => in_array((string)input($k), ['yes', 'no'], true) ? ((string)input($k) === 'yes') : null;
        $medical = [
            'conditions'         => $conds,
            'other'              => $clip(input('cond_other'), 200),
            'needs_treatment'    => $yn('needs_treatment'),
            'treatment_details'  => $clip(input('treatment_details'), 600),
            'regular_medication' => $yn('regular_medication'),
            'medication_details' => $clip(input('medication_details'), 600),
            'may_administer'     => $yn('may_administer'),
        ];

        $ipBucket = 'admit:ip:' . clientIpAddr();
        if (!in_array($media, ['none', 'internal', 'public'], true)) {
            $error = 'Please choose a photo & media option.';
        } elseif ($first === '' || $last === '') {
            $error = "Please enter the student's first and last name.";
        } elseif ($grade === '') {
            $error = 'Please select the grade/class being applied for.';
        } elseif (!$primary || $primary['phone'] === '') {
            $error = 'Please give at least one parent or guardian with a name and phone number.';
        } elseif (array_filter($emerg, fn($c) => $c['name'] === '' || $c['phone'] === '')) {
            $error = 'Each emergency contact needs both a name and a phone number.';
        } elseif ($medical['may_administer'] === null) {
            $error = 'Please answer whether the school may administer medication in an emergency.';
        } elseif (!$accept) {
            $error = 'Please tick the declaration to continue.';
        } elseif ($cName === '') {
            $error = 'Please type your full name to sign the declaration.';
        } elseif (rateCount($ipBucket, 3600) >= 25) {
            $error = 'Too many submissions from this connection. Please try again later.';
        } else {
            $sb->from('admissions')->insert([
                'school_id'             => $school['id'],
                'status'                => 'pending',
                'first_name'            => $first,
                'last_name'             => $last,
                'middle_name'           => $clip(input('middle_name'), 80) ?: null,
                'gender'                => input('gender') ?: null,
                'dob'                   => input('dob') ?: null,
                'address'               => $clip(input('address'), 200) ?: null,
                'phone'                 => $clip(input('phone'), 30) ?: null,
                'nationality'           => $clip(input('nationality'), 60) ?: null,
                'religion'              => $clip(input('religion'), 60) ?: null,
                'assessment_number'     => $askAssessment ? ($clip(input('assessment_number'), 40) ?: null) : null,
                'birth_cert_number'     => $askBirthCert  ? ($clip(input('birth_cert_number'), 40) ?: null) : null,
                'nemis_upi'             => $askNemis      ? ($clip(input('nemis_upi'), 40) ?: null) : null,
                'grade_applying'        => $grade,
                'previous_school'       => $clip(input('previous_school'), 160) ?: null,
                // Flat guardian columns kept for the review queue and older code paths.
                'guardian_name'         => $primary['name'],
                'guardian_phone'        => $primary['phone'],
                'guardian_email'        => $primary['email'] ?: null,
                'guardian_id'           => $primary['id_number'] ?: null,
                'guardian_relationship' => $primary['relation'],
                'guardian_name_2'       => $second['name'] ?? null,
                'guardian_phone_2'      => ($second['phone'] ?? '') ?: null,
                'guardian_relation_2'   => $second['relation'] ?? null,
                'parents'               => $parents,
                'emergency_contacts'    => $emerg,
                'medical'               => $medical,
                'consent_accepted'      => true,
                'consent_name'          => $cName,
                'consent_at'            => date('c'),
                'rules_version'         => $rulesVersion,
                'media_consent'         => $media,
                'source_ip'             => publicClientIp() ?: null,
            ]);
            rateRecord($ipBucket);
            $success = true;
        }
    }
}

$fieldCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm';
$lblCls   = 'block text-sm font-medium text-gray-700 mb-1';
$pv = fn(array $k) => e((string)($_POST['parent'][$k[0]][$k[1]] ?? ''));
$steps = ['Rules', 'Student', 'Parents', 'Emergency & medical', 'Declare'];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admission — <?= e($school['name'] ?? 'School') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link rel="stylesheet" href="/assets/tuta-extra.css?v=1">
    <?php if ($turnstileSiteKey): ?><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script><?php endif; ?>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body{font-family:'Inter',system-ui,sans-serif}
        .step{display:none}.step.on{display:block}
        .prog{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
        .prog span{height:4px;border-radius:2px;background:#e5e7eb}.prog span.done{background:#10b981}.prog span.cur{background:#059669}
        .sev{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(4,minmax(0,1fr));gap:4px;align-items:center}
        .sev label{display:flex;align-items:center;justify-content:center;gap:4px;font-size:12px;color:#374151;border:1px solid #e5e7eb;border-radius:8px;padding:6px 2px;cursor:pointer}
        .sev label:has(input:checked){border-color:#10b981;background:#ecfdf5;color:#065f46;font-weight:600}
        .sev input{display:none}
        .yn{display:inline-flex;border:1px solid #e5e7eb;border-radius:8px;padding:2px}
        .yn label{padding:6px 14px;border-radius:6px;font-size:13px;color:#374151;cursor:pointer}
        .yn label:has(input:checked){background:#059669;color:#fff;font-weight:600}
        .yn input{display:none}
    </style>
</head>
<body class="bg-gradient-to-br from-emerald-50 via-white to-teal-50 min-h-screen p-4">
<div class="w-full max-w-2xl mx-auto py-6">

    <?php if (!$school): ?>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <h1 class="text-lg font-bold text-gray-900 mb-2">Admission link not valid</h1>
            <p class="text-sm text-gray-500">This link is missing or incorrect. Please use the QR code or link provided by the school.</p>
        </div>

    <?php elseif ($success): ?>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <h1 class="text-lg font-bold text-gray-900 mb-2">Admission submitted</h1>
            <p class="text-sm text-gray-600">Thank you. <strong><?= e($school['name']) ?></strong> has received the details and will be in touch.</p>
            <a href="<?= baseUrl('admit') ?>?school=<?= e($school['id']) ?>" class="mt-6 inline-block px-6 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Start another admission</a>
        </div>

    <?php else: ?>
        <div class="text-center mb-5">
            <?php if (!empty($school['logo_url'])): ?>
                <img src="<?= e($school['logo_url']) ?>" alt="<?= e($school['name']) ?>" class="w-14 h-14 rounded-2xl object-contain border border-gray-100 bg-white mx-auto mb-3">
            <?php endif; ?>
            <h1 class="text-xl font-bold text-gray-900"><?= e($school['name']) ?></h1>
            <p class="text-sm text-gray-500 mt-1">Student admission</p>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div class="mb-1 flex items-baseline justify-between">
                <p class="text-xs font-semibold uppercase tracking-wide text-emerald-700">Step <span id="stepNo">1</span> of 5</p>
                <p class="text-xs text-gray-500" id="stepName"><?= e($steps[0]) ?></p>
            </div>
            <div class="prog mb-5" id="prog"><?php for ($i = 0; $i < 5; $i++): ?><span></span><?php endfor; ?></div>

            <?php if ($error): ?>
                <div class="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"><?= e($error) ?></div>
            <?php endif; ?>

            <form method="POST" action="<?= baseUrl('admit') ?>?school=<?= e($school['id']) ?>" id="admitForm" novalidate>
                <?= csrfField() ?>
                <input type="hidden" name="school" value="<?= e($school['id']) ?>">
                <?= publicFormTsField() ?>
                <div style="position:absolute;left:-9999px;" aria-hidden="true"><label>Leave empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>

                <!-- ═══ 1. Rules & photo consent ═══ -->
                <section class="step on" data-step="1">
                    <h2 class="text-base font-bold text-gray-900 mb-1">Rules &amp; Regulations</h2>
                    <p class="text-xs text-gray-500 mb-3">Please read these — you'll be asked to sign for them at the end.</p>
                    <?php if ($rulesFile):
                        // Show the document right here — a parent on a phone should not
                        // be bounced to a new tab. PDFs and images embed; anything else
                        // (a Word file) can only be opened.
                        $rulesExt = strtolower(pathinfo(parse_url($rulesFile, PHP_URL_PATH) ?: '', PATHINFO_EXTENSION));
                        $rulesIsPdf = $rulesExt === 'pdf'; $rulesIsImg = in_array($rulesExt, ['png', 'jpg', 'jpeg', 'webp', 'gif'], true); ?>
                        <?php if ($rulesIsPdf): ?>
                            <div class="rounded-lg border border-gray-200 overflow-hidden mb-3 bg-gray-100">
                                <iframe src="<?= e($rulesFile) ?>#toolbar=0&navpanes=0&view=FitH" title="Rules and regulations" class="w-full block" style="height:min(70vh,560px);border:0"></iframe>
                            </div>
                        <?php elseif ($rulesIsImg): ?>
                            <div class="rounded-lg border border-gray-200 overflow-auto mb-3 bg-gray-100" style="max-height:min(70vh,560px)">
                                <img src="<?= e($rulesFile) ?>" alt="Rules and regulations" class="w-full block">
                            </div>
                        <?php endif; ?>
                        <a href="<?= e($rulesFile) ?>" target="_blank" rel="noopener" class="inline-flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                            <?= ($rulesIsPdf || $rulesIsImg) ? 'Open full size' : 'Open the rules &amp; regulations document' ?>
                        </a>
                    <?php endif; ?>
                    <?php if ($rulesText !== ''): ?>
                        <div class="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-line mb-5"><?= e($rulesText) ?></div>
                    <?php elseif ($rulesDocText !== ''): ?>
                        <div class="overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800 whitespace-pre-line mb-5 leading-relaxed" style="max-height:min(70vh,560px)"><?= e($rulesDocText) ?></div>
                    <?php elseif (!$rulesFile): ?>
                        <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-400 mb-5">The school has not published rules yet.</div>
                    <?php endif; ?>

                    <?php $mc = input('media_consent'); ?>
                    <h3 class="text-sm font-semibold text-gray-700 mb-1">Photo &amp; media consent</h3>
                    <p class="text-xs text-gray-500 mb-2">Separate from the rules — your choice here does not affect admission. Please pick one.</p>
                    <div class="space-y-2 mb-2">
                        <label class="flex items-start gap-2 cursor-pointer"><input type="radio" name="media_consent" value="internal" required <?= $mc === 'internal' ? 'checked' : '' ?> class="w-4 h-4 mt-0.5 border-gray-300 text-emerald-600"><span class="text-sm text-gray-700"><span class="font-medium">Internal use only</span> — report cards, classroom &amp; school records.</span></label>
                        <label class="flex items-start gap-2 cursor-pointer"><input type="radio" name="media_consent" value="public" <?= $mc === 'public' ? 'checked' : '' ?> class="w-4 h-4 mt-0.5 border-gray-300 text-emerald-600"><span class="text-sm text-gray-700"><span class="font-medium">Internal &amp; public</span> — also the school website, social media &amp; marketing.</span></label>
                        <label class="flex items-start gap-2 cursor-pointer"><input type="radio" name="media_consent" value="none" <?= $mc === 'none' ? 'checked' : '' ?> class="w-4 h-4 mt-0.5 border-gray-300 text-emerald-600"><span class="text-sm text-gray-700"><span class="font-medium">No photos or video</span> of my child.</span></label>
                    </div>
                </section>

                <!-- ═══ 2. Student ═══ -->
                <section class="step" data-step="2">
                    <h2 class="text-base font-bold text-gray-900 mb-3">The student</h2>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div><label class="<?= $lblCls ?>">Surname *</label><input type="text" name="last_name" required value="<?= e(input('last_name')) ?>" class="<?= $fieldCls ?>"></div>
                        <div><label class="<?= $lblCls ?>">First name *</label><input type="text" name="first_name" required value="<?= e(input('first_name')) ?>" class="<?= $fieldCls ?>"></div>
                        <div><label class="<?= $lblCls ?>">Middle name</label><input type="text" name="middle_name" value="<?= e(input('middle_name')) ?>" class="<?= $fieldCls ?>"></div>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                        <div><label class="<?= $lblCls ?>">Date of birth</label><input type="date" name="dob" value="<?= e(input('dob')) ?>" class="<?= $fieldCls ?>"></div>
                        <div><label class="<?= $lblCls ?>">Sex</label>
                            <select name="gender" class="<?= $fieldCls ?>"><option value="">—</option><option value="male"<?= selectedIf(input('gender'), 'male') ?>>Male</option><option value="female"<?= selectedIf(input('gender'), 'female') ?>>Female</option></select></div>
                        <div class="col-span-2 sm:col-span-1"><label class="<?= $lblCls ?>">Grade / class applying for *</label><input type="text" name="grade_applying" required value="<?= e(input('grade_applying')) ?>" placeholder="e.g. Grade 7" class="<?= $fieldCls ?>"></div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div><label class="<?= $lblCls ?>">Home address</label><input type="text" name="address" value="<?= e(input('address')) ?>" class="<?= $fieldCls ?>"></div>
                        <div><label class="<?= $lblCls ?>">Home phone</label><input type="tel" name="phone" value="<?= e(input('phone')) ?>" placeholder="07XX XXX XXX" class="<?= $fieldCls ?>"></div>
                        <div><label class="<?= $lblCls ?>">Nationality</label><input type="text" name="nationality" value="<?= e(input('nationality') ?: 'Kenyan') ?>" class="<?= $fieldCls ?>"></div>
                        <div><label class="<?= $lblCls ?>">Denomination / religion</label><input type="text" name="religion" value="<?= e(input('religion')) ?>" class="<?= $fieldCls ?>"></div>
                        <div class="sm:col-span-2"><label class="<?= $lblCls ?>">Last school attended</label><input type="text" name="previous_school" value="<?= e(input('previous_school')) ?>" class="<?= $fieldCls ?>"></div>
                    </div>
                    <?php if ($askAssessment || $askBirthCert || $askNemis): ?>
                    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Identity numbers</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <?php if ($askAssessment): ?><div><label class="<?= $lblCls ?>">Grade 6 assessment number</label><input type="text" name="assessment_number" value="<?= e(input('assessment_number')) ?>" placeholder="KPSEA" class="<?= $fieldCls ?>"></div><?php endif; ?>
                        <?php if ($askBirthCert): ?><div><label class="<?= $lblCls ?>">Birth certificate entry no.</label><input type="text" name="birth_cert_number" value="<?= e(input('birth_cert_number')) ?>" class="<?= $fieldCls ?>"></div><?php endif; ?>
                        <?php if ($askNemis): ?><div><label class="<?= $lblCls ?>">NEMIS / UPI number</label><input type="text" name="nemis_upi" value="<?= e(input('nemis_upi')) ?>" class="<?= $fieldCls ?>"></div><?php endif; ?>
                    </div>
                    <?php endif; ?>
                </section>

                <!-- ═══ 3. Parents ═══ -->
                <section class="step" data-step="3">
                    <h2 class="text-base font-bold text-gray-900 mb-1">Parents &amp; guardian</h2>
                    <p class="text-xs text-gray-500 mb-4">Fill in whoever applies. At least one person with a name and phone is needed. Everyone listed receives school messages; pick who handles fees.</p>
                    <?php $pp = (string)($_POST['primary_parent'] ?? ''); $firstBlock = true;
                    foreach ($parentKinds as $k => $label): ?>
                    <fieldset class="rounded-xl border border-gray-200 p-4 mb-3">
                        <legend class="px-1.5 text-sm font-semibold text-gray-800"><?= e($label) ?><?= $k === 'guardian' ? ' <span class="font-normal text-gray-400">(if applicable)</span>' : '' ?></legend>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div><label class="<?= $lblCls ?>">Full name</label><input type="text" name="parent[<?= $k ?>][name]" value="<?= $pv([$k, 'name']) ?>" class="<?= $fieldCls ?>"></div>
                            <div><label class="<?= $lblCls ?>">Phone</label><input type="tel" name="parent[<?= $k ?>][phone]" value="<?= $pv([$k, 'phone']) ?>" placeholder="07XX XXX XXX" class="<?= $fieldCls ?>"></div>
                            <div><label class="<?= $lblCls ?>">National ID number</label><input type="text" name="parent[<?= $k ?>][id_number]" value="<?= $pv([$k, 'id_number']) ?>" class="<?= $fieldCls ?>"></div>
                            <div><label class="<?= $lblCls ?>">Occupation</label><input type="text" name="parent[<?= $k ?>][occupation]" value="<?= $pv([$k, 'occupation']) ?>" class="<?= $fieldCls ?>"></div>
                            <div><label class="<?= $lblCls ?>">Email</label><input type="email" name="parent[<?= $k ?>][email]" value="<?= $pv([$k, 'email']) ?>" class="<?= $fieldCls ?>"></div>
                            <div><label class="<?= $lblCls ?>">Address</label><input type="text" name="parent[<?= $k ?>][address]" value="<?= $pv([$k, 'address']) ?>" class="<?= $fieldCls ?>"></div>
                        </div>
                        <label class="flex items-center gap-2 mt-3 text-sm text-gray-700 cursor-pointer">
                            <input type="radio" name="primary_parent" value="<?= $k ?>" <?= ($pp === $k || ($pp === '' && $firstBlock)) ? 'checked' : '' ?> class="w-4 h-4 border-gray-300 text-emerald-600">
                            Main contact for fees and school notices
                        </label>
                    </fieldset>
                    <?php $firstBlock = false; endforeach; ?>
                </section>

                <!-- ═══ 4. Emergency & medical ═══ -->
                <section class="step" data-step="4">
                    <h2 class="text-base font-bold text-gray-900 mb-1">Emergency contacts</h2>
                    <p class="text-xs text-gray-500 mb-3">Someone else — family, a guardian or a friend — who can attend to your child if you cannot be reached.</p>
                    <?php foreach ([1, 2] as $n): ?>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <div><label class="<?= $lblCls ?>">Name<?= $n === 2 ? ' <span class="font-normal text-gray-400">(second)</span>' : '' ?></label><input type="text" name="emergency[<?= $n ?>][name]" value="<?= e((string)($_POST['emergency'][$n]['name'] ?? '')) ?>" class="<?= $fieldCls ?>"></div>
                        <div><label class="<?= $lblCls ?>">Relationship</label><input type="text" name="emergency[<?= $n ?>][relationship]" value="<?= e((string)($_POST['emergency'][$n]['relationship'] ?? '')) ?>" placeholder="e.g. Aunt" class="<?= $fieldCls ?>"></div>
                        <div><label class="<?= $lblCls ?>">Mobile</label><input type="tel" name="emergency[<?= $n ?>][phone]" value="<?= e((string)($_POST['emergency'][$n]['phone'] ?? '')) ?>" placeholder="07XX XXX XXX" class="<?= $fieldCls ?>"></div>
                    </div>
                    <?php endforeach; ?>

                    <h2 class="text-base font-bold text-gray-900 mt-6 mb-1">Medical</h2>
                    <p class="text-xs text-gray-500 mb-3">Seen only by the school's administration and head teacher. Does your child have any of the following? If yes, how severe?</p>
                    <div class="sev mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><span></span><?php foreach ($severities as $sv): ?><span class="text-center"><?= e($sv) ?></span><?php endforeach; ?></div>
                    <?php foreach ($conditions as $ck => $cl): $cur = (string)($_POST['cond'][$ck] ?? 'none'); ?>
                    <div class="sev mb-1.5">
                        <span class="text-sm text-gray-800"><?= e($cl) ?></span>
                        <?php foreach ($severities as $sk => $sv): ?>
                        <label><input type="radio" name="cond[<?= $ck ?>]" value="<?= $sk ?>" <?= $cur === $sk ? 'checked' : '' ?>><?= $sk === 'none' ? '—' : '●' ?></label>
                        <?php endforeach; ?>
                    </div>
                    <?php endforeach; ?>
                    <div class="mt-3 mb-4"><label class="<?= $lblCls ?>">Other condition</label><input type="text" name="cond_other" value="<?= e(input('cond_other')) ?>" placeholder="Anything else the school should know" class="<?= $fieldCls ?>"></div>

                    <?php $nt = (string)input('needs_treatment'); $rm = (string)input('regular_medication'); $ma = (string)input('may_administer'); ?>
                    <div class="flex items-center justify-between gap-3 mb-2 flex-wrap">
                        <span class="text-sm text-gray-800">Does your child require medical treatment?</span>
                        <span class="yn"><label><input type="radio" name="needs_treatment" value="no" <?= $nt === 'no' ? 'checked' : '' ?>>No</label><label><input type="radio" name="needs_treatment" value="yes" <?= $nt === 'yes' ? 'checked' : '' ?>>Yes</label></span>
                    </div>
                    <div class="mb-4"><input type="text" name="treatment_details" value="<?= e(input('treatment_details')) ?>" placeholder="If yes, give details" class="<?= $fieldCls ?>"></div>

                    <div class="flex items-center justify-between gap-3 mb-2 flex-wrap">
                        <span class="text-sm text-gray-800">Does your child take any regular medication?</span>
                        <span class="yn"><label><input type="radio" name="regular_medication" value="no" <?= $rm === 'no' ? 'checked' : '' ?>>No</label><label><input type="radio" name="regular_medication" value="yes" <?= $rm === 'yes' ? 'checked' : '' ?>>Yes</label></span>
                    </div>
                    <div class="mb-5"><input type="text" name="medication_details" value="<?= e(input('medication_details')) ?>" placeholder="If yes, the medication and dosage" class="<?= $fieldCls ?>"></div>

                    <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                        <p class="text-sm font-medium text-gray-800 mb-2">Do you give the school permission to administer medication to your child in an emergency or otherwise? *</p>
                        <span class="yn bg-white"><label><input type="radio" name="may_administer" value="no" required <?= $ma === 'no' ? 'checked' : '' ?>>No</label><label><input type="radio" name="may_administer" value="yes" <?= $ma === 'yes' ? 'checked' : '' ?>>Yes</label></span>
                    </div>
                </section>

                <!-- ═══ 5. Declare ═══ -->
                <section class="step" data-step="5">
                    <h2 class="text-base font-bold text-gray-900 mb-1">Declaration</h2>
                    <p class="text-xs text-gray-500 mb-3">To be signed by the parent or guardian.</p>
                    <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-2 mb-4">
                        <p>I declare that the information provided here, and any accompanying documents, are to the best of my knowledge true and correct.</p>
                        <p>I have read and agree to the school's rules and regulations, and I understand that the school may cancel this admission should any information supplied prove to be false.</p>
                    </div>
                    <label class="flex items-start gap-2 cursor-pointer mb-3">
                        <input type="checkbox" name="consent_accept" value="1" required class="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600">
                        <span class="text-sm text-gray-700">I agree to the declaration above and the rules and regulations.</span>
                    </label>
                    <div class="mb-5">
                        <label class="<?= $lblCls ?>">Type your full name to sign *</label>
                        <input type="text" name="consent_name" required value="<?= e(input('consent_name')) ?>" class="<?= $fieldCls ?>">
                        <p class="text-[11px] text-gray-400 mt-1">Your name, the date and time, and the version of the rules you accepted are recorded with this submission.</p>
                    </div>
                    <?php if ($turnstileSiteKey): ?><div class="cf-turnstile mb-4" data-sitekey="<?= e($turnstileSiteKey) ?>"></div><?php endif; ?>
                </section>

                <!-- Nav -->
                <div class="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-gray-100">
                    <button type="button" id="btnBack" class="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition invisible">Back</button>
                    <button type="button" id="btnNext" class="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Continue</button>
                    <button type="submit" id="btnSubmit" class="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition hidden">Submit admission</button>
                </div>
            </form>
        </div>
    <?php endif; ?>
</div>

<script>
(function () {
    var form = document.getElementById('admitForm'); if (!form) return;
    var steps = [].slice.call(form.querySelectorAll('.step')), names = <?= json_encode($steps) ?>;
    var cur = <?= $error ? 5 : 1 ?>, back = document.getElementById('btnBack'), next = document.getElementById('btnNext'), sub = document.getElementById('btnSubmit');
    function show(n) {
        cur = n;
        steps.forEach(function (s) { s.classList.toggle('on', +s.dataset.step === n); });
        document.getElementById('stepNo').textContent = n;
        document.getElementById('stepName').textContent = names[n - 1];
        [].slice.call(document.querySelectorAll('#prog span')).forEach(function (b, i) { b.className = i + 1 < n ? 'done' : (i + 1 === n ? 'cur' : ''); });
        back.classList.toggle('invisible', n === 1);
        next.classList.toggle('hidden', n === 5);
        sub.classList.toggle('hidden', n !== 5);
        window.scrollTo({top: 0, behavior: 'smooth'});
    }
    function valid(n) {
        var sec = steps[n - 1], ok = true;
        [].slice.call(sec.querySelectorAll('input,select,textarea')).forEach(function (f) {
            if (!f.checkValidity()) { ok = false; }
        });
        if (n === 1 && !sec.querySelector('input[name="media_consent"]:checked')) { alert('Please choose a photo & media option.'); return false; }
        if (n === 3) {
            var any = false;
            ['father', 'mother', 'guardian'].forEach(function (k) {
                var nm = form.querySelector('[name="parent[' + k + '][name]"]').value.trim(), ph = form.querySelector('[name="parent[' + k + '][phone]"]').value.trim();
                if (nm && ph) any = true;
            });
            if (!any) { alert('Please give at least one parent or guardian with a name and phone number.'); return false; }
        }
        if (n === 4 && !sec.querySelector('input[name="may_administer"]:checked')) { alert('Please answer whether the school may administer medication.'); return false; }
        if (!ok) { var f = sec.querySelector(':invalid'); if (f) { f.reportValidity(); f.focus(); } }
        return ok;
    }
    next.addEventListener('click', function () { if (valid(cur)) show(cur + 1); });
    back.addEventListener('click', function () { if (cur > 1) show(cur - 1); });
    form.addEventListener('submit', function (e) { if (!valid(5)) e.preventDefault(); });
    // Enter moves on instead of submitting early.
    form.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && cur < 5) { e.preventDefault(); next.click(); } });
    show(cur);
})();
</script>
</body>
</html>
