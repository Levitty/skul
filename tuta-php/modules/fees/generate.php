<?php
/**
 * Generate Invoices — one student OR a whole class.
 *
 * Mode toggle at the top:
 *   • Whole class — pick a class, tick students, generate (bulk).
 *   • One student — pick a student, generate a single invoice.
 *   • One-off charge — bill an ad-hoc item (a trip, an exam fee, a
 *     replacement book) to any set of learners, with no fee schedule
 *     involved. Calls create_one_off_charge (migration 119) instead.
 * Both modes call the same generate_invoices_for_class RPC; single mode
 * just sends a one-student batch.
 *
 * Single mode can be deep-linked from a student's profile:
 *   fees/invoices/generate?mode=single&student_id=<uuid>
 */
$pageTitle = 'Generate Invoices';
$sb  = new Supabase();
$sid = schoolId();

$classes  = cachedClasses();
$classMap = cachedClassMap();
$terms    = cachedTerms();      // ordered by start_date asc
$currentTerm = cachedCurrentTerm();

$termMap = [];
foreach ($terms as $t) $termMap[$t['id']] = $t;

// ── "Next term" = the term after the active one ────────────────
$nextTerm = null;
if ($currentTerm) {
    $foundActive = false;
    foreach ($terms as $t) {
        if ($foundActive) { $nextTerm = $t; break; }
        if ($t['id'] === $currentTerm['id']) $foundActive = true;
    }
}
$defaultTargetTermId = $nextTerm['id'] ?? ($currentTerm['id'] ?? '');

// ── Mode + selections ──────────────────────────────────────────
$mode              = in_array(input('mode'), ['single', 'charge'], true) ? input('mode') : 'bulk';
$selectedTermId    = input('target_term_id') ?: $defaultTargetTermId;
$selectedTerm      = $termMap[$selectedTermId] ?? null;
$selectedClass     = input('class_id');
$selectedStudentId = input('student_id');

// Transport routes & activities (per-student selectors)
$routesResult = $sb->from('transport_routes')
    ->select('id,name,route_number,fee_amount')
    ->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$routes = $routesResult['data'] ?? [];

$activitiesResult = $sb->from('activities')
    ->select('id,name,fee_amount')
    ->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$activities = $activitiesResult['data'] ?? [];

// Boarding fee (flat, per term). Only surfaces when the school has set one.
$boardingFee = (float)(function_exists('schoolSetting') ? schoolSetting('boarding_fee', '0') : 0);
$boardingOn  = $boardingFee > 0;

