<?php
/**
 * Admissions — review digital admission submissions and convert to students.
 * Also hosts the shareable admission link + QR code and the rules editor.
 */
$pageTitle = 'Admissions';
require_once __DIR__ . '/../includes/storage.php';
$sb  = new Supabase();
$sid = schoolId();
$classes = cachedClasses();

// Small school_settings upsert.
$putSetting = function (string $key, string $value) use ($sb, $sid) {
    $ex = $sb->from('school_settings')->select('id')->eq('school_id', $sid)->eq('key', $key)->single()->execute();
    if (!empty($ex['data'])) {
        $sb->from('school_settings')->eq('school_id', $sid)->eq('key', $key)->update(['value' => $value, 'updated_at' => date('c')]);
    } else {
        $sb->from('school_settings')->insert(['school_id' => $sid, 'key' => $key, 'value' => $value]);
    }
};

if (isPost() && verifyCsrf()) {
    $action = input('action');

    // ── Which identity numbers the parent form asks for ──
    if ($action === 'save_ask') {
        $putSetting('admit_ask_assessment_no', input('ask_assessment') ? 'true' : 'false');
        $putSetting('admit_ask_birth_cert',    input('ask_birth_cert') ? 'true' : 'false');
        $putSetting('admit_ask_nemis',         input('ask_nemis')      ? 'true' : 'false');
        Supabase::clearCache('settings_' . $sid);
        flash('success', 'Saved — the parent form now asks for what you ticked.');
        redirect('admissions');
    }

    // ── Save rules & regulations (bump version) ──
    if ($action === 'save_rules') {
        $rules = trim((string)input('admission_rules'));
        $vRes  = $sb->from('school_settings')->select('value')->eq('school_id', $sid)->eq('key', 'admission_rules_version')->single()->execute();
        $ver   = (int)($vRes['data'][0]['value'] ?? 0) + 1;
        $putSetting('admission_rules', $rules);

        // Optional rules document (PDF / Word).
        $docMsg = '';
        if (input('remove_rules_doc')) {
            $putSetting('admission_rules_file', '');
            $putSetting('admission_rules_file_name', '');
            $docMsg = ' Document removed.';
        } elseif (!empty($_FILES['rules_doc']['name'] ?? '')) {
            $up = uploadAdmissionRulesDoc($sid, $_FILES['rules_doc']);
            if (!empty($up['ok'])) {
                $putSetting('admission_rules_file', $up['url']);
                $putSetting('admission_rules_file_name', $_FILES['rules_doc']['name']);
                $docMsg = ' Document uploaded.';
            } else {
                $putSetting('admission_rules_version', (string)$ver);
                Supabase::clearCache('settings_' . $sid);
                flash('error', 'Rules text saved, but the document upload failed: ' . ($up['error'] ?? 'unknown error'));
                redirect('admissions');
            }
        }

        $putSetting('admission_rules_version', (string)$ver);
        Supabase::clearCache('settings_' . $sid);
        flash('success', 'Rules saved (version ' . $ver . ').' . $docMsg);
        redirect('admissions');
    }

    // ── Approve → create the student via one governed action ──
    // admit_applicant (mig. 101) creates the student, flips the admission, and
    // writes the audit line atomically. Because it locks the admission and
    // re-checks 'pending' in the database, a crash mid-way (or a double click)
    // can no longer create the same child twice.
    if ($action === 'approve') {
        $id = input('admission_id');
        $me = currentUser();
        $res = $sb->rpc('admit_applicant', [
            'p_admission_id' => $id,
            'p_school_id'    => $sid,
            'p_class_id'     => input('class_id') ?: null,
            'p_user_id'      => $me['id']    ?? null,
            'p_user_email'   => $me['email'] ?? null,
        ]);
        $payload = $res['data'] ?? null;
        if (!empty($res['error'])) {
            flash('error', 'Could not admit the learner. Please try again.');
        } elseif (!is_array($payload) || empty($payload['success'])) {
            flash('error', $payload['error'] ?? 'The admission could not be completed.');
        } else {
            flash('success', ($payload['name'] ?? 'The learner') . ' admitted and added to students.');
            // Close the loop on the enquiry this admission came from (mig. 129).
            $admRow = $sb->from('admissions')->select('enquiry_id')->eq('id', $id)->single()->execute()['data'][0] ?? null;
            if (!empty($admRow['enquiry_id']) && !empty($payload['student_id'])) {
                $sb->from('enquiries')->eq('id', $admRow['enquiry_id'])->eq('school_id', $sid)->update([
                    'status' => 'admitted', 'student_id' => $payload['student_id'], 'last_activity_at' => date('c'),
                ]);
                $sb->from('enquiry_notes')->insert(['school_id' => $sid, 'enquiry_id' => $admRow['enquiry_id'], 'kind' => 'system',
                    'author_email' => currentUser()['email'] ?? null, 'body' => 'Admitted — learner record created.']);
            }
        }
        redirect('admissions');
    }

    // ── Reject ──
    if ($action === 'reject') {
        $id = input('admission_id');
        $sb->from('admissions')->eq('id', $id)->eq('school_id', $sid)->eq('status', 'pending')->update([
            'status'      => 'rejected',
            'reviewed_at' => date('c'),
            'reviewed_by' => currentUser()['email'] ?? 'staff',
        ]);
        flash('success', 'Admission rejected.');
        redirect('admissions');
    }
}

