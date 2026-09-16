<?php
/**
 * Platform Admin Dashboard — manage all schools on the platform.
 * Only accessible to platform admins.
 */
if (!isPlatformAdmin()) { redirect('dashboard'); }

$pageTitle = 'Platform Admin';
$sb = new Supabase();

// ── Handle POST actions ──────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // Enter a school's context
    if ($action === 'enter_school') {
        $schoolId = input('school_id');
        $school = $sb->from('schools')->select('*')->eq('id', $schoolId)->single()->execute();
        if (!empty($school['data'][0])) {
            $s = $school['data'][0];
            switchSchool($s['id'], 'school_admin', $s['name']);
            flash('success', 'Switched to ' . $s['name']);
            redirect('dashboard');
        }
        flash('error', 'School not found.');
        redirect('admin/dashboard');
    }

    // Toggle school active status
    if ($action === 'toggle_active') {
        $schoolId = input('school_id');
        $newStatus = input('is_active') === '1' ? false : true;
        $sb->from('schools')->eq('id', $schoolId)->update([
            'is_active'  => $newStatus,
            'updated_at' => date('c'),
        ]);
        flash('success', $newStatus ? 'School activated.' : 'School deactivated.');
        redirect('admin/dashboard');
    }

    // Add new school
    if ($action === 'add_school') {
        $name  = input('name');
        $code  = strtoupper(input('code'));
        $email = input('email');
        $phone = input('phone');
        $plan  = input('plan');

        if (!$name || !$code) {
            flash('error', 'School name and code are required.');
            redirect('admin/dashboard');
        }

        $result = $sb->from('schools')->insert([
            'name'                => $name,
            'code'                => $code,
            'email'               => $email,
            'phone'               => $phone,
            'plan'                => $plan ?: 'free',
            'is_active'           => true,
            'subscription_status' => 'trial',
            'trial_ends_at'       => date('c', strtotime('+30 days')),
            'created_at'          => date('c'),
            'updated_at'          => date('c'),
        ]);

        if (!empty($result['error'])) {
            flash('error', 'Failed to create school: ' . $result['error']);
        } else {
            $schoolId = $result['data'][0]['id'] ?? null;
            $adminEmail = input('admin_email');
            auditLog('create', 'school', $schoolId, ['name' => $name, 'code' => $code]);

            // If admin email provided, create an invitation and email it.
            if ($adminEmail && $schoolId) {
                $token = bin2hex(random_bytes(32));
                $sb->from('invitations')->insert([
                    'email'       => $adminEmail,
                    'school_id'   => $schoolId,
                    'school_name' => $name,
                    'role'        => 'admin',
                    'token'       => $token,
                    'invited_by'  => currentUser()['id'] ?? null,
                ]);
                $mail = sendInvitationEmail($adminEmail, $name, 'admin', inviteUrl($token));
                if ($mail['ok']) {
                    flash('success', 'School "' . $name . '" created. Invitation emailed to ' . $adminEmail . '.');
                } else {
                    flash('success', 'School "' . $name . '" created. '
                        . (mailEnabled()
                            ? 'The invitation email could not be sent (' . $mail['error'] . ') — '
                            : 'Automatic email is off — ')
                        . 'open Pending Invitations below to copy the link for ' . $adminEmail . '.');
                }
            } else {
                flash('success', 'School "' . $name . '" created successfully.');
            }
        }
        redirect('admin');
    }

    // Send invitation to a user for an existing school
    if ($action === 'invite_user') {
        $email    = input('invite_email');
        $schoolId = input('school_id');
        $role     = input('invite_role') ?: 'admin';

        if (!$email || !$schoolId) {
            flash('error', 'Email and school are required.');
        } else {
            $schoolData = $sb->from('schools')->select('name')->eq('id', $schoolId)->single()->execute();
            $schoolName = $schoolData['data'][0]['name'] ?? '';
            $token = bin2hex(random_bytes(32));
            $sb->from('invitations')->insert([
                'email'       => $email,
                'school_id'   => $schoolId,
                'school_name' => $schoolName,
                'role'        => $role,
                'token'       => $token,
                'invited_by'  => currentUser()['id'] ?? null,
            ]);
            auditLog('invite', 'user', null, ['email' => $email, 'school' => $schoolName, 'role' => $role]);
            // Use the school's own login domain for the invite link (falls back to APP_URL).
            $schoolBase = schoolBaseUrl(['domain' => schoolDomain($schoolId)]);
            $mail = sendInvitationEmail($email, $schoolName, $role, inviteUrl($token, $schoolBase));
            if ($mail['ok']) {
                flash('success', 'Invitation emailed to ' . $email . '.');
            } else {
                flash('success', 'Invitation created for ' . $email . '. '
                    . (mailEnabled()
                        ? 'The email could not be sent (' . $mail['error'] . ') — '
                        : 'Automatic email is off — ')
                    . 'copy the link from Pending Invitations below.');
            }
        }
        redirect('admin');
    }

    // Resend an invitation email
    if ($action === 'resend_invitation') {
        $invId  = input('invitation_id');
        $invRes = $sb->from('invitations')->select('*')->eq('id', $invId)->single()->execute();
        $inv    = $invRes['data'][0] ?? null;
        if (!$inv) {
            flash('error', 'Invitation not found.');
        } elseif (!empty($inv['accepted_at'])) {
            flash('error', 'That invitation has already been accepted.');
        } else {
            $schoolBase = schoolBaseUrl(['domain' => schoolDomain($inv['school_id'] ?? '')]);
            $mail = sendInvitationEmail(
                $inv['email'], $inv['school_name'] ?? '', $inv['role'] ?? 'admin',
                inviteUrl($inv['token'], $schoolBase), $inv['expires_at'] ?? ''
            );
            if ($mail['ok']) {
                flash('success', 'Invitation re-sent to ' . $inv['email'] . '.');
            } else {
                flash('error', 'Could not send email (' . $mail['error'] . '). Use "Copy link" instead.');
            }
        }
        redirect('admin');
    }

    // Cancel a pending invitation
    if ($action === 'cancel_invitation') {
        $sb->from('invitations')->eq('id', input('invitation_id'))->delete();
        flash('success', 'Invitation cancelled.');
        redirect('admin');
    }
}

