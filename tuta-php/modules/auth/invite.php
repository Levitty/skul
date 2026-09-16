<?php
/**
 * Accept Invitation — invitation-only onboarding.
 * Replaces the old public /register page.
 */
$pageTitle = 'Accept Invitation';

$token = input('token');
$error = '';
$success = false;
$invitation = null;

if (!$token) {
    $error = 'Invalid invitation link. Please check your email for the correct link.';
} else {
    // Look up the invitation
    $sb = new Supabase();
    $invResult = $sb->from('invitations')->select('*')->eq('token', $token)->single()->execute();
    $invitation = $invResult['data'][0] ?? null;

    if (!$invitation) {
        $error = 'This invitation link is not valid.';
    } elseif ($invitation['accepted_at']) {
        $error = 'This invitation has already been used.';
    } elseif (strtotime($invitation['expires_at']) < time()) {
        $error = 'This invitation has expired. Please ask the administrator to send a new one.';
    }
}

// Handle form submission.
// Note the explicit branching: if CSRF fails (usually because the user's
// session token rotated in another tab between page load and submit), we
// MUST set $error so the user sees something. The previous gate skipped
// processing silently, which looked like "the button does nothing".
if (isPost()) {
    if (!verifyCsrf()) {
        $error = 'Your session expired while you were filling in this form. Please refresh the page and try again.';
    }
}
if (isPost() && verifyCsrf() && $invitation && !$error) {
    $name     = input('name');
    $password = input('password');
    $confirm  = input('password_confirm');

    if (!$name) {
        $error = 'Your name is required.';
    } elseif (strlen($password) < 6) {
        $error = 'Password must be at least 6 characters.';
    } elseif ($password !== $confirm) {
        $error = 'Passwords do not match.';
    } else {
        $sb = new Supabase();

        // Create auth user, already email-confirmed. The invitation token was
        // delivered to this address, so ownership is established — confirming
        // now lets the user log in immediately instead of being blocked by an
        // unverified-email error that surfaces as "Invalid email or password".
        $authResult = $sb->adminCreateUser($invitation['email'], $password, true);

        if ($authResult['error']) {
            $error = $authResult['error'];
        } else {
            $userId = $authResult['data']['id'] ?? $authResult['data']['user']['id'] ?? null;

            if ($userId) {
                // Create user profile. The table's columns are id / school_id /
                // full_name — the previous code used user_id / name / email,
                // which silently failed and left new users without a name.
                $sb->from('user_profiles')->insert([
                    'id'        => $userId,
                    'school_id' => $invitation['school_id'],
                    'full_name' => $name,
                ]);

                // Platform admin invitations: insert into platform_admins (no
                // school_id). All other roles get the standard user_schools row.
                $invRoleLower = strtolower(trim((string)($invitation['role'] ?? '')));
                if ($invRoleLower === 'platform_admin') {
                    $sb->from('platform_admins')->insert([
                        'user_id' => $userId,
                    ]);
                } elseif ($invRoleLower === 'group_admin' && $invitation['school_id']) {
                    // Group admin super-admins the GROUP that owns the invited
                    // school — recorded in school_group_admins, NOT user_schools
                    // ('group_admin' isn't a per-school role and the user_schools
                    // role check rejects it, which silently left the account with
                    // no access).
                    $grp = $sb->from('school_group_members')->select('group_id')
                        ->eq('school_id', $invitation['school_id'])->limit(1)->execute();
                    $gid = $grp['data'][0]['group_id'] ?? null;
                    if ($gid) {
                        $sb->from('school_group_admins')->insert([
                            'group_id' => $gid,
                            'user_id'  => $userId,
                        ]);
                    }
                } elseif ($invitation['school_id']) {
                    $sb->from('user_schools')->insert([
                        'user_id'   => $userId,
                        'school_id' => $invitation['school_id'],
                        'role'      => $invitation['role'] ?? 'admin',
                    ]);
                }

                // Parent invitations: wire up the children named on the
                // invitation, so the parent portal can find them immediately.
                $invRole = strtolower(trim($invitation['role'] ?? ''));
                if ($invRole === 'parent' && !empty($invitation['link_student_ids']) && $invitation['school_id']) {
                    $linkIds = array_filter(array_map('trim', explode(',', $invitation['link_student_ids'])));
                    $links = [];
                    foreach ($linkIds as $stuId) {
                        $links[] = [
                            'school_id'      => $invitation['school_id'],
                            'parent_user_id' => $userId,
                            'student_id'     => $stuId,
                        ];
                    }
                    if (!empty($links)) {
                        $sb->from('student_parents')->insert($links);
                    }
                }

                // Mark invitation as accepted
                $sb->from('invitations')->eq('id', $invitation['id'])->update([
                    'accepted_at' => date('c'),
                ]);

                $success = true;
            } else {
                $error = 'Account created but could not retrieve user ID. Please try logging in.';
                $success = true; // Still show success since auth account was created
            }
        }
    }
}