// ── Data ──
$filter = input('status') ?: 'pending';
if (!in_array($filter, ['pending', 'approved', 'rejected', 'all'], true)) $filter = 'pending';
$q = $sb->from('admissions')->select('*')->eq('school_id', $sid);
if ($filter !== 'all') $q = $q->eq('status', $filter);
$admissions = $q->order('created_at', false)->limit(300)->execute()['data'] ?? [];

$rulesText     = (string)(schoolSetting('admission_rules', ''));
$rulesVer      = (int)(schoolSetting('admission_rules_version', '1'));
$rulesFile     = (string)(schoolSetting('admission_rules_file', ''));
$rulesFileName = (string)(schoolSetting('admission_rules_file_name', ''));

$scheme    = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host      = $_SERVER['HTTP_HOST'] ?? '';
$admitUrl  = $scheme . '://' . $host . baseUrl('admit') . '?school=' . $sid;

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Admissions</h1>
    <p class="text-sm text-gray-500 mt-1">Two ways to admit a learner — let families apply themselves, or enter everything yourself. Either way the next admission number is assigned automatically.</p>
</div>

<!-- ── Two ways to admit ─────────────────────────────── -->
<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

    <!-- Option 1 — Parent self-service (QR / link) -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col">
        <div class="flex items-start gap-3 mb-4">
            <div class="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-1v4m-4-4H5m14-4h-4m-2-4h.01M9 9h.01M12 4a2 2 0 100 4 2 2 0 000-4zm-7 7a2 2 0 100 4 2 2 0 000-4zm14 0a2 2 0 100 4 2 2 0 000-4z"/></svg>
            </div>
            <div>
                <h2 class="text-base font-bold text-gray-900">Parent self-service</h2>
                <p class="text-xs text-gray-500 mt-0.5">Share the QR or link. Families complete the form &amp; accept the rules; their submissions land in the review queue below for you to approve.</p>
            </div>
        </div>
        <div class="text-center bg-gray-50/60 rounded-lg p-4 mt-auto">
            <div id="admitQr" class="inline-block p-2 bg-white rounded-lg border border-gray-100"></div>
            <div class="mt-3 flex flex-col gap-2">
                <input id="admitUrl" type="text" readonly value="<?= e($admitUrl) ?>" class="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-mono text-gray-600 text-center">
                <div class="flex gap-2 justify-center">
                    <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('admitUrl').value).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy link',1500);})" class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Copy link</button>
                    <button type="button" onclick="window.print()" class="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Print</button>
                    <a href="<?= e($admitUrl) ?>" target="_blank" rel="noopener" class="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Open</a>
                </div>
            </div>
        </div>
    </div>

    <!-- Option 2 — Admit directly (staff-entered full form) -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col">
        <div class="flex items-start gap-3 mb-4">
            <div class="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </div>
            <div>
                <h2 class="text-base font-bold text-gray-900">Admit directly &nbsp;<span class="text-[11px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">staff-entered</span></h2>
                <p class="text-xs text-gray-500 mt-0.5">Fill in the full admission form yourself. The learner is enrolled and billed immediately — no approval step.</p>
            </div>
        </div>
        <ul class="text-xs text-gray-600 space-y-1.5 mb-4">
            <li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>Personal details, guardian &amp; contacts</li>
            <li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>Class placement, sections &amp; previous school</li>
            <li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>Fees, transport &amp; activities — invoice generated</li>
        </ul>
        <a href="<?= baseUrl('students/add') ?>" class="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 shadow-sm transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Open admission form
        </a>
    </div>
