<?php
/**
 * Platform Admins — list, invite, and revoke platform-level administrators.
 *
 * A platform admin operates the SaaS across every school. The platform_admins
 * table is the source of truth (see modules/auth/login.php). This page is
 * the UI for managing it.
 */
if (!isPlatformAdmin()) { redirect('dashboard'); }

$pageTitle = 'Platform Admins';
$sb = new Supabase();
$user = currentUser();

// ── POST actions ─────────────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'invite_admin') {
        $email = strtolower(trim((string)input('invite_email')));
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('error', 'A valid email address is required.');
        } else {
            $token = bin2hex(random_bytes(24));
            $sb->from('invitations')->insert([
                'email'       => $email,
                'school_id'   => null,
                'school_name' => 'Tuta School Platform',
                'role'        => 'platform_admin',
                'token'       => $token,
                'invited_by'  => $user['id'] ?? null,
            ]);
            auditLog('invite', 'platform_admin', null, ['email' => $email]);
            $mail = sendInvitationEmail($email, 'Tuta School Platform', 'platform_admin', inviteUrl($token));
            if ($mail['ok']) {
                flash('success', 'Invitation emailed to ' . $email . '.');
            } else {
                flash('success', 'Invitation created for ' . $email . '. '
                    . (mailEnabled()
                        ? 'Email failed (' . $mail['error'] . ') — '
                        : 'Automatic email is off — ')
                    . 'copy the link from Pending Invitations below.');
            }
        }
        redirect('admin/platform-admins');
    }

    if ($action === 'revoke_admin') {
        $adminRowId   = input('platform_admin_id');
        $targetUserId = input('target_user_id');
        // Belt and braces: never let the current admin revoke themselves
        // (that would lock them out of /admin instantly).
        if ($targetUserId === ($user['id'] ?? '')) {
            flash('error', 'You cannot revoke your own platform admin status.');
        } elseif ($adminRowId) {
            $sb->from('platform_admins')->eq('id', $adminRowId)->delete();
            auditLog('revoke', 'platform_admin', $adminRowId);
            flash('success', 'Platform admin access revoked.');
        }
        redirect('admin/platform-admins');
    }

    if ($action === 'cancel_invitation') {
        $invId = input('invitation_id');
        if ($invId) {
            $sb->from('invitations')->eq('id', $invId)->eq('role', 'platform_admin')->delete();
            flash('success', 'Invitation cancelled.');
        }
        redirect('admin/platform-admins');
    }

    if ($action === 'resend_invitation') {
        $invId = input('invitation_id');
        $invRes = $sb->from('invitations')->select('*')->eq('id', $invId)->eq('role', 'platform_admin')->single()->execute();
        $inv = $invRes['data'][0] ?? null;
        if (!$inv) {
            flash('error', 'Invitation not found.');
        } elseif (!empty($inv['accepted_at'])) {
            flash('error', 'That invitation has already been accepted.');
        } else {
            $mail = sendInvitationEmail($inv['email'], 'Tuta School Platform', 'platform_admin',
                inviteUrl($inv['token']), $inv['expires_at'] ?? '');
            flash($mail['ok'] ? 'success' : 'error',
                $mail['ok'] ? 'Invitation re-sent to ' . $inv['email'] . '.'
                            : 'Could not send (' . $mail['error'] . '). Use Copy link instead.');
        }
        redirect('admin/platform-admins');
    }
}

// ── Fetch data ───────────────────────────────────────────────
$paRes = $sb->from('platform_admins')->select('id,user_id,created_at')->order('created_at')->execute();
$admins = is_array($paRes['data']) ? $paRes['data'] : [];

