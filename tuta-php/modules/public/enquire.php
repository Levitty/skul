<?php
/**
 * Public Enquiry Form — front-facing, no login. Reached at:
 *   ?route=enquire&school=<school_id>
 * The school's shareable link (with its id baked in) is shown on the staff
 * Enquiries inbox. Submissions land there for triage.
 *
 * Spam defence: honeypot + time-trap (drop bots silently), optional Turnstile,
 * and a content score that files link-spam under status='spam' automatically.
 */
require_once __DIR__ . '/../../includes/public-forms.php';

$sb     = new Supabase();
$school = publicResolveSchool($sb);

$error = '';
$success = false;

// Turnstile site key (optional) — only renders the widget if configured.
$turnstileSiteKey = $school ? publicSchoolSetting($sb, $school['id'], 'turnstile_site_key', '') : '';

if ($school && isPost()) {
    if (!verifyCsrf()) {
        $error = 'Your session expired. Please refresh the page and try again.';
    } elseif (publicIsBot((string)input('website'), input('form_ts'))) {
        // Bot: pretend success, store nothing.
        $success = true;
    } elseif ($turnstileSiteKey && !publicTurnstilePass($sb, $school['id'], (string)($_POST['cf-turnstile-response'] ?? ''))) {
        $error = 'Could not verify you are human. Please try again.';
    } else {
        $name  = trim((string)input('name'));
        $phone = trim((string)input('phone'));
        $email = trim((string)input('email'));
        $child = trim((string)input('child_name'));
        $grade = trim((string)input('grade_interest'));
        $msg   = trim((string)input('message'));

        // Per-IP submission cap (storage-flood / abuse defence).
        $ipBucket = 'enquire:ip:' . clientIpAddr();
        if ($name === '' || ($phone === '' && $email === '')) {
            $error = 'Please give your name and at least a phone number or email.';
        } elseif ($grade === '') {
            $error = 'Please tell us which grade/class you are enquiring about.';
        } elseif (rateCount($ipBucket, 3600) >= 15) {
            $error = 'Too many submissions from this connection. Please try again later.';
        } else {
            // Length caps — never store unbounded free text from a public form.
            $clip   = fn($s, $n) => mb_substr((string)$s, 0, $n);
            $score  = publicSpamScore($msg);
            $status = $score >= 50 ? 'spam' : 'new';
            $insEnq = $sb->from('enquiries')->insert([
                'school_id'      => $school['id'],
                'name'           => $clip($name, 120),
                'phone'          => $phone ? $clip($phone, 30) : null,
                'email'          => $email ? $clip($email, 160) : null,
                'child_name'     => $child ? $clip($child, 120) : null,
                'grade_interest' => $clip($grade, 60),
                'message'        => $msg ? $clip($msg, 2000) : null,
                'status'         => $status,
                'spam_score'     => $score,
                'source_ip'      => publicClientIp() ?: null,
            ]);
            rateRecord($ipBucket);
            require_once __DIR__ . '/../../includes/enquiry-notify.php';
            enquiryNotifyNew($sb, $school['id'], ['status' => $status, 'name' => $name, 'phone' => $phone, 'email' => $email, 'child_name' => $child,
                                                  'grade_interest' => $grade, 'message' => $msg, 'source' => 'hosted form'], $insEnq['data'][0]['id'] ?? null);
            $success = true;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enquiry — <?= e($school['name'] ?? 'School') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <?php if ($turnstileSiteKey): ?>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <?php endif; ?>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body class="bg-gradient-to-br from-emerald-50 via-white to-teal-50 min-h-screen flex items-center justify-center p-4">
<div class="w-full max-w-lg">

    <?php if (!$school): ?>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <h1 class="text-lg font-bold text-gray-900 mb-2">Enquiry link not valid</h1>
            <p class="text-sm text-gray-500">This enquiry link is missing or incorrect. Please use the link or QR code provided by the school.</p>
        </div>

    <?php elseif ($success): ?>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <h1 class="text-lg font-bold text-gray-900 mb-2">Thank you!</h1>
            <p class="text-sm text-gray-600">Your enquiry has been received by <strong><?= e($school['name']) ?></strong>. The school office will be in touch.</p>
        </div>

    <?php else: ?>
        <div class="text-center mb-6">
            <?php if (!empty($school['logo_url'])): ?>
                <img src="<?= e($school['logo_url']) ?>" alt="<?= e($school['name']) ?>" class="w-14 h-14 rounded-2xl object-contain border border-gray-100 bg-white mx-auto mb-3">
            <?php else: ?>
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-3">
                    <span class="text-white font-bold"><?= e(strtoupper(substr($school['name'], 0, 2))) ?></span>
                </div>
            <?php endif; ?>
            <h1 class="text-xl font-bold text-gray-900"><?= e($school['name']) ?></h1>
            <p class="text-sm text-gray-500 mt-1">Make an enquiry</p>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <?php if ($error): ?>
                <div class="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"><?= e($error) ?></div>
            <?php endif; ?>

            <form method="POST" action="<?= baseUrl('enquire') ?>?school=<?= e($school['id']) ?>">
                <?= csrfField() ?>
                <input type="hidden" name="school" value="<?= e($school['id']) ?>">
                <?= publicFormTsField() ?>
                <!-- Honeypot: must stay empty. Hidden from humans, off-screen for screen readers. -->
                <div style="position:absolute;left:-9999px;" aria-hidden="true">
                    <label>Leave this field empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="sm:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
                        <input type="text" name="name" required value="<?= e(input('name')) ?>"
                            class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input type="text" name="phone" value="<?= e(input('phone')) ?>" placeholder="07XX XXX XXX"
                            class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" name="email" value="<?= e(input('email')) ?>"
                            class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Child's name</label>
                        <input type="text" name="child_name" value="<?= e(input('child_name')) ?>"
                            class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Grade / class enquiring about *</label>
                        <input type="text" name="grade_interest" required value="<?= e(input('grade_interest')) ?>" placeholder="e.g. Grade 4, PP1"
                            class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Message</label>
                        <textarea name="message" rows="3"
                            class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"><?= e(input('message')) ?></textarea>
                    </div>
                </div>

                <?php if ($turnstileSiteKey): ?>
                <div class="cf-turnstile mt-4" data-sitekey="<?= e($turnstileSiteKey) ?>"></div>
                <?php endif; ?>

                <button type="submit" class="w-full mt-5 py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 shadow-sm transition">
                    Send Enquiry
                </button>
            </form>
        </div>
    <?php endif; ?>
</div>
</body>
</html>