</div>

<div class="grid grid-cols-1 gap-4 mb-6">
    <!-- Rules editor -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rules &amp; Regulations</p>
            <span class="text-[11px] text-gray-400">Version <?= $rulesVer ?></span>
        </div>
        <form method="POST" action="<?= baseUrl('admissions') ?>" enctype="multipart/form-data">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="save_rules">
            <textarea name="admission_rules" rows="5" placeholder="Paste the school rules and regulations parents must accept during admission…"
                class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"><?= e($rulesText) ?></textarea>

            <div class="mt-3">
                <label class="block text-sm font-medium text-gray-700 mb-1">…or upload a document (PDF / Word)</label>
                <?php if ($rulesFile): ?>
                    <div class="flex items-center gap-3 mb-2 text-sm">
                        <a href="<?= e($rulesFile) ?>" target="_blank" rel="noopener" class="text-emerald-600 hover:underline"> <?= e($rulesFileName ?: 'Current document') ?></a>
                        <label class="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" name="remove_rules_doc" value="1" class="rounded border-gray-300 text-red-600"> remove</label>
                    </div>
                <?php endif; ?>
                <input type="file" name="rules_doc" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    class="block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:text-sm file:font-medium hover:file:bg-emerald-100">
                <p class="text-xs text-gray-400 mt-1">Max 10 MB. Parents get a button to open it on the admission form.</p>
            </div>

            <p class="text-xs text-gray-400 mt-2">Saving bumps the version. The version (and document) a parent accepted is stored with their submission.</p>
            <button type="submit" class="mt-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save rules</button>
        </form>
    </div>
</div>

<!-- What the parent form asks for -->
<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Identity numbers on the parent form</p>
    <p class="text-xs text-gray-500 mb-3">A junior secondary asks for the Grade 6 assessment number; a primary asks for the birth certificate. Tick what applies to this school.</p>
    <form method="POST" action="<?= baseUrl('admissions') ?>" class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="save_ask">
        <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" name="ask_assessment" value="1" <?= schoolSetting('admit_ask_assessment_no', 'false') === 'true' ? 'checked' : '' ?> class="w-4 h-4 rounded border-gray-300 text-emerald-600"> Grade 6 assessment (KPSEA) number</label>
        <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" name="ask_birth_cert" value="1" <?= schoolSetting('admit_ask_birth_cert', 'true') === 'true' ? 'checked' : '' ?> class="w-4 h-4 rounded border-gray-300 text-emerald-600"> Birth certificate entry number</label>
        <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" name="ask_nemis" value="1" <?= schoolSetting('admit_ask_nemis', 'true') === 'true' ? 'checked' : '' ?> class="w-4 h-4 rounded border-gray-300 text-emerald-600"> NEMIS / UPI number</label>
        <button type="submit" class="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save</button>
    </form>
</div>

<!-- Filter chips -->
<div class="flex flex-wrap gap-2 mb-4">
    <?php foreach (['pending' => 'Pending', 'approved' => 'Approved', 'rejected' => 'Rejected', 'all' => 'All'] as $key => $label):
        $active = $filter === $key; ?>
        <a href="<?= baseUrl('admissions') ?>?status=<?= e($key) ?>" class="px-3 py-1.5 rounded-lg text-sm font-medium transition <?= $active ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50' ?>"><?= e($label) ?></a>
    <?php endforeach; ?>
</div>

