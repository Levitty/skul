<?php
/**
 * School Registration page — public, standalone.
 * New schools can self-register for the multi-school SaaS.
 */

if (isLoggedIn()) {
    redirect('dashboard');
}

$error   = '';
$success = '';

if (isPost()) {
    if (!verifyCsrf()) {
        $error = 'Invalid form submission. Please try again.';
    } else {
        $schoolName  = trim(input('school_name'));
        $schoolCode  = strtoupper(trim(input('school_code')));
        $adminName   = trim(input('admin_name'));
        $email       = trim(input('email'));
        $phone       = trim(input('phone'));
        $password    = input('password');
        $passwordC   = input('password_confirmation');

        // ── Validation ──────────────────────────────────
        if (!$schoolName || !$schoolCode || !$adminName || !$email || !$phone || !$password) {
            $error = 'All fields are required.';
        } elseif (!preg_match('/^[A-Z0-9]{2,10}$/', $schoolCode)) {
            $error = 'School code must be 2-10 uppercase letters/numbers (e.g. COGS).';
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = 'Please enter a valid email address.';
        } elseif (strlen($password) < 6) {
            $error = 'Password must be at least 6 characters.';
        } elseif ($password !== $passwordC) {
            $error = 'Passwords do not match.';
        }

        if (!$error) {
            $sb = new Supabase();

            // Check if school code already taken
            $codeCheck = $sb->from('schools')
                ->select('id')
                ->eq('code', $schoolCode)
                ->single()
                ->execute();

            if (!empty($codeCheck['data'])) {
                $error = 'That school code is already taken. Please choose another.';
            }
        }

        if (!$error) {
            // ── 1. Create auth user ─────────────────────
            $signUpResult = $sb->signUp($email, $password);

            if ($signUpResult['error']) {
                $error = $signUpResult['error'];
            } else {
                $userId = $signUpResult['data']['user']['id']
                       ?? $signUpResult['data']['id']
                       ?? null;

                if (!$userId) {
                    $error = 'Registration failed — could not create user. Please try again.';
                }
            }
        }

        if (!$error) {
            // ── 2. Generate slug ────────────────────────
            $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower($schoolName));
            $slug = trim($slug, '-');

            $trialEnds = date('Y-m-d\TH:i:s', strtotime('+30 days'));
            $now       = date('Y-m-d\TH:i:s');

            // ── 3. Insert school ────────────────────────
            $schoolInsert = $sb->from('schools')->insert([
                'name'                => $schoolName,
                'code'                => $schoolCode,
                'phone'               => $phone,
                'email'               => $email,
                'plan'                => 'free',
                'subscription_status' => 'trial',
                'trial_ends_at'       => $trialEnds,
                'slug'                => $slug,
                'is_active'           => true,
                'approved'            => true,
            ]);

            if ($schoolInsert['error']) {
                $error = 'Failed to create school: ' . $schoolInsert['error'];
            } else {
                $schoolId = $schoolInsert['data'][0]['id'] ?? null;

                if (!$schoolId) {
                    $error = 'Failed to create school — no ID returned.';
                }
            }
        }

        if (!$error) {
            // ── 4. Insert user_schools ──────────────────
            $usInsert = $sb->from('user_schools')->insert([
                'user_id'   => $userId,
                'school_id' => $schoolId,
                'role'      => 'school_admin',
            ]);

            if ($usInsert['error']) {
                $error = 'Failed to link user to school: ' . $usInsert['error'];
            }
        }

        if (!$error) {
            // ── 5. Insert user_profiles ─────────────────
            $profileInsert = $sb->from('user_profiles')->insert([
                'id'        => $userId,
                'school_id' => $schoolId,
                'full_name' => $adminName,
            ]);

            if ($profileInsert['error']) {
                $error = 'Failed to create user profile: ' . $profileInsert['error'];
            }
        }

        if (!$error) {
            // ── 6. Insert academic_year ─────────────────
            $currentYear = date('Y');
            $sb->from('academic_years')->insert([
                'school_id'  => $schoolId,
                'name'       => $currentYear,
                'start_date' => $currentYear . '-01-01',
                'end_date'   => $currentYear . '-12-31',
                'is_current' => true,
            ]);

            $success = 'School registered successfully! Please check your email to verify your account, then sign in.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register Your School — <?= APP_NAME ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body class="bg-gradient-to-br from-emerald-50 via-white to-teal-50 min-h-screen flex items-center justify-center p-4">

<div class="w-full max-w-md">
    <div class="text-center mb-8">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-200">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900"><?= APP_NAME ?></h1>
        <p class="text-sm text-gray-500 mt-1">Register your school</p>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <?php if ($success): ?>
            <div class="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm mb-4">
                <?= e($success) ?>
            </div>
            <div class="text-center">
                <a href="<?= baseUrl('login') ?>" class="inline-block py-2.5 px-6 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 shadow-sm transition">
                    Go to Sign In
                </a>
            </div>
        <?php else: ?>
            <?php if ($error): ?>
                <div class="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <?= e($error) ?>
                </div>
            <?php endif; ?>

            <form method="POST" action="<?= baseUrl('register') ?>">
                <?= csrfField() ?>

                <!-- School Info -->
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">School Information</p>

                <div class="mb-3">
                    <label class="block text-sm font-medium text-gray-700 mb-1">School Name</label>
                    <input type="text" name="school_name" value="<?= e(input('school_name')) ?>" required
                        class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition"
                        placeholder="Crown of Gold School">
                </div>

                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">School Code</label>
                    <input type="text" name="school_code" value="<?= e(input('school_code')) ?>" required maxlength="10"
                        class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm uppercase transition"
                        placeholder="COGS">
                    <p class="text-xs text-gray-400 mt-1">Short unique code, 2-10 characters (letters & numbers only)</p>
                </div>

                <!-- Admin Info -->
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-5">Admin Account</p>

                <div class="mb-3">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input type="text" name="admin_name" value="<?= e(input('admin_name')) ?>" required
                        class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition"
                        placeholder="John Doe">
                </div>

                <div class="mb-3">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" name="email" value="<?= e(input('email')) ?>" required
                        class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition"
                        placeholder="admin@school.com">
                </div>

                <div class="mb-3">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <input type="tel" name="phone" value="<?= e(input('phone')) ?>" required
                        class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition"
                        placeholder="+254 712 345 678">
                </div>

                <div class="grid grid-cols-2 gap-3 mb-5">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input type="password" name="password" required minlength="6"
                            class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition"
                            placeholder="Min 6 chars">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Confirm</label>
                        <input type="password" name="password_confirmation" required minlength="6"
                            class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition"
                            placeholder="Repeat password">
                    </div>
                </div>

                <button type="submit"
                    class="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 shadow-sm transition">
                    Register School
                </button>
            </form>

            <div class="mt-4 text-center">
                <a href="<?= baseUrl('login') ?>" class="text-sm text-emerald-600 hover:text-emerald-700 font-medium">Already have an account? Sign In</a>
            </div>
        <?php endif; ?>
    </div>
</div>

</body>
</html>
