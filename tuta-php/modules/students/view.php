<?php
/**
 * Student Profile — detailed view with all info, fees, grades summary.
 */
$pageTitle = 'Student Profile';
$sb  = new Supabase();
$sid = schoolId();
$id  = input('id');

if (!$id) redirect('students');

// Medical is sensitive: admin and head teacher only (decision 2026-09-04).
$canSeeMedical = isAdmin() || hasRole(['head_teacher']);

// ── Emergency contacts + medical: edited here on the profile (mig. 124) ──
if (isPost() && verifyCsrf() && userCan('students.manage')) {
    $action = input('action');

    if ($action === 'save_emergency') {
        $rows = [];
        foreach ([1, 2] as $n) {
            $nm = trim((string)($_POST['emergency'][$n]['name'] ?? ''));
            $ph = trim((string)($_POST['emergency'][$n]['phone'] ?? ''));
            if ($nm === '' && $ph === '') continue;
            if ($nm === '' || $ph === '') {
                flash('error', 'Each emergency contact needs both a name and a phone.');
                redirect('students/view?id=' . urlencode($id));
            }
            $rows[] = ['school_id' => $sid, 'student_id' => $id, 'name' => mb_substr($nm, 0, 120),
                       'relationship' => mb_substr(trim((string)($_POST['emergency'][$n]['relationship'] ?? '')), 0, 60) ?: null,
                       'phone' => mb_substr($ph, 0, 30), 'priority' => count($rows) + 1];
        }
        $sb->from('emergency_contacts')->eq('student_id', $id)->eq('school_id', $sid)->delete();
        if ($rows) $sb->from('emergency_contacts')->insert($rows);
        auditLog('update', 'student', $id, ['emergency_contacts' => count($rows)]);
        flash('success', 'Emergency contacts saved.');
        redirect('students/view?id=' . urlencode($id));
    }

    // ── Transport: move a child between routes (mig. 130) ──
    // The route lives on the child, not the invoice, so a family that moves
    // house is corrected once here and every later invoice follows.
    if ($action === 'save_transport' && userCan('fees.manage')) {
        $routeId = input('route_id') ?: null;
        $feeIn   = trim((string)input('fee_amount'));
        $me      = currentUser();
        $term    = cachedCurrentTerm();
        // cachedCurrentTerm() doesn't carry the year; cachedTerms() does.
        $yearId  = null;
        foreach (cachedTerms() as $t) {
            if (($t['id'] ?? '') === ($term['id'] ?? '')) { $yearId = $t['academic_year_id'] ?? null; break; }
        }
        $res = $sb->rpc('set_student_transport', [
            'p_school_id'        => $sid,
            'p_student_id'       => $id,
            'p_route_id'         => $routeId,
            'p_fee_amount'       => $feeIn === '' ? null : (float)str_replace(',', '', $feeIn),
            'p_fee_reason'       => mb_substr(trim((string)input('fee_reason')), 0, 200) ?: null,
            'p_start_date'       => input('start_date') ?: null,
            'p_term_id'          => $term['id'] ?? null,
            'p_academic_year_id' => $yearId,
            'p_apply_invoice'    => input('apply_invoice') === '1',
            'p_user_id'          => $me['id'] ?? null,
            'p_user_email'       => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
            flash('error', is_array($p) ? ($p['error'] ?? 'Could not change transport.') : 'Could not change transport.');
        } else {
            $msg = $p['message'] ?? 'Transport updated.';
            if (!empty($p['invoice_note'])) $msg .= ' ' . $p['invoice_note'];
            // The specific pickup point — Greatwall inside Athi River Zone 1.
            if ($routeId) {
                $pk = $sb->rpc('set_student_pickup', [
                    'p_school_id' => $sid, 'p_student_id' => $id,
                    'p_zone_id'   => input('zone_id') ?: null,
                    'p_user_id'   => $me['id'] ?? null, 'p_user_email' => $me['email'] ?? null,
                ])['data'] ?? null;
                if (is_array($pk) && !empty($pk['changed'])) $msg .= ' ' . ($pk['message'] ?? '');
                elseif (is_array($pk) && empty($pk['success'])) $msg .= ' ' . ($pk['error'] ?? '');
            }
            flash('success', $msg);
        }
        redirect('students/view?id=' . urlencode($id));
    }

    if ($action === 'save_medical' && $canSeeMedical) {
        $conds = [];
        foreach (['asthma', 'diabetes', 'hearing', 'visual'] as $ck) {
            $v = (string)($_POST['cond'][$ck] ?? 'none');
            $conds[$ck] = in_array($v, ['none', 'mild', 'moderate', 'severe'], true) ? $v : 'none';
        }
        $yn = fn($k) => in_array((string)input($k), ['yes', 'no'], true) ? ((string)input($k) === 'yes') : null;
        $me = currentUser();
        $row = [
            'student_id' => $id, 'school_id' => $sid, 'conditions' => $conds,
            'other_condition'    => mb_substr(trim((string)input('cond_other')), 0, 200) ?: null,
            'needs_treatment'    => $yn('needs_treatment'),
            'treatment_details'  => mb_substr(trim((string)input('treatment_details')), 0, 600) ?: null,
            'regular_medication' => $yn('regular_medication'),
            'medication_details' => mb_substr(trim((string)input('medication_details')), 0, 600) ?: null,
            'may_administer'     => $yn('may_administer'),
            'updated_at' => date('c'), 'updated_by' => $me['email'] ?? null,
        ];
        $ex = $sb->from('student_medical')->select('student_id')->eq('student_id', $id)->single()->execute();
        $r = !empty($ex['data'][0]['student_id'])
            ? $sb->from('student_medical')->eq('student_id', $id)->update($row)
            : $sb->from('student_medical')->insert($row);
        if (empty($r['error'])) auditLog('update', 'student_medical', $id, ['by' => $me['email'] ?? null]);
        flash($r['error'] ? 'error' : 'success', $r['error'] ?: 'Medical details saved.');
        redirect('students/view?id=' . urlencode($id));
    }
}

$studentResult = $sb->from('students')->select('*')->eq('id', $id)->eq('school_id', $sid)->single()->execute();
$student = $studentResult['data'][0] ?? null;
if (!$student) {
    flash('error', 'Student not found.');
    redirect('students');
}

$s = $student;

// Guardians (rows), emergency contacts, medical — all from mig. 124.
$guardianRows = $sb->from('guardians')->select('id,name,relation,phone,email,id_number,occupation,address,is_primary,is_billing_contact')
    ->eq('student_id', $id)->order('is_primary', false)->execute()['data'] ?? [];
$emergencyRows = $sb->from('emergency_contacts')->select('id,name,relationship,phone,priority')
    ->eq('student_id', $id)->eq('school_id', $sid)->order('priority')->execute()['data'] ?? [];
$medical = $canSeeMedical
    ? ($sb->from('student_medical')->select('*')->eq('student_id', $id)->single()->execute()['data'][0] ?? null)
    : null;
if ($medical && is_string($medical['conditions'] ?? null)) $medical['conditions'] = json_decode($medical['conditions'], true) ?: [];
$condLabels = ['asthma' => 'Asthma', 'diabetes' => 'Diabetes', 'hearing' => 'Hearing impairment', 'visual' => 'Visual impairment'];
$medFlags = [];
if ($medical) {
    foreach (($medical['conditions'] ?? []) as $ck => $sv) if ($sv && $sv !== 'none') $medFlags[] = ($condLabels[$ck] ?? ucfirst($ck)) . ' · ' . $sv;
    if (!empty($medical['other_condition'])) $medFlags[] = $medical['other_condition'];
}

// Class & section names
$classMap = cachedClassMap();
$className = $classMap[$s['current_class_id'] ?? ''] ?? '—';

$sectionName = '—';
if (!empty($s['section_id'])) {
    $secResult = $sb->from('sections')->select('name')->eq('id', $s['section_id'])->single()->execute();
    $sectionName = $secResult['data'][0]['name'] ?? '—';
}

// Recent invoices (last 5)
$invoicesResult = $sb->from('invoices')->select('id,reference,amount,paid_amount,status,due_date')
    ->eq('student_id', $id)->eq('school_id', $sid)
    ->order('created_at', false)->limit(5)->execute();
$invoices = $invoicesResult['data'] ?? [];

// Fee totals — summed across ALL of the student's invoices, not just the 5
// shown below. (Previously this summed only the 5 recent invoices, so the
// Billed/Outstanding figures were wrong once a student had more than 5.)
$totalBilled = 0;
$totalPaid = 0;
$allInvoicesResult = $sb->from('invoices')->select('amount,paid_amount,status')
    ->eq('student_id', $id)->eq('school_id', $sid)->execute();
foreach (($allInvoicesResult['data'] ?? []) as $inv) {
    if (($inv['status'] ?? '') === 'cancelled') continue;   // cancelled invoices don't count
    $totalBilled += (float)($inv['amount'] ?? 0);
    $totalPaid   += (float)($inv['paid_amount'] ?? 0);
}

// ── Attendance this term: present / late count as attended ──────
$attTerm = cachedCurrentTerm();
$attFrom = $attTerm['start_date'] ?? date('Y-01-01');
$attRows = Supabase::fetchAllPaged(fn($q) => $q->from('attendance_records')->select('date,status')
    ->eq('student_id', $id)->eq('school_id', $sid)->gte('date', $attFrom)->order('date', false)) ?: [];
$att = ['present' => 0, 'late' => 0, 'absent' => 0, 'other' => 0];
$attRecent = [];
foreach ($attRows as $r) {
    $st = strtolower((string)$r['status']);
    $att[isset($att[$st]) ? $st : 'other']++;
    if (count($attRecent) < 10) $attRecent[] = $r;
}
$attDays = $att['present'] + $att['late'] + $att['absent'];
$attPct  = $attDays > 0 ? round(($att['present'] + $att['late']) / $attDays * 100) : null;

// ── Transport: what's in force, what it was, and what can be changed to ──
$canEditTransport = userCan('fees.manage');
$trRoutes = $sb->from('transport_routes')->select('id,name,fee_amount,start_location,end_location,is_active')
    ->eq('school_id', $sid)->order('name')->execute()['data'] ?? [];
$trRouteMap = [];
foreach ($trRoutes as $r) $trRouteMap[$r['id']] = $r;

$trZones = $sb->from('transport_zones')->select('id,route_id,name,sequence')
    ->eq('school_id', $sid)->eq('is_active', 'true')->order('sequence')->execute()['data'] ?? [];
$trZoneMap = []; foreach ($trZones as $z) $trZoneMap[$z['id']] = $z;

$trRows = $sb->from('student_transport')
    ->select('id,route_id,zone_id,fee_amount,fee_reason,start_date,end_date,is_active,changed_by,changed_at,created_at')
    ->eq('student_id', $id)->eq('school_id', $sid)
    ->order('created_at', false)->limit(12)->execute()['data'] ?? [];
$trCurrent = null;
$trHistory = [];
foreach ($trRows as $row) {
    if (!$trCurrent && !empty($row['is_active'])) $trCurrent = $row;
    else $trHistory[] = $row;
}

// The invoice a change could be applied to: this term's, still open.
$trTerm    = cachedCurrentTerm();
$trInvoice = null;
if ($trTerm['id'] ?? null) {
    $trInvoice = $sb->from('invoices')->select('id,reference,amount,paid_amount,status')
        ->eq('student_id', $id)->eq('school_id', $sid)->eq('term_id', $trTerm['id'])
        ->neq('status', 'cancelled')->order('created_at', false)->single()->execute()['data'][0] ?? null;
}

// Recent payments (last 5)
$paymentsResult = $sb->from('payments')->select('id,amount,method,paid_at,reference:transaction_ref')
    ->eq('student_id', $id)
    ->order('paid_at', false)->limit(5)->execute();
$payments = $paymentsResult['data'] ?? [];

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6 flex items-center justify-between">
    <div>
        <a href="<?= baseUrl('students') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to Students</a>
        <h1 class="text-2xl font-bold text-gray-900 mt-2"><?= e($s['first_name'] . ' ' . $s['last_name']) ?></h1>
        <div class="flex items-center gap-3 mt-1">
            <?php if ($s['admission_number']): ?>
                <span class="text-sm text-gray-500">Adm: <?= e($s['admission_number']) ?></span>
            <?php endif; ?>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium <?= $s['status'] === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600' ?>">
                <?= e(ucfirst($s['status'] ?? 'active')) ?>
            </span>
            <?php if ($s['student_type'] ?? ''): ?>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    <?= e($s['student_type'] === 'boarder' ? 'Boarder' : 'Day Scholar') ?>
                </span>
            <?php endif; ?>
        </div>
    </div>
    <div class="flex items-center gap-2">
        <a href="<?= baseUrl('fees/invoices/generate?mode=single&student_id=' . $id) ?>" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 transition">Generate Invoice</a>
        <a href="<?= baseUrl('students/edit?id=' . $id) ?>" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Edit Student</a>
    </div>
</div>

<!-- Info Cards -->
<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

    <!-- Personal Details -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-blue-500"></div>
            Personal Details
        </h2>
        <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
                <dt class="text-gray-500">Gender</dt>
                <dd class="text-gray-900 font-medium"><?= e(ucfirst($s['gender'] ?? '—')) ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Date of Birth</dt>
                <dd class="text-gray-900 font-medium"><?= formatDate($s['dob'] ?? null) ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Place of Birth</dt>
                <dd class="text-gray-900 font-medium"><?= e($s['birth_place'] ?? '—') ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Religion</dt>
                <dd class="text-gray-900 font-medium"><?= e($s['religion'] ?? '—') ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Blood Group</dt>
                <dd class="text-gray-900 font-medium"><?= e($s['blood_group'] ?? '—') ?></dd>
            </div>
            <?php if ($s['phone'] ?? ''): ?>
            <div class="flex justify-between">
                <dt class="text-gray-500">Phone</dt>
                <dd class="text-gray-900 font-medium"><?= e($s['phone']) ?></dd>
            </div>
            <?php endif; ?>
            <?php if ($s['email'] ?? ''): ?>
            <div class="flex justify-between">
                <dt class="text-gray-500">Email</dt>
                <dd class="text-gray-900 font-medium"><?= e($s['email']) ?></dd>
            </div>
            <?php endif; ?>
            <?php if ($s['address'] ?? ''): ?>
            <div class="pt-2 border-t border-gray-50">
                <dt class="text-gray-500 mb-1">Address</dt>
                <dd class="text-gray-900"><?= e($s['address']) ?><?= ($s['city'] ?? '') ? ', ' . e($s['city']) : '' ?><?= ($s['country'] ?? '') ? ', ' . e($s['country']) : '' ?></dd>
            </div>
            <?php endif; ?>
        </dl>
    </div>

    <!-- Academic Details -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
            Academic Details
        </h2>
        <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
                <dt class="text-gray-500">Class</dt>
                <dd class="text-gray-900 font-medium"><?= e($className) ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Section</dt>
                <dd class="text-gray-900 font-medium"><?= e($sectionName) ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Roll Number</dt>
                <dd class="text-gray-900 font-medium"><?= e($s['roll_number'] ?? '—') ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Admission No.</dt>
                <dd class="text-gray-900 font-medium"><?= e($s['admission_number'] ?? '—') ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Admission Date</dt>
                <dd class="text-gray-900 font-medium"><?= formatDate($s['admission_date'] ?? null) ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Type</dt>
                <dd class="text-gray-900 font-medium"><?= e(($s['student_type'] ?? 'day_scholar') === 'boarder' ? 'Boarder' : 'Day Scholar') ?></dd>
            </div>
        </dl>

        <?php if ($s['previous_school_name'] ?? ''): ?>
        <div class="mt-4 pt-4 border-t border-gray-100">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Previous School</h3>
            <p class="text-sm text-gray-900"><?= e($s['previous_school_name']) ?></p>
            <?php if ($s['previous_school_class'] ?? ''): ?>
                <p class="text-xs text-gray-500">Class: <?= e($s['previous_school_class']) ?></p>
            <?php endif; ?>
            <?php if ($s['previous_school_passout_year'] ?? 0): ?>
                <p class="text-xs text-gray-500">Year: <?= (int)$s['previous_school_passout_year'] ?></p>
            <?php endif; ?>
        </div>
        <?php endif; ?>
    </div>

    <!-- Guardian Details -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-indigo-500"></div>
            Guardian / Parent
        </h2>
        <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
                <dt class="text-gray-500">Name</dt>
                <dd class="text-gray-900 font-medium"><?= e($s['guardian_name'] ?? '—') ?></dd>
            </div>
            <div class="flex justify-between">
                <dt class="text-gray-500">Phone</dt>
                <dd class="text-gray-900 font-medium"><?= e($s['guardian_phone'] ?? '—') ?></dd>
            </div>
        </dl>

        <?php if (trim((string)($s['guardian_name_2'] ?? '')) !== '' || trim((string)($s['guardian_phone_2'] ?? '')) !== ''): ?>
        <div class="mt-4 pt-4 border-t border-gray-100">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Second guardian<?= trim((string)($s['guardian_relation_2'] ?? '')) !== '' ? ' · ' . e($s['guardian_relation_2']) : '' ?>
            </h3>
            <dl class="space-y-2 text-sm">
                <div class="flex justify-between">
                    <dt class="text-gray-500">Name</dt>
                    <dd class="text-gray-900 font-medium"><?= e($s['guardian_name_2'] ?? '—') ?></dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">Phone</dt>
                    <dd class="text-gray-900 font-medium"><?= e($s['guardian_phone_2'] ?? '—') ?></dd>
                </div>
            </dl>
            <p class="text-[11px] text-gray-400 mt-2">Receives all SMS notices alongside the first guardian.</p>
        </div>
        <?php endif; ?>

        <?php if (!empty($guardianRows)): ?>
        <div class="mt-4 pt-4 border-t border-gray-100">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">On the admission form</h3>
            <div class="space-y-2">
                <?php foreach ($guardianRows as $g): ?>
                <div class="text-sm">
                    <span class="font-medium text-gray-900"><?= e($g['name']) ?></span>
                    <span class="text-gray-400"> · <?= e($g['relation'] ?: 'Guardian') ?></span>
                    <?php if (!empty($g['is_billing_contact'])): ?><span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">fees contact</span><?php endif; ?>
                    <p class="text-xs text-gray-500"><?= e(implode(' · ', array_filter([$g['phone'] ?? '', !empty($g['id_number']) ? 'ID ' . $g['id_number'] : '', $g['occupation'] ?? '', $g['email'] ?? '']))) ?></p>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>

        <!-- Emergency contacts -->
        <div class="mt-4 pt-4 border-t border-gray-100">
            <div class="flex items-center justify-between mb-2">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Emergency contacts</h3>
                <?php if (userCan('students.manage')): ?><button type="button" onclick="document.getElementById('emergEdit').classList.toggle('hidden')" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium"><?= $emergencyRows ? 'Edit' : 'Add' ?></button><?php endif; ?>
            </div>
            <?php if (empty($emergencyRows)): ?>
                <p class="text-sm text-amber-600">None on file — someone to call if the parents can't be reached.</p>
            <?php else: foreach ($emergencyRows as $c): ?>
                <div class="text-sm mb-1"><span class="font-medium text-gray-900"><?= e($c['name']) ?></span><?= !empty($c['relationship']) ? ' <span class="text-gray-400">· ' . e($c['relationship']) . '</span>' : '' ?> <span class="text-gray-600">· <?= e($c['phone']) ?></span></div>
            <?php endforeach; endif; ?>
            <?php if (userCan('students.manage')): ?>
            <form method="POST" id="emergEdit" class="hidden mt-3 space-y-2">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="save_emergency">
                <?php foreach ([1, 2] as $n): $c = $emergencyRows[$n - 1] ?? []; ?>
                <div class="grid grid-cols-3 gap-2">
                    <input type="text" name="emergency[<?= $n ?>][name]" value="<?= e($c['name'] ?? '') ?>" placeholder="Name" class="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm">
                    <input type="text" name="emergency[<?= $n ?>][relationship]" value="<?= e($c['relationship'] ?? '') ?>" placeholder="Relationship" class="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm">
                    <input type="text" name="emergency[<?= $n ?>][phone]" value="<?= e($c['phone'] ?? '') ?>" placeholder="Mobile" class="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm">
                </div>
                <?php endforeach; ?>
                <button type="submit" class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Save contacts</button>
            </form>
            <?php endif; ?>
        </div>

        <?php if ($canSeeMedical): ?>
        <!-- Medical — admin and head teacher only -->
        <div class="mt-4 pt-4 border-t border-gray-100">
            <div class="flex items-center justify-between mb-2">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Medical <span class="normal-case font-normal text-gray-400">· admin &amp; head only</span></h3>
                <button type="button" onclick="document.getElementById('medEdit').classList.toggle('hidden')" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium"><?= $medical ? 'Edit' : 'Add' ?></button>
            </div>
            <?php if (!$medical): ?>
                <p class="text-sm text-gray-400">Nothing on file.</p>
            <?php else: ?>
                <?php if ($medFlags): ?>
                    <div class="flex flex-wrap gap-1.5 mb-2"><?php foreach ($medFlags as $f): ?><span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700"><?= e($f) ?></span><?php endforeach; ?></div>
                <?php else: ?>
                    <p class="text-sm text-gray-600 mb-1">No conditions declared.</p>
                <?php endif; ?>
                <dl class="text-sm space-y-1">
                    <?php if (!empty($medical['treatment_details'])): ?><div><dt class="inline text-gray-500">Treatment:</dt> <dd class="inline text-gray-800"><?= e($medical['treatment_details']) ?></dd></div><?php endif; ?>
                    <?php if (!empty($medical['medication_details'])): ?><div><dt class="inline text-gray-500">Medication:</dt> <dd class="inline text-gray-800"><?= e($medical['medication_details']) ?></dd></div><?php endif; ?>
                    <div><dt class="inline text-gray-500">May administer medication:</dt> <dd class="inline font-medium <?= ($medical['may_administer'] ?? null) === true ? 'text-emerald-700' : 'text-red-600' ?>"><?= ($medical['may_administer'] ?? null) === true ? 'Yes' : (($medical['may_administer'] ?? null) === false ? 'No' : '—') ?></dd></div>
                </dl>
            <?php endif; ?>
            <form method="POST" id="medEdit" class="hidden mt-3 space-y-2">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="save_medical">
                <?php $mc = $medical['conditions'] ?? []; foreach ($condLabels as $ck => $cl): $cur = $mc[$ck] ?? 'none'; ?>
                <div class="flex items-center justify-between gap-2 text-sm">
                    <span class="text-gray-700"><?= e($cl) ?></span>
                    <select name="cond[<?= $ck ?>]" class="px-2 py-1 rounded-lg border border-gray-200 text-xs">
                        <?php foreach (['none' => 'No', 'mild' => 'Mild', 'moderate' => 'Moderate', 'severe' => 'Severe'] as $sk => $sv): ?><option value="<?= $sk ?>"<?= $cur === $sk ? ' selected' : '' ?>><?= $sv ?></option><?php endforeach; ?>
                    </select>
                </div>
                <?php endforeach; ?>
                <input type="text" name="cond_other" value="<?= e($medical['other_condition'] ?? '') ?>" placeholder="Other condition" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm">
                <?php foreach ([['needs_treatment', 'treatment_details', 'Requires treatment', 'Treatment details'], ['regular_medication', 'medication_details', 'Regular medication', 'Medication and dosage'], ['may_administer', null, 'School may administer medication', null]] as [$k, $dk, $lbl, $dlbl]):
                    $v = $medical[$k] ?? null; ?>
                <div class="flex items-center justify-between gap-2 text-sm">
                    <span class="text-gray-700"><?= e($lbl) ?></span>
                    <select name="<?= $k ?>" class="px-2 py-1 rounded-lg border border-gray-200 text-xs">
                        <option value=""<?= $v === null ? ' selected' : '' ?>>—</option>
                        <option value="no"<?= $v === false ? ' selected' : '' ?>>No</option>
                        <option value="yes"<?= $v === true ? ' selected' : '' ?>>Yes</option>
                    </select>
                </div>
                <?php if ($dk): ?><input type="text" name="<?= $dk ?>" value="<?= e($medical[$dk] ?? '') ?>" placeholder="<?= e($dlbl) ?>" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"><?php endif; ?>
                <?php endforeach; ?>
                <button type="submit" class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Save medical</button>
            </form>
        </div>
        <?php endif; ?>

        <?php if ($s['extra_notes'] ?? ''): ?>
        <div class="mt-4 pt-4 border-t border-gray-100">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h3>
            <p class="text-sm text-gray-700"><?= nl2br(e($s['extra_notes'])) ?></p>
        </div>
        <?php endif; ?>

        <!-- Fee Summary -->
        <?php $studentCredit = (float)($s['credit_balance'] ?? 0); ?>
        <div class="mt-4 pt-4 border-t border-gray-100">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Fee Summary</h3>
            <div class="grid grid-cols-<?= $studentCredit > 0 ? '3' : '2' ?> gap-3">
                <div class="bg-emerald-50 rounded-lg p-3 text-center">
                    <p class="text-xs text-emerald-600">Total Billed</p>
                    <p class="text-lg font-bold text-emerald-700"><?= money($totalBilled) ?></p>
                </div>
                <div class="bg-rose-50 rounded-lg p-3 text-center">
                    <p class="text-xs text-rose-600">Outstanding</p>
                    <p class="text-lg font-bold text-rose-700"><?= money($totalBilled - $totalPaid) ?></p>
                </div>
                <?php if ($studentCredit > 0): ?>
                <div class="bg-cyan-50 rounded-lg p-3 text-center"
                     title="Credit from overpayments. Applies automatically to the next invoice.">
                    <p class="text-xs text-cyan-600">Credit</p>
                    <p class="text-lg font-bold text-cyan-700"><?= money($studentCredit) ?></p>
                </div>
                <?php endif; ?>
            </div>
        </div>

        <!-- Attendance -->
        <div class="mt-4 pt-4 border-t border-gray-100">
            <div class="flex items-baseline justify-between mb-3">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendance <span class="normal-case font-normal text-gray-400">· <?= e($attTerm['name'] ?? 'this term') ?></span></h3>
                <a href="<?= baseUrl('students/attendance') ?>" class="text-[11px] text-emerald-700 font-medium">Register →</a>
            </div>
            <?php if ($attDays === 0): ?>
                <p class="text-sm text-gray-400">No attendance marked this term.</p>
            <?php else: ?>
            <div class="flex items-center gap-4">
                <div class="text-center flex-none">
                    <p class="text-2xl font-bold tabular-nums <?= $attPct >= 90 ? 'text-emerald-700' : ($attPct >= 75 ? 'text-amber-600' : 'text-rose-600') ?>"><?= $attPct ?>%</p>
                    <p class="text-[11px] text-gray-500"><?= $attDays ?> day<?= $attDays === 1 ? '' : 's' ?> marked</p>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex h-2 rounded-full overflow-hidden bg-gray-100 mb-2">
                        <div class="bg-emerald-500" style="width:<?= round($att['present'] / $attDays * 100, 1) ?>%"></div>
                        <div class="bg-amber-400"   style="width:<?= round($att['late'] / $attDays * 100, 1) ?>%"></div>
                        <div class="bg-rose-500"    style="width:<?= round($att['absent'] / $attDays * 100, 1) ?>%"></div>
                    </div>
                    <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                        <span><span class="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1 align-middle"></span>Present <b class="text-gray-900 tabular-nums"><?= $att['present'] ?></b></span>
                        <span><span class="inline-block w-2 h-2 rounded-sm bg-amber-400 mr-1 align-middle"></span>Late <b class="text-gray-900 tabular-nums"><?= $att['late'] ?></b></span>
                        <span><span class="inline-block w-2 h-2 rounded-sm bg-rose-500 mr-1 align-middle"></span>Absent <b class="text-gray-900 tabular-nums"><?= $att['absent'] ?></b></span>
                    </div>
                    <?php if ($attRecent): ?>
                    <div class="flex gap-1 mt-2" title="Last <?= count($attRecent) ?> days marked, oldest to newest">
                        <?php foreach (array_reverse($attRecent) as $r): $st = strtolower((string)$r['status']);
                              $c = $st === 'present' ? 'bg-emerald-500' : ($st === 'late' ? 'bg-amber-400' : ($st === 'absent' ? 'bg-rose-500' : 'bg-gray-300')); ?>
                            <span class="w-3 h-3 rounded-sm <?= $c ?>" title="<?= e(date('D j M', strtotime($r['date']))) ?> · <?= e($st) ?>"></span>
                        <?php endforeach; ?>
                    </div>
                    <?php endif; ?>
                </div>
            </div>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- Transport -->
<?php
$trCurRoute = $trCurrent ? ($trRouteMap[$trCurrent['route_id']] ?? null) : null;
$trCurFee   = $trCurrent ? (float)($trCurrent['fee_amount'] ?? 0) : 0.0;
$trStdFee   = $trCurRoute ? (float)($trCurRoute['fee_amount'] ?? 0) : 0.0;
$trDate     = fn($d) => $d ? date('j M Y', strtotime($d)) : '—';
?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6 overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-amber-500"></div>
            Transport
        </h2>
        <?php if ($canEditTransport): ?>
            <button type="button" onclick="document.getElementById('trEdit').classList.toggle('hidden')"
                    class="text-xs font-medium text-emerald-600 hover:text-emerald-700"><?= $trCurrent ? 'Change route' : 'Add transport' ?></button>
        <?php endif; ?>
    </div>

    <div class="px-5 py-4">
        <?php if ($trCurrent && $trCurRoute): ?>
            <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
                <div>
                    <p class="text-xs text-gray-500">Route</p>
                    <p class="text-sm font-semibold text-gray-900"><?= e($trCurRoute['name']) ?></p>
                    <?php if (!empty($trCurRoute['start_location']) || !empty($trCurRoute['end_location'])): ?>
                        <p class="text-xs text-gray-400"><?= e(trim(($trCurRoute['start_location'] ?? '') . ' → ' . ($trCurRoute['end_location'] ?? ''), ' →')) ?></p>
                    <?php endif; ?>
                </div>
                <div>
                    <p class="text-xs text-gray-500">Pickup point</p>
                    <p class="text-sm font-semibold text-gray-900"><?= e($trZoneMap[$trCurrent['zone_id'] ?? '']['name'] ?? '—') ?></p>
                    <?php if (empty($trCurrent['zone_id']) && !empty(array_filter($trZones, fn($z) => $z['route_id'] === $trCurrent['route_id']))): ?>
                        <p class="text-xs text-amber-600">not set — this route has named points</p>
                    <?php endif; ?>
                </div>
                <div>
                    <p class="text-xs text-gray-500">Fee per term</p>
                    <p class="text-sm font-semibold text-gray-900"><?= money($trCurFee) ?></p>
                    <?php if ($trStdFee > 0 && abs($trCurFee - $trStdFee) > 0.005): ?>
                        <p class="text-xs text-amber-600" title="<?= e($trCurrent['fee_reason'] ?? '') ?>">
                            not the standard <?= money($trStdFee) ?><?= !empty($trCurrent['fee_reason']) ? ' · ' . e($trCurrent['fee_reason']) : '' ?>
                        </p>
                    <?php endif; ?>
                </div>
                <div>
                    <p class="text-xs text-gray-500">Since</p>
                    <p class="text-sm font-semibold text-gray-900"><?= e($trDate($trCurrent['start_date'] ?? $trCurrent['created_at'])) ?></p>
                </div>
            </div>
        <?php elseif ($trCurrent): ?>
            <p class="text-sm text-amber-700">On a route that no longer exists. Pick a current one.</p>
        <?php else: ?>
            <p class="text-sm text-gray-500">Not on school transport.</p>
        <?php endif; ?>

        <?php if ($canEditTransport): ?>
        <!-- Change form -->
        <form method="POST" id="trEdit" class="hidden mt-5 pt-5 border-t border-gray-100">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="save_transport">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Route</label>
                    <select name="route_id" id="trRoute" onchange="trFill()"
                            class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
                        <option value="">No transport</option>
                        <?php foreach ($trRoutes as $r): ?>
                            <?php if (empty($r['is_active']) && ($trCurrent['route_id'] ?? '') !== $r['id']) continue; ?>
                            <option value="<?= e($r['id']) ?>" data-fee="<?= e((string)(float)($r['fee_amount'] ?? 0)) ?>"
                                <?= ($trCurrent['route_id'] ?? '') === $r['id'] ? 'selected' : '' ?>>
                                <?= e($r['name']) ?> — <?= money((float)($r['fee_amount'] ?? 0)) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Pickup point</label>
                    <select name="zone_id" id="trZone"
                            class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
                        <option value="">Not specified</option>
                        <?php foreach ($trZones as $z): ?>
                            <option value="<?= e($z['id']) ?>" data-route="<?= e($z['route_id']) ?>"
                                <?= ($trCurrent['zone_id'] ?? '') === $z['id'] ? 'selected' : '' ?>><?= e($z['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                    <p class="text-[11px] text-gray-400 mt-1">Where on the route this child is collected. Add points under Transport → Buses &amp; zones.</p>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Fee per term</label>
                    <input type="text" name="fee_amount" id="trFee" value="<?= $trCurrent ? e(number_format($trCurFee, 2, '.', '')) : '' ?>"
                           class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
                    <p class="text-[11px] text-gray-400 mt-1">Leave as the route's fee unless this child pays differently.</p>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Reason <span class="text-gray-400">(if not the standard fee)</span></label>
                    <input type="text" name="fee_reason" maxlength="200" value="<?= e($trCurrent['fee_reason'] ?? '') ?>"
                           placeholder="e.g. staff child, shared with sibling"
                           class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">From</label>
                    <input type="date" name="start_date" value="<?= e(date('Y-m-d')) ?>"
                           class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
                </div>
            </div>

            <?php if ($trInvoice): ?>
            <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p class="text-xs font-medium text-gray-700 mb-2">
                    This term already has invoice <?= e($trInvoice['reference'] ?? '') ?>
                    (<?= money((float)$trInvoice['amount']) ?><?= (float)($trInvoice['paid_amount'] ?? 0) > 0 ? ', ' . money((float)$trInvoice['paid_amount']) . ' paid' : '' ?>).
                </p>
                <label class="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="apply_invoice" value="0" checked class="mt-0.5 w-4 h-4 border-gray-300 text-emerald-600">
                    <span>Leave it alone — the new route applies from the next invoice.</span>
                </label>
                <label class="flex items-start gap-2 text-sm text-gray-700 cursor-pointer mt-1.5">
                    <input type="radio" name="apply_invoice" value="1" class="mt-0.5 w-4 h-4 border-gray-300 text-emerald-600">
                    <span>Adjust it now — replace the transport line and change the total by the difference.</span>
                </label>
            </div>
            <?php endif; ?>

            <div class="mt-4 flex items-center gap-2">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save transport</button>
                <button type="button" onclick="document.getElementById('trEdit').classList.add('hidden')"
                        class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
        <script>
        function trFill() {
            var sel = document.getElementById('trRoute'), fee = document.getElementById('trFee');
            var opt = sel.options[sel.selectedIndex];
            fee.value = opt && opt.dataset.fee ? opt.dataset.fee : '';
            trZones();
        }
        // Only the pickup points that belong to the chosen route.
        function trZones() {
            var route = document.getElementById('trRoute').value, z = document.getElementById('trZone');
            if (!z) return;
            var keep = z.value;
            Array.from(z.options).forEach(function (o) {
                var mine = !o.value || o.dataset.route === route;
                o.hidden = !mine; o.disabled = !mine;
            });
            var cur = z.options[z.selectedIndex];
            if (cur && cur.disabled) z.value = '';
        }
        trZones();
        </script>
        <?php endif; ?>

        <?php if ($trHistory): ?>
        <div class="mt-5 pt-4 border-t border-gray-100">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Previously</h3>
            <ul class="space-y-1.5">
                <?php foreach (array_slice($trHistory, 0, 5) as $h): ?>
                    <li class="text-xs text-gray-500 flex flex-wrap items-baseline gap-x-2">
                        <span class="text-gray-700 font-medium"><?= e($trRouteMap[$h['route_id']]['name'] ?? 'Route removed') ?></span>
                        <span><?= money((float)($h['fee_amount'] ?? 0)) ?></span>
                        <span><?= e($trDate($h['start_date'] ?? $h['created_at'])) ?> – <?= e($trDate($h['end_date'])) ?></span>
                        <?php if (!empty($h['changed_by'])): ?><span class="text-gray-400">· <?= e($h['changed_by']) ?></span><?php endif; ?>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>
        <?php endif; ?>
    </div>
</div>

<!-- Recent Invoices -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-700">Recent Invoices</h2>
            <a href="<?= baseUrl('fees/invoices?student_id=' . $id) ?>" class="text-xs text-emerald-600 hover:text-emerald-700">View All</a>
        </div>
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-2 font-medium text-gray-500">Reference</th>
                    <th class="text-right px-4 py-2 font-medium text-gray-500">Amount</th>
                    <th class="text-center px-4 py-2 font-medium text-gray-500">Status</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($invoices)): ?>
                    <tr><td colspan="3" class="px-4 py-6 text-center text-gray-400 text-xs">No invoices</td></tr>
                <?php else: ?>
                    <?php foreach ($invoices as $inv): ?>
                        <tr class="hover:bg-gray-50/50">
                            <td class="px-4 py-2 text-gray-900"><?= e($inv['reference'] ?? '—') ?></td>
                            <td class="px-4 py-2 text-right text-gray-600"><?= money((float)($inv['amount'] ?? 0)) ?></td>
                            <td class="px-4 py-2 text-center">
                                <?php
                                    $st = $inv['status'] ?? 'unpaid';
                                    $colors = ['paid' => 'bg-emerald-50 text-emerald-700', 'partial' => 'bg-amber-50 text-amber-700', 'unpaid' => 'bg-red-50 text-red-700'];
                                ?>
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium <?= $colors[$st] ?? 'bg-gray-100 text-gray-600' ?>"><?= e(ucfirst($st)) ?></span>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>

    <!-- Recent Payments -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-700">Recent Payments</h2>
        </div>
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-2 font-medium text-gray-500">Date</th>
                    <th class="text-right px-4 py-2 font-medium text-gray-500">Amount</th>
                    <th class="text-left px-4 py-2 font-medium text-gray-500">Method</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($payments)): ?>
                    <tr><td colspan="3" class="px-4 py-6 text-center text-gray-400 text-xs">No payments</td></tr>
                <?php else: ?>
                    <?php foreach ($payments as $p): ?>
                        <tr class="hover:bg-gray-50/50">
                            <td class="px-4 py-2 text-gray-600"><?= formatDate($p['paid_at'] ?? null) ?></td>
                            <td class="px-4 py-2 text-right text-gray-900 font-medium"><?= money((float)($p['amount'] ?? 0)) ?></td>
                            <td class="px-4 py-2 text-gray-600"><?= e(ucfirst(str_replace('_', ' ', $p['method'] ?? '—'))) ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