// Per-tenant branding for this page, taken from the invitation's school so the
// sign-up flow matches the school the person is joining. Platform-admin invites
// (no school_id) fall back to the product name.
$brandName = APP_NAME;
$brandLogo = '';
if (!empty($invitation['school_id'])) {
    $sbBrand = new Supabase();
    $schB = $sbBrand->from('schools')->select('name,logo_url')->eq('id', $invitation['school_id'])->single()->execute();
    $brandName = ($schB['data'][0]['name'] ?? '') ?: ($invitation['school_name'] ?? APP_NAME);
    $brandLogo = $schB['data'][0]['logo_url'] ?? '';
}
$brandInitial = strtoupper(substr($brandName ?: 'S', 0, 1));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $pageTitle ?> — <?= e($brandName) ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md">
        <div class="text-center mb-8">
            <?php if ($brandLogo): ?>
                <img src="<?= e($brandLogo) ?>" alt="<?= e($brandName) ?>" class="w-12 h-12 rounded-xl object-contain border border-gray-100 bg-white mx-auto mb-4">
            <?php else: ?>
                <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-xl mb-4"><?= e($brandInitial) ?></div>
            <?php endif; ?>
            <h1 class="text-2xl font-bold text-gray-900"><?= e($brandName) ?></h1>
            <?php if ($brandName !== APP_NAME): ?>
                <p class="text-xs text-gray-400 mt-1">Powered by <?= APP_NAME ?></p>
            <?php endif; ?>
        </div>

        <div class="bg-white rounded-xl border border-gray-100 p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

            <?php if ($success): ?>
                <div class="text-center">
                    <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <h2 class="text-lg font-bold text-gray-900 mb-2">Account Created</h2>
                    <p class="text-sm text-gray-600 mb-2">Please check your email to verify your account, then log in.</p>
                    <?php if ($invitation['school_name'] ?? ''): ?>
                        <p class="text-sm text-gray-500">You've been added to <strong><?= e($invitation['school_name']) ?></strong> as <strong><?= e(ucfirst($invitation['role'] ?? 'admin')) ?></strong>.</p>
                    <?php endif; ?>
                    <a href="<?= baseUrl('login') ?>" class="mt-6 inline-block px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Go to Login</a>
                </div>

            <?php elseif ($error && !$invitation): ?>
                <div class="text-center">
                    <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </div>
                    <h2 class="text-lg font-bold text-gray-900 mb-2">Invalid Invitation</h2>
                    <p class="text-sm text-gray-600"><?= e($error) ?></p>
                </div>

            <?php else: ?>
                <h2 class="text-lg font-bold text-gray-900 mb-1">Accept Invitation</h2>
                <p class="text-sm text-gray-500 mb-6">
                    You've been invited to join
                    <?php if ($invitation['school_name'] ?? ''): ?>
                        <strong><?= e($invitation['school_name']) ?></strong> as <strong><?= e(ucfirst($invitation['role'] ?? 'admin')) ?></strong>.
                    <?php else: ?>
                        Tuta School.
                    <?php endif; ?>
                    Set up your account below.
                </p>

                <?php if ($error): ?>
                    <div class="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"><?= e($error) ?></div>
                <?php endif; ?>

                <form method="POST">
                    <?= csrfField() ?>
                    <input type="hidden" name="token" value="<?= e($token) ?>">

                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" value="<?= e($invitation['email']) ?>" disabled class="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                        <input type="text" name="name" required value="<?= e(input('name')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input type="password" name="password" required minlength="6" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                    </div>
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                        <input type="password" name="password_confirm" required minlength="6" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                    </div>
                    <button type="submit" class="w-full py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Create Account</button>
                </form>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
