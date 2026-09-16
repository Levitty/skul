<?php
/**
 * Add a new student — step-by-step wizard.
 * Steps: 1) Personal Info → 2) Guardian → 3) Academic → 4) Previous School → 5) Fees & Services
 * On submit: creates student, enrollment, assigns transport/activities, generates invoice.
 */
$pageTitle = 'Add Student';
$sb  = new Supabase();
$sid = schoolId();

$classes = cachedClasses();

// Fetch sections
$sectionRows = $sb->from('sections')->select('id,class_id,name')->execute();
$sections = $sectionRows['data'] ?? [];
$sectionsByClass = [];
foreach ($sections as $sec) {
    $sectionsByClass[$sec['class_id']][] = $sec;
}

// Fetch fee heads
$feeHeadsResult = $sb->from('fee_heads')->select('id,name,amount,class_id,category,is_mandatory')->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$allFeeHeads = $feeHeadsResult['data'] ?? [];

// Group fee heads by class_id (null = all classes)
$feeHeadsByClass = ['_all' => []];
foreach ($allFeeHeads as $fh) {
    if (empty($fh['class_id'])) {
        $feeHeadsByClass['_all'][] = $fh;
    } else {
        $feeHeadsByClass[$fh['class_id']][] = $fh;
    }
}

// Fetch transport routes
$routesResult = $sb->from('transport_routes')->select('id,name,fee_amount,start_location,end_location')->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$transportRoutes = $routesResult['data'] ?? [];

// Fetch activities
$activitiesResult = $sb->from('activities')->select('id,name,fee_amount,description')->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$activities = $activitiesResult['data'] ?? [];

// Fetch existing students for the sibling picker (lightweight — only what's needed)
// Used to let users link a new admission to an existing family without typing IDs.
$siblingPickerRes = $sb->from('students')
    ->select('id,first_name,last_name,admission_number,family_id,current_class_id,guardian_name')
    ->eq('school_id', $sid)->eq('status', 'active')
    ->order('first_name')
    ->execute();
$existingStudents = $siblingPickerRes['data'] ?? [];

// Build a class_id => class_name map so we can label siblings nicely
$classNameMap = [];
foreach ($classes as $c) $classNameMap[$c['id']] = $c['name'] ?? '';

// Academic year & term
$yearResult = $sb->from('academic_years')->select('id')->eq('school_id', $sid)->eq('is_current', 'true')->single()->execute();
$academicYearId = $yearResult['data'][0]['id'] ?? null;

$termResult = $sb->from('terms')->select('id,name,academic_year_id')->eq('school_id', $sid)->eq('is_current', 'true')->single()->execute();
$currentTerm = $termResult['data'][0] ?? null;
$termId = $currentTerm['id'] ?? null;
if (!$academicYearId && $currentTerm) $academicYearId = $currentTerm['academic_year_id'] ?? null;

// ── Pre-load schedules for the active term, keyed by class_id ──
// Used by the Fees step JS to show the right schedule when a class is picked.
$schedulesByClass = []; // class_id => ['id','name','items' => [{name, amount, category}, ...]]
if ($termId) {
    $schedRes = $sb->from('fee_groups')
        ->select('id,name,class_id,billing_cycle')
        ->eq('school_id', $sid)->eq('term_id', $termId)->eq('is_active', 'true')
        ->execute();
    $schedules = $schedRes['data'] ?? [];

    if (!empty($schedules)) {
        $schedIds = array_column($schedules, 'id');
        $schedItemsRes = $sb->from('fee_group_items')
            ->select('fee_group_id,fee_head_id,amount')
            ->in('fee_group_id', $schedIds)
            ->execute();
        $rawSchedItems = $schedItemsRes['data'] ?? [];

        $headIds = array_unique(array_column($rawSchedItems, 'fee_head_id'));
        $schedHeadMap = [];
        if (!empty($headIds)) {
            $schedHeadsRes = $sb->from('fee_heads')->select('id,name,category')->in('id', $headIds)->execute();
            foreach (($schedHeadsRes['data'] ?? []) as $h) $schedHeadMap[$h['id']] = $h;
        }

        foreach ($schedules as $sched) {
            $items = [];
            foreach ($rawSchedItems as $it) {
                if ($it['fee_group_id'] === $sched['id']) {
                    $h = $schedHeadMap[$it['fee_head_id']] ?? ['name' => 'Fee', 'category' => 'other'];
                    $items[] = [
                        'fee_head_id' => $it['fee_head_id'],
                        'amount'      => (float)$it['amount'],
                        'name'        => $h['name'],
                        'category'    => $h['category'],
                    ];
                }
            }
            if (!empty($sched['class_id'])) {
                $schedulesByClass[$sched['class_id']] = [
                    'id'    => $sched['id'],
                    'name'  => $sched['name'],
                    'items' => $items,
                ];
            }
        }
    }
}

$errors = [];