<!-- Queue -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?php if (empty($admissions)): ?>
        <div class="px-5 py-12 text-center text-gray-400 text-sm">No <?= $filter === 'all' ? '' : e($filter) ?> admissions.</div>
    <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($admissions as $a):
                $statusBadge = ['pending' => 'bg-blue-50 text-blue-700', 'approved' => 'bg-emerald-50 text-emerald-700', 'rejected' => 'bg-red-50 text-red-700'];
            ?>
                <div class="px-5 py-4">
                    <div class="flex items-start justify-between gap-4 flex-wrap">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <p class="font-semibold text-gray-900"><?= e($a['first_name'] . ' ' . $a['last_name']) ?></p>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium <?= $statusBadge[$a['status']] ?? 'bg-gray-100 text-gray-600' ?>"><?= e(ucfirst($a['status'])) ?></span>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">
                                Grade: <?= e($a['grade_applying'] ?: '—') ?>
                                <?php if (!empty($a['gender'])): ?><span class="text-gray-300 mx-1">·</span><?= e(ucfirst($a['gender'])) ?><?php endif; ?>
                                <?php if (!empty($a['dob'])): ?><span class="text-gray-300 mx-1">·</span>DOB <?= e($a['dob']) ?><?php endif; ?>
                                <span class="text-gray-300 mx-1">·</span><?= formatDate($a['created_at']) ?>
                            </p>
                            <p class="text-xs text-gray-600 mt-1">
                                <span class="text-gray-400">Guardian:</span> <?= e($a['guardian_name'] ?: '—') ?>
                                <?php if (!empty($a['guardian_phone'])): ?><span class="text-gray-300 mx-1">·</span><?= e($a['guardian_phone']) ?><?php endif; ?>
                                <?php if (!empty($a['guardian_relationship'])): ?><span class="text-gray-300 mx-1">·</span><?= e($a['guardian_relationship']) ?><?php endif; ?>
                            </p>
                            <?php if (!empty($a['previous_school'])): ?><p class="text-xs text-gray-500 mt-1"><span class="text-gray-400">Previous school:</span> <?= e($a['previous_school']) ?></p><?php endif; ?>
                            <?php
                            // The full form (mig. 124): parents, emergency contacts, medical, identity.
                            $jd = fn($v) => is_string($v) ? (json_decode($v, true) ?: null) : $v;
                            $aParents = $jd($a['parents'] ?? null); $aEmerg = $jd($a['emergency_contacts'] ?? null); $aMed = $jd($a['medical'] ?? null);
                            $ids = array_filter(['Assessment no.' => $a['assessment_number'] ?? '', 'Birth cert.' => $a['birth_cert_number'] ?? '', 'NEMIS/UPI' => $a['nemis_upi'] ?? '']);
                            $flags = [];
                            if (is_array($aMed)) {
                                foreach (($aMed['conditions'] ?? []) as $ck => $sv) if ($sv && $sv !== 'none') $flags[] = ucfirst($ck) . ' (' . $sv . ')';
                                if (!empty($aMed['other'])) $flags[] = $aMed['other'];
                                if (!empty($aMed['regular_medication'])) $flags[] = 'on medication';
                            }
                            if (is_array($aParents) || is_array($aEmerg) || is_array($aMed) || $ids): ?>
                            <details class="mt-2 text-xs">
                                <summary class="cursor-pointer text-emerald-700 font-medium select-none">Full form
                                    <?php if ($flags): ?><span class="ml-2 inline-flex px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">medical: <?= e(implode(', ', $flags)) ?></span><?php endif; ?>
                                </summary>
                                <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-gray-600">
                                    <?php if ($ids || !empty($a['middle_name']) || !empty($a['address']) || !empty($a['nationality']) || !empty($a['religion'])): ?>
                                    <div>
                                        <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Identity</p>
                                        <?php if (!empty($a['middle_name'])): ?><div>Middle name: <?= e($a['middle_name']) ?></div><?php endif; ?>
                                        <?php foreach ($ids as $lbl => $val): ?><div><?= e($lbl) ?>: <span class="font-mono"><?= e($val) ?></span></div><?php endforeach; ?>
                                        <?php if (!empty($a['nationality']) || !empty($a['religion'])): ?><div><?= e(implode(' · ', array_filter([$a['nationality'] ?? '', $a['religion'] ?? '']))) ?></div><?php endif; ?>
                                        <?php if (!empty($a['address']) || !empty($a['phone'])): ?><div><?= e(implode(' · ', array_filter([$a['address'] ?? '', $a['phone'] ?? '']))) ?></div><?php endif; ?>
                                    </div>
                                    <?php endif; ?>
                                    <?php if (is_array($aParents) && $aParents): ?>
                                    <div>
                                        <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Parents</p>
                                        <?php foreach ($aParents as $p): ?>
                                        <div class="mb-1"><span class="font-medium text-gray-800"><?= e($p['relation'] ?? '') ?></span>: <?= e($p['name'] ?? '') ?><?= !empty($p['is_primary']) ? ' <span class="text-emerald-700">· main contact</span>' : '' ?><br>
                                            <span class="text-gray-500"><?= e(implode(' · ', array_filter([$p['phone'] ?? '', !empty($p['id_number']) ? 'ID ' . $p['id_number'] : '', $p['occupation'] ?? '', $p['email'] ?? '']))) ?></span></div>
                                        <?php endforeach; ?>
                                    </div>
                                    <?php endif; ?>
                                    <?php if (is_array($aEmerg) && $aEmerg): ?>
                                    <div>
                                        <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Emergency contacts</p>
                                        <?php foreach ($aEmerg as $c): ?><div><?= e($c['name'] ?? '') ?><?= !empty($c['relationship']) ? ' (' . e($c['relationship']) . ')' : '' ?> · <?= e($c['phone'] ?? '') ?></div><?php endforeach; ?>
                                    </div>
                                    <?php endif; ?>
                                    <?php if (is_array($aMed)): ?>
                                    <div>
                                        <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Medical</p>
                                        <div><?= $flags ? e(implode(', ', $flags)) : 'No conditions declared' ?></div>
                                        <?php if (!empty($aMed['treatment_details'])): ?><div>Treatment: <?= e($aMed['treatment_details']) ?></div><?php endif; ?>
                                        <?php if (!empty($aMed['medication_details'])): ?><div>Medication: <?= e($aMed['medication_details']) ?></div><?php endif; ?>
                                        <div>May administer medication: <span class="font-medium <?= ($aMed['may_administer'] ?? null) === true ? 'text-emerald-700' : 'text-red-600' ?>"><?= ($aMed['may_administer'] ?? null) === true ? 'Yes' : (($aMed['may_administer'] ?? null) === false ? 'No' : '—') ?></span></div>
                                    </div>
                                    <?php endif; ?>
                                </div>
                            </details>
                            <?php endif; ?>
                            <p class="text-[11px] text-gray-400 mt-1">Accepted rules v<?= (int)($a['rules_version'] ?? 0) ?> as "<?= e($a['consent_name'] ?? '') ?>"<?= !empty($a['consent_at']) ? ' on ' . formatDate($a['consent_at']) : '' ?></p>
                        </div>
                        <?php if ($a['status'] === 'pending'): ?>
                        <div class="flex flex-col gap-2 flex-shrink-0">
                            <form method="POST" action="<?= baseUrl('admissions') ?>" class="flex items-end gap-2">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="approve">
                                <input type="hidden" name="admission_id" value="<?= e($a['id']) ?>">
                                <div>
                                    <label class="block text-[11px] text-gray-500 mb-1">Assign class</label>
                                    <select name="class_id" class="px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                                        <option value="">— optional —</option>
                                        <?php foreach ($classes as $c): ?><option value="<?= e($c['id']) ?>"><?= e($c['name']) ?></option><?php endforeach; ?>
                                    </select>
                                </div>
                                <button type="submit" class="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Approve</button>
                            </form>
                            <form method="POST" action="<?= baseUrl('admissions') ?>" onsubmit="return confirm('Reject this admission?')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="reject">
                                <input type="hidden" name="admission_id" value="<?= e($a['id']) ?>">
                                <button type="submit" class="w-full px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">Reject</button>
                            </form>
                        </div>
                        <?php elseif ($a['status'] === 'approved' && !empty($a['created_student_id'])): ?>
                            <a href="<?= baseUrl('students/view') ?>?id=<?= e($a['created_student_id']) ?>" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium flex-shrink-0">View student →</a>
                        <?php endif; ?>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
<script>
(function(){
    var url = <?= jsonHtml($admitUrl) ?>;
    var el = document.getElementById('admitQr');
    function draw(){
        if (!el) return;
        if (window.QRCode){ el.innerHTML=''; new QRCode(el, {text:url, width:176, height:176, correctLevel: QRCode.CorrectLevel.M}); }
        else { setTimeout(draw, 120); }
    }
    draw();
})();
</script>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