$adminUserIds = array_values(array_filter(array_column($admins, 'user_id')));
$profiles = [];
if (!empty($adminUserIds)) {
    $pRes = $sb->from('user_profiles')->select('id,full_name,phone')->in('id', $adminUserIds)->execute();
    foreach (($pRes['data'] ?? []) as $p) $profiles[$p['id']] = $p;
}
foreach ($admins as &$a) {
    $a['name']  = $profiles[$a['user_id']]['full_name'] ?? '';
    $a['phone'] = $profiles[$a['user_id']]['phone']     ?? '';
}
unset($a);

$invRes = $sb->from('invitations')
    ->select('id,email,token,accepted_at,expires_at,created_at')
    ->eq('role', 'platform_admin')->is('accepted_at', 'null')
    ->order('created_at', false)->execute();
$pendingInvites = is_array($invRes['data']) ? $invRes['data'] : [];

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <div class="flex items-center gap-2 text-sm text-gray-400 mb-2">
        <a href="<?= baseUrl('admin') ?>" class="hover:text-emerald-600 transition">Platform Admin</a>
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        <span class="text-gray-600">Platform Admins</span>
    </div>
    <h1 class="text-2xl font-bold text-gray-900">Platform Admins</h1>
    <p class="text-sm text-gray-500 mt-1">The people who can administer every school on Tuta. Treat as carefully as root.</p>
</div>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Admins list -->
    <div class="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="px-5 py-4 border-b border-gray-100">
            <h2 class="text-sm font-semibold text-gray-700">Current platform admins</h2>
            <p class="text-xs text-gray-400 mt-0.5"><?= count($admins) ?> active</p>
        </div>
        <?php if (empty($admins)): ?>
            <p class="px-5 py-8 text-sm text-gray-400 text-center">No platform admins listed. (You shouldn't be reading this — if you can see this page you should be in the table.)</p>
        <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($admins as $a): ?>
                <?php $isMe = ($a['user_id'] === ($user['id'] ?? '')); ?>
                <div class="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                            <?= e(strtoupper(substr($a['name'] ?: 'P', 0, 1))) ?>
                        </div>
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">
                                <?= e($a['name'] !== '' ? $a['name'] : 'Platform admin') ?>
                                <?php if ($isMe): ?>
                                    <span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">You</span>
                                <?php endif; ?>
                            </p>
                            <p class="text-[11px] text-gray-400">Since <?= formatDate($a['created_at'] ?? '') ?><?= !empty($a['phone']) ? ' · ' . e($a['phone']) : '' ?></p>
                        </div>
                    </div>
                    <?php if ($isMe): ?>
                        <span class="text-xs text-gray-400 italic">Self-revoke is blocked</span>
                    <?php else: ?>
                        <form method="POST" onsubmit="return confirm('Revoke platform admin access for this person? They will keep any school-level access they have, but lose access to /admin.')" class="inline">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="revoke_admin">
                            <input type="hidden" name="platform_admin_id" value="<?= e($a['id']) ?>">
                            <input type="hidden" name="target_user_id" value="<?= e($a['user_id']) ?>">
                            <button type="submit" class="px-2.5 py-1 text-xs font-medium text-red-500 hover:text-red-700 transition">Revoke</button>
                        </form>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>

    <!-- Invite + Pending -->
    <div class="space-y-6">
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-1">Invite a platform admin</h3>
            <p class="text-xs text-gray-400 mb-4">They'll get an email with a link to set their password. Once accepted, they have full platform access.</p>
            <form method="POST" class="space-y-3">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="invite_admin">
                <input type="email" name="invite_email" required placeholder="name@example.com"
                       class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
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
                    $inviteLink = inviteUrl($inv['token'] ?? '');
                    $expTs      = !empty($inv['expires_at']) ? strtotime($inv['expires_at']) : 0;
                    $isExpired  = $expTs && $expTs < time();
                    ?>
                    <div class="px-5 py-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-gray-900"><?= e($inv['email']) ?></p>
                                <?php if ($isExpired): ?>
                                    <p class="text-xs text-red-500">Expired</p>
                                <?php endif; ?>
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
