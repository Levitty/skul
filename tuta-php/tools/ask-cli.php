<?php
/**
 * Ask Tuta from the terminal — for trying the assistant before it has a page.
 *
 *   php tools/ask-cli.php "<school name>" "How much did we collect this week?"
 *   php tools/ask-cli.php --group "<group name>" "Which branch is behind on fees?"
 *
 * Reads ANTHROPIC_API_KEY from config.php (never from the command line). Prints
 * the answer, which tools it consulted, and what the question cost.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require __DIR__ . '/../config.php';
require __DIR__ . '/../includes/supabase.php';
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/helpers.php';
require __DIR__ . '/../includes/assistant.php';

$args = array_slice($argv, 1);
$groupMode = ($args[0] ?? '') === '--group';
if ($groupMode) array_shift($args);
[$name, $question] = $args + [null, null];
if (!$name || !$question) { fwrite(STDERR, "usage: php tools/ask-cli.php [--group] \"<school or group name>\" \"<question>\"\n"); exit(1); }

$sb = new Supabase();
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

if ($groupMode) {
    $grp = null;
    foreach ($sb->from('school_groups')->select('id,name')->execute()['data'] ?? [] as $row) {
        if (stripos($row['name'], $name) !== false) { $grp = $row; break; }
    }
    if (!$grp) { fwrite(STDERR, "No group matching '{$name}'.\n"); exit(1); }
    $_SESSION['school_id'] = '';
    $_SESSION['group_id'] = $grp['id'];
    $_SESSION['group_name'] = $grp['name'];
    echo "Group: {$grp['name']}\nQ: {$question}\n\n";
    $r = assistantAsk('', [['role' => 'user', 'content' => $question]], $grp['id']);
} else {
    $sch = null;
    foreach ($sb->from('schools')->select('id,name')->execute()['data'] ?? [] as $row) {
        if (stripos($row['name'], $name) !== false) { $sch = $row; break; }
    }
    if (!$sch) { fwrite(STDERR, "No school matching '{$name}'.\n"); exit(1); }
    // Enough session for schoolId() / schoolSetting() / caches to work.
    $_SESSION['school_id'] = $sch['id'];
    echo "School: {$sch['name']}\nQ: {$question}\n\n";
    $r = assistantAsk($sch['id'], [['role' => 'user', 'content' => $question]]);
}

if (!$r['ok']) { echo "ERROR: {$r['error']}\n"; exit(1); }
echo $r['text'], "\n\n";
printf("— checked: %s · %d in / %d out tokens (%d cached) · \$%.4f\n",
    $r['tools'] ? implode(', ', $r['tools']) : 'nothing',
    $r['usage']['in'], $r['usage']['out'], $r['usage']['cache_read'], $r['cost_usd']);
