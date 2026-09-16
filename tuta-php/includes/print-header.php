<?php
/**
 * Shared professional print header for invoices & receipts.
 * Expects: $school (array with name, address, phone, email, logo_url)
 *          $documentTitle (string, e.g. "FEE INVOICE" or "PAYMENT RECEIPT")
 *          $documentNumber (string, e.g. invoice reference or receipt number)
 *
 * Brand color: pulled from school_settings.brand_color (set in
 * Settings → Currency & Invoices). Defaults to emerald-600 so existing
 * invoices look identical until the user picks their own color.
 */
$schoolName    = $school['name'] ?? 'School';
$schoolAddress = $school['address'] ?? '';
$schoolPhone   = $school['phone'] ?? '';
$schoolEmail   = $school['email'] ?? '';
$schoolLogo    = $school['logo_url'] ?? '';
$schoolCode    = $school['code'] ?? '';

// Brand color (validated HEX; falls back if anything looks wrong)
$brandColor = schoolSetting('brand_color', '#059669');
if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $brandColor)) {
    $brandColor = '#059669';
}
// Slightly darker tone for the gradient end — shift each channel ~12% darker.
$br = max(0, hexdec(substr($brandColor, 1, 2)) - 24);
$bg = max(0, hexdec(substr($brandColor, 3, 2)) - 24);
$bb = max(0, hexdec(substr($brandColor, 5, 2)) - 24);
$brandColorDark = sprintf('#%02x%02x%02x', $br, $bg, $bb);
?>

<!-- School Header -->
<div class="px-8 py-6 relative z-10"
     style="border-bottom: 2px solid <?= e($brandColor) ?>;">
    <div class="flex items-start gap-5">
        <!-- Logo -->
        <div class="flex-shrink-0">
            <?php if ($schoolLogo): ?>
                <img src="<?= e($schoolLogo) ?>" alt="<?= e($schoolName) ?>" class="w-20 h-20 object-contain rounded-lg">
            <?php else: ?>
                <div class="w-20 h-20 rounded-lg flex items-center justify-center"
                     style="background: linear-gradient(135deg, <?= e($brandColor) ?>, <?= e($brandColorDark) ?>);">
                    <span class="text-white text-2xl font-bold"><?= e(strtoupper(substr($schoolName, 0, 2))) ?></span>
                </div>
            <?php endif; ?>
        </div>

        <!-- School Details -->
        <div class="flex-1 min-w-0">
            <h1 class="text-xl font-bold text-gray-900 uppercase tracking-wide"><?= e($schoolName) ?></h1>
            <?php if ($schoolAddress): ?>
                <p class="text-sm text-gray-600 mt-1">
                    <svg class="w-3.5 h-3.5 inline-block text-gray-400 mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <?= e($schoolAddress) ?>
                </p>
            <?php endif; ?>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-gray-600">
                <?php if ($schoolPhone): ?>
                    <span>
                        <svg class="w-3.5 h-3.5 inline-block text-gray-400 mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                        <?= e($schoolPhone) ?>
                    </span>
                <?php endif; ?>
                <?php if ($schoolEmail): ?>
                    <span>
                        <svg class="w-3.5 h-3.5 inline-block text-gray-400 mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        <?= e($schoolEmail) ?>
                    </span>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- Document Title Bar -->
<div class="px-8 py-3 flex items-center justify-between relative z-10"
     style="background: linear-gradient(90deg, <?= e($brandColor) ?>, <?= e($brandColorDark) ?>);">
    <h2 class="text-base font-bold text-white uppercase tracking-wider"><?= e($documentTitle ?? 'DOCUMENT') ?></h2>
    <span class="text-sm font-mono" style="color: rgba(255,255,255,0.85);"><?= e($documentNumber ?? '') ?></span>
</div>
