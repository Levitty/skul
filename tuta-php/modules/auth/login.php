<?php
/**
 * Login page — authenticates via Supabase Auth.
 * Multi-school SaaS: if user belongs to multiple schools, redirects to school picker.
 */

require_once __DIR__ . '/../../includes/public-forms.php'; // turnstileVerify()

if (isLoggedIn()) {
    redirect('dashboard');
}

$error = '';

// Per-tenant login: if this hostname belongs to a school, scope the page to it.
// On the platform host (school.tutagora.com) this is null and login is open.
$hostTenant    = tenantFromHost();
$isTenantLogin = $hostTenant !== null;
$brandName     = $isTenantLogin ? ($hostTenant['name'] ?? APP_NAME) : APP_NAME;
$brandLogo     = $isTenantLogin ? ($hostTenant['logo_url'] ?? '') : '';

if (isPost()) {
    if (!verifyCsrf()) {
        $error = 'Invalid form submission. Please try again.';
    } else {
        $email    = input('email');
        $password = input('password');

        // Brute-force / credential-stuffing throttle. Count recent FAILED
        // attempts by email and by source IP; block once either crosses a
        // threshold in the last 15 minutes. Keys use REMOTE_ADDR (not the
        // spoofable X-Forwarded-For) so an attacker can't reset the counter.
        $ipKey    = 'loginfail:ip:' . clientIpAddr();
        $emailKey = 'loginfail:email:' . strtolower(trim((string)$email));

        if (!$email || !$password) {
            $error = 'Please enter both email and password.';
        } elseif (defined('TURNSTILE_LOGIN_SECRET') && TURNSTILE_LOGIN_SECRET !== ''
            && !turnstileVerify(TURNSTILE_LOGIN_SECRET, (string)($_POST['cf-turnstile-response'] ?? ''))) {
            $error = 'Could not verify you are human. Please try again.';
        } elseif (rateCount($emailKey, 900) >= 5 || rateCount($ipKey, 900) >= 25) {
            $error = 'Too many sign-in attempts. Please wait a few minutes and try again.';
        } else {
            $sb     = new Supabase();
            $result = $sb->signIn($email, $password);

            if ($result['error']) {
                // Record the failure for throttling, and return ONE uniform
                // message regardless of cause — distinct "not verified" vs
                // "invalid" responses let an attacker enumerate which emails
                // are real accounts. (A static hint under the form covers the
                // invited-but-unverified case without leaking per-account.)
                rateRecord($emailKey);
                rateRecord($ipKey);
                $error = 'Invalid email or password.';
            } else {
                $accessToken = $result['data']['access_token'] ?? '';
                $userData    = $result['data']['user'] ?? [];

                if (empty($userData['id'])) {
                    $error = 'Login failed. Please try again.';
                } else {
                    // Check if platform admin
                    $adminCheck = $sb->from('platform_admins')
                        ->select('id')
                        ->eq('user_id', $userData['id'])
                        ->single()
                        ->execute();
                    $isPlatformAdmin = !empty($adminCheck['data'][0]['id']);

                    // Get ALL schools this user belongs to
                    $schoolsResult = $sb->from('user_schools')
                        ->select('school_id,role')
                        ->eq('user_id', $userData['id'])
                        ->execute();
                    $userSchoolRows = $schoolsResult['data'] ?? [];

                    // Is this a group super-admin (e.g. Whitestar)? They own a
                    // group of branch schools but no school of their own, so this
                    // must be resolved before the "no school profile" fallback.
                    $groupAdminCheck = $sb->from('school_group_admins')
                        ->select('group_id')
                        ->eq('user_id', $userData['id'])
                        ->single()
                        ->execute();
                    $groupId = $groupAdminCheck['data'][0]['group_id'] ?? null;

                    if ($isTenantLogin) {
                        // Strict per-tenant login: only members of THIS school's
                        // domain may sign in here. Platform admins use the
                        // platform host (school.tutagora.com).
                        $tid = $hostTenant['id'];
                        $landTid = $tid; // which school we actually sign the user into
                        $memberRole = null;
                        foreach ($userSchoolRows as $us) {
                            if (($us['school_id'] ?? '') === $tid) { $memberRole = $us['role']; break; }
                        }
                        // Platform admins (superadmins) and this tenant's group
                        // super-admin have no per-school membership row, but must
                        // still be able to sign in on any branded domain. Grant
                        // them admin access to the tenant they're logging into.
                        if ($memberRole === null && ($isPlatformAdmin || ($groupId && groupOwnsSchool($groupId, $tid)))) {
                            $memberRole = $isPlatformAdmin ? 'platform_admin' : 'school_admin';
                        }
                        // Shared GROUP login domain (e.g. mgt.whitestarschools.com):
                        // the host is anchored to ONE branch, but every branch in that
                        // branch's group signs in here. If the user isn't a member of
                        // the anchor branch but belongs to a sibling branch in the same
                        // group, accept the login and land them on their own branch
                        // rather than rejecting them.
                        if ($memberRole === null) {
                            $anchorGroup = groupIdForSchool($tid);
                            if ($anchorGroup) {
                                foreach ($userSchoolRows as $us) {
                                    $scid = $us['school_id'] ?? '';
                                    if ($scid !== '' && $scid !== $tid && groupOwnsSchool($anchorGroup, $scid)) {
                                        $memberRole = $us['role'];
                                        $landTid    = $scid;
                                        break;
                                    }
                                }
                            }
                        }
                        if ($memberRole === null) {
                            $error = 'This account is not part of ' . $brandName . '. Please use your school\'s own login page.';
                        } elseif ($landTid === $tid && empty($hostTenant['is_active'])) {
                            $error = 'This school is currently inactive. Please contact your administrator.';
                        } else {
                            // Land on THIS domain's school, but load every active
                            // school the user belongs to into the session — so a
                            // member of a sibling tenant sharing this domain (e.g.
                            // Whitestar Senior alongside Springs Junior) can switch
                            // between them after signing in. Each keeps its own
                            // branding/receipts because the active school drives them.
                            $allSchools = [];
                            foreach ($userSchoolRows as $us) {
                                $sname = $brandName;
                                if (($us['school_id'] ?? '') !== $tid) {
                                    $sres = $sb->from('schools')->select('name,is_active')
                                        ->eq('id', $us['school_id'])->single()->execute();
                                    $srow = $sres['data'][0] ?? null;
                                    if (!$srow || empty($srow['is_active'])) continue;
                                    $sname = $srow['name'];
                                }
                                $allSchools[] = ['school_id' => $us['school_id'], 'role' => $us['role'], 'name' => $sname];
                            }
                            if (empty($allSchools)) {
                                $allSchools = [['school_id' => $landTid, 'role' => $memberRole, 'name' => $brandName]];
                            }
                            // When landing on a sibling branch (group domain), brand the
                            // session with that branch's name, not the domain anchor's.
                            $landBrand = $brandName;
                            if ($landTid !== $tid) {
                                foreach ($allSchools as $asch) {
                                    if (($asch['school_id'] ?? '') === $landTid) { $landBrand = $asch['name']; break; }
                                }
                            }
                            loginUser($userData, $landTid, $memberRole, $allSchools, $isPlatformAdmin, $landBrand);
                            auditLog('login', 'user', $userData['id'] ?? null, ['email' => $email, 'host' => currentHost()]);
                            // If this account also super-admins a school group, give it
                            // the group context so the consolidated dashboard (and the
                            // "Group Dashboard" sidebar link) work on the branded tenant
                            // domain too — land on the group rollup, then drill into any
                            // school from there.
                            if ($groupId) {
                                $gName = $sb->from('school_groups')->select('name')->eq('id', $groupId)->single()->execute();
                                $_SESSION['group_id']   = $groupId;
                                $_SESSION['group_name'] = $gName['data'][0]['name'] ?? 'Group';
                                redirect('group');
                            }
                            redirect('dashboard');
                        }
                    } elseif ($groupId && !$isTenantLogin) {
                        // Group super-admin → consolidated group dashboard. Takes
                        // priority over any single-school membership so the owner
                        // always lands on the group view (they drill into branches
                        // from there).
                        $gName = $sb->from('school_groups')->select('name')->eq('id', $groupId)->single()->execute();
                        loginUser($userData, '', 'group_admin', [], $isPlatformAdmin);
                        $_SESSION['group_id']   = $groupId;
                        $_SESSION['group_name'] = $gName['data'][0]['name'] ?? 'Group';
                        auditLog('login', 'user', $userData['id'] ?? null, ['email' => $email, 'group' => $groupId]);
                        redirect('group');
                    } elseif (empty($userSchoolRows) && !$isPlatformAdmin) {
                        // Fallback: try user_profiles
                        $profileFallback = $sb->from('user_profiles')
                            ->select('school_id')
                            ->eq('id', $userData['id'])
                            ->single()
                            ->execute();

                        if (empty($profileFallback['data'][0]['school_id'])) {
                            $error = 'No school profile found for this account.';
                        } else {
                            loginUser($userData, $profileFallback['data'][0]['school_id'], 'school_admin', [], $isPlatformAdmin);
                            auditLog('login', 'user', $userData['id'] ?? null, ['email' => $email]);
                            redirect('dashboard');
                        }
                    } elseif ($isPlatformAdmin) {
                        // On the platform host, a platform admin always lands on the
                        // all-tenants admin dashboard — even if their account is also a
                        // member of a school. (They can "Enter School" from there.)
                        loginUser($userData, '', 'platform_admin', [], true);
                        auditLog('login', 'user', $userData['id'] ?? null, ['email' => $email, 'platform' => true]);
                        redirect('admin');
                    } else {
                        // Fetch school names for all schools
                        $schoolIds = array_column($userSchoolRows, 'school_id');
                        $allSchools = [];
                        foreach ($userSchoolRows as $us) {
                            $schResult = $sb->from('schools')
                                ->select('id,name,is_active')
                                ->eq('id', $us['school_id'])
                                ->single()
                                ->execute();
                            $sch = $schResult['data'][0] ?? null;
                            if ($sch && $sch['is_active']) {
                                $allSchools[] = [
                                    'school_id' => $us['school_id'],
                                    'role'      => $us['role'],
                                    'name'      => $sch['name'],
                                ];
                            }
                        }

                        if (count($allSchools) === 0) {
                            $error = 'No active school found for this account.';
                        } elseif (count($allSchools) === 1) {
                            // Single school — log in directly
                            $s = $allSchools[0];
                            loginUser($userData, $s['school_id'], $s['role'], $allSchools, $isPlatformAdmin, $s['name']);
                            auditLog('login', 'user', $userData['id'] ?? null, ['email' => $email, 'school' => $s['name']]);
                            redirect('dashboard');
                        } else {
                            // Multiple schools — store user data, redirect to school picker
                            loginUser($userData, $allSchools[0]['school_id'], $allSchools[0]['role'], $allSchools, $isPlatformAdmin, $allSchools[0]['name']);
                            auditLog('login', 'user', $userData['id'] ?? null, ['email' => $email, 'multi_school' => true]);
                            redirect('switch-school');
                        }
                    }
                }
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login — <?= e($brandName) ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <?php if (defined('TURNSTILE_LOGIN_SITE_KEY') && TURNSTILE_LOGIN_SITE_KEY !== ''): ?>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <?php endif; ?>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body class="bg-gradient-to-br from-emerald-50 via-white to-teal-50 min-h-screen flex items-center justify-center p-4">

<div class="w-full max-w-sm">
    <div class="text-center mb-8">
        <?php if ($isTenantLogin && $brandLogo): ?>
            <img src="<?= e($brandLogo) ?>" alt="<?= e($brandName) ?>" class="w-14 h-14 rounded-2xl object-contain border border-gray-100 bg-white mx-auto mb-3 shadow">
        <?php else: ?>
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-200">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            </div>
        <?php endif; ?>
        <h1 class="text-2xl font-bold text-gray-900"><?= e($brandName) ?></h1>
        <p class="text-sm text-gray-500 mt-1"><?= $isTenantLogin ? 'Sign in to your school portal' : 'School Management System' ?></p>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <?php if ($error): ?>
            <div class="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <?= e($error) ?>
            </div>
        <?php endif; ?>

        <form method="POST" action="<?= baseUrl('login') ?>">
            <?= csrfField() ?>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" name="email" value="<?= e(input('email')) ?>" required
                    class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition"
                    placeholder="you@school.com">
            </div>
            <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" name="password" required
                    class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition"
                    placeholder="••••••••">
            </div>
            <?php if (defined('TURNSTILE_LOGIN_SITE_KEY') && TURNSTILE_LOGIN_SITE_KEY !== ''): ?>
            <div class="cf-turnstile mb-4" data-sitekey="<?= e(TURNSTILE_LOGIN_SITE_KEY) ?>"></div>
            <?php endif; ?>
            <button type="submit"
                class="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 shadow-sm transition">
                Sign In
            </button>
        </form>

        <!-- Registration is invitation-only. Schools are created by platform admins. -->
        <p class="mt-4 text-center text-xs text-gray-400">
            Recently invited and can't sign in? Your email may still need verifying —
            ask your school administrator to resend the invitation.
        </p>
    </div>
</div>

</body>
</html>
