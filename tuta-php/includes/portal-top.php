<?php
/**
 * Parent portal — shared page top. Mobile-first layout, distinct from the
 * staff app. Expects $pageTitle. A back link is optional: set $portalBack
 * (a route) and $portalBackLabel before including.
 */
$portalSchool = cachedSchool();
$portalUser   = currentUser();
$brand = schoolSetting('brand_color', '#059669');
if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $brand)) $brand = '#059669';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e($pageTitle ?? 'Parent Portal') ?> — <?= e($portalSchool['name'] ?? 'School') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Inter',system-ui,-apple-system,sans-serif}</style>
</head>
<body class="bg-gray-50 min-h-screen">

<header style="background: <?= e($brand) ?>;">
    <div class="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
        <?php if (!empty($portalBack)): ?>
            <a href="<?= baseUrl($portalBack) ?>" class="flex items-center gap-2 min-w-0">
                <svg class="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                <div class="min-w-0">
                    <p class="text-white font-semibold text-sm leading-tight truncate"><?= e($portalBackLabel ?? 'Back') ?></p>
                    <p class="text-white/70 text-xs truncate"><?= e($portalSchool['name'] ?? '') ?></p>
                </div>
            </a>
        <?php else: ?>
            <div class="flex items-center gap-2.5 min-w-0">
                <?php if (!empty($portalSchool['logo_url'])): ?>
                    <img src="<?= e($portalSchool['logo_url']) ?>" alt="" class="w-9 h-9 rounded-lg object-contain bg-white p-0.5 flex-shrink-0 shadow-sm">
                <?php endif; ?>
                <div class="min-w-0">
                    <p class="text-white font-semibold text-sm leading-tight truncate"><?= e($portalSchool['name'] ?? 'School') ?></p>
                    <p class="text-white/70 text-xs">Parent portal</p>
                </div>
            </div>
        <?php endif; ?>
        <div class="flex items-center gap-3 flex-shrink-0 ml-3">
            <a href="<?= baseUrl('account') ?>" class="text-white/80 hover:text-white text-xs font-medium">Password</a>
            <a href="<?= baseUrl('logout') ?>" class="text-white/80 hover:text-white text-xs font-medium">Sign out</a>
        </div>
    </div>
</header>

<main class="max-w-md mx-auto px-4 py-5">
    <?php foreach (getFlash() as $msg): ?>
        <div class="mb-3 px-3 py-2 rounded-lg text-sm <?= ($msg['type'] ?? '') === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200' ?>">
            <?= e($msg['message']) ?>
        </div>
    <?php endforeach; ?>
