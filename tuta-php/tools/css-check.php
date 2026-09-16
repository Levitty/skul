<?php
/**
 * CSS check — which Tailwind classes do the pages use that the precompiled
 * assets/tuta.css (+ tuta-extra.css) does not define?
 *
 *   php tools/css-check.php            # every page
 *   php tools/css-check.php modules/finance/expenses.php
 *
 * tuta.css is a Tailwind build frozen at a point in time. A class it lacks
 * renders as nothing, silently. Anything this lists needs adding to
 * assets/tuta-extra.css (with Tailwind's exact semantics) before upload.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
chdir(__DIR__ . '/..');

$css = file_get_contents('assets/tuta.css') . "\n" . file_get_contents('assets/tuta-extra.css');
// Every selector class in the CSS, unescaped ("\:" → ":", "\[" → "[", "\2c " → ",").
preg_match_all('/\.((?:\\\\2c |\\\\.|[A-Za-z0-9_-])+)(?=[\s{,:>\[])/', $css, $m);
$defined = [];
foreach ($m[1] as $sel) {
    $sel = preg_replace('/\\\\2c ?/', ',', $sel);
    $sel = preg_replace('/\\\\(.)/', '$1', $sel);
    $defined[$sel] = true;
}

$files = isset($argv[1]) ? [$argv[1]] : array_merge(glob('modules/*.php'), glob('modules/*/*.php'), glob('includes/layout-*.php'));
$IGNORE = ['hidden', 'group', 'sidebar-link', 'active', 'step', 'on', 'open', 'inline', 'block', 'cf-turnstile'];
// A class with no hyphen, colon or bracket is a JavaScript hook (rowchk, invpick), not a utility.
$isHook = fn(string $c) => !preg_match('/[-:\[]/', $c) || str_ends_with($c, '-') || preg_match('/^(fg|ln|stk|tab|step|ln|sale|transfer|item|prorated|subject|student|activity|alloc|teacher)-/', $c);
$missing = [];
foreach ($files as $f) {
    $src = file_get_contents($f);
    // Classes the page defines for itself in a <style> block count as defined.
    $own = [];
    if (preg_match_all('/<style[^>]*>(.*?)<\/style>/s', $src, $sm)) foreach ($sm[1] as $blk) { preg_match_all('/\.([A-Za-z_-][A-Za-z0-9_-]*)/', $blk, $cm); foreach ($cm[1] as $c) $own[$c] = true; }
    // class="..." attributes, minus any PHP inside them.
    preg_match_all('/class="([^"]*)"/', $src, $mm);
    foreach ($mm[1] as $attr) {
        $attr = preg_replace('/<\?(?:=|php).*?\?>/s', ' ', $attr);
        foreach (preg_split('/\s+/', trim($attr)) as $c) {
            if ($c === '' || str_contains($c, '$') || str_contains($c, "'") || str_starts_with($c, 'xp-') || str_starts_with($c, 'pc-') || str_starts_with($c, 'st-')) continue;
            if (!preg_match('/^-?[A-Za-z\[][A-Za-z0-9_:\/\[\]().,%#!-]*$/', $c)) continue;   // PHP debris, not a class
            if (in_array($c, $IGNORE, true) || isset($defined[$c]) || isset($own[$c]) || $isHook($c)) continue;
            $missing[$c][$f] = true;
        }
    }
}
ksort($missing);
if (!$missing) { echo "All classes defined.\n"; exit(0); }
printf("%d class(es) used but not in the CSS:\n", count($missing));
foreach ($missing as $c => $where) printf("  %-40s %s\n", $c, implode(', ', array_map('basename', array_keys($where))));
exit(1);
