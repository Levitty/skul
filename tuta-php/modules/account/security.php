<?php
/**
 * Change Password — self-service for any signed-in user (admin, teacher,
 * bursar or parent). We verify the current password by re-authenticating with
 * signIn() (proves it's really them), then set the new one via the admin API.
 *
 * Deliberately NOT the Supabase recovery-email flow: that depends on the Auth
 * "Site URL" and needs a token-handling landing page. This works entirely
 * server-side and in-app, so it can't break on a mis-set redirect.
 */
$pageTitle = 'Change Password';

$sb      = new Supabase();
$error   = '';
$success = false;

$email = $_SESSION['user_email'] ?? '';
$uid   = $_SESSION['user_id'] ?? '';

if (isPost()) {
    if (!verifyCsrf()) {
        $error = 'Your session expired while you were on this page. Please refresh and try again.';
    } else {
        $current = (string)input('current_password');
        $new     = (string)input('new_password');
        $confirm = (string)input('confirm_password');

        if (!$current || !$new || !$confirm) {
            $error = 'Please fill in all three fields.';
        } elseif (strlen($new) < 8) {
            $error = 'Your new password must be at least 8 characters.';
        } elseif ($new !== $confirm) {
            $error = 'The two new-password fields do not match.';
        } elseif ($new === $current) {
            $error = 'Your new password must be different from your current one.';
        } elseif (!$email || !$uid) {
            $error = 'Could not identify your account. Please log out and back in, then try again.';
        } else {
            // 1. Prove identity: the current password must actually sign in.
            $auth = $sb->signIn($email, $current);
            if (!empty($auth['error']) || empty($auth['data']['access_token'])) {
                $error = 'Your current password is incorrect.';
            } else {
                // 2. Set the new password (service-key admin endpoint).
                $upd = $sb->adminUpdateUser($uid, ['password' => $new]);
                if (!empty($upd['error']) || (int)($upd['status'] ?? 0) >= 400) {
                    $error = 'Could not update your password: ' . ($upd['error'] ?? ('HTTP ' . ($upd['status'] ?? '?')));
                } else {
                    auditLog('change_password', 'user', $uid, []);
                    $success = true;
                }
            }
        }
    }
}

// Adaptive chrome: parents get the mobile portal layout, staff the app shell.
$asParent = isParent();
if ($asParent) {
    $portalBack      = 'portal';
    $portalBackLabel = 'Back to portal';
    require __DIR__ . '/../../includes/portal-top.php';
} else {
    require __DIR__ . '/../../includes/layout-top.php';
}
?>

<div class="max-w-md<?= $asParent ? '' : ' mx-auto' ?>">
    <?php if (!$asParent): ?>
        <h1 class="text-2xl font-bold text-gray-900 mb-1">Change Password</h1>
        <p class="text-sm text-gray-500 mb-6">Update the password for <span class="font-medium text-gray-700"><?= e($email) ?></span>.</p>
    <?php else: ?>
        <h1 class="text-lg font-bold text-gray-900 mb-4">Change Password</h1>
    <?php endif; ?>

    <?php if ($success): ?>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            <p class="font-semibold"> Password changed.</p>
            <p class="mt-1">Your new password is active now. Use it the next time you sign in.</p>
            <a href="<?= baseUrl($asParent ? 'portal' : 'dashboard') ?>" class="inline-block mt-3 text-emerald-700 font-medium hover:underline">Done &rarr;</a>
        </div>
    <?php else: ?>
        <?php if ($error): ?>
            <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><?= e($error) ?></div>
        <?php endif; ?>

        <form method="POST" class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 space-y-4">
            <?= csrfField() ?>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Current password</label>
                <input type="password" name="current_password" required autocomplete="current-password"
                       class="block w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input type="password" name="new_password" required minlength="8" autocomplete="new-password"
                       class="block w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                <p class="text-xs text-gray-400 mt-1">At least 8 characters.</p>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                <input type="password" name="confirm_password" required minlength="8" autocomplete="new-password"
                       class="block w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
            </div>
            <button type="submit" class="w-full px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
                Update password
            </button>
        </form>
    <?php endif; ?>
</div>

<?php
if ($asParent) {
    require __DIR__ . '/../../includes/portal-bottom.php';
} else {
    require __DIR__ . '/../../includes/layout-bottom.php';
}
?>