// ── Fetch data ───────────────────────────────────────────────
$schoolsResult  = $sb->from('schools')->select('*')->order('created_at', false)->execute();
$schools        = is_array($schoolsResult['data']) ? $schoolsResult['data'] : [];

$studentsResult = $sb->from('students')->select('id,school_id,status')->execute();
$allStudents    = is_array($studentsResult['data']) ? $studentsResult['data'] : [];

// Pending (unaccepted) invitations — platform-wide.
$invResult      = $sb->from('invitations')
    ->select('id,email,role,school_id,school_name,token,accepted_at,expires_at,created_at')
    ->is('accepted_at', 'null')->order('created_at', false)->execute();
$pendingInvites = is_array($invResult['data']) ? $invResult['data'] : [];

// Build student count per school
$studentCounts = [];
$totalStudents = 0;
foreach ($allStudents as $stu) {
    $sid = $stu['school_id'] ?? '';
    if (!isset($studentCounts[$sid])) $studentCounts[$sid] = 0;
    $studentCounts[$sid]++;
    $totalStudents++;
}

// Summary stats
$totalSchools  = count($schools);
$activeSchools = 0;
$trialSchools  = 0;
foreach ($schools as $s) {
    if (!empty($s['is_active'])) $activeSchools++;
    if (($s['subscription_status'] ?? '') === 'trial') $trialSchools++;
}

