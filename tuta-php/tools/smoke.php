<?php
/**
 * Smoke test — render pages offline against the live database and fail on
 * any PHP warning, notice or fatal. Run before every upload.
 *
 *   php tools/smoke.php                 # the standard set, as a school admin at Sabaki
 *   php tools/smoke.php "Langata"       # another school (name substring)
 *   php tools/smoke.php "Sabaki" finance/expenses "month=all"   # one route
 *
 * Nothing is written: requests are GET, the session is fake, and pages that
 * redirect are reported as such. Output lands in tools/.smoke-out/ so a page
 * can be opened and inspected.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
chdir(__DIR__ . '/..');
error_reporting(E_ALL);
ini_set('display_errors', '1');

$school = $argv[1] ?? 'Sabaki';
$only   = $argv[2] ?? null;
$qs     = $argv[3] ?? '';

$ROUTES = [
    'dashboard', 'ask', 'students/list', 'students/attendance', 'students/streams', 'students/promote', 'students/add',
    'fees/invoices', 'fees/dashboard', 'fees/heads',
    'finance/overview', 'finance/expenses', 'finance/expenses|month=all', 'finance/petty-cash', 'finance/cost-centres',
    'finance/expense-import', 'finance/uniform', 'finance/income-statement', 'finance/accountant-pack', 'finance/briefing',
    'transport/buses', 'transport/roster', 'grades/entry', 'grades/reports', 'grades/import', 'enquiries', 'admissions', 'settings',
    'communications/sms', 'group|--group', 'public/admit|--public',
];

$_SERVER['HTTP_HOST'] = 'localhost'; $_SERVER['SCRIPT_NAME'] = '/index.php'; $_SERVER['REQUEST_METHOD'] = 'GET';
require 'config.php'; require 'includes/supabase.php'; require 'includes/auth.php'; require 'includes/helpers.php';
require 'includes/mailer.php'; require 'includes/storage.php'; require 'includes/sms.php'; require 'includes/permissions.php'; require 'includes/whatsapp.php';
session_start();
$sb = new Supabase();
$sid = null; $schoolName = '';
foreach ($sb->from('schools')->select('id,name')->execute()['data'] ?? [] as $s) if (stripos($s['name'], $school) !== false) { $sid = $s['id']; $schoolName = $s['name']; break; }
if (!$sid) { fwrite(STDERR, "No school matching '$school'.\n"); exit(1); }
$group = $sb->from('school_groups')->select('id,name')->limit(1)->execute()['data'][0] ?? null;
$groupAdmin = $group ? ($sb->from('school_group_admins')->select('user_id')->eq('group_id', $group['id'])->limit(1)->execute()['data'][0]['user_id'] ?? null) : null;

$outDir = __DIR__ . '/.smoke-out'; @mkdir($outDir, 0755, true);
$list = $only ? [$only . ($qs ? '|' . $qs : '')] : $ROUTES;
$fail = 0; $t0 = microtime(true);
// Pages call header()/redirect(); on the CLI those are harmless but noisy.
set_error_handler(function ($no, $str) { return str_contains($str, 'Cannot modify header information'); }, E_WARNING);
printf("Smoke: %s (%d pages)\n", $schoolName, count($list));

foreach ($list as $entry) {
    [$route, $flag] = array_pad(explode('|', $entry, 2), 2, '');
    // Fresh fake session per page.
    foreach (array_keys($_SESSION) as $k) unset($_SESSION[$k]);
    $_SESSION['user_id'] = '00000000-0000-0000-0000-000000000001'; $_SESSION['user_email'] = 'smoke@test'; $_SESSION['user_name'] = 'Smoke';
    $_SESSION['school_id'] = $sid; $_SESSION['school_name'] = $schoolName; $_SESSION['user_role'] = 'school_admin';
    $_GET = ['route' => $route];
    if ($flag === '--group') { $_SESSION['school_id'] = ''; $_SESSION['group_id'] = $group['id'] ?? ''; $_SESSION['group_name'] = $group['name'] ?? ''; $_SESSION['user_role'] = 'group_admin'; if ($groupAdmin) $_SESSION['user_id'] = $groupAdmin; }
    elseif ($flag === '--public') { $_GET['school'] = $sid; }
    elseif ($flag !== '') { parse_str($flag, $extra); $_GET += $extra; }

    $file = 'modules/' . $route . '.php';
    if (!is_file($file)) { printf("  %-38s MISSING %s\n", $route, $file); $fail++; continue; }
    $__start = microtime(true); $__status = 'ok';
    ob_start();
    try { require $file; }
    catch (\Throwable $__e) { $__status = 'FATAL ' . get_class($__e) . ': ' . $__e->getMessage() . ' @ ' . basename($__e->getFile()) . ':' . $__e->getLine(); }
    $__out = ob_get_clean();
    $__ms = (int)((microtime(true) - $__start) * 1000);
    $__problems = [];
    if (preg_match_all('/(?:Warning|Notice|Fatal error):\s*([^\n<]{0,160})/', $__out, $__m)) $__problems = array_values(array_unique($__m[1]));
    file_put_contents($outDir . '/' . str_replace('/', '-', $route) . ($flag ? '-' . preg_replace('/\W+/', '', $flag) : '') . '.html', $__out);
    if ($__status !== 'ok' || $__problems) $fail++;
    printf("  %-38s %-8s %5dms %6dB%s\n", $route . ($flag ? ' ' . $flag : ''), $__status, $__ms, strlen($__out), $__problems ? "\n      ! " . implode("\n      ! ", $__problems) : '');
}
printf("%s — %d page(s) with problems, %.1fs\n", $fail ? 'FAIL' : 'PASS', $fail, microtime(true) - $t0);
exit($fail ? 1 : 0);