// ════════════════════════════════════════════════════════════════
// POST — calls generate_invoices_for_class (same RPC for both modes)
// ════════════════════════════════════════════════════════════════
if (isPost() && verifyCsrf()) {

    // ── One-off charge ────────────────────────────────────────────
    // Nothing to do with fee schedules, so it branches out early and
    // hands the whole job to create_one_off_charge (migration 119).
    if (input('mode') === 'charge') {
        $chTermId = input('target_term_id') ?: ($currentTerm['id'] ?? null);
        $chYearId = $termMap[$chTermId]['academic_year_id'] ?? null;
        if (!$chYearId) {
            $yr = $sb->from('academic_years')->select('id')->eq('school_id', $sid)
                ->eq('is_current', 'true')->single()->execute();
            $chYearId = $yr['data'][0]['id'] ?? null;
        }
        $chBack = 'fees/invoices/generate?mode=charge&target_term_id=' . urlencode((string)$chTermId);

        $chDesc   = trim((string)input('description'));
        $chAmount = round((float)str_replace(',', '', (string)input('amount')), 2);
        $chWho    = input('who');
        $chMode   = input('charge_mode') === 'merge' ? 'merge' : 'separate';
        $chStatus = input('invoice_status') === 'draft' ? 'draft' : 'unpaid';
        $chDue    = input('due_date') ?: null;

        $chIds = [];
        if ($chWho === 'selected') {
            $chIds = array_values(array_filter((array)($_POST['student_ids'] ?? [])));
        } elseif (strpos((string)$chWho, 'class:') === 0) {
            $wantClass = substr((string)$chWho, 6);
            $rosterRes = $sb->from('students')->select('id')
                ->eq('school_id', $sid)->eq('status', 'active')
                ->eq('current_class_id', $wantClass)->execute();
            foreach (($rosterRes['data'] ?? []) as $r) $chIds[] = $r['id'];
        }

        if ($chDesc === '' || $chAmount <= 0) {
            flash('error', 'Enter what the charge is for and a positive amount.');
            redirect($chBack);
        }
        if (empty($chIds)) {
            flash('error', 'Choose who to bill — a class, or specific learners.');
            redirect($chBack);
        }
        if (!$chYearId) {
            flash('error', 'No academic year is set for that term. Set one in Settings → Academic.');
            redirect($chBack);
        }

        @set_time_limit(300);   // a whole-school charge is hundreds of rows
        $chUser = currentUser();
        $chRes  = $sb->rpc('create_one_off_charge', [
            'p_school_id'        => $sid,
            'p_student_ids'      => array_values($chIds),
            'p_description'      => $chDesc,
            'p_amount'           => $chAmount,
            'p_term_id'          => $chTermId,
            'p_academic_year_id' => $chYearId,
            'p_due_date'         => $chDue,
            'p_mode'             => $chMode,
            'p_status'           => $chStatus,
            'p_user_id'          => $chUser['id']    ?? null,
            'p_user_email'       => $chUser['email'] ?? null,
        ]);
        $chPayload = $chRes['data'] ?? null;

        if (!empty($chRes['error']) || !is_array($chPayload) || empty($chPayload['success'])) {
            flash('error', is_array($chPayload)
                ? ($chPayload['error'] ?? 'Could not create the charge.')
                : 'Could not create the charge.');
            redirect($chBack);
        }

        $billed = (int)$chPayload['billed'];
        if ($billed === 0) {
            flash('error', 'Nobody was billed — everyone selected already has this charge this term.');
            redirect($chBack);
        }
        $note = $billed . ' learner' . ($billed === 1 ? '' : 's') . ' billed '
              . money($chAmount) . ' — ' . money((float)$chPayload['total']) . ' total.';
        if ((int)$chPayload['merged'] > 0)  $note .= ' ' . (int)$chPayload['merged'] . ' added to an existing invoice.';
        if ((int)$chPayload['skipped'] > 0) $note .= ' ' . (int)$chPayload['skipped'] . ' skipped (already charged this term).';
        flashLink('success', $note, baseUrl('fees/invoices'), 'View invoices');
        redirect($chBack);
    }

    $postMode      = (input('mode') === 'single') ? 'single' : 'bulk';
    $classId       = input('class_id');
    $groupId       = input('fee_group_id');
    $targetTermId  = input('target_term_id');
    $dueDate       = input('due_date');
    $invoiceStatus = input('invoice_status') === 'unpaid' ? 'unpaid' : 'draft';
    $studentIds    = $_POST['student_ids']     ?? [];
    $studentRoutes   = $_POST['transport_route'] ?? [];
    $studentActs     = $_POST['activities']      ?? [];
    $studentBoarding = $_POST['boarding']        ?? [];  // student_id => '1' if boarding

    $backUrl = 'fees/invoices/generate?mode=' . $postMode . '&target_term_id=' . $targetTermId;

    if (!$classId || !$groupId || !$targetTermId) {
        flash('error', 'Class, schedule, and target term are required.');
        redirect($backUrl);
    }
    if (empty($studentIds)) {
        flash('error', 'Please select at least one student.');
        redirect($backUrl);
    }

    // Activities billing mode: 'bundled' (default) rides on the fee invoice;
    // 'separate' is billed on its own invoice after fee generation.
    $activitiesMode = function_exists('schoolSetting') ? schoolSetting('activities_billing_mode', 'bundled') : 'bundled';
    $sepActivities  = ($activitiesMode === 'separate');

    // Build per-student payload for the RPC
    $studentsPayload = [];
    foreach ($studentIds as $stuId) {
        $studentsPayload[] = [
            'student_id'         => $stuId,
            'transport_route_id' => !empty($studentRoutes[$stuId]) ? $studentRoutes[$stuId] : null,
            // In separate mode, activities are NOT bundled onto the fee invoice.
            'activity_ids'       => $sepActivities ? [] : array_values($studentActs[$stuId] ?? []),
            'proration_percent'  => 100,
        ];
    }

    $user      = currentUser();
    $invPrefix = function_exists('schoolSetting') ? schoolSetting('invoice_prefix', 'INV') : 'INV';

    $result = $sb->rpc('generate_invoices_for_class', [
        'p_school_id'      => $sid,
        'p_class_id'       => $classId,
        'p_fee_group_id'   => $groupId,
        'p_term_id'        => $targetTermId,
        'p_due_date'       => $dueDate ?: null,
        'p_user_id'        => $user['id']    ?? null,
        'p_user_email'     => $user['email'] ?? null,
        'p_students'       => $studentsPayload,
        'p_invoice_prefix' => $invPrefix,
        'p_status'         => $invoiceStatus,
    ]);

    if (!empty($result['error'])) {
        flash('error', 'Generation failed: ' . $result['error']);
        redirect($backUrl);
    }

    // ── Boarding fee (flat) ──────────────────────────────────────────
    // Add a "Boarding" line to each newly-generated invoice whose student was
    // ticked as a boarder. Only touches the invoices the RPC just created
    // (returned invoice_ids), so re-runs never double-bill.
    $boardedCount = 0;
    if ($boardingOn && !empty($studentBoarding)) {
        $newIds = $result['data']['invoice_ids'] ?? [];
        if (!empty($newIds)) {
            $invRows = $sb->from('invoices')->select('id,student_id,amount')
                ->in('id', $newIds)->execute()['data'] ?? [];
            foreach ($invRows as $inv) {
                if (empty($studentBoarding[$inv['student_id']])) continue;
                $sb->from('invoice_items')->insert([
                    'invoice_id'  => $inv['id'],
                    'description' => 'Boarding',
                    'amount'      => $boardingFee,
                ]);
                $sb->from('invoices')->eq('id', $inv['id'])->eq('school_id', $sid)
                    ->update(['amount' => round((float)$inv['amount'] + $boardingFee, 2), 'updated_at' => date('c')]);
                $boardedCount++;
            }
        }
    }

    // ── Separate activity invoices (billing mode = separate) ─────────
    // Each student's selected activities get their own invoice. fee_group_id
    // is NULL, so it's exempt from the per-term unique index (057) and can't
    // collide with the fee invoice. The id is generated here (UUIDv4) so we
    // don't depend on the insert returning a representation. Skipped if an
    // ACT- invoice already exists for the student this term.
    $activityInvoices = 0;
    if ($sepActivities) {
        $actMap = [];
        foreach ($activities as $a) $actMap[$a['id']] = $a;
        $fgYearRes = $sb->from('fee_groups')->select('academic_year_id')
            ->eq('id', $groupId)->eq('school_id', $sid)->single()->execute();
        $actYearId = $fgYearRes['data'][0]['academic_year_id'] ?? null;

        foreach ($studentIds as $stuId) {
            $picked = array_values($studentActs[$stuId] ?? []);
            if (empty($picked)) continue;

            // Build line items + total from THIS school's activities only.
            $items = []; $total = 0.0;
            foreach ($picked as $aid) {
                if (!isset($actMap[$aid])) continue; // ignore unknown/foreign ids
                $amt = (float)($actMap[$aid]['fee_amount'] ?? 0);
                if ($amt <= 0) continue;
                $items[] = ['description' => 'Activity — ' . $actMap[$aid]['name'], 'amount' => $amt];
                $total  += $amt;
            }
            if (empty($items) || $total <= 0) continue;

            // Don't double-bill activities for this student this term.
            $dup = $sb->from('invoices')->select('id')
                ->eq('school_id', $sid)->eq('student_id', $stuId)->eq('term_id', $targetTermId)
                ->ilike('reference', 'ACT-%')->neq('status', 'cancelled')->limit(1)->execute();
            if (!empty($dup['data'])) continue;

            // UUIDv4 generated client-side so invoice_items can reference it.
            $rb = random_bytes(16);
            $rb[6] = chr((ord($rb[6]) & 0x0f) | 0x40);
            $rb[8] = chr((ord($rb[8]) & 0x3f) | 0x80);
            $newId = vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($rb), 4));
            $ref   = 'ACT-' . strtoupper(substr(bin2hex($rb), 0, 8));

            $invRes = $sb->from('invoices')->insert([
                'id'               => $newId,
                'school_id'        => $sid,
                'student_id'       => $stuId,
                'academic_year_id' => $actYearId,
                'fee_group_id'     => null, // exempt from per-term unique index
                'term_id'          => $targetTermId,
                'reference'        => $ref,
                'amount'           => $total,
                'paid_amount'      => 0,
                'status'           => $invoiceStatus,
                'due_date'         => $dueDate ?: null,
                'issued_at'        => $invoiceStatus === 'unpaid' ? date('c') : null,
            ]);
            if (!empty($invRes['error'])) continue;

            $rows = [];
            foreach ($items as $it) {
                $rows[] = ['invoice_id' => $newId, 'description' => $it['description'], 'amount' => $it['amount']];
            }
            if (!empty($rows)) $sb->from('invoice_items')->insert($rows);
            $activityInvoices++;
        }
    }

    $payload   = $result['data'] ?? [];
    $generated = (int)($payload['generated_count']        ?? 0);
    $skipped   = (int)($payload['skipped_count']          ?? 0);
    $failed    = (int)($payload['failed_count']           ?? 0);
    $credits   = (float)($payload['credits_applied_total']   ?? 0);
    $carry     = (float)($payload['carry_forward_total']     ?? 0);
    $discounts = (float)($payload['discounts_applied_total'] ?? 0);

    $msg = $generated . ' invoice(s) generated';
    if ($invoiceStatus === 'draft') $msg .= ' as drafts (review before issuing)';
    $msg .= '.';
    if ($skipped > 0) $msg .= " $skipped skipped (already exist for this term).";
    if ($failed  > 0) {
        $msg .= " $failed failed.";
        // Surface the real DB error(s) — the RPC returns a per-student `failed`
        // array with an `error` field. Without this, failures are undiagnosable.
        $reasons = [];
        foreach (($payload['failed'] ?? []) as $fr) {
            $err = trim((string)($fr['error'] ?? ''));
            if ($err !== '') $reasons[$err] = true;
        }
        if (!empty($reasons)) $msg .= ' Reason: ' . implode(' | ', array_keys($reasons));
    }
    if ($credits   > 0) $msg .= ' ' . money($credits) . ' student credit auto-applied.';
    if ($carry     > 0) $msg .= ' ' . money($carry) . ' carried forward from previous terms.';
    if ($discounts > 0) $msg .= ' ' . money($discounts) . ' in discounts applied.';
    if (!empty($boardedCount) && $boardedCount > 0) $msg .= ' ' . $boardedCount . ' boarder(s) charged ' . money($boardingFee) . ' boarding.';
    if ($activityInvoices > 0) $msg .= ' ' . $activityInvoices . ' separate activity invoice(s) created.';

    flash($failed > 0 ? 'error' : 'success', $msg);
    redirect('fees/invoices?status=' . $invoiceStatus);
}