// ── Cross-school financials (platform-wide) ──────────────────────
// Lean, paginated fetch so this scales as the platform grows. Drafts and
// cancelled invoices are excluded from committed revenue.
$invRows = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('invoices')->select('school_id,amount,paid_amount,status'));
$schoolBilled = $schoolCollected = [];
$totBilled = 0.0; $totCollected = 0.0;
foreach ($invRows as $iv) {
    $st = $iv['status'] ?? '';
    if ($st === 'draft' || $st === 'cancelled') continue;
    $scid = $iv['school_id'] ?? '';
    $amt  = (float)($iv['amount'] ?? 0);
    $paid = (float)($iv['paid_amount'] ?? 0);
    $schoolBilled[$scid]    = ($schoolBilled[$scid] ?? 0) + $amt;
    $schoolCollected[$scid] = ($schoolCollected[$scid] ?? 0) + $paid;
    $totBilled += $amt; $totCollected += $paid;
}
$totOutstanding = max(0, $totBilled - $totCollected);
$collRate = $totBilled > 0 ? ($totCollected / $totBilled * 100) : 0;
$fmtK = fn($n) => 'KES ' . number_format((float)$n);

// Plan badge colors
function planBadge(string $plan): string {
    $colors = [
        'free'       => 'bg-gray-100 text-gray-600',
        'basic'      => 'bg-blue-100 text-blue-700',
        'standard'   => 'bg-indigo-100 text-indigo-700',
        'premium'    => 'bg-amber-100 text-amber-700',
        'enterprise' => 'bg-purple-100 text-purple-700',
    ];
    $cls = $colors[$plan] ?? 'bg-gray-100 text-gray-600';
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' . $cls . '">' . e(ucfirst($plan ?: 'free')) . '</span>';
}