if (isPost() && verifyCsrf()) {
    $firstName = input('first_name');
    $lastName  = input('last_name');
    $admNo     = input('admission_number');
    $gender    = input('gender');
    $dob       = input('dob');
    $classId   = input('class_id');

    if (!$firstName) $errors[] = 'First name is required';
    if (!$lastName)  $errors[] = 'Last name is required';
    if (!$classId)   $errors[] = 'Class is required';

    if ($admNo) {
        $dup = $sb->from('students')->select('id')->eq('school_id', $sid)->eq('admission_number', $admNo)->eq('status', 'active')->single()->execute();
        if (!empty($dup['data'])) $errors[] = 'Admission number already exists';
    }

    // ── Resolve family_id from picked sibling ────────────
    // The form sends `sibling_id` when the user picks an existing student to
    // link this new admission to a family. We derive family_id from there.
    // If the sibling has no family_id yet, we mint one (FAM-XXXX) and update
    // the sibling so both records point to the same family afterwards.
    $siblingId       = input('sibling_id');
    $resolvedFamilyId = null;
    $siblingToUpdate  = null; // tuple [id, family_id_to_set] if we need to backfill

    if ($siblingId) {
        $sibRes = $sb->from('students')
            ->select('id,family_id')
            ->eq('school_id', $sid)->eq('id', $siblingId)->eq('status', 'active')
            ->single()->execute();
        $sibling = $sibRes['data'][0] ?? null;
        if ($sibling) {
            if (!empty($sibling['family_id'])) {
                $resolvedFamilyId = $sibling['family_id'];
            } else {
                // Mint a new family_id and remember to backfill the sibling after
                // the new student is created.
                $resolvedFamilyId = 'FAM-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
                $siblingToUpdate  = ['id' => $sibling['id'], 'family_id' => $resolvedFamilyId];
            }
        }
    } elseif (input('family_id')) {
        // Backwards compat: still accept a manually-typed family_id
        $resolvedFamilyId = input('family_id');
    }

    // ── Auto-generate roll_number if not provided ────────
    // Convention: next ordinal within the chosen class. Schools that want
    // their own scheme can still type one explicitly.
    $rollNumber = input('roll_number');
    if (!$rollNumber && $classId) {
        $classCountRes = $sb->from('students')
            ->select('id')
            ->eq('school_id', $sid)
            ->eq('current_class_id', $classId)
            ->eq('status', 'active')
            ->execute();
        $existingInClass = is_array($classCountRes['data'] ?? null) ? count($classCountRes['data']) : 0;
        $rollNumber = (string)($existingInClass + 1);
    }

    if (empty($errors)) {
        $data = [
            'school_id'              => $sid,
            'first_name'             => $firstName,
            'last_name'              => $lastName,
            'admission_number'       => $admNo ?: null, // DB trigger fills if null
            'gender'                 => $gender ?: null,
            'dob'                    => $dob ?: null,
            'current_class_id'       => $classId,
            'section_id'             => input('section_id') ?: null,
            'student_type'           => input('student_type') ?: 'day_scholar',
            'religion'               => input('religion') ?: null,
            'blood_group'            => input('blood_group') ?: null,
            'address'                => input('address') ?: null,
            'phone'                  => input('phone') ?: null,
            'email'                  => input('email') ?: null,
            'city'                   => input('city') ?: null,
            'country'                => input('country') ?: null,
            'birth_place'            => input('birth_place') ?: null,
            'roll_number'            => $rollNumber ?: null,
            'admission_date'         => input('admission_date') ?: date('Y-m-d'),
            'family_id'              => $resolvedFamilyId,
            'guardian_name'          => input('guardian_name') ?: null,
            'guardian_phone'         => input('guardian_phone') ?: null,
            'guardian_name_2'        => input('guardian_name_2') ?: null,
            'guardian_phone_2'       => input('guardian_phone_2') ?: null,
            'guardian_relation_2'    => input('guardian_relation_2') ?: null,
            'previous_school_name'   => input('previous_school_name') ?: null,
            'previous_school_address'=> input('previous_school_address') ?: null,
            'previous_school_class'  => input('previous_school_class') ?: null,
            'previous_school_passout_year' => input('previous_school_passout_year') ? (int)input('previous_school_passout_year') : null,
            'extra_notes'            => input('extra_notes') ?: null,
            'status'                 => 'active',
        ];

        $result = $sb->from('students')->insert($data);

        if ($result['error']) {
            $errors[] = $result['error'];
        } else {
            $studentId = $result['data'][0]['id'] ?? null;

            // Backfill the sibling's family_id if we minted a new one — both
            // records now share the same family.
            if ($siblingToUpdate) {
                $sb->from('students')
                    ->eq('id', $siblingToUpdate['id'])->eq('school_id', $sid)
                    ->update(['family_id' => $siblingToUpdate['family_id']]);
            }

            // Create enrollment
            if ($studentId && $academicYearId) {
                $sb->from('enrollments')->insert([
                    'student_id'       => $studentId,
                    'class_id'         => $classId,
                    'section_id'       => input('section_id') ?: null,
                    'academic_year_id' => $academicYearId,
                    'school_id'        => $sid,
                ]);
            }

            // Assign transport route
            // The column is route_id. This used to write transport_route_id,
            // which does not exist, so every assignment made here was silently
            // dropped by Postgres while the invoice still carried the fee.
            $transportId = input('transport_route_id');
            if ($studentId && $transportId) {
                $tRoute = null;
                foreach ($transportRoutes as $tr) if ($tr['id'] === $transportId) { $tRoute = $tr; break; }
                $sb->from('student_transport')->insert([
                    'student_id'  => $studentId,
                    'route_id'    => $transportId,
                    'school_id'   => $sid,
                    'fee_amount'  => (float)($tRoute['fee_amount'] ?? 0),
                    'start_date'  => date('Y-m-d'),
                    'is_active'   => true,
                    'term_id'     => $termId ?: null,
                    'academic_year_id' => $academicYearId ?: null,
                ]);
            }

            // Assign activities
            $activityIds = $_POST['activity_ids'] ?? [];
            foreach ($activityIds as $actId) {
                $sb->from('student_activities')->insert([
                    'student_id'  => $studentId,
                    'activity_id' => $actId,
                    'school_id'   => $sid,
                ]);
            }

            // ── Generate first invoice via the atomic RPC ──
            // Uses the schedule for (class, current term) — the same one
            // bulk-generate uses, ensuring consistency across admission and term-end.
            $generateInvoice = input('generate_invoice') === '1';
            $scheduleId      = input('schedule_id');
            $invoiceMessage  = '';

            if ($generateInvoice && $studentId && $scheduleId && $termId) {
                $prorationPct = (int)(input('proration_percent') ?: 100);
                if ($prorationPct === 0) {
                    // 0 means "Custom" was selected — read the custom value
                    $prorationPct = max(1, min(100, (int)(input('proration_custom') ?: 100)));
                }

                $studentPayload = [[
                    'student_id'         => $studentId,
                    'transport_route_id' => $transportId ?: null,
                    'activity_ids'       => array_values($activityIds),
                    'proration_percent'  => $prorationPct,
                ]];

                $invStatus = input('invoice_status') === 'draft' ? 'draft' : 'unpaid';
                $user      = currentUser();
                $invPrefix = schoolSetting('invoice_prefix', 'INV');

                $rpcResult = $sb->rpc('generate_invoices_for_class', [
                    'p_school_id'      => $sid,
                    'p_class_id'       => $classId,
                    'p_fee_group_id'   => $scheduleId,
                    'p_term_id'        => $termId,
                    'p_due_date'       => input('due_date') ?: null,
                    'p_user_id'        => $user['id']    ?? null,
                    'p_user_email'     => $user['email'] ?? null,
                    'p_students'       => $studentPayload,
                    'p_invoice_prefix' => $invPrefix,
                    'p_status'         => $invStatus,
                ]);

                if (!empty($rpcResult['error'])) {
                    $invoiceMessage = ' But invoice failed: ' . $rpcResult['error'] . ' (you can generate one later via Bulk Generate).';
                } else {
                    $payload = $rpcResult['data'] ?? [];
                    $generated = (int)($payload['generated_count'] ?? 0);
                    if ($generated > 0) {
                        $invoiceMessage = $invStatus === 'draft'
                            ? ' Draft invoice created — review on the Invoices page before issuing.'
                            : ' Invoice issued and ready for payment.';
                        if ($prorationPct < 100) {
                            $invoiceMessage .= ' Prorated at ' . $prorationPct . '%.';
                        }
                    }
                }
            }

            auditLog('create', 'student', $studentId, ['name' => $firstName . ' ' . $lastName, 'class_id' => $classId]);
            flash('success', 'Student added successfully.' . $invoiceMessage);
            redirect('students');
        }
    }
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<script>
// Wizard navigation — defined early so buttons work immediately
const steps = ['personal', 'guardian', 'academic', 'previous', 'fees'];
let currentStep = 0;

function showStep(idx) {
    currentStep = idx;
    steps.forEach((s, i) => {
        document.getElementById('step-' + s).classList.toggle('hidden', i !== idx);
    });
    // Update step indicators
    document.querySelectorAll('.step-indicator').forEach((el, i) => {
        if (i < idx) {
            el.className = 'step-indicator flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white text-sm font-semibold';
        } else if (i === idx) {
            el.className = 'step-indicator flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white text-sm font-semibold ring-4 ring-emerald-100';
        } else {
            el.className = 'step-indicator flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-500 text-sm font-semibold';
        }
    });
    // Update step labels
    document.querySelectorAll('.step-label').forEach((el, i) => {
        el.className = 'step-label text-xs mt-1 ' + (i <= idx ? 'text-emerald-700 font-medium' : 'text-gray-400');
    });
    // Show/hide buttons
    document.getElementById('btnBack').classList.toggle('hidden', idx === 0);
    document.getElementById('btnNext').classList.toggle('hidden', idx === steps.length - 1);
    document.getElementById('btnSubmit').classList.toggle('hidden', idx !== steps.length - 1);
    // Recalculate fees when reaching fees step
    if (idx === steps.length - 1) updateFeeTotal();
}

function nextStep() {
    // Validate current step
    if (currentStep === 0) {
        if (!document.querySelector('[name=first_name]').value || !document.querySelector('[name=last_name]').value) {
            alert('First name and last name are required.'); return;
        }
    }
    if (currentStep === 2) {
        if (!document.querySelector('[name=class_id]').value) {
            alert('Please select a class.'); return;
        }
        loadClassFees();
    }
    if (currentStep < steps.length - 1) showStep(currentStep + 1);
}

function prevStep() {
    if (currentStep > 0) showStep(currentStep - 1);
}

// Pre-loaded data
const schedulesByClass = <?= jsonHtml($schedulesByClass) ?>;
const transportRoutes  = <?= jsonHtml($transportRoutes) ?>;
const activitiesList   = <?= jsonHtml($activities) ?>;

let currentSchedule = null;  // { id, name, items[] }

function loadClassFees() {
    const classId  = document.getElementById('classSelect').value;
    const container = document.getElementById('scheduleItemsList');
    const noMsg     = document.getElementById('noScheduleMsg');
    const section   = document.getElementById('scheduleSection');
    container.innerHTML = '';

    currentSchedule = schedulesByClass[classId] || null;

    if (!currentSchedule) {
        noMsg.classList.remove('hidden');
        section.classList.add('hidden');
        document.getElementById('scheduleIdInput').value = '';
        recalcTotal();
        return;
    }

    noMsg.classList.add('hidden');
    section.classList.remove('hidden');
    document.getElementById('scheduleIdInput').value = currentSchedule.id;
    document.getElementById('scheduleNameDisplay').textContent = currentSchedule.name;

    if (currentSchedule.items.length === 0) {
        container.innerHTML = '<p class="text-amber-700 py-2 px-3 text-xs">This schedule has no fee items. Edit it in Fees → Schedules first.</p>';
    } else {
        currentSchedule.items.forEach(item => {
            container.innerHTML += `
                <div class="flex items-center justify-between py-1.5 px-3 bg-white rounded border border-gray-100">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-800">${item.name}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">${item.category || ''}</span>
                    </div>
                    <span class="text-gray-700 font-medium prorated-amt" data-original="${item.amount}">${item.amount.toFixed(2)}</span>
                </div>`;
        });
    }
    applyProration(); // also recalcs total
}

function applyProration() {
    const sel = document.getElementById('prorationSelect');
    if (!sel) return;
    const customInput = document.getElementById('prorationCustom');
    let pct = parseInt(sel.value, 10);

    if (sel.value === '0') {
        customInput.classList.remove('hidden');
        pct = parseInt(customInput.value, 10) || 0;
    } else {
        customInput.classList.add('hidden');
    }
    if (!Number.isFinite(pct) || pct < 1) pct = 100;
    if (pct > 100) pct = 100;

    document.querySelectorAll('.prorated-amt').forEach(el => {
        const orig = parseFloat(el.dataset.original) || 0;
        el.textContent = (orig * pct / 100).toFixed(2);
    });
    recalcTotal();
}

function recalcTotal() {
    let scheduleTotal = 0, transportTotal = 0, activitiesTotal = 0;

    // Sum prorated schedule items (only if schedule loaded)
    document.querySelectorAll('.prorated-amt').forEach(el => {
        scheduleTotal += parseFloat(el.textContent) || 0;
    });

    // Transport
    const tSel = document.getElementById('transportSelect');
    if (tSel && tSel.value) {
        const route = transportRoutes.find(r => r.id === tSel.value);
        if (route) transportTotal = parseFloat(route.fee_amount || 0);
    }

    // Activities
    document.querySelectorAll('.activity-cb:checked').forEach(cb => {
        activitiesTotal += parseFloat(cb.dataset.fee) || 0;
    });

    const total = scheduleTotal + transportTotal + activitiesTotal;
    document.getElementById('feeTotalDisplay').textContent = total.toFixed(2);

    const parts = [];
    if (scheduleTotal > 0)   parts.push('Fees ' + scheduleTotal.toFixed(2));
    if (transportTotal > 0)  parts.push('Transport ' + transportTotal.toFixed(2));
    if (activitiesTotal > 0) parts.push('Activities ' + activitiesTotal.toFixed(2));
    document.getElementById('totalBreakdown').textContent = parts.length ? parts.join(' + ') : '—';
}

// Toggle the whole invoice section based on the "Generate first invoice" checkbox
function toggleInvoiceSection(cb) {
    document.getElementById('invoiceSection').style.display = cb.checked ? '' : 'none';
}

// Backwards-compat alias used by the wizard navigator
function updateFeeTotal() { recalcTotal(); }
</script>

<div class="mb-6">
    <a href="<?= baseUrl('students') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to Students</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">Add Student</h1>
</div>

<?php if (!empty($errors)): ?>
    <div class="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
        <?php foreach ($errors as $err): ?><p><?= e($err) ?></p><?php endforeach; ?>
    </div>
<?php endif; ?>

<!-- Step Progress Bar -->
<div class="flex items-center justify-between mb-6 max-w-2xl mx-auto px-4">
    <?php
    $stepNames = ['Personal', 'Guardian', 'Academic', 'Previous', 'Fees'];
    foreach ($stepNames as $i => $name):
    ?>
        <div class="flex flex-col items-center flex-1">
            <div class="step-indicator flex items-center justify-center w-8 h-8 rounded-full <?= $i === 0 ? 'bg-emerald-500 text-white ring-4 ring-emerald-100' : 'bg-gray-200 text-gray-500' ?> text-sm font-semibold">
                <?= $i + 1 ?>
            </div>
            <span class="step-label text-xs mt-1 <?= $i === 0 ? 'text-emerald-700 font-medium' : 'text-gray-400' ?>"><?= $name ?></span>
        </div>
        <?php if ($i < count($stepNames) - 1): ?>
            <div class="flex-1 h-0.5 bg-gray-200 mx-1 mt-[-12px]"></div>
        <?php endif; ?>
    <?php endforeach; ?>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <!-- novalidate: we do explicit JS validation. HTML5 `required` on a field
         inside a hidden wizard step throws "An invalid form control is not
         focusable" and silently fails submission — the exact bug we just fixed. -->
    <form method="POST" class="p-6" novalidate>
        <?= csrfField() ?>

        <!-- Step 1: Personal Info -->
        <div id="step-personal">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">Personal Information</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input type="text" name="first_name" value="<?= e(input('first_name')) ?>" data-required="1" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input type="text" name="last_name" value="<?= e(input('last_name')) ?>" data-required="1" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                    <select name="gender" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select</option>
                        <option value="male"<?= selectedIf(input('gender'), 'male') ?>>Male</option>
                        <option value="female"<?= selectedIf(input('gender'), 'female') ?>>Female</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                    <input type="date" name="dob" value="<?= e(input('dob')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Place of Birth</label>
                    <input type="text" name="birth_place" value="<?= e(input('birth_place')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Religion</label>
                    <input type="text" name="religion" value="<?= e(input('religion')) ?>" placeholder="e.g. Christian, Muslim" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
                    <select name="blood_group" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select</option>
                        <?php foreach (['A+','A-','B+','B-','AB+','AB-','O+','O-'] as $bg): ?>
                            <option value="<?= $bg ?>"<?= selectedIf(input('blood_group'), $bg) ?>><?= $bg ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Student Phone</label>
                    <input type="text" name="phone" value="<?= e(input('phone')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Student Email</label>
                    <input type="email" name="email" value="<?= e(input('email')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div class="sm:col-span-2 lg:col-span-3">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input type="text" name="address" value="<?= e(input('address')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input type="text" name="city" value="<?= e(input('city')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Country</label>
                    <input type="text" name="country" value="<?= e(input('country')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
        </div>

        <!-- Step 2: Guardian -->
        <div id="step-guardian" class="hidden">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">Guardian Information</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Guardian Name</label>
                    <input type="text" name="guardian_name" value="<?= e(input('guardian_name')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Guardian Phone</label>
                    <input type="text" name="guardian_phone" value="<?= e(input('guardian_phone')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
            </div>

            <!-- Optional second contact — also receives SMS notices. Common where
                 parents are separated and both want school communication. -->
            <p class="text-xs font-medium text-gray-500 mt-5 mb-2">Second guardian <span class="text-gray-400 font-normal">(optional — also receives all SMS)</span></p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input type="text" name="guardian_name_2" value="<?= e(input('guardian_name_2')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="text" name="guardian_phone_2" value="<?= e(input('guardian_phone_2')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                    <select name="guardian_relation_2" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                        <option value="">—</option>
                        <?php foreach (['Mother','Father','Guardian','Grandparent','Aunt','Uncle','Sibling','Other'] as $rel): ?>
                            <option value="<?= e($rel) ?>" <?= input('guardian_relation_2') === $rel ? 'selected' : '' ?>><?= e($rel) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            <!-- Sibling linker: pick an existing student to attach this admission to a family -->
            <div class="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                <label class="block text-sm font-medium text-blue-800 mb-1">Link to a sibling (optional)</label>
                <p class="text-xs text-blue-600 mb-2">Pick an existing student to link this admission to the same family. We'll handle the family ID for you — no need to type one. Useful for consolidated billing and cross-sibling payments.</p>

                <!-- Hidden field actually submitted -->
                <input type="hidden" name="sibling_id" id="siblingIdInput" value="">

                <!-- Empty state: button to open picker -->
                <div id="siblingEmptyState">
                    <button type="button" onclick="openSiblingPicker()" class="px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-100 transition">
                        + Link to a sibling
                    </button>
                </div>

                <!-- Selected state: show who we picked, with a clear button -->
                <div id="siblingSelectedState" class="hidden flex items-center gap-2 px-3 py-2 bg-white border border-blue-200 rounded-lg">
                    <svg class="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span class="text-sm text-gray-800">Linking to: <span id="siblingSelectedLabel" class="font-semibold"></span></span>
                    <button type="button" onclick="clearSibling()" class="ml-auto text-xs text-red-500 hover:text-red-700">Clear</button>
                </div>
            </div>

            <!-- Sibling picker modal -->
            <div id="siblingPickerModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
                <div class="bg-white rounded-xl p-5 w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-lg font-bold text-gray-900">Pick a sibling</h3>
                        <button type="button" onclick="closeSiblingPicker()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                    </div>
                    <input type="text" id="siblingSearchInput" placeholder="Type a name or admission number..." oninput="filterSiblings()" class="w-full px-3 py-2 mb-3 rounded-lg border border-gray-200 focus:border-blue-400 outline-none text-sm">
                    <div id="siblingResults" class="overflow-y-auto flex-1 divide-y divide-gray-50 border border-gray-100 rounded-lg">
                        <!-- Filled by JS -->
                    </div>
                    <p class="text-[11px] text-gray-400 mt-2">Showing only active students at this school.</p>
                </div>
            </div>
            <p class="text-xs text-gray-400 mt-4">Additional guardians and emergency contacts can be managed from the student profile after creation.</p>
        </div>

        <!-- Step 3: Academic -->
        <div id="step-academic" class="hidden">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">Academic Details</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label class="block text-sm font-medium text-gray-700">Admission Number</label>
                        <button type="button" onclick="toggleAdmOverride()" id="admOverrideBtn" class="text-[11px] text-emerald-600 hover:text-emerald-800">Override</button>
                    </div>
                    <input type="text" name="admission_number" id="admInput" value="<?= e(input('admission_number')) ?>"
                           placeholder="Auto-generated"
                           readonly
                           class="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 outline-none text-sm cursor-not-allowed">
                    <p class="text-[11px] text-gray-400 mt-1">Generated from school code + sequence. Click Override to set manually.</p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                    <select name="class_id" id="classSelect" data-required="1" onchange="updateSections()" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select class</option>
                        <?php foreach ($classes as $c): ?>
                            <option value="<?= e($c['id']) ?>"<?= selectedIf(input('class_id'), $c['id']) ?>><?= e($c['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Stream</label>
                    <select name="section_id" id="sectionSelect" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">No section</option>
                    </select>
                </div>
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label class="block text-sm font-medium text-gray-700">Roll Number</label>
                        <button type="button" onclick="toggleRollOverride()" id="rollOverrideBtn" class="text-[11px] text-emerald-600 hover:text-emerald-800">Override</button>
                    </div>
                    <input type="text" name="roll_number" id="rollInput" value="<?= e(input('roll_number')) ?>"
                           placeholder="Auto (next number in class)"
                           readonly
                           class="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 outline-none text-sm cursor-not-allowed">
                    <p class="text-[11px] text-gray-400 mt-1">Auto-assigned within the chosen class. Click Override to set manually.</p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Student Type</label>
                    <select name="student_type" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="day_scholar"<?= selectedIf(input('student_type'), 'day_scholar') ?>>Day Scholar</option>
                        <option value="boarder"<?= selectedIf(input('student_type'), 'boarder') ?>>Boarder</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Admission Date</label>
                    <input type="date" name="admission_date" value="<?= e(input('admission_date') ?: date('Y-m-d')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
        </div>

        <!-- Step 4: Previous School -->
        <div id="step-previous" class="hidden">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">Previous School</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Previous School Name</label>
                    <input type="text" name="previous_school_name" value="<?= e(input('previous_school_name')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Previous School Address</label>
                    <input type="text" name="previous_school_address" value="<?= e(input('previous_school_address')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class Attended</label>
                    <input type="text" name="previous_school_class" value="<?= e(input('previous_school_class')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Year of Passing</label>
                    <input type="number" name="previous_school_passout_year" value="<?= e(input('previous_school_passout_year')) ?>" min="2000" max="2030" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Extra Notes</label>
                <textarea name="extra_notes" rows="3" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"><?= e(input('extra_notes')) ?></textarea>
            </div>
        </div>

        <!-- Step 5: Fees & Services — first invoice on admission -->
        <div id="step-fees" class="hidden">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">First Invoice (on Admission)</h3>

            <!-- Generate-invoice toggle -->
            <div class="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <label class="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" name="generate_invoice" id="genInvoiceToggle" value="1" checked
                           onchange="toggleInvoiceSection(this)"
                           class="mt-0.5 w-4 h-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500">
                    <div>
                        <span class="text-sm font-semibold text-emerald-900">Generate first invoice now</span>
                        <p class="text-xs text-emerald-700 mt-0.5">
                            Uses the schedule for this student's class in the active term <?php if ($currentTerm): ?>(<?= e($currentTerm['name']) ?>)<?php endif; ?>.
                            Use proration below if joining mid-term.
                        </p>
                    </div>
                </label>
            </div>

            <div id="invoiceSection">
                <!-- Schedule preview -->
                <div id="noScheduleMsg" class="hidden p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                    <p class="text-sm text-amber-800">
                        <strong>No schedule for this class in the active term.</strong>
                        Create one in <a href="<?= baseUrl('fees/schedules') ?>" class="underline font-medium" target="_blank">Fees → Schedules</a> first, then come back here. The student will still be created either way.
                    </p>
                </div>

                <div id="scheduleSection" class="hidden">
                    <input type="hidden" name="schedule_id" id="scheduleIdInput" value="">

                    <div class="mb-4">
                        <p class="text-xs text-gray-500">Schedule loaded:</p>
                        <p class="text-sm font-semibold text-gray-800" id="scheduleNameDisplay">—</p>
                    </div>

                    <!-- Proration -->
                    <div class="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                        <label class="block text-sm font-semibold text-blue-900 mb-1">Proration (for mid-term joiners)</label>
                        <p class="text-xs text-blue-700 mb-2">Reduces fee-head amounts by the chosen percentage. Transport and activities stay at full price.</p>
                        <div class="flex items-center gap-2 flex-wrap">
                            <select name="proration_percent" id="prorationSelect" onchange="applyProration()"
                                    class="px-3 py-2 rounded-lg border border-blue-200 focus:border-blue-400 outline-none text-sm bg-white">
                                <option value="100">Full (100%)</option>
                                <option value="75">75%</option>
                                <option value="50">50%</option>
                                <option value="25">25%</option>
                                <option value="0">Custom…</option>
                            </select>
                            <input type="number" name="proration_custom" id="prorationCustom" min="1" max="100"
                                   placeholder="Enter %" oninput="applyProration()"
                                   class="hidden w-28 px-3 py-2 rounded-lg border border-blue-200 focus:border-blue-400 outline-none text-sm bg-white">
                        </div>
                    </div>

                    <!-- Schedule items (read-only preview) -->
                    <div class="mb-5">
                        <h4 class="text-sm font-semibold text-gray-700 mb-2">Fee Items <span class="text-xs text-gray-400">(from the schedule — edit on the Invoice page after creation if needed)</span></h4>
                        <div id="scheduleItemsList" class="border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-1 text-sm">
                            <p class="text-gray-400 py-2 px-3 text-xs">Pick a class in the Academic step first.</p>
                        </div>
                    </div>
                </div>

                <!-- Transport -->
                <div class="mb-5">
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">Transport Route (optional)</h4>
                    <select name="transport_route_id" id="transportSelect" onchange="recalcTotal()"
                            class="w-full max-w-md px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">No transport</option>
                        <?php foreach ($transportRoutes as $tr): ?>
                            <option value="<?= e($tr['id']) ?>" data-fee="<?= (float)($tr['fee_amount'] ?? 0) ?>">
                                <?= e($tr['name']) ?> — <?= money((float)($tr['fee_amount'] ?? 0)) ?>
                                <?= $tr['start_location'] ? '(' . e($tr['start_location']) . ' → ' . e($tr['end_location'] ?? 'School') . ')' : '' ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- Activities -->
                <?php if (!empty($activities)): ?>
                <div class="mb-5">
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">Extracurricular Activities (optional)</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-gray-100 rounded-lg p-3 bg-gray-50">
                        <?php foreach ($activities as $act): ?>
                            <label class="flex items-center justify-between cursor-pointer text-sm py-2 px-3 hover:bg-white rounded-lg">
                                <div class="flex items-center gap-2">
                                    <input type="checkbox" name="activity_ids[]" value="<?= e($act['id']) ?>" onchange="recalcTotal()"
                                           class="activity-cb w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                           data-fee="<?= (float)($act['fee_amount'] ?? 0) ?>">
                                    <span class="text-gray-700"><?= e($act['name']) ?></span>
                                </div>
                                <span class="text-gray-500 font-medium"><?= money((float)($act['fee_amount'] ?? 0)) ?></span>
                            </label>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>

                <!-- Due date + draft -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                        <input type="date" name="due_date"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Save as</label>
                        <select name="invoice_status"
                                class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                            <option value="unpaid" selected>Issued (parent can pay immediately)</option>
                            <option value="draft">Draft (review before issuing)</option>
                        </select>
                    </div>
                </div>

                <!-- Total -->
                <div class="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-4 flex items-center justify-between">
                    <div>
                        <span class="text-sm font-semibold text-emerald-800">Invoice Total</span>
                        <p class="text-xs text-emerald-700/70" id="totalBreakdown">—</p>
                    </div>
                    <span class="text-xl font-bold text-emerald-700" id="feeTotalDisplay">0.00</span>
                </div>
            </div>
        </div>

        <!-- Navigation Buttons -->
        <div class="mt-6 flex gap-3 border-t border-gray-100 pt-5">
            <button type="button" id="btnBack" onclick="prevStep()" class="hidden px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                &larr; Back
            </button>
            <button type="button" id="btnNext" onclick="nextStep()" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                Next &rarr;
            </button>
            <button type="submit" id="btnSubmit" class="hidden px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                Add Student & Generate Invoice
            </button>
            <a href="<?= baseUrl('students') ?>" class="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</a>
        </div>
    </form>
</div>

<script>
// ── Sections data from PHP ──────────────────────────
const sectionsByClass = <?= jsonHtml($sectionsByClass) ?>;

function updateSections() {
    const classId = document.getElementById('classSelect').value;
    const sel = document.getElementById('sectionSelect');
    sel.innerHTML = '<option value="">No section</option>';
    if (classId && sectionsByClass[classId]) {
        sectionsByClass[classId].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            sel.appendChild(opt);
        });
    }
}

// Init sections on page load if class already selected
updateSections();

// ── Sibling picker ──────────────────────────────────
const existingStudents = <?= jsonHtml($existingStudents) ?>;
const classNameMap     = <?= jsonHtml($classNameMap) ?>;

function openSiblingPicker() {
    document.getElementById('siblingPickerModal').classList.remove('hidden');
    document.getElementById('siblingSearchInput').value = '';
    renderSiblingResults(existingStudents);
    setTimeout(() => document.getElementById('siblingSearchInput').focus(), 50);
}
function closeSiblingPicker() {
    document.getElementById('siblingPickerModal').classList.add('hidden');
}
function filterSiblings() {
    const q = document.getElementById('siblingSearchInput').value.trim().toLowerCase();
    if (!q) { renderSiblingResults(existingStudents); return; }
    const filtered = existingStudents.filter(s => {
        const fullName = ((s.first_name || '') + ' ' + (s.last_name || '')).toLowerCase();
        const adm      = (s.admission_number || '').toLowerCase();
        return fullName.includes(q) || adm.includes(q);
    });
    renderSiblingResults(filtered);
}
function renderSiblingResults(list) {
    const container = document.getElementById('siblingResults');
    if (!list.length) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No matching students.</p>';
        return;
    }
    container.innerHTML = list.slice(0, 50).map(s => {
        const className = classNameMap[s.current_class_id] || '';
        const adm = s.admission_number ? `<span class="text-gray-400 text-xs">· ${escapeHtml(s.admission_number)}</span>` : '';
        const fam = s.family_id ? `<span class="text-blue-600 text-xs">· ${escapeHtml(s.family_id)}</span>` : '<span class="text-gray-300 text-xs">· no family yet</span>';
        return `<button type="button" onclick="pickSibling('${s.id}', '${escapeAttr((s.first_name||'') + ' ' + (s.last_name||''))}', '${escapeAttr(s.family_id || '')}')" class="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-3">
            <div>
                <div class="text-sm text-gray-800">${escapeHtml(s.first_name || '')} ${escapeHtml(s.last_name || '')}</div>
                <div class="text-[11px] text-gray-500">${escapeHtml(className)} ${adm} ${fam}</div>
            </div>
            <span class="text-blue-600 text-xs">Link →</span>
        </button>`;
    }).join('');
    if (list.length > 50) {
        container.innerHTML += '<p class="text-[11px] text-gray-400 text-center py-2">Showing first 50. Type to narrow down.</p>';
    }
}
function pickSibling(id, name, familyId) {
    document.getElementById('siblingIdInput').value = id;
    document.getElementById('siblingSelectedLabel').textContent = name + (familyId ? ' (' + familyId + ')' : ' (new family will be created)');
    document.getElementById('siblingEmptyState').classList.add('hidden');
    document.getElementById('siblingSelectedState').classList.remove('hidden');
    document.getElementById('siblingSelectedState').classList.add('flex');
    closeSiblingPicker();
}
function clearSibling() {
    document.getElementById('siblingIdInput').value = '';
    document.getElementById('siblingSelectedState').classList.add('hidden');
    document.getElementById('siblingSelectedState').classList.remove('flex');
    document.getElementById('siblingEmptyState').classList.remove('hidden');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function escapeAttr(s) {
    return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ── Override toggles for admission and roll number ──
function toggleAdmOverride() {
    const inp = document.getElementById('admInput');
    const btn = document.getElementById('admOverrideBtn');
    if (inp.readOnly) {
        inp.readOnly = false;
        inp.classList.remove('bg-gray-50', 'text-gray-500', 'cursor-not-allowed');
        inp.classList.add('focus:border-emerald-400', 'focus:ring-2', 'focus:ring-emerald-100');
        inp.placeholder = 'Type to override';
        btn.textContent = 'Cancel override';
        inp.focus();
    } else {
        inp.readOnly = true;
        inp.value = '';
        inp.classList.add('bg-gray-50', 'text-gray-500', 'cursor-not-allowed');
        inp.classList.remove('focus:border-emerald-400', 'focus:ring-2', 'focus:ring-emerald-100');
        inp.placeholder = 'Auto-generated';
        btn.textContent = 'Override';
    }
}
function toggleRollOverride() {
    const inp = document.getElementById('rollInput');
    const btn = document.getElementById('rollOverrideBtn');
    if (inp.readOnly) {
        inp.readOnly = false;
        inp.classList.remove('bg-gray-50', 'text-gray-500', 'cursor-not-allowed');
        inp.classList.add('focus:border-emerald-400', 'focus:ring-2', 'focus:ring-emerald-100');
        inp.placeholder = 'Type to override';
        btn.textContent = 'Cancel override';
        inp.focus();
    } else {
        inp.readOnly = true;
        inp.value = '';
        inp.classList.add('bg-gray-50', 'text-gray-500', 'cursor-not-allowed');
        inp.classList.remove('focus:border-emerald-400', 'focus:ring-2', 'focus:ring-emerald-100');
        inp.placeholder = 'Auto (next number in class)';
        btn.textContent = 'Override';
    }
}

// ── Robust submit handler ───────────────────────────
// Why this exists: HTML5 `required` on a hidden field (display:none from the
// wizard) makes browsers silently fail submission with "An invalid form
// control with name='X' is not focusable" — visually nothing happens, which
// is exactly the bug we hit. We do explicit validation here, jump the user
// to the offending step, and only then call form.submit() which bypasses
// HTML5 validation entirely.
document.addEventListener('DOMContentLoaded', wireUpSubmit);
wireUpSubmit(); // also run if the script runs after DOMContentLoaded (PJAX swap)

function wireUpSubmit() {
    const btn = document.getElementById('btnSubmit');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        const form = btn.closest('form');
        if (!form) return;

        // Validate any field with data-required="1" — surface errors clearly
        const stepOf = el => {
            const stepDiv = el.closest('[id^="step-"]');
            if (!stepDiv) return -1;
            const id = stepDiv.id.replace('step-', '');
            return steps.indexOf(id);
        };
        const required = form.querySelectorAll('[data-required="1"]');
        for (const el of required) {
            if (!el.value || !el.value.trim()) {
                const stepIdx = stepOf(el);
                if (stepIdx >= 0) showStep(stepIdx);
                el.focus();
                el.classList.add('border-red-400', 'ring-2', 'ring-red-100');
                alert('Please fill in: ' + (el.previousElementSibling?.textContent || el.name));
                return;
            }
        }
        // All good — submit natively
        form.submit();
    });
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