// ════════════════════════════════════════════════════════════════
// GET — resolve target class, load schedule + students
// ════════════════════════════════════════════════════════════════

// All active students — needed for the single-mode and charge-mode pickers.
$allStudents = [];
if ($mode === 'single' || $mode === 'charge') {
    $asRes = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,credit_balance,current_class_id,student_type')
        ->eq('school_id', $sid)->eq('status', 'active')->order('first_name')->execute();
    $allStudents = $asRes['data'] ?? [];
}

// Single mode: the class is derived from the chosen student.
$singleStudent = null;
if ($mode === 'single' && $selectedStudentId) {
    foreach ($allStudents as $as) {
        if ($as['id'] === $selectedStudentId) { $singleStudent = $as; break; }
    }
    if ($singleStudent) {
        $selectedClass = $singleStudent['current_class_id'];
    }
}

$schedule      = null;
$scheduleItems = [];
$students      = [];
$transportMap  = [];
$baseTotal     = 0;

if ($selectedClass && $selectedTermId) {
    // Find the schedule for this (class, term)
    $schedRes = $sb->from('fee_groups')
        ->select('id,name,description,billing_cycle,academic_year_id')
        ->eq('school_id', $sid)
        ->eq('class_id', $selectedClass)
        ->eq('term_id', $selectedTermId)
        ->eq('is_active', 'true')
        ->single()->execute();
    $schedule = ($schedRes['data'] ?? [])[0] ?? null;

    if ($schedule) {
        $itemsRes = $sb->from('fee_group_items')->select('fee_head_id,amount')
            ->eq('fee_group_id', $schedule['id'])->execute();
        $rawItems = $itemsRes['data'] ?? [];

        if (!empty($rawItems)) {
            $headIds  = array_column($rawItems, 'fee_head_id');
            $headsRes = $sb->from('fee_heads')->select('id,name,category')->in('id', $headIds)->execute();
            $headNameMap = [];
            foreach (($headsRes['data'] ?? []) as $h) $headNameMap[$h['id']] = $h;
            foreach ($rawItems as $it) {
                $h = $headNameMap[$it['fee_head_id']] ?? ['name' => 'Fee', 'category' => 'other'];
                $scheduleItems[] = [
                    'fee_head_id' => $it['fee_head_id'],
                    'amount'      => $it['amount'],
                    'name'        => $h['name'],
                    'category'    => $h['category'],
                ];
                $baseTotal += (float)$it['amount'];
            }
        }

        // Students for this run: one (single mode) or the whole class (bulk).
        if ($mode === 'single') {
            $students = $singleStudent ? [$singleStudent] : [];
        } else {
            $stuRes = $sb->from('students')
                ->select('id,first_name,last_name,admission_number,credit_balance,student_type')
                ->eq('school_id', $sid)
                ->eq('current_class_id', $selectedClass)
                ->eq('status', 'active')
                ->order('first_name')
                ->execute();
            $students = $stuRes['data'] ?? [];
        }

        // Pre-fill transport: a student with a saved transport assignment
        // gets their route auto-selected in the dropdown below.
        if (!empty($students)) {
            $stIds = array_column($students, 'id');
            $stRes = $sb->from('student_transport')->select('student_id,route_id')
                ->eq('school_id', $sid)->in('student_id', $stIds)->execute();
            foreach (($stRes['data'] ?? []) as $row) {
                $transportMap[$row['student_id']] = $row['route_id'];
            }
        }
    }
}

