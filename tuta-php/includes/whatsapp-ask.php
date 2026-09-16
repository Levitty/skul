<?php
/**
 * WhatsApp as the door to Ask — for the people who run the school.
 *
 * A parent texting the number gets the fees assistant (whatsapp-bot.php). A
 * director or administrator texting the same number gets Ask Tuta: the
 * Claude-backed assistant that reads the school's — or the whole group's —
 * records and answers in plain words. Same brain as the Ask page.
 *
 * Who counts as a manager: a number listed in the school's wa_ask_phones
 * setting, or a staff profile phone that belongs to a school administrator
 * here or to an admin of the group this school is in. Group admins get the
 * group scope (every branch); school admins get their school.
 *
 * The thread lives in wa_conversations.context so follow-up questions work
 * ("and last month?"). Ten turns are kept. "reset" starts over; "parent"
 * drops into the parent flow for that phone; "ask" comes back.
 */

require_once __DIR__ . '/assistant.php';

/** True if this phone belongs to a manager; also says which scope they get. */
function whatsappAskManager(Supabase $sb, string $schoolId, string $phone): ?array
{
    $tail = substr(preg_replace('/\D/', '', $phone), -9);
    if (strlen($tail) < 9) return null;

    // Group this school belongs to (if any).
    $groupId = $sb->from('school_group_members')->select('group_id')->eq('school_id', $schoolId)->limit(1)->execute()['data'][0]['group_id'] ?? null;
    $groupName = $groupId ? ($sb->from('school_groups')->select('name')->eq('id', $groupId)->single()->execute()['data'][0]['name'] ?? 'the group') : null;

    // 1. Explicit allow-list on the school: "0722123456, 0733…" — optional " group" suffix widens scope.
    foreach (array_filter(array_map('trim', explode(',', (string)schoolSetting('wa_ask_phones', '')))) as $entry) {
        $wantGroup = stripos($entry, 'group') !== false;
        $num = substr(preg_replace('/\D/', '', $entry), -9);
        if ($num === $tail) {
            return ['scope' => ($wantGroup && $groupId) ? 'group' : 'school', 'group_id' => $groupId, 'group_name' => $groupName, 'name' => ''];
        }
    }

    // 2. Staff profile phone → administrator of this school, or of the group.
    $profiles = $sb->from('user_profiles')->select('id,full_name,phone')->ilike('phone', '%' . $tail . '%')->limit(10)->execute()['data'] ?? [];
    foreach ($profiles as $p) {
        if ($groupId) {
            $ga = $sb->from('school_group_admins')->select('user_id')->eq('group_id', $groupId)->eq('user_id', $p['id'])->limit(1)->execute()['data'] ?? [];
            if ($ga) return ['scope' => 'group', 'group_id' => $groupId, 'group_name' => $groupName, 'name' => (string)$p['full_name']];
        }
        $us = $sb->from('user_schools')->select('role')->eq('school_id', $schoolId)->eq('user_id', $p['id'])->limit(1)->execute()['data'][0] ?? null;
        if ($us && in_array($us['role'], ['school_admin', 'platform_admin'], true)) {
            return ['scope' => 'school', 'group_id' => $groupId, 'group_name' => $groupName, 'name' => (string)$p['full_name']];
        }
    }
    return null;
}

/**
 * Handle a manager's message. Returns true when it was handled here (so the
 * parent bot must not run), false to fall through to the parent flow.
 */