function statusBadge(string $status): string {
    $colors = [
        'trial'     => 'bg-cyan-100 text-cyan-700',
        'active'    => 'bg-emerald-100 text-emerald-700',
        'past_due'  => 'bg-amber-100 text-amber-700',
        'cancelled' => 'bg-gray-100 text-gray-600',
        'suspended' => 'bg-red-100 text-red-700',
    ];
    $cls = $colors[$status] ?? 'bg-gray-100 text-gray-600';
    $label = str_replace('_', ' ', ucfirst($status ?: 'unknown'));
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' . $cls . '">' . e($label) . '</span>';
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6 flex items-center justify-between">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Platform Admin</h1>
        <p class="text-sm text-gray-500 mt-1">Manage all schools on the platform</p>
    </div>
    <div class="flex items-center gap-2">
        <a href="<?= baseUrl('admin/platform-admins') ?>"
           class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/></svg>
            Platform Admins
        </a>
        <button type="button" data-modal-open="addSchoolModal" onclick="openModal('addSchoolModal')"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Add School
        </button>
    </div>
</div>

<!-- Summary Cards -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-3">
            <div class="w-2 h-2 rounded-full bg-blue-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Schools</span>
        </div>
        <p class="text-[28px] font-bold text-gray-900 tracking-tight"><?= number_format($totalSchools) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-3">
            <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Schools</span>
        </div>
        <p class="text-[28px] font-bold text-gray-900 tracking-tight"><?= number_format($activeSchools) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-3">
            <div class="w-2 h-2 rounded-full bg-indigo-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Students</span>
        </div>
        <p class="text-[28px] font-bold text-gray-900 tracking-tight"><?= number_format($totalStudents) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-3">
            <div class="w-2 h-2 rounded-full bg-cyan-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">On Trial</span>
        </div>
        <p class="text-[28px] font-bold text-gray-900 tracking-tight"><?= number_format($trialSchools) ?></p>
    </div>
</div>

<!-- Financial roll-up (all schools) -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Billed</span>
        <p class="text-2xl font-bold text-gray-900 tracking-tight mt-2"><?= $fmtK($totBilled) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Collected</span>
        <p class="text-2xl font-bold text-emerald-600 tracking-tight mt-2"><?= $fmtK($totCollected) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Outstanding</span>
        <p class="text-2xl font-bold text-red-600 tracking-tight mt-2"><?= $fmtK($totOutstanding) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Collection Rate</span>
        <p class="text-2xl font-bold text-gray-900 tracking-tight mt-2"><?= number_format($collRate, 1) ?>%</p>
    </div>
</div>

<!-- Pending Invitations -->
<?php if (!empty($pendingInvites)): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8">
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-700">Pending Invitations</h2>
        <span class="text-xs text-gray-400"><?= count($pendingInvites) ?> awaiting sign-up</span>
    </div>
    <div class="divide-y divide-gray-50">
        <?php foreach ($pendingInvites as $inv): ?>
            <?php
            $inviteLink = inviteUrl($inv['token'] ?? '', schoolBaseUrl(['domain' => schoolDomain($inv['school_id'] ?? '')]));
            $expTs      = !empty($inv['expires_at']) ? strtotime($inv['expires_at']) : 0;
            $isExpired  = $expTs && $expTs < time();
            ?>
            <div class="px-5 py-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-gray-900"><?= e($inv['email'] ?? '') ?></p>
                        <p class="text-xs text-gray-400">
                            <?= e(ucfirst($inv['role'] ?? 'admin')) ?><?php if (!empty($inv['school_name'])): ?> &middot; <?= e($inv['school_name']) ?><?php endif; ?><?php if ($isExpired): ?> &middot; <span class="text-red-500 font-medium">expired</span><?php endif; ?>
                        </p>
                    </div>
                    <div class="flex items-center gap-1.5 flex-shrink-0">
                        <form method="POST" class="inline">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="resend_invitation">
                            <input type="hidden" name="invitation_id" value="<?= e($inv['id']) ?>">
                            <button type="submit" class="px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">Resend email</button>
                        </form>
                        <form method="POST" class="inline" onsubmit="return confirm('Cancel this invitation?')">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="cancel_invitation">
                            <input type="hidden" name="invitation_id" value="<?= e($inv['id']) ?>">
                            <button type="submit" class="px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-red-600 transition">Cancel</button>
                        </form>
                    </div>
                </div>
                <div class="flex items-center gap-2 mt-2">
                    <input type="text" readonly value="<?= e($inviteLink) ?>" onclick="this.select()"
                        class="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 bg-gray-50 font-mono">
                    <button type="button"
                        onclick="navigator.clipboard.writeText('<?= e($inviteLink) ?>'); this.textContent='Copied';"
                        class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition whitespace-nowrap">Copy link</button>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<!-- Schools Table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-700">All Schools</h2>
    </div>

    <?php if (empty($schools)): ?>
        <div class="p-8 text-center text-gray-400 text-sm">No schools found. Click "Add School" to create one.</div>
    <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50/60">
                        <th class="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">School</th>
                        <th class="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Code</th>
                        <th class="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Plan</th>
                        <th class="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                        <th class="text-center px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Students</th>
                        <th class="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Collected</th>
                        <th class="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Outstanding</th>
                        <th class="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Created</th>
                        <th class="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    <?php foreach ($schools as $school): ?>
                        <tr class="hover:bg-gray-50/40 transition">
                            <td class="px-5 py-3">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-lg <?= !empty($school['is_active']) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400' ?> flex items-center justify-center text-xs font-bold flex-shrink-0">
                                        <?= strtoupper(substr($school['name'] ?? '?', 0, 2)) ?>
                                    </div>
                                    <div>
                                        <p class="font-medium text-gray-900"><?= e($school['name'] ?? '') ?></p>
                                        <p class="text-xs text-gray-400"><?= e($school['email'] ?? '') ?></p>
                                    </div>
                                </div>
                            </td>
                            <td class="px-5 py-3 text-gray-600 font-mono text-xs"><?= e($school['code'] ?? '') ?></td>
                            <td class="px-5 py-3"><?= planBadge($school['plan'] ?? 'free') ?></td>
                            <td class="px-5 py-3"><?= statusBadge($school['subscription_status'] ?? '') ?></td>
                            <td class="px-5 py-3 text-center text-gray-700 font-medium"><?= number_format($studentCounts[$school['id']] ?? 0) ?></td>
                            <?php $sb2 = (float)($schoolBilled[$school['id']] ?? 0); $sc2 = (float)($schoolCollected[$school['id']] ?? 0); $so2 = max(0, $sb2 - $sc2); ?>
                            <td class="px-5 py-3 text-right text-emerald-700 text-xs whitespace-nowrap"><?= $sb2 > 0 ? $fmtK($sc2) : '<span class="text-gray-300">—</span>' ?></td>
                            <td class="px-5 py-3 text-right text-xs whitespace-nowrap <?= $so2 > 0 ? 'text-red-600' : 'text-gray-300' ?>"><?= $sb2 > 0 ? $fmtK($so2) : '—' ?></td>
                            <td class="px-5 py-3 text-gray-500 text-xs"><?= formatDate($school['created_at'] ?? '') ?></td>
                            <td class="px-5 py-3">
                                <div class="flex items-center justify-end gap-1">
                                    <!-- Enter school -->
                                    <form method="POST" class="inline">
                                        <?= csrfField() ?>
                                        <input type="hidden" name="action" value="enter_school">
                                        <input type="hidden" name="school_id" value="<?= e($school['id']) ?>">
                                        <button type="submit" title="Enter school" class="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>
                                        </button>
                                    </form>
                                    <!-- Edit school -->
                                    <a href="<?= baseUrl('admin/manage-school?id=' . urlencode($school['id'])) ?>" title="Edit school" class="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                    </a>
                                    <!-- Toggle active -->
                                    <form method="POST" class="inline">
                                        <?= csrfField() ?>
                                        <input type="hidden" name="action" value="toggle_active">
                                        <input type="hidden" name="school_id" value="<?= e($school['id']) ?>">
                                        <input type="hidden" name="is_active" value="<?= !empty($school['is_active']) ? '1' : '0' ?>">
                                        <button type="submit" title="<?= !empty($school['is_active']) ? 'Deactivate' : 'Activate' ?>"
                                                class="p-1.5 rounded-lg <?= !empty($school['is_active']) ? 'text-amber-500 hover:bg-amber-50' : 'text-green-500 hover:bg-green-50' ?> transition">
                                            <?php if (!empty($school['is_active'])): ?>
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                                            <?php else: ?>
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                            <?php endif; ?>
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</div>

<!-- Add School Modal -->
<div id="addSchoolModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="document.getElementById('addSchoolModal').classList.add('hidden')"></div>
    <!-- Modal -->
    <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div class="flex items-center justify-between mb-5">
            <h3 class="text-lg font-bold text-gray-900">Add New School</h3>
            <button onclick="document.getElementById('addSchoolModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 transition">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>

        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_school">

            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">School Name <span class="text-red-400">*</span></label>
                    <input type="text" name="name" required placeholder="e.g. Crown of Gold School"
                           class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">School Code <span class="text-red-400">*</span></label>
                        <input type="text" name="code" required placeholder="e.g. COGS" maxlength="10"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition uppercase">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                        <select name="plan" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                            <option value="free">Free</option>
                            <option value="basic">Basic</option>
                            <option value="standard" selected>Standard</option>
                            <option value="premium">Premium</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" name="email" placeholder="school@example.com"
                           class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="text" name="phone" placeholder="+254 ..."
                           class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                </div>
                <div class="pt-3 border-t border-gray-100">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                    <input type="email" name="admin_email" placeholder="admin@school.com"
                           class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                    <p class="text-xs text-gray-400 mt-1">We'll email this person an invitation to set up their account. The link also appears under Pending Invitations, so you can copy and send it yourself.</p>
                </div>
            </div>

            <div class="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button type="button" onclick="document.getElementById('addSchoolModal').classList.add('hidden')"
                        class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Cancel</button>
                <button type="submit"
                        class="px-5 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition">
                    Create School
                </button>
            </div>
        </form>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
