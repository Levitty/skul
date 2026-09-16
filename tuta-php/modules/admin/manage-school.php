<?php
/**
 * Manage School — view/edit a single school's details.
 * Only accessible to platform admins.
 */
if (!isPlatformAdmin()) { redirect('dashboard'); }

$pageTitle = 'Manage School';
$sb = new Supabase();

$schoolId = input('id');
if (!$schoolId) {
    flash('error', 'No school ID provided.');
    redirect('admin/dashboard');
}

// ── Handle POST update ───────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'update_school') {
        $data = [
            'name'                   => input('name'),
            'code'                   => strtoupper(input('code')),
            'email'                  => input('email'),
            'phone'                  => input('phone'),
            'address'                => input('address'),
            'plan'                   => input('plan'),
            'subscription_status'    => input('subscription_status'),
            'is_active'              => input('is_active') === '1',
            'max_students'           => input('max_students') ? (int)input('max_students') : null,
            'updated_at'             => date('c'),
        ];

        // Handle date fields — only set if provided
        $trialEnds = input('trial_ends_at');
        if ($trialEnds) $data['trial_ends_at'] = $trialEnds . 'T00:00:00Z';

        $subStarts = input('subscription_starts_at');
        if ($subStarts) $data['subscription_starts_at'] = $subStarts . 'T00:00:00Z';

        $subEnds = input('subscription_ends_at');
        if ($subEnds) $data['subscription_ends_at'] = $subEnds . 'T00:00:00Z';

        $result = $sb->from('schools')->eq('id', $schoolId)->update($data);

        if (!empty($result['error'])) {
            flash('error', 'Update failed: ' . $result['error']);
        } else {
            flash('success', 'School updated successfully.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    // ── Set this school's own login domain ───────────────
    if ($action === 'set_domain') {
        $domain = strtolower(trim((string)input('domain')));
        $domain = preg_replace('~^https?://~', '', $domain);   // strip scheme
        $domain = preg_replace('~/.*$~', '', $domain);          // strip path
        $res = $sb->from('schools')->eq('id', $schoolId)->update([
            'domain'     => ($domain !== '' ? $domain : null),
            'updated_at' => date('c'),
        ]);
        if (!empty($res['error'])) {
            flash('error', 'Could not save domain (' . $res['error'] . '). If the column is missing, run the add-domain SQL first.');
        } else {
            Supabase::clearCache("school_$schoolId");
            flash('success', $domain !== ''
                ? 'Login domain set to ' . $domain . '. Point its DNS to this app (with SSL) to use it.'
                : 'Login domain cleared — this school will use the platform login.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    // Invite a user (any role) to this school — uses the same invitations
    // table and email flow as Settings → Staff & Roles, but from the platform
    // admin's perspective.
    if ($action === 'invite_user') {
        $email = strtolower(trim((string)input('invite_email')));
        $role  = input('invite_role') ?: 'school_admin';
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('error', 'A valid email address is required.');
        } else {
            // Load the school now — $school is fetched later in this file, so we
            // must read it here or the invitation (and its email) would be saved
            // with a blank school name.
            $schRow     = $sb->from('schools')->select('name,logo_url')->eq('id', $schoolId)->single()->execute();
            $schoolName = $schRow['data'][0]['name'] ?? '';
            $schoolLogo = $schRow['data'][0]['logo_url'] ?? '';
            $schoolBase = schoolBaseUrl(['domain' => schoolDomain($schoolId)]); // school's own URL if set
            $token = bin2hex(random_bytes(24));
            $sb->from('invitations')->insert([
                'email'       => $email,
                'school_id'   => $schoolId,
                'school_name' => $schoolName,
                'role'        => $role,
                'token'       => $token,
                'invited_by'  => currentUser()['id'] ?? null,
            ]);
            auditLog('invite', 'user', null, ['email' => $email, 'school_id' => $schoolId, 'role' => $role]);
            $mail = sendInvitationEmail($email, $schoolName, $role, inviteUrl($token, $schoolBase), '', $schoolLogo);
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
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    if ($action === 'change_user_role') {
        $usId    = input('user_school_id');
        $newRole = input('new_role');
        if ($usId !== '' && $newRole !== '' && array_key_exists($newRole, schoolRoleLabels($schoolId))) {
            $sb->from('user_schools')->eq('id', $usId)->eq('school_id', $schoolId)
                ->update(['role' => $newRole]);
            flash('success', 'Role updated.');
        } else {
            flash('error', 'Could not update role.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    if ($action === 'remove_user') {
        $usId = input('user_school_id');
        if ($usId !== '') {
            $sb->from('user_schools')->eq('id', $usId)->eq('school_id', $schoolId)->delete();
            flash('success', 'User removed from this school.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    if ($action === 'cancel_invitation') {
        $invId = input('invitation_id');
        if ($invId !== '') {
            $sb->from('invitations')->eq('id', $invId)->eq('school_id', $schoolId)->delete();
            flash('success', 'Invitation cancelled.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    if ($action === 'resend_invitation') {
        $invId = input('invitation_id');
        $invRes = $sb->from('invitations')->select('*')->eq('id', $invId)->eq('school_id', $schoolId)->single()->execute();
        $inv = $invRes['data'][0] ?? null;
        if (!$inv) {
            flash('error', 'Invitation not found.');
        } elseif (!empty($inv['accepted_at'])) {
            flash('error', 'That invitation has already been accepted.');
        } else {
            // Older invitations may have been saved with a blank school name —
            // resolve it (and the logo) from the school so the email is correct.
            $schRow     = $sb->from('schools')->select('name,logo_url')->eq('id', $schoolId)->single()->execute();
            $schoolName = ($inv['school_name'] ?? '') ?: ($schRow['data'][0]['name'] ?? '');
            $schoolLogo = $schRow['data'][0]['logo_url'] ?? '';
            $schoolBase = schoolBaseUrl(['domain' => schoolDomain($schoolId)]);
            $mail = sendInvitationEmail(
                $inv['email'], $schoolName, $inv['role'] ?? 'school_admin',
                inviteUrl($inv['token'], $schoolBase), $inv['expires_at'] ?? '', $schoolLogo
            );
            flash($mail['ok'] ? 'success' : 'error',
                $mail['ok'] ? 'Invitation re-sent to ' . $inv['email'] . '.'
                            : 'Could not send (' . $mail['error'] . '). Use Copy link instead.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    // ── Branches: add ────────────────────────────────────
    if ($action === 'add_branch') {
        $bname = trim((string)input('branch_name'));
        if ($bname === '') {
            flash('error', 'Branch name is required.');
        } else {
            $res = $sb->from('school_branches')->insert([
                'school_id' => $schoolId,
                'name'      => $bname,
                'address'   => trim((string)input('branch_address')) ?: null,
                'phone'     => trim((string)input('branch_phone')) ?: null,
            ]);
            flash($res['error'] ? 'error' : 'success', $res['error'] ?: 'Branch "' . $bname . '" added.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    // ── Branches: edit ───────────────────────────────────
    if ($action === 'edit_branch') {
        $bid   = input('branch_id');
        $bname = trim((string)input('branch_name'));
        if ($bid !== '' && $bname !== '') {
            $sb->from('school_branches')->eq('id', $bid)->eq('school_id', $schoolId)->update([
                'name'       => $bname,
                'address'    => trim((string)input('branch_address')) ?: null,
                'phone'      => trim((string)input('branch_phone')) ?: null,
                'updated_at' => date('c'),
            ]);
            flash('success', 'Branch updated.');
        } else {
            flash('error', 'Branch name is required.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    // ── Branches: hide / show ────────────────────────────
    if ($action === 'toggle_branch') {
        $bid = input('branch_id');
        $to  = input('to') === '1';
        if ($bid !== '') {
            $sb->from('school_branches')->eq('id', $bid)->eq('school_id', $schoolId)
               ->update(['is_active' => $to, 'updated_at' => date('c')]);
            flash('success', $to ? 'Branch activated.' : 'Branch hidden.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    // ── Assign a staff member to a branch ────────────────
    // Setting a branch makes them a branch-scoped admin (Phase 2 scoping reads
    // this). Empty = whole-school access.
    if ($action === 'set_user_branch') {
        $usId = input('user_school_id');
        $bid  = input('branch_id');
        if ($usId !== '') {
            $val = null;
            if ($bid !== '') {
                $chk = $sb->from('school_branches')->select('id')->eq('id', $bid)->eq('school_id', $schoolId)->single()->execute();
                $val = !empty($chk['data'][0]['id']) ? $bid : null;
            }
            $sb->from('user_schools')->eq('id', $usId)->eq('school_id', $schoolId)->update(['branch_id' => $val]);
            flash('success', $val ? 'Staff assigned to branch.' : 'Staff set to whole-school access.');
        }
        redirect('admin/manage-school?id=' . urlencode($schoolId));
    }

    // ── Delete school (safe) ─────────────────────────────
    // Hard-delete ONLY when the school has no students/staff/classes/invoices.
    // Otherwise deactivate (reversible) so live data is never silently destroyed.
    if ($action === 'delete_school') {
        $has = function (string $table) use ($sb, $schoolId): bool {
            $r = $sb->from($table)->select('id')->eq('school_id', $schoolId)->limit(1)->execute();
            return !empty($r['data']);
        };
        if ($has('students') || $has('user_schools') || $has('classes') || $has('invoices')) {
            $sb->from('schools')->eq('id', $schoolId)->update(['is_active' => false, 'updated_at' => date('c')]);
            flash('error', 'This school still has students, staff, classes or invoices, so it was DEACTIVATED (hidden) instead of deleted. Remove that data first to permanently delete it.');
            redirect('admin/manage-school?id=' . urlencode($schoolId));
        }
        // Empty — clear the few child rows that may exist, then delete.
        foreach (['invitations','school_branches','academic_years','terms','school_settings','fee_heads','fee_groups','subjects','expense_categories','income_categories'] as $t) {
            $sb->from($t)->eq('school_id', $schoolId)->delete();
        }
        $del = $sb->from('schools')->eq('id', $schoolId)->delete();
        if (!empty($del['error'])) {
            $sb->from('schools')->eq('id', $schoolId)->update(['is_active' => false, 'updated_at' => date('c')]);
            flash('error', 'Could not fully delete (' . $del['error'] . ') — deactivated instead.');
            redirect('admin/manage-school?id=' . urlencode($schoolId));
        }
        auditLog('delete', 'school', $schoolId, []);
        flash('success', 'School deleted.');
        redirect('admin/dashboard');
    }
}

// ── Fetch school ─────────────────────────────────────────────
$schoolResult = $sb->from('schools')->select('*')->eq('id', $schoolId)->single()->execute();
$school = $schoolResult['data'][0] ?? null;

if (!$school) {
    flash('error', 'School not found.');
    redirect('admin/dashboard');
}

// ── Branches for this school ─────────────────────────────────
$branchRes = $sb->from('school_branches')->select('id,name,address,phone,is_active')
    ->eq('school_id', $schoolId)->order('name')->execute();
$branches = is_array($branchRes['data']) ? $branchRes['data'] : [];
$branchMap = [];
foreach ($branches as $b) $branchMap[$b['id']] = $b['name'];
$activeBranches = array_values(array_filter($branches, fn($b) => !empty($b['is_active'])));

// ── Fetch ALL users in this school (any role) ────────────────
$userSchoolsResult = $sb->from('user_schools')
    ->select('id,user_id,role,branch_id,created_at')
    ->eq('school_id', $schoolId)
    ->order('created_at')
    ->execute();
$userLinks = is_array($userSchoolsResult['data']) ? $userSchoolsResult['data'] : [];

// Pull names + emails from user_profiles in one query.
$userIds = array_values(array_filter(array_column($userLinks, 'user_id')));
$profileMap = [];
if (!empty($userIds)) {
    $profRes = $sb->from('user_profiles')->select('id,full_name,phone')->in('id', $userIds)->execute();
    foreach (($profRes['data'] ?? []) as $p) $profileMap[$p['id']] = $p;
}
foreach ($userLinks as &$_u) {
    $_u['name']  = $profileMap[$_u['user_id']]['full_name'] ?? '';
    $_u['phone'] = $profileMap[$_u['user_id']]['phone'] ?? '';
}
unset($_u);

// Pending (unaccepted) invitations specifically for this school.
$invRes = $sb->from('invitations')
    ->select('id,email,role,token,accepted_at,expires_at,created_at')
    ->eq('school_id', $schoolId)->is('accepted_at', 'null')
    ->order('created_at', false)->execute();
$pendingInvites = is_array($invRes['data']) ? $invRes['data'] : [];

// Role choices for the invite + change-role dropdowns. Exclude platform_admin
// (managed separately) and parent (parents are invited from the school's own
// Parent Accounts UI).
$inviteRoles = schoolRoleLabels($schoolId);
unset($inviteRoles['platform_admin'], $inviteRoles['parent']);

// ── Quick stats ──────────────────────────────────────────────
$studentsResult = $sb->from('students')->select('id')->eq('school_id', $schoolId)->execute();
$classesResult  = $sb->from('classes')->select('id')->eq('school_id', $schoolId)->execute();
$feeHeadsResult = $sb->from('fee_heads')->select('id')->eq('school_id', $schoolId)->execute();

$studentCount = is_array($studentsResult['data']) ? count($studentsResult['data']) : 0;
$classCount   = is_array($classesResult['data']) ? count($classesResult['data']) : 0;
$feeHeadCount = is_array($feeHeadsResult['data']) ? count($feeHeadsResult['data']) : 0;

// Helper for date input value
function dateVal(?string $isoDate): string {
    if (!$isoDate) return '';
    return date('Y-m-d', strtotime($isoDate));
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<!-- Breadcrumb -->
<div class="mb-6">
    <div class="flex items-center gap-2 text-sm text-gray-400 mb-2">
        <a href="<?= baseUrl('admin/dashboard') ?>" class="hover:text-emerald-600 transition">Platform Admin</a>
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        <span class="text-gray-600"><?= e($school['name']) ?></span>
    </div>
    <h1 class="text-2xl font-bold text-gray-900">Manage School</h1>
</div>

<!-- Quick Stats -->
<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-3">
            <div class="w-2 h-2 rounded-full bg-blue-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Students</span>
        </div>
        <p class="text-[28px] font-bold text-gray-900 tracking-tight"><?= number_format($studentCount) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-3">
            <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Classes</span>
        </div>
        <p class="text-[28px] font-bold text-gray-900 tracking-tight"><?= number_format($classCount) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-3">
            <div class="w-2 h-2 rounded-full bg-indigo-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Fee Heads</span>
        </div>
        <p class="text-[28px] font-bold text-gray-900 tracking-tight"><?= number_format($feeHeadCount) ?></p>
    </div>
</div>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- School Details Form (2 cols) -->
    <div class="lg:col-span-2">
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="text-sm font-semibold text-gray-700">School Details</h2>
            </div>
            <form method="POST" class="p-5">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="update_school">

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <!-- Name -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">School Name</label>
                        <input type="text" name="name" value="<?= e($school['name'] ?? '') ?>" required
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                    </div>
                    <!-- Code -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Code</label>
                        <input type="text" name="code" value="<?= e($school['code'] ?? '') ?>" required maxlength="10"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition uppercase">
                    </div>
                    <!-- Email -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" name="email" value="<?= e($school['email'] ?? '') ?>"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                    </div>
                    <!-- Phone -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input type="text" name="phone" value="<?= e($school['phone'] ?? '') ?>"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                    </div>
                    <!-- Address (full width) -->
                    <div class="sm:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <input type="text" name="address" value="<?= e($school['address'] ?? '') ?>"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                    </div>
                    <!-- Plan -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                        <select name="plan" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                            <?php foreach (['free','basic','standard','premium','enterprise'] as $p): ?>
                                <option value="<?= $p ?>"<?= selectedIf($school['plan'] ?? '', $p) ?>><?= ucfirst($p) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <!-- Subscription Status -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Subscription Status</label>
                        <select name="subscription_status" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                            <?php foreach (['trial','active','past_due','cancelled','suspended'] as $s): ?>
                                <option value="<?= $s ?>"<?= selectedIf($school['subscription_status'] ?? '', $s) ?>><?= ucfirst(str_replace('_', ' ', $s)) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <!-- Active toggle -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Active</label>
                        <select name="is_active" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                            <option value="1"<?= selectedIf(!empty($school['is_active']), true) ?>>Yes</option>
                            <option value="0"<?= selectedIf(empty($school['is_active']), true) ?>>No</option>
                        </select>
                    </div>
                    <!-- Max Students -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Max Students</label>
                        <input type="number" name="max_students" value="<?= e($school['max_students'] ?? '') ?>" min="0" placeholder="Unlimited"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                    </div>
                    <!-- Trial Ends -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Trial Ends At</label>
                        <input type="date" name="trial_ends_at" value="<?= dateVal($school['trial_ends_at'] ?? '') ?>"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                    </div>
                    <!-- Subscription Starts -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Subscription Starts</label>
                        <input type="date" name="subscription_starts_at" value="<?= dateVal($school['subscription_starts_at'] ?? '') ?>"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                    </div>
                    <!-- Subscription Ends -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Subscription Ends</label>
                        <input type="date" name="subscription_ends_at" value="<?= dateVal($school['subscription_ends_at'] ?? '') ?>"
                               class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition">
                    </div>
                </div>

                <div class="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
                    <a href="<?= baseUrl('admin/dashboard') ?>" class="text-sm text-gray-500 hover:text-gray-700 transition">Back to all schools</a>
                    <button type="submit"
                            class="px-5 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition">
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Sidebar: Admin Users + Info -->
    <div class="space-y-6">
        <!-- School Info Card -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">School Info</h3>
            <dl class="space-y-2 text-sm">
                <div class="flex justify-between">
                    <dt class="text-gray-400">ID</dt>
                    <dd class="text-gray-600 font-mono text-xs truncate max-w-[160px]" title="<?= e($school['id']) ?>"><?= e($school['id']) ?></dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-400">Slug</dt>
                    <dd class="text-gray-600"><?= e($school['slug'] ?? '—') ?></dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-400">Approved</dt>
                    <dd>
                        <?php if (!empty($school['approved'])): ?>
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Yes</span>
                        <?php else: ?>
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">No</span>
                        <?php endif; ?>
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-400">Created</dt>
                    <dd class="text-gray-600"><?= formatDate($school['created_at'] ?? '') ?></dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-400">Updated</dt>
                    <dd class="text-gray-600"><?= formatDate($school['updated_at'] ?? '') ?></dd>
                </div>
                <?php if (!empty($school['logo_url'])): ?>
                    <div class="pt-2">
                        <dt class="text-gray-400 mb-1">Logo</dt>
                        <dd><img src="<?= e($school['logo_url']) ?>" alt="Logo" class="w-16 h-16 rounded-lg object-contain border border-gray-100"></dd>
                    </div>
                <?php endif; ?>
            </dl>
        </div>

        <!-- Quick Action: Enter School -->
        <form method="POST" action="<?= baseUrl('admin/dashboard') ?>">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="enter_school">
            <input type="hidden" name="school_id" value="<?= e($school['id']) ?>">
            <button type="submit"
                    class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>
                Enter This School
            </button>
        </form>

        <!-- Login Domain -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mt-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-1">Login Domain</h3>
            <p class="text-xs text-gray-400 mb-3">This school's own login URL — its staff sign in here and invite links use it. Leave blank to use the platform login (<?= e(parse_url(APP_URL, PHP_URL_HOST)) ?>).</p>
            <form method="POST" class="flex items-center gap-2">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="set_domain">
                <input type="text" name="domain" value="<?= e($school['domain'] ?? '') ?>" placeholder="mgt.exampleschool.com"
                    class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <button type="submit" class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save</button>
            </form>
            <p class="text-[11px] text-gray-400 mt-1">Point this domain's DNS to the app on Hostinger (with SSL) for it to work.</p>
        </div>

        <!-- Branches / Campuses -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mt-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-1">Branches / Campuses</h3>
            <p class="text-xs text-gray-400 mb-4">Campuses within this school. Assign a staff member to a branch (in the staff list) to make them a branch admin.</p>
            <form method="POST" class="space-y-2 mb-4 pb-4 border-b border-gray-100">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="add_branch">
                <input type="text" name="branch_name" required placeholder="Branch name (e.g. Springs)" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <input type="text" name="branch_address" placeholder="Address (optional)" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <button type="submit" class="w-full py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Add Branch</button>
            </form>
            <?php if (empty($branches)): ?>
                <p class="text-xs text-gray-400">No branches yet.</p>
            <?php else: ?>
                <div class="space-y-1.5">
                    <?php foreach ($branches as $b): ?>
                        <div class="flex items-center justify-between py-1.5">
                            <div class="min-w-0">
                                <span class="text-sm font-medium text-gray-900"><?= e($b['name']) ?></span>
                                <?php if (empty($b['is_active'])): ?><span class="ml-1 text-[11px] text-amber-600">(hidden)</span><?php endif; ?>
                                <?php if (!empty($b['address'])): ?><span class="block text-[11px] text-gray-400 truncate"><?= e($b['address']) ?></span><?php endif; ?>
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <button type="button" onclick="editBranch('<?= e($b['id']) ?>','<?= e(addslashes($b['name'])) ?>','<?= e(addslashes($b['address'] ?? '')) ?>','<?= e(addslashes($b['phone'] ?? '')) ?>')" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>
                                <form method="POST" class="inline">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="toggle_branch">
                                    <input type="hidden" name="branch_id" value="<?= e($b['id']) ?>">
                                    <input type="hidden" name="to" value="<?= empty($b['is_active']) ? '1' : '0' ?>">
                                    <button type="submit" class="text-xs text-gray-500 hover:text-gray-800 font-medium"><?= empty($b['is_active']) ? 'Show' : 'Hide' ?></button>
                                </form>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>

        <!-- Danger zone: delete school -->
        <form method="POST" class="mt-6" onsubmit="return confirm('Delete this school? If it has students, staff, classes or invoices it will be DEACTIVATED instead. This cannot be undone.')">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="delete_school">
            <button type="submit" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Delete School
            </button>
            <p class="text-[11px] text-gray-400 mt-1 text-center">Only fully deletes when empty; otherwise deactivates.</p>
        </form>
    </div>
</div>

<!-- Edit Branch Modal -->
<div id="editBranchModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Branch</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit_branch">
            <input type="hidden" name="branch_id" id="ebId">
            <div class="mb-3">
                <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" name="branch_name" id="ebName" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="mb-3">
                <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" name="branch_address" id="ebAddr" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" name="branch_phone" id="ebPhone" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save</button>
                <button type="button" onclick="closeModal('editBranchModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>
<script>
window.editBranch = function (id, name, addr, phone) {
    var s=function(i,v){var el=document.getElementById(i);if(el)el.value=v||'';};
    s('ebId',id); s('ebName',name); s('ebAddr',addr); s('ebPhone',phone);
    window.openModal('editBranchModal');
};
</script>

<!-- ── Users & Invitations (full-width section under the form) ── -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">

    <!-- Users in this school -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
                <h3 class="text-sm font-semibold text-gray-700">Users in this school</h3>
                <p class="text-xs text-gray-400 mt-0.5"><?= count($userLinks) ?> staff member<?= count($userLinks) === 1 ? '' : 's' ?></p>
            </div>
        </div>
        <?php if (empty($userLinks)): ?>
            <p class="px-5 py-6 text-sm text-gray-400">No users linked to this school yet — invite the first one below.</p>
        <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($userLinks as $u): ?>
                <?php $uRole = normalizeRole($u['role'] ?? ''); ?>
                <div class="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0 flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                            <?= e(strtoupper(substr($u['name'] ?: 'U', 0, 1))) ?>
                        </div>
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate"><?= e($u['name'] !== '' ? $u['name'] : 'Staff member') ?></p>
                            <p class="text-[11px] text-gray-400">Since <?= formatDate($u['created_at'] ?? '') ?><?= !empty($u['phone']) ? ' · ' . e($u['phone']) : '' ?></p>
                        </div>
                    </div>
                    <form method="POST" class="flex items-center gap-2">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="change_user_role">
                        <input type="hidden" name="user_school_id" value="<?= e($u['id']) ?>">
                        <select name="new_role" class="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:border-emerald-400 outline-none">
                            <?php foreach ($inviteRoles as $rKey => $rLabel): ?>
                                <option value="<?= e($rKey) ?>"<?= $rKey === $uRole ? ' selected' : '' ?>><?= e($rLabel) ?></option>
                            <?php endforeach; ?>
                        </select>
                        <button type="submit" class="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">Save</button>
                    </form>
                    <?php if (!empty($activeBranches)): ?>
                    <form method="POST" class="flex items-center gap-2" title="Limit this staff member to one branch (leave as All branches for whole-school access)">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="set_user_branch">
                        <input type="hidden" name="user_school_id" value="<?= e($u['id']) ?>">
                        <select name="branch_id" class="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:border-emerald-400 outline-none">
                            <option value="">All branches</option>
                            <?php foreach ($activeBranches as $b): ?>
                                <option value="<?= e($b['id']) ?>"<?= ($u['branch_id'] ?? '') === $b['id'] ? ' selected' : '' ?>><?= e($b['name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                        <button type="submit" class="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Set</button>
                    </form>
                    <?php endif; ?>
                    <form method="POST" onsubmit="return confirm('Remove this user from the school? Their login keeps working but they lose all access here.')" class="inline">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="remove_user">
                        <input type="hidden" name="user_school_id" value="<?= e($u['id']) ?>">
                        <button type="submit" class="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                    </form>
                </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>

    <!-- Invite a user + Pending invitations -->
    <div class="space-y-6">
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-1">Invite to this school</h3>
            <p class="text-xs text-gray-400 mb-4">An invitation email goes to the address you enter (or a copyable link appears in Pending if email is off).</p>
            <form method="POST" class="space-y-3">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="invite_user">
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Email address</label>
                    <input type="email" name="invite_email" required placeholder="name@example.com"
                           class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Role</label>
                    <select name="invite_role" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <?php foreach ($inviteRoles as $rKey => $rLabel): ?>
                            <option value="<?= e($rKey) ?>"<?= $rKey === 'school_admin' ? ' selected' : '' ?>><?= e($rLabel) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <button type="submit" class="w-full py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Send Invitation</button>
            </form>
        </div>

        <?php if (!empty($pendingInvites)): ?>
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div class="px-5 py-4 border-b border-gray-100">
                <h3 class="text-sm font-semibold text-gray-700">Pending Invitations</h3>
                <p class="text-xs text-gray-400 mt-0.5"><?= count($pendingInvites) ?> awaiting sign-up</p>
            </div>
            <div class="divide-y divide-gray-50">
                <?php foreach ($pendingInvites as $inv): ?>
                    <?php
                    $inviteLink = inviteUrl($inv['token'] ?? '', schoolBaseUrl($school));
                    $expTs      = !empty($inv['expires_at']) ? strtotime($inv['expires_at']) : 0;
                    $isExpired  = $expTs && $expTs < time();
                    ?>
                    <div class="px-5 py-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-gray-900"><?= e($inv['email']) ?></p>
                                <p class="text-xs text-gray-400">
                                    <?= e(roleLabel($inv['role'] ?? '')) ?>
                                    <?php if ($isExpired): ?> · <span class="text-red-500">expired</span><?php endif; ?>
                                </p>
                            </div>
                            <div class="flex items-center gap-1.5 flex-shrink-0">
                                <form method="POST" class="inline">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="resend_invitation">
                                    <input type="hidden" name="invitation_id" value="<?= e($inv['id']) ?>">
                                    <button type="submit" class="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">Resend</button>
                                </form>
                                <form method="POST" class="inline" onsubmit="return confirm('Cancel this invitation?')">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="cancel_invitation">
                                    <input type="hidden" name="invitation_id" value="<?= e($inv['id']) ?>">
                                    <button type="submit" class="text-xs text-gray-400 hover:text-red-600 font-medium">Cancel</button>
                                </form>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 mt-2">
                            <input type="text" readonly value="<?= e($inviteLink) ?>" onclick="this.select()"
                                class="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 bg-gray-50 font-mono">
                            <button type="button"
                                onclick="navigator.clipboard.writeText('<?= e($inviteLink) ?>'); this.textContent='Copied';"
                                class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition whitespace-nowrap">Copy</button>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