$genUrl = baseUrl('fees/invoices/generate');

// Smart default for the "save as" radio: if this school has already issued any
// invoice in the selected term, this is a same-term follow-up batch — default
// to "Issue immediately". Otherwise it's the first batch of a new term —
// default to "Draft" so the admin can review before parents see anything.
$defaultIssueMode = 'draft';
// Charge mode never reads this — skip the query rather than pay for it.
if ($selectedTermId && $mode !== 'charge') {
    $priorRes = $sb->from('invoices')->select('id')
        ->eq('school_id', $sid)->eq('term_id', $selectedTermId)
        ->in('status', ['unpaid', 'partial', 'paid', 'overdue'])
        ->range(0, 1)->execute();
    if (!empty($priorRes['data'])) {
        $defaultIssueMode = 'unpaid';
    }
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <a href="<?= baseUrl('fees/invoices') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to Invoices</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">Generate Invoices</h1>
    <p class="text-sm text-gray-500 mt-1">Bill one student or a whole class from a fee schedule, or raise a one-off charge for a trip or activity.</p>
</div>

<!-- Mode toggle -->
<div class="inline-flex rounded-lg border border-gray-200 bg-white p-1 mb-4">
    <a href="<?= e($genUrl) ?>?mode=bulk&target_term_id=<?= e($selectedTermId) ?>"
       class="px-4 py-1.5 text-sm font-medium rounded-md transition <?= $mode === 'bulk' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50' ?>">
        Whole class
    </a>
    <a href="<?= e($genUrl) ?>?mode=single&target_term_id=<?= e($selectedTermId) ?>"
       class="px-4 py-1.5 text-sm font-medium rounded-md transition <?= $mode === 'single' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50' ?>">
        One student
    </a>
    <a href="<?= e($genUrl) ?>?mode=charge&target_term_id=<?= e($selectedTermId) ?>"
       class="px-4 py-1.5 text-sm font-medium rounded-md transition <?= $mode === 'charge' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50' ?>">
        One-off charge
    </a>
</div>

<?php if ($mode === 'charge'):
    // Roster counts per class, for the "whole class" chips.
    $chCountByClass = [];
    foreach ($allStudents as $s) {
        $cid = $s['current_class_id'] ?? '';
        if ($cid) $chCountByClass[$cid] = ($chCountByClass[$cid] ?? 0) + 1;
    }
    $chSelTerm = $termMap[$selectedTermId] ?? $currentTerm;
?>

<form method="POST" onsubmit="return confirmCharge()">
    <?= csrfField() ?>
    <input type="hidden" name="mode" value="charge">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
        <div class="lg:col-span-2 space-y-4">

            <!-- What -->
            <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <h2 class="text-sm font-semibold text-gray-700 mb-1">1. What is the charge?</h2>
                <p class="text-xs text-gray-500 mb-4">No fee schedule needed — this bills a one-off item straight to the learners you pick.</p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div class="sm:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                        <input type="text" name="description" id="chDesc" required maxlength="120"
                               placeholder="e.g. Grade 5 Trip — Nairobi National Museum"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <p class="text-[11px] text-gray-400 mt-1">This is what parents see on the invoice.</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Amount per learner *</label>
                        <input type="text" name="amount" id="chAmt" required inputmode="numeric" oninput="chTotal()"
                               placeholder="2500"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                        <select name="target_term_id" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                            <?php foreach ($terms as $t): ?>
                                <option value="<?= e($t['id']) ?>"<?= selectedIf($selectedTermId, $t['id']) ?>>
                                    <?= e($t['name']) ?><?= !empty($t['is_current']) ? ' (active)' : '' ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Due date</label>
                        <input type="date" name="due_date" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Bill as</label>
                        <select name="charge_mode" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                            <option value="separate">Its own invoice</option>
                            <option value="merge">Add to existing invoice</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Issue</label>
                        <select name="invoice_status" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                            <option value="unpaid">Issue now</option>
                            <option value="draft">Save as draft</option>
                        </select>
                    </div>
                </div>
                <p class="text-[11px] text-gray-400 mt-2">Its own invoice (prefix <span class="font-mono">CHG-</span>) makes it easy to see what the trip collected. Merging gives the family a single bill.</p>
            </div>

            <!-- Who -->
            <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <h2 class="text-sm font-semibold text-gray-700 mb-1">2. Who pays it?</h2>
                <p class="text-xs text-gray-500 mb-3">Tap a class for the whole roster, or pick learners one by one.</p>
                <input type="hidden" name="who" id="who" value="">

                <div class="flex flex-wrap gap-1.5 mb-3">
                    <?php foreach ($classMap as $cid => $cname): if (empty($chCountByClass[$cid])) continue; ?>
                        <button type="button" data-w="class:<?= e($cid) ?>" data-n="<?= (int)$chCountByClass[$cid] ?>"
                                onclick="pickWho(this)"
                                class="who px-2.5 py-1 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-xs transition">
                            <?= e($cname) ?> <span class="text-gray-400">(<?= (int)$chCountByClass[$cid] ?>)</span>
                        </button>
                    <?php endforeach; ?>
                    <button type="button" data-w="selected" onclick="pickWho(this)"
                            class="who px-2.5 py-1 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-xs transition font-medium">
                        Specific learners…
                    </button>
                </div>

                <div id="whoPick" class="hidden">
                    <div class="flex gap-2 mb-2">
                        <input type="text" id="stuSearch" oninput="stuFilter()" placeholder="Search name or admission number…"
                               class="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <select id="stuClass" onchange="stuFilter()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                            <option value="">All classes</option>
                            <?php foreach ($classMap as $cid => $cname): if (empty($chCountByClass[$cid])) continue; ?>
                                <option value="<?= e($cid) ?>"><?= e($cname) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="flex items-center gap-3 mb-2 text-[11px]">
                        <button type="button" onclick="stuAll(true)" class="text-emerald-700 hover:underline font-medium">Select all shown</button>
                        <button type="button" onclick="stuAll(false)" class="text-gray-500 hover:underline">Clear</button>
                        <span class="text-gray-400" id="stuShown"></span>
                    </div>
                    <div class="max-h-72 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
                        <?php foreach ($allStudents as $s):
                            $nm = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''));
                            $cn = $classMap[$s['current_class_id'] ?? ''] ?? ''; ?>
                        <label class="sturow flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                               data-c="<?= e($s['current_class_id'] ?? '') ?>"
                               data-s="<?= e(strtolower($nm . ' ' . ($s['admission_number'] ?? '') . ' ' . $cn)) ?>">
                            <input type="checkbox" name="student_ids[]" value="<?= e($s['id']) ?>" onchange="chTotal()"
                                   class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                            <span class="min-w-0 flex-1">
                                <span class="block text-sm text-gray-900 truncate"><?= e($nm) ?></span>
                                <span class="block text-[11px] text-gray-400"><?= e($s['admission_number'] ?? '') ?><?= $cn !== '' ? ' · ' . e($cn) : '' ?></span>
                            </span>
                        </label>
                        <?php endforeach; ?>
                        <?php if (empty($allStudents)): ?>
                            <div class="px-3 py-6 text-center text-sm text-gray-400">No active learners.</div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>

        <!-- Summary -->
        <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">Summary</h3>
            <dl class="space-y-2 text-sm">
                <div class="flex justify-between"><dt class="text-gray-500">Term</dt>
                    <dd class="text-gray-900 font-medium"><?= e($chSelTerm['name'] ?? '—') ?></dd></div>
                <div class="flex justify-between"><dt class="text-gray-500">Learners</dt>
                    <dd class="text-gray-900 font-medium" id="sumCount">0</dd></div>
                <div class="flex justify-between"><dt class="text-gray-500">Each</dt>
                    <dd class="text-gray-900 font-medium" id="sumEach">—</dd></div>
                <div class="flex justify-between pt-2 border-t border-gray-100"><dt class="text-gray-600 font-medium">Total</dt>
                    <dd class="text-emerald-700 font-bold" id="sumTotal">—</dd></div>
            </dl>
            <button type="submit" id="chBtn"
                class="w-full mt-4 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                Create charge
            </button>
            <p class="text-[11px] text-gray-400 mt-3">A learner who already has this exact charge this term is skipped, so it is safe to run again.</p>
        </div>
    </div>
