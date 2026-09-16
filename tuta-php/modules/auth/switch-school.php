<?php
/**
 * School Picker / Switcher — standalone page (no sidebar layout).
 * Displays all schools the user belongs to and lets them switch context.
 */

// Must be logged in (at least have a user_id in session)
initSession();
if (empty($_SESSION['user_id'])) {
    redirect('login');
}

$user    = currentUser();
$schools = $_SESSION['user_schools'] ?? [];

// If the session snapshot is short (e.g. logged in on a strict per-tenant host
// that only loaded one school), rebuild the full list from the live memberships
// so every school the user belongs to is switchable.
if (count($schools) <= 1 && !isPlatformAdmin() && !empty($_SESSION['user_id'])) {
    $sb = new Supabase();
    $memRes = $sb->from('user_schools')->select('school_id,role')->eq('user_id', $_SESSION['user_id'])->execute();
    $rebuilt = [];
    foreach (($memRes['data'] ?? []) as $m) {
        $schRes = $sb->from('schools')->select('name,is_active')->eq('id', $m['school_id'])->single()->execute();
        $sch = $schRes['data'][0] ?? null;
        if ($sch && !empty($sch['is_active'])) {
            $rebuilt[] = ['school_id' => $m['school_id'], 'role' => $m['role'], 'name' => $sch['name']];
        }
    }
    if (count($rebuilt) > count($schools)) {
        $schools = $rebuilt;
        $_SESSION['user_schools'] = $rebuilt; // repair the session so the sidebar link shows too
    }
}

// Group admins can enter ANY school in their group as school_admin — union
// those in. Membership in the group is enough; no per-school row needed. An
// explicit school_admin membership is kept; a lower one (e.g. teacher) is
// upgraded to school_admin for a school the user's group owns.
foreach (groupAdminSchools($_SESSION['user_id'] ?? '') as $gs) {
    $found = false;
    foreach ($schools as &$sref) {
        if ($sref['school_id'] === $gs['school_id']) {
            $found = true;
            if (($sref['role'] ?? '') !== 'school_admin') $sref['role'] = 'school_admin';
            break;
        }
    }
    unset($sref);
    if (!$found) $schools[] = $gs;
}
$_SESSION['user_schools'] = $schools;

// Safety net: if only one school (or zero), go straight to dashboard
if (count($schools) <= 1 && !isPlatformAdmin()) {
    redirect('dashboard');
}

// Handle POST — switch school
if (isPost()) {
    if (!verifyCsrf()) {
        flash('error', 'Invalid form submission. Please try again.');
        redirect('switch-school');
    }

    $schoolId   = input('school_id');
    $schoolRole = input('school_role');
    $schoolName = input('school_name');

    if (!$schoolId) {
        flash('error', 'Please select a school.');
        redirect('switch-school');
    }

    // Verify the user actually belongs to this school
    $valid = false;
    foreach ($schools as $s) {
        if ($s['school_id'] === $schoolId) {
            $valid      = true;
            $schoolRole = $s['role'];
            $schoolName = $s['name'];
            break;
        }
    }

    if (!$valid && !isPlatformAdmin()) {
        flash('error', 'You do not have access to that school.');
        redirect('switch-school');
    }

    switchSchool($schoolId, $schoolRole, $schoolName);
    flash('success', 'Switched to ' . $schoolName);
    redirect('dashboard');
}

$currentSchoolId = $_SESSION['school_id'] ?? '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Choose School — <?= APP_NAME ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body class="bg-gradient-to-br from-emerald-50 via-white to-teal-50 min-h-screen flex items-center justify-center p-4">

<div class="w-full max-w-md">
    <!-- Header -->
    <div class="text-center mb-8">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-200">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900">Choose a School</h1>
        <p class="text-sm text-gray-500 mt-1">Welcome back, <?= e($user['name'] ?? $user['email']) ?></p>
    </div>

    <!-- Flash messages -->
    <?php if ($msg = ($_SESSION['flash']['error'] ?? '')): unset($_SESSION['flash']['error']); ?>
        <div class="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <?= e($msg) ?>
        </div>
    <?php endif; ?>

    <!-- School Cards -->
    <div class="space-y-3">
        <?php foreach ($schools as $school): ?>
            <?php $isActive = ($school['school_id'] === $currentSchoolId); ?>
            <form method="POST" action="<?= baseUrl('switch-school') ?>">
                <?= csrfField() ?>
                <input type="hidden" name="school_id" value="<?= e($school['school_id']) ?>">
                <input type="hidden" name="school_role" value="<?= e($school['role']) ?>">
                <input type="hidden" name="school_name" value="<?= e($school['name']) ?>">

                <button type="submit"
                    class="w-full text-left bg-white rounded-2xl shadow-sm border-2 <?= $isActive ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-gray-100 hover:border-emerald-200' ?> p-5 transition group">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3 min-w-0">
                            <!-- School icon -->
                            <div class="flex-shrink-0 w-10 h-10 rounded-xl <?= $isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500 group-hover:bg-emerald-50 group-hover:text-emerald-500' ?> flex items-center justify-center transition">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                            </div>
                            <div class="min-w-0">
                                <div class="font-semibold text-gray-900 truncate"><?= e($school['name']) ?></div>
                                <div class="flex items-center gap-2 mt-0.5">
                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium <?= $isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600' ?>">
                                        <?= e(ucfirst(str_replace('_', ' ', $school['role']))) ?>
                                    </span>
                                    <?php if ($isActive): ?>
                                        <span class="text-xs text-emerald-600 font-medium">Current</span>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>

                        <!-- Arrow / Enter button -->
                        <div class="flex-shrink-0 ml-3">
                            <?php if ($isActive): ?>
                                <span class="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium shadow-sm">
                                    Enter
                                </span>
                            <?php else: ?>
                                <span class="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium group-hover:bg-emerald-500 group-hover:text-white transition">
                                    Switch
                                </span>
                            <?php endif; ?>
                        </div>
                    </div>
                </button>
            </form>
        <?php endforeach; ?>

        <?php if (isPlatformAdmin()): ?>
            <!-- Platform Admin Dashboard Card -->
            <a href="<?= baseUrl('admin') ?>"
                class="block w-full text-left bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-purple-200 p-5 transition group">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        </div>
                        <div>
                            <div class="font-semibold text-gray-900">Platform Admin Dashboard</div>
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 mt-0.5">
                                Super Admin
                            </span>
                        </div>
                    </div>
                    <div class="flex-shrink-0 ml-3">
                        <span class="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium group-hover:bg-purple-500 group-hover:text-white transition">
                            Open
                        </span>
                    </div>
                </div>
            </a>
        <?php endif; ?>
    </div>

    <!-- Logout link -->
    <div class="mt-6 text-center">
        <a href="<?= baseUrl('logout') ?>" class="text-sm text-gray-500 hover:text-gray-700 font-medium">Sign out</a>
    </div>
</div>

</body>
</html>