function whatsappAskHandle(Supabase $sb, string $schoolId, string $phone, string $text, array $conv, callable $save): bool
{
    $mgr = whatsappAskManager($sb, $schoolId, $phone);
    if (!$mgr) return false;

    $ctx   = is_string($conv['context'] ?? null) ? (json_decode($conv['context'], true) ?: []) : (array)($conv['context'] ?? []);
    $state = (string)($conv['state'] ?? 'idle');
    $lower = mb_strtolower(trim($text));

    // Managers can step into the parent view and back.
    if ($lower === 'parent') { $save('idle', ['as_parent' => true]); whatsappSendFreeText($phone, "Okay — showing you what a parent sees. Reply *hi*. Reply *ask* to come back."); return true; }
    if (!empty($ctx['as_parent']) && $lower !== 'ask') return false;
    if ($lower === 'ask') { $save('ask', []); }

    $schoolName = schoolSetting('school_name', 'this school');
    $first = trim((string)$mgr['name']) !== '' ? explode(' ', trim($mgr['name']))[0] : '';

    // A group-entitled number can narrow to this branch and widen again.
    $scope = $mgr['scope'];
    if ($mgr['scope'] === 'group' && in_array($lower, ['group', 'all branches', 'all'], true)) { $save('ask', ['ask' => [], 'scope' => 'group']); whatsappSendFreeText($phone, "Now asking across all of " . ($mgr['group_name'] ?: 'the group') . ". What would you like to know?"); return true; }
    if ($mgr['scope'] === 'group' && in_array($lower, ['school', 'branch', 'this school'], true)) { $save('ask', ['ask' => [], 'scope' => 'school']); whatsappSendFreeText($phone, "Now asking about " . $schoolName . " only. Reply *group* to widen again."); return true; }
    if ($mgr['scope'] === 'group' && ($ctx['scope'] ?? '') === 'school') $scope = 'school';
    $mgr['scope'] = $scope;
    $scopeName  = $scope === 'group' ? ($mgr['group_name'] ?: 'the group') : $schoolName;

    if ($text === '' || in_array($lower, ['hi', 'hello', 'hey', 'menu', 'start', 'help', 'ask', 'habari'], true)) {
        $ex = $mgr['scope'] === 'group'
            ? "• Which branch is behind on collections?\n• How much came in across the group this week?\n• Who are the ten largest debtors anywhere?\n• Which branches are recording expenses?"
            : "• How much have we collected this term?\n• Who owes more than 20,000 in Grade 5?\n• What did we spend this month, by heading?\n• What has each bus cost this term?";
        $tip = $mgr['scope'] === 'group' ? " Reply *school* to ask about " . $schoolName . " only." : '';
        whatsappSendFreeText($phone, "Hello" . ($first ? " " . $first : '') . ". 👋 This is *Ask Tuta* for " . $scopeName . ($scope === 'group' ? " — all branches" : '') . " — ask me anything about fees, learners, spending or transport and I'll answer from the records.\n\nFor example:\n" . $ex . "\n\nReply *reset* to start a new thread, or *parent* to see what a parent sees." . $tip);
        $save('ask', ['ask' => [], 'scope' => $mgr['scope']]);
        return true;
    }
    if (in_array($lower, ['reset', 'new', 'clear'], true)) {
        $save('ask', ['ask' => [], 'scope' => $mgr['scope']]);
        whatsappSendFreeText($phone, "New thread. What would you like to know?");
        return true;
    }
    if (!claudeConfigured()) {
        whatsappSendFreeText($phone, "Ask isn't switched on for this school yet.");
        return true;
    }

    // ── The question ──────────────────────────────────────────────
    $history = array_slice((array)($ctx['ask'] ?? []), -10);
    $history[] = ['role' => 'user', 'content' => mb_substr($text, 0, 600)];

    $sid = $mgr['scope'] === 'group' ? '' : $schoolId;
    if ($mgr['scope'] === 'group') { $_SESSION['group_id'] = $mgr['group_id']; $_SESSION['group_name'] = $mgr['group_name']; }
    $r = assistantAsk($sid, $history, $mgr['group_id']);

    if (!$r['ok']) {
        whatsappSendFreeText($phone, "I couldn't answer that just now (" . $r['error'] . "). Try again in a moment.");
        return true;
    }
    $answer = trim($r['text']);
    $history[] = ['role' => 'assistant', 'content' => $answer];
    $save('ask', ['ask' => array_slice($history, -10), 'scope' => $mgr['scope'], 'cost' => round((float)($ctx['cost'] ?? 0) + $r['cost_usd'], 4)]);

    // WhatsApp caps a text at 4096 chars; split long answers on paragraphs.
    foreach (whatsappAskChunks($answer, 3800) as $chunk) whatsappSendFreeText($phone, $chunk);

    try {
        $sb->from('audit_logs')->insert(['school_id' => $schoolId, 'user_email' => 'whatsapp:' . $phone, 'action' => 'ask', 'entity_type' => 'assistant',
            'payload' => ['q' => mb_substr($text, 0, 300), 'tools' => $r['tools'], 'cost_usd' => $r['cost_usd'], 'via' => 'whatsapp', 'scope' => $mgr['scope']]]);
    } catch (\Throwable $e) { /* logging never blocks a reply */ }
    return true;
}

function whatsappAskChunks(string $text, int $max): array
{
    if (mb_strlen($text) <= $max) return [$text];
    $out = []; $cur = '';
    foreach (preg_split('/\n\n+/', $text) as $para) {
        if ($cur !== '' && mb_strlen($cur) + mb_strlen($para) + 2 > $max) { $out[] = $cur; $cur = ''; }
        $cur .= ($cur === '' ? '' : "\n\n") . $para;
        while (mb_strlen($cur) > $max) { $out[] = mb_substr($cur, 0, $max); $cur = mb_substr($cur, $max); }
    }
    if ($cur !== '') $out[] = $cur;
    return $out;
}