</form>

<script>
var WHO_ON  = ['border-emerald-500', 'bg-emerald-50', 'ring-1', 'ring-emerald-200'];
var WHO_OFF = ['border-gray-200', 'bg-white', 'hover:bg-gray-50'];
function pickWho(btn) {
    document.getElementById('who').value = btn.dataset.w;
    document.querySelectorAll('.who').forEach(function (b) {
        var on = b === btn;
        WHO_ON.forEach(function (c) { b.classList.toggle(c, on); });
        WHO_OFF.forEach(function (c) { b.classList.toggle(c, !on); });
    });
    document.getElementById('whoPick').classList.toggle('hidden', btn.dataset.w !== 'selected');
    if (btn.dataset.w === 'selected') stuFilter();
    chTotal();
}
function stuFilter() {
    var q = document.getElementById('stuSearch').value.trim().toLowerCase();
    var c = document.getElementById('stuClass').value, shown = 0;
    document.querySelectorAll('.sturow').forEach(function (r) {
        var show = (q === '' || r.dataset.s.indexOf(q) > -1) && (c === '' || r.dataset.c === c);
        r.classList.toggle('hidden', !show);
        if (show) shown++;
    });
    document.getElementById('stuShown').textContent = shown + ' shown';
}
function stuAll(on) {
    document.querySelectorAll('.sturow').forEach(function (r) {
        if (on && r.classList.contains('hidden')) return;
        var cb = r.querySelector('input[type=checkbox]');
        if (cb) cb.checked = on;
    });
    chTotal();
}
/** How many learners the current choice targets. */
function targetCount() {
    var w = document.getElementById('who').value;
    if (w === 'selected') return document.querySelectorAll('.sturow input[type=checkbox]:checked').length;
    var btn = document.querySelector('.who[data-w="' + w + '"]');
    return btn ? parseInt(btn.dataset.n || '0', 10) : 0;
}
function chTotal() {
    var n = targetCount();
    var a = parseFloat((document.getElementById('chAmt').value || '').replace(/,/g, '')) || 0;
    document.getElementById('sumCount').textContent = n;
    document.getElementById('sumEach').textContent  = a > 0 ? 'KES ' + a.toLocaleString() : '—';
    document.getElementById('sumTotal').textContent = (a > 0 && n > 0) ? 'KES ' + (a * n).toLocaleString() : '—';
}
function confirmCharge() {
    var n = targetCount();
    var a = parseFloat((document.getElementById('chAmt').value || '').replace(/,/g, '')) || 0;
    var d = document.getElementById('chDesc').value.trim();
    if (!document.getElementById('who').value) { alert('Choose who to bill first.'); return false; }
    if (n === 0) { alert('No learners selected.'); return false; }
    if (!d || a <= 0) { alert('Enter a description and amount.'); return false; }
    var ok = confirm('Bill "' + d + '" — KES ' + a.toLocaleString() + ' to ' + n +
                     ' learner' + (n === 1 ? '' : 's') + '?\n\nTotal: KES ' + (a * n).toLocaleString());
    if (ok) { var b = document.getElementById('chBtn'); b.disabled = true; b.textContent = 'Creating…'; }
    return ok;
}
chTotal();
</script>

<?php
    require __DIR__ . '/../../includes/layout-bottom.php';
    return;
endif;
?>

<!-- Step 1 + 2: target term + (class | student) -->
<div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-5xl mb-4">
    <form method="GET" action="<?= e($genUrl) ?>" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="hidden" name="mode" value="<?= e($mode) ?>">
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">1. Target Term *</label>
            <select name="target_term_id" onchange="this.form.submit()"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <option value="">Choose target term</option>
                <?php foreach ($terms as $t): ?>
                    <option value="<?= e($t['id']) ?>"<?= selectedIf($selectedTermId, $t['id']) ?>>
                        <?= e($t['name']) ?>
                        <?= !empty($t['is_current']) ? ' (active)' : '' ?>
                        <?= ($nextTerm && $t['id'] === $nextTerm['id']) ? ' — next term' : '' ?>
                    </option>
                <?php endforeach; ?>
            </select>
            <p class="text-xs text-gray-400 mt-1">Defaults to the term <strong>after</strong> the active one.</p>
        </div>

        <?php if ($mode === 'bulk'): ?>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">2. Class *</label>
                <select name="class_id" onchange="this.form.submit()"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="">Choose class</option>
                    <?php foreach ($classes as $c): ?>
                        <option value="<?= e($c['id']) ?>"<?= selectedIf($selectedClass, $c['id']) ?>><?= e($c['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
        <?php else: ?>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">2. Student *</label>
                <!-- Class filter (client-side only, not submitted): narrows the
                     student list so you don't scroll 300 names. -->
                <select id="singleClassFilter" onchange="filterStudentsByClass()"
                        class="w-full px-3 py-2 mb-2 rounded-lg border border-gray-200 bg-gray-50 focus:border-emerald-400 outline-none text-sm">
                    <option value="">Filter by class (optional) — or choose a student below</option>
                    <?php foreach ($classes as $c): ?>
                        <option value="<?= e($c['id']) ?>"><?= e($c['name']) ?></option>
                    <?php endforeach; ?>
                </select>
                <select name="student_id" id="singleStudentSelect" onchange="this.form.submit()"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="">Choose student</option>
                    <?php foreach ($allStudents as $as): ?>
                        <option value="<?= e($as['id']) ?>" data-class="<?= e($as['current_class_id'] ?? '') ?>"<?= selectedIf($selectedStudentId, $as['id']) ?>>
                            <?= e($as['first_name'] . ' ' . $as['last_name']) ?>
                            — <?= e($classMap[$as['current_class_id']] ?? 'No class') ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <p class="text-xs text-gray-400 mt-1">Pick a class to shrink the list, then choose the student. Their schedule loads automatically.</p>
            </div>
            <script>
            // Global (survives PJAX) — hides student options not in the picked class.
            window.filterStudentsByClass = function () {
                var cls = document.getElementById('singleClassFilter').value;
                var sel = document.getElementById('singleStudentSelect');
                if (!sel) return;
                for (var i = 0; i < sel.options.length; i++) {
                    var opt = sel.options[i];
                    if (!opt.value) continue; // keep the "Choose student" placeholder
                    var show = !cls || opt.getAttribute('data-class') === cls;
                    opt.hidden = !show;
                    opt.disabled = !show;
                }
                // If the chosen student is now filtered out, reset the picker.
                if (sel.selectedIndex > 0 && sel.options[sel.selectedIndex].hidden) sel.selectedIndex = 0;
            };
            </script>
        <?php endif; ?>
    </form>
</div>

<?php if ($selectedClass && $selectedTermId && !$schedule): ?>
    <!-- No schedule yet for (class, term) -->
    <div class="max-w-5xl bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-amber-900">No schedule for <?= e($classMap[$selectedClass] ?? '') ?> in <?= e($selectedTerm['name'] ?? '') ?></h3>
        <p class="text-sm text-amber-800 mt-1">You need a fee schedule for this class &amp; term before invoices can be generated.</p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
            <a href="<?= baseUrl('fees/schedules/edit') ?>" class="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition">Create new schedule</a>
            <a href="<?= baseUrl('fees/schedules?class_id=' . $selectedClass) ?>" class="px-4 py-2 text-sm font-medium text-amber-700 bg-white border border-amber-300 rounded-lg hover:bg-amber-50 transition">Roll forward an existing one</a>
        </div>
    </div>

<?php elseif ($selectedClass && $selectedTermId && $schedule): ?>

    <!-- Schedule + breakdown -->
    <div class="max-w-5xl bg-white rounded-xl border border-emerald-100 p-5 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
                <h3 class="text-sm font-semibold text-emerald-800">Schedule loaded: <?= e($schedule['name']) ?></h3>
                <?php if (!empty($schedule['description'])): ?>
                    <p class="text-xs text-emerald-600 mt-0.5"><?= e($schedule['description']) ?></p>
                <?php endif; ?>
            </div>
            <a href="<?= baseUrl('fees/schedules/edit?id=' . $schedule['id']) ?>" class="text-xs text-emerald-700 hover:underline">Edit schedule &rarr;</a>
        </div>

        <?php if (empty($scheduleItems)): ?>
            <p class="text-amber-700 text-sm bg-amber-50 px-3 py-2 rounded">This schedule has no fee items. Add some via the Edit link.</p>
        <?php else: ?>
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50 border-b border-gray-100">
                        <th class="text-left px-3 py-2 font-medium text-gray-600">Fee Head</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-600">Category</th>
                        <th class="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    <?php foreach ($scheduleItems as $it): ?>
                        <tr>
                            <td class="px-3 py-1.5 text-gray-800"><?= e($it['name']) ?></td>
                            <td class="px-3 py-1.5"><span class="inline-flex px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600"><?= e(ucfirst($it['category'])) ?></span></td>
                            <td class="px-3 py-1.5 text-right font-medium"><?= money((float)$it['amount']) ?></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
                <tfoot>
                    <tr class="bg-emerald-50 border-t border-emerald-100">
                        <td colspan="2" class="px-3 py-2 font-semibold text-emerald-800">Base per-student total</td>
                        <td class="px-3 py-2 text-right font-bold text-emerald-800"><?= money($baseTotal) ?></td>
                    </tr>
                </tfoot>
            </table>
            <p class="text-xs text-gray-400 mt-2">Plus per-student transport/activities, plus any unpaid balance carried forward from previous terms.</p>
        <?php endif; ?>
    </div>

    <?php if (!empty($scheduleItems) && !empty($students)): ?>
    <!-- Student selection form -->
    <form method="POST" id="generateForm">
        <?= csrfField() ?>
        <input type="hidden" name="mode" value="<?= e($mode) ?>">
        <input type="hidden" name="class_id" value="<?= e($selectedClass) ?>">
        <input type="hidden" name="target_term_id" value="<?= e($selectedTermId) ?>">
        <input type="hidden" name="fee_group_id" value="<?= e($schedule['id']) ?>">

        <div class="max-w-5xl bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4">
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-900">
                    <?php if ($mode === 'single'): ?>
                        Student to invoice
                    <?php else: ?>
                        3. Select Students <span class="text-gray-400">(<?= count($students) ?> in class)</span>
                    <?php endif; ?>
                </h3>
                <?php if ($mode === 'bulk'): ?>
                    <label class="flex items-center gap-2 text-xs text-emerald-600 cursor-pointer">
                        <input type="checkbox" id="selectAll" onclick="toggleAll(this)" class="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600">
                        Select all
                    </label>
                <?php endif; ?>
            </div>

            <div class="rounded-lg border border-gray-200 overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-gray-50 border-b border-gray-100">
                            <?php if ($mode === 'bulk'): ?><th class="px-3 py-2 w-8"></th><?php endif; ?>
                            <th class="text-left px-3 py-2 font-medium text-gray-600">Student</th>
                            <th class="text-left px-3 py-2 font-medium text-gray-600">Adm No.</th>
                            <?php if (!empty($routes)): ?><th class="text-left px-3 py-2 font-medium text-gray-600">Transport</th><?php endif; ?>
                            <?php if (!empty($activities)): ?><th class="text-left px-3 py-2 font-medium text-gray-600">Activities</th><?php endif; ?>
                            <?php if ($boardingOn): ?><th class="text-center px-3 py-2 font-medium text-gray-600">Boarding<br><span class="text-[10px] font-normal text-gray-400"><?= money($boardingFee) ?></span></th><?php endif; ?>
                            <th class="text-right px-3 py-2 font-medium text-gray-600">Credit</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                        <?php foreach ($students as $s): $credit = (float)($s['credit_balance'] ?? 0); ?>
                            <tr class="hover:bg-gray-50/50">
                                <?php if ($mode === 'bulk'): ?>
                                    <td class="px-3 py-2">
                                        <input type="checkbox" name="student_ids[]" value="<?= e($s['id']) ?>"
                                               class="student-cb w-4 h-4 rounded border-gray-300 text-emerald-600" onchange="updateCount()">
                                    </td>
                                <?php else: ?>
                                    <input type="hidden" name="student_ids[]" value="<?= e($s['id']) ?>">
                                <?php endif; ?>
                                <td class="px-3 py-2 font-medium text-gray-900"><?= e($s['first_name'] . ' ' . $s['last_name']) ?></td>
                                <td class="px-3 py-2 text-gray-500 text-xs"><?= e($s['admission_number'] ?? '') ?></td>
                                <?php if (!empty($routes)): ?>
                                    <td class="px-3 py-2">
                                        <select name="transport_route[<?= e($s['id']) ?>]"
                                                class="px-2 py-1 rounded border border-gray-200 text-xs w-full max-w-[200px] focus:border-emerald-400 outline-none">
                                            <option value="">None</option>
                                            <?php foreach ($routes as $r): ?>
                                                <option value="<?= e($r['id']) ?>"<?= selectedIf($transportMap[$s['id']] ?? '', $r['id']) ?>>
                                                    <?= e($r['name']) ?><?= $r['route_number'] ? ' (' . e($r['route_number']) . ')' : '' ?>
                                                    — <?= money((float)$r['fee_amount']) ?>
                                                </option>
                                            <?php endforeach; ?>
                                        </select>
                                    </td>
                                <?php endif; ?>
                                <?php if (!empty($activities)): ?>
                                    <td class="px-3 py-2">
                                        <div class="flex flex-wrap gap-1">
                                            <?php foreach ($activities as $a): ?>
                                                <label class="inline-flex items-center gap-1 cursor-pointer text-xs bg-gray-50 hover:bg-purple-50 px-2 py-1 rounded border border-gray-200">
                                                    <input type="checkbox" name="activities[<?= e($s['id']) ?>][]" value="<?= e($a['id']) ?>" class="w-3 h-3 rounded border-gray-300 text-purple-600">
                                                    <span class="text-gray-700"><?= e($a['name']) ?></span>
                                                    <span class="text-gray-400"><?= money((float)$a['fee_amount']) ?></span>
                                                </label>
                                            <?php endforeach; ?>
                                        </div>
                                    </td>
                                <?php endif; ?>
                                <?php if ($boardingOn): $isBoarder = (($s['student_type'] ?? '') === 'boarder'); ?>
                                    <td class="px-3 py-2 text-center">
                                        <input type="checkbox" name="boarding[<?= e($s['id']) ?>]" value="1" <?= $isBoarder ? 'checked' : '' ?> title="<?= $isBoarder ? 'Boarder — auto-ticked' : 'Day scholar' ?>" class="w-4 h-4 rounded border-gray-300 text-emerald-600">
                                    </td>
                                <?php endif; ?>
                                <td class="px-3 py-2 text-right">
                                    <?php if ($credit > 0): ?>
                                        <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><?= money($credit) ?></span>
                                    <?php else: ?>
                                        <span class="text-gray-300 text-xs">—</span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>

            <?php if ($mode === 'bulk'): ?>
                <p class="mt-2 text-xs text-gray-500"><span id="selectedCount">0</span> student(s) selected</p>
            <?php endif; ?>
        </div>

        <!-- Issue mode + due date -->
        <div class="max-w-5xl bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4">
            <h3 class="text-sm font-semibold text-gray-900 mb-3"><?= $mode === 'single' ? '3.' : '4.' ?> How should we save this?</h3>
            <?php
            $draftSelected = $defaultIssueMode === 'draft';
            $draftCls = $draftSelected ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 hover:bg-gray-50';
            $issueCls = $draftSelected ? 'border-gray-200 hover:bg-gray-50'    : 'border-emerald-200 bg-emerald-50/40';
            ?>
            <p class="text-xs text-gray-500 mb-3">
                <?= $draftSelected
                    ? 'No invoices have been issued for this term yet — defaulting to Draft so you can review the first batch.'
                    : 'This term already has issued invoices — defaulting to Issue immediately for this follow-up batch.' ?>
            </p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="flex items-start gap-3 p-3 rounded-lg border-2 <?= $draftCls ?> cursor-pointer">
                    <input type="radio" name="invoice_status" value="draft" <?= $draftSelected ? 'checked' : '' ?> class="mt-0.5 text-emerald-600 focus:ring-emerald-500">
                    <div>
                        <p class="text-sm font-medium <?= $draftSelected ? 'text-emerald-900' : 'text-gray-800' ?>">Save as draft<?= $mode === 'bulk' ? 's' : '' ?></p>
                        <p class="text-xs <?= $draftSelected ? 'text-emerald-700' : 'text-gray-500' ?> mt-0.5">Review before it goes to the parent. Issue when ready.</p>
                    </div>
                </label>
                <label class="flex items-start gap-3 p-3 rounded-lg border-2 <?= $issueCls ?> cursor-pointer">
                    <input type="radio" name="invoice_status" value="unpaid" <?= $draftSelected ? '' : 'checked' ?> class="mt-0.5 text-emerald-600 focus:ring-emerald-500">
                    <div>
                        <p class="text-sm font-medium <?= $draftSelected ? 'text-gray-800' : 'text-emerald-900' ?>">Issue immediately</p>
                        <p class="text-xs <?= $draftSelected ? 'text-gray-500' : 'text-emerald-700' ?> mt-0.5">Skip the draft step. Payable right away, no edits after.</p>
                    </div>
                </label>
            </div>
            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input type="date" name="due_date" class="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
        </div>

        <button type="submit"
                class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
            <?= $mode === 'single' ? 'Generate Invoice' : 'Generate Invoices' ?>
        </button>
    </form>

    <?php elseif (empty($students)): ?>
        <p class="text-gray-500 text-sm">
            <?= $mode === 'single' ? 'Pick a student above.' : 'No active students in ' . e($classMap[$selectedClass] ?? 'this class') . '.' ?>
        </p>
    <?php endif; ?>

<?php elseif ($mode === 'bulk' && !$selectedClass): ?>
    <p class="text-gray-400 text-sm">Pick a target term and class above to get started.</p>
<?php elseif ($mode === 'single' && !$selectedStudentId): ?>
    <p class="text-gray-400 text-sm">Pick a target term and a student above to get started.</p>
<?php endif; ?>

<?php if ($mode === 'bulk'): ?>
<script>
function toggleAll(el) {
    document.querySelectorAll('.student-cb').forEach(cb => cb.checked = el.checked);
    updateCount();
}
function updateCount() {
    const checked = document.querySelectorAll('.student-cb:checked').length;
    const total   = document.querySelectorAll('.student-cb').length;
    const c = document.getElementById('selectedCount');
    if (c) c.textContent = checked;
    const all = document.getElementById('selectAll');
    if (all) all.checked = checked === total && total > 0;
}
</script>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
