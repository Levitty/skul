<?php
/**
 * Enquiries — the admissions pipeline, not an inbox.
 *
 *   New → Contacted → Visit booked → Applied → Admitted, or Lost (with a
 *   reason). Each enquiry has a source (website, WhatsApp, walk-in, phone,
 *   referral), an owner, a follow-up date, and a notes timeline. "Convert to
 *   admission" carries the details into the admissions queue; approving there
 *   closes the enquiry as Admitted and links the learner (mig. 129).
 *
 * Where enquiries come from:
 *   • the school's own website, posting to api/enquiry with the key shown here
 *   • Tuta's hosted form (the shareable link)
 *   • the office keying in a walk-in or a phone call ("+ Add enquiry")
 *   • the WhatsApp assistant, later
 */
$pageTitle = 'Enquiries';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

$STAGES = ['new' => 'New', 'contacted' => 'Contacted', 'visit_booked' => 'Visit booked', 'applied' => 'Applied', 'admitted' => 'Admitted', 'lost' => 'Lost'];
$SOURCES = ['website' => 'Website', 'whatsapp' => 'WhatsApp', 'walk_in' => 'Walk-in', 'phone' => 'Phone call', 'referral' => 'Referral', 'other' => 'Other'];
$putSetting = function (string $key, string $value) use ($sb, $sid) {
    $ex = $sb->from('school_settings')->select('id')->eq('school_id', $sid)->eq('key', $key)->single()->execute();
    if (!empty($ex['data'])) $sb->from('school_settings')->eq('school_id', $sid)->eq('key', $key)->update(['value' => $value, 'updated_at' => date('c')]);
    else $sb->from('school_settings')->insert(['school_id' => $sid, 'key' => $key, 'value' => $value]);
    Supabase::clearCache('settings_' . $sid);
};
$note = function (string $enquiryId, string $body, string $kind = 'note') use ($sb, $sid, $me) {
    $sb->from('enquiry_notes')->insert(['school_id' => $sid, 'enquiry_id' => $enquiryId, 'kind' => $kind, 'author_email' => $me['email'] ?? null, 'body' => $body]);
    $sb->from('enquiries')->eq('id', $enquiryId)->eq('school_id', $sid)->update(['last_activity_at' => date('c')]);
};
$filter = trim((string)input('status')) ?: 'open';
$back   = fn(string $open = ''): string => 'enquiries?status=' . urlencode($filter) . ($open !== '' ? '&open=' . urlencode($open) : '');

// Public keys + links this school's website needs. Created on first visit.
$publicKey = schoolSetting('enquiry_public_key', '');
if ($publicKey === '') { $publicKey = 'sk_' . bin2hex(random_bytes(10)); $putSetting('enquiry_public_key', $publicKey); }
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host   = $_SERVER['HTTP_HOST'] ?? '';
$hostedUrl = $scheme . '://' . $host . baseUrl('enquire') . '?school=' . $sid;
$admitUrl  = $scheme . '://' . $host . baseUrl('admit') . '?school=' . $sid;
$endpoint  = $scheme . '://' . $host . '/?route=api/enquiry';
if (schoolSetting('admission_public_url', '') === '') $putSetting('admission_public_url', $admitUrl);

// ════════════════════════════════════════════════════════════════
// POST
// ════════════════════════════════════════════════════════════════
if (isPost() && verifyCsrf()) {
    $action = input('action');
    $id = (string)input('id');

    if ($action === 'set_stage' && $id !== '') {
        $to = (string)input('status');
        $allowed = array_merge(array_keys($STAGES), ['spam', 'archived']);
        if (!in_array($to, $allowed, true)) { flash('error', 'Unknown stage.'); redirect($back()); }
        $upd = ['status' => $to, 'last_activity_at' => date('c')];
        if ($to === 'contacted') $upd['contacted_at'] = date('c');
        if ($to === 'lost') $upd['lost_reason'] = mb_substr(trim((string)input('lost_reason')), 0, 200) ?: null;
        $sb->from('enquiries')->eq('id', $id)->eq('school_id', $sid)->update($upd);
        $note($id, 'Moved to ' . ($STAGES[$to] ?? ucfirst($to)) . ($to === 'lost' && !empty($upd['lost_reason']) ? ' — ' . $upd['lost_reason'] : ''), 'status');
        flash('success', 'Enquiry marked ' . strtolower($STAGES[$to] ?? $to) . '.');
        redirect($back($to === 'spam' || $to === 'archived' ? '' : $id));
    }

    if ($action === 'add_note' && $id !== '') {
        $body = trim((string)input('note'));
        if ($body !== '') { $note($id, mb_substr($body, 0, 1000)); flash('success', 'Note added.'); }
        redirect($back($id));
    }

    if ($action === 'set_follow_up' && $id !== '') {
        $d = (string)input('follow_up_at');
        $d = preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
        $sb->from('enquiries')->eq('id', $id)->eq('school_id', $sid)->update(['follow_up_at' => $d, 'last_activity_at' => date('c')]);
        $note($id, $d ? 'Follow up on ' . date('j M Y', strtotime($d)) : 'Follow-up cleared', 'follow_up');
        flash('success', $d ? 'Follow-up set.' : 'Follow-up cleared.');
        redirect($back($id));
    }

    if ($action === 'assign' && $id !== '') {
        $uid = (string)input('assigned_to');
        $email = null;
        if ($uid !== '') { $p = $sb->from('user_profiles')->select('email,full_name')->eq('id', $uid)->single()->execute()['data'][0] ?? null; $email = $p['email'] ?? null; }
        $sb->from('enquiries')->eq('id', $id)->eq('school_id', $sid)->update(['assigned_to' => $uid ?: null, 'assigned_email' => $email, 'last_activity_at' => date('c')]);
        $note($id, $uid ? 'Assigned to ' . ($p['full_name'] ?? $email ?? 'staff') : 'Unassigned', 'assign');
        flash('success', 'Owner updated.');
        redirect($back($id));
    }

    if ($action === 'add_enquiry') {
        $name = trim((string)input('name')); $phone = trim((string)input('phone')); $email = trim((string)input('email'));
        if ($name === '' || ($phone === '' && $email === '')) { flash('error', 'Name and a phone or email are required.'); redirect($back()); }
        $src = in_array(input('source'), array_keys($SOURCES), true) ? input('source') : 'walk_in';
        $dob = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)input('child_dob')) ? input('child_dob') : null;
        $ins = $sb->from('enquiries')->insert([
            'school_id' => $sid, 'name' => mb_substr($name, 0, 120), 'phone' => $phone ?: null, 'email' => $email ?: null,
            'child_name' => mb_substr(trim((string)input('child_name')), 0, 120) ?: null, 'child_dob' => $dob,
            'grade_interest' => mb_substr(trim((string)input('grade_interest')), 0, 60) ?: null,
            'message' => mb_substr(trim((string)input('message')), 0, 2000) ?: null,
            'status' => 'contacted', 'contacted_at' => date('c'), 'source' => $src,
            'assigned_to' => $me['id'] ?? null, 'assigned_email' => $me['email'] ?? null, 'last_activity_at' => date('c'),
        ]);
        $newId = $ins['data'][0]['id'] ?? '';
        if ($newId) $note($newId, 'Logged by ' . ($me['email'] ?? 'staff') . ' (' . $SOURCES[$src] . ')', 'system');
        flash('success', 'Enquiry logged.');
        redirect($back($newId));
    }

    if ($action === 'convert' && $id !== '') {
        $en = $sb->from('enquiries')->select('*')->eq('id', $id)->eq('school_id', $sid)->single()->execute()['data'][0] ?? null;
        if (!$en) { flash('error', 'Enquiry not found.'); redirect($back()); }
        if (!empty($en['admission_id'])) { flash('error', 'This enquiry already has an admission.'); redirect($back($id)); }
        $child = trim((string)($en['child_name'] ?? ''));
        $parts = preg_split('/\s+/', $child); $first = $parts[0] ?? ''; $last = trim(implode(' ', array_slice($parts, 1)));
        $ins = $sb->from('admissions')->insert([
            'school_id' => $sid, 'status' => 'pending',
            'first_name' => $first !== '' ? $first : 'Child of', 'last_name' => $last !== '' ? $last : $en['name'],
            'dob' => $en['child_dob'] ?? null, 'grade_applying' => $en['grade_interest'] ?? '',
            'guardian_name' => $en['name'], 'guardian_phone' => $en['phone'] ?? '', 'guardian_email' => $en['email'] ?? null,
            'parents' => [['relation' => 'Guardian', 'name' => $en['name'], 'phone' => $en['phone'] ?? '', 'email' => $en['email'] ?? '', 'is_primary' => true]],
            'consent_accepted' => false, 'consent_name' => null, 'rules_version' => 0,
            'media_consent' => 'none', 'enquiry_id' => $id,
        ]);
        $admId = $ins['data'][0]['id'] ?? null;
        if (!$admId) { flash('error', 'Could not create the admission: ' . ($ins['error'] ?? 'unknown error')); redirect($back($id)); }
        $sb->from('enquiries')->eq('id', $id)->eq('school_id', $sid)->update(['status' => 'applied', 'admission_id' => $admId, 'last_activity_at' => date('c')]);
        $note($id, 'Converted to an admission — review it under Admissions. Details still to be completed by the parent or the office.', 'system');
        flashLink('success', 'Admission created from the enquiry. Complete or approve it under Admissions.', baseUrl('admissions'), 'Open admissions');
        redirect($back($id));
    }

    if ($action === 'save_ack') {
        $putSetting('enquiry_ack_enabled', input('enquiry_ack_enabled') ? '1' : '0');
        $putSetting('enquiry_ack_text', mb_substr(trim((string)input('enquiry_ack_text')), 0, 2000));
        flash('success', 'Acknowledgement saved.');
        redirect($back());
    }

    if ($action === 'save_notify') {
        $putSetting('enquiry_notify_phones', mb_substr(trim((string)input('enquiry_notify_phones')), 0, 300));
        $putSetting('enquiry_notify_emails', mb_substr(trim((string)input('enquiry_notify_emails')), 0, 500));
        flash('success', 'The office will be told about new enquiries.');
        redirect($back());
    }

    redirect($back());
}

// ════════════════════════════════════════════════════════════════
// Data
// ════════════════════════════════════════════════════════════════
$all = $sb->from('enquiries')->select('*')->eq('school_id', $sid)->order('created_at', false)->limit(1000)->execute()['data'] ?? [];
$today = date('Y-m-d');
$openStages = ['new', 'contacted', 'visit_booked', 'applied'];
$counts = ['open' => 0, 'due' => 0, 'new' => 0, 'contacted' => 0, 'visit_booked' => 0, 'applied' => 0, 'admitted' => 0, 'lost' => 0, 'spam' => 0, 'archived' => 0, 'mine' => 0];
foreach ($all as $e) {
    $st = $e['status'] ?? 'new';
    if (isset($counts[$st])) $counts[$st]++;
    if (in_array($st, $openStages, true)) { $counts['open']++; if (($e['assigned_to'] ?? '') === ($me['id'] ?? '-')) $counts['mine']++; }
    if (in_array($st, $openStages, true) && !empty($e['follow_up_at']) && $e['follow_up_at'] <= $today) $counts['due']++;
}
$q = mb_strtolower(trim((string)input('q')));
$list = array_values(array_filter($all, function ($e) use ($filter, $openStages, $today, $me, $q) {
    $st = $e['status'] ?? 'new';
    $ok = match ($filter) {
        'open' => in_array($st, $openStages, true),
        'due'  => in_array($st, $openStages, true) && !empty($e['follow_up_at']) && $e['follow_up_at'] <= $today,
        'mine' => in_array($st, $openStages, true) && ($e['assigned_to'] ?? '') === ($me['id'] ?? '-'),
        'all'  => true,
        default => $st === $filter,
    };
    if ($ok && $q !== '') $ok = str_contains(mb_strtolower(($e['name'] ?? '') . ' ' . ($e['phone'] ?? '') . ' ' . ($e['email'] ?? '') . ' ' . ($e['child_name'] ?? '')), $q);
    return $ok;
}));
// Overdue follow-ups first, then newest.
usort($list, function ($a, $b) use ($today) {
    $ad = !empty($a['follow_up_at']) && $a['follow_up_at'] <= $today ? 0 : 1;
    $bd = !empty($b['follow_up_at']) && $b['follow_up_at'] <= $today ? 0 : 1;
    return $ad <=> $bd ?: strcmp((string)$b['created_at'], (string)$a['created_at']);
});

// Metrics: last 90 days.
$since = date('Y-m-d', strtotime('-90 days'));
$recent = array_filter($all, fn($e) => substr((string)$e['created_at'], 0, 10) >= $since && !in_array($e['status'], ['spam', 'archived'], true));
$m = ['total' => count($recent), 'admitted' => 0, 'stale' => 0, 'hours' => [], 'by_source' => []];
foreach ($recent as $e) {
    if ($e['status'] === 'admitted') $m['admitted']++;
    if ($e['status'] === 'new' && strtotime((string)$e['created_at']) < time() - 2 * 86400) $m['stale']++;
    if (!empty($e['contacted_at'])) $m['hours'][] = max(0, (strtotime($e['contacted_at']) - strtotime($e['created_at'])) / 3600);
    $s = $e['source'] ?: 'website'; $m['by_source'][$s] = ($m['by_source'][$s] ?? 0) + 1;
}
sort($m['hours']);
$median = $m['hours'] ? $m['hours'][(int)floor(count($m['hours']) / 2)] : null;
$thisMonth = count(array_filter($all, fn($e) => substr((string)$e['created_at'], 0, 7) === date('Y-m') && !in_array($e['status'], ['spam'], true)));
arsort($m['by_source']);

// Staff for the owner picker.
$staff = [];
foreach (($sb->from('user_schools')->select('user_id,role')->eq('school_id', $sid)->limit(200)->execute()['data'] ?? []) as $us) $staff[$us['user_id']] = $us['role'];
$staffRows = [];
if ($staff) {
    foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('user_profiles')->select('id,email,full_name'), 'id', array_keys($staff)) as $p) {
        $staffRows[] = ['id' => $p['id'], 'label' => ($p['full_name'] ?: $p['email']) . ' · ' . str_replace('_', ' ', $staff[$p['id']] ?? '')];
    }
    usort($staffRows, fn($a, $b) => strcmp($a['label'], $b['label']));
}
$staffName = []; foreach ($staffRows as $r) $staffName[$r['id']] = explode(' · ', $r['label'])[0];

// Notes for the enquiry that's open.
$openId = trim((string)input('open'));
$notes = [];
if ($openId !== '') {
    $notes = $sb->from('enquiry_notes')->select('kind,author_email,body,created_at')->eq('enquiry_id', $openId)->eq('school_id', $sid)->order('created_at', false)->limit(100)->execute()['data'] ?? [];
}

$stageCls = ['new' => 'bg-blue-50 text-blue-700', 'contacted' => 'bg-amber-50 text-amber-700', 'visit_booked' => 'bg-violet-50 text-violet-700',
             'applied' => 'bg-teal-50 text-teal-700', 'admitted' => 'bg-emerald-50 text-emerald-700', 'lost' => 'bg-gray-100 text-gray-600',
             'spam' => 'bg-red-50 text-red-700', 'archived' => 'bg-gray-100 text-gray-500'];
$age = function (?string $dob): string { if (!$dob) return ''; $d = date_diff(date_create($dob), date_create()); return $d->y . ' yr' . ($d->y === 1 ? '' : 's'); };
$ago = function (?string $dt): string { if (!$dt) return ''; $s = time() - strtotime($dt); if ($s < 3600) return max(1, (int)($s / 60)) . 'm ago'; if ($s < 86400) return (int)($s / 3600) . 'h ago'; $d = (int)($s / 86400); return $d === 1 ? 'yesterday' : $d . 'd ago'; };

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="flex items-start justify-between gap-4 mb-5 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Enquiries</h1>
        <p class="text-sm text-gray-500 mt-1">From first contact to an admitted learner. Nothing waits without an owner and a date.</p>
    </div>
    <div class="flex gap-2 flex-wrap">
        <button type="button" onclick="document.getElementById('connectCard').classList.toggle('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Website &amp; settings</button>
        <button type="button" onclick="openModal('addEnqModal')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">+ Add enquiry</button>
    </div>
</div>

<!-- Tiles -->
<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <?php foreach ([
        ['bg-blue-500',   number_format($thisMonth), 'New this month'],
        ['bg-rose-500',   number_format($m['stale']), 'Uncontacted over 2 days'],
        ['bg-violet-500', number_format($counts['due']), 'Follow-ups due'],
        ['bg-emerald-500', $m['total'] > 0 ? number_format($m['admitted'] / $m['total'] * 100, 0) . '%' : '—', 'Admitted · last 90 days' . ($median !== null ? ' · first contact in ' . ($median < 1 ? '<1h' : ($median < 48 ? round($median) . 'h' : round($median / 24) . 'd')) : '')],
    ] as [$bg, $val, $lbl]): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl <?= $bg ?> flex items-center justify-center flex-shrink-0"><span class="w-2.5 h-2.5 rounded-full bg-white/90"></span></div>
        <div class="min-w-0"><p class="text-lg font-bold text-gray-900 leading-tight tabular-nums"><?= e($val) ?></p><p class="text-xs text-gray-500 mt-0.5 truncate"><?= e($lbl) ?></p></div>
    </div>
    <?php endforeach; ?>
</div>

<!-- Website connection + settings (collapsed) -->
<div id="connectCard" class="hidden mb-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-800 mb-1">Connect your website</h2>
        <p class="text-xs text-gray-500 mb-3">Your web developer adds one script and two attributes to the existing contact form. Submissions land here with the source "Website".</p>
        <dl class="text-xs space-y-1.5 mb-3">
            <div><dt class="text-gray-500">Endpoint</dt><dd class="font-mono text-gray-800 break-all"><?= e($endpoint) ?></dd></div>
            <div><dt class="text-gray-500">School ID</dt><dd class="font-mono text-gray-800 break-all"><?= e($sid) ?></dd></div>
            <div><dt class="text-gray-500">Public key</dt><dd class="font-mono text-gray-800"><?= e($publicKey) ?></dd></div>
        </dl>
        <details class="text-xs"><summary class="cursor-pointer text-emerald-700 font-medium">Show the snippet</summary>
<pre class="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 overflow-x-auto text-[11px] leading-relaxed text-gray-700"><?= e('<form data-tuta-enquiry data-school="' . $sid . '" data-key="' . $publicKey . '">
  <input name="name" placeholder="Your name" required>
  <input name="phone" placeholder="Phone">  <input name="email" type="email" placeholder="Email">
  <input name="child_name" placeholder="Child\'s name">  <input name="child_dob" type="date">
  <select name="grade_interest"><option>PP1</option><option>Grade 1</option>…</select>
  <textarea name="message"></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Send enquiry</button>
</form>
<script src="' . $scheme . '://' . $host . '/assets/tuta-enquiry.js"></script>') ?></pre>
        </details>
        <p class="text-xs text-gray-500 mt-3">Or share the hosted form: <a href="<?= e($hostedUrl) ?>" target="_blank" class="text-emerald-700 font-medium break-all"><?= e($hostedUrl) ?></a></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-800 mb-1">Acknowledgement to the parent</h2>
        <p class="text-xs text-gray-500 mb-3">Sent by email the moment an enquiry with an email address arrives. Leave the text blank for Tuta's default, which includes the admission link.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="save_ack">
            <label class="flex items-center gap-2 text-sm text-gray-700 mb-2"><input type="checkbox" name="enquiry_ack_enabled" value="1" <?= schoolSetting('enquiry_ack_enabled', '1') === '1' ? 'checked' : '' ?> class="rounded border-gray-300 text-emerald-600"> Send an acknowledgement email</label>
            <textarea name="enquiry_ack_text" rows="4" placeholder="Dear parent, thank you for your enquiry about …" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"><?= e(schoolSetting('enquiry_ack_text', '')) ?></textarea>
            <button type="submit" class="mt-2 px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Save</button>
        </form>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-800 mb-1">Tell the office</h2>
        <p class="text-xs text-gray-500 mb-3">The moment a new enquiry arrives from the website or the hosted form, these people get an SMS and an email with the parent's details and a link — so the call-back happens today, not when someone next opens this page.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="save_notify">
            <label class="block text-xs font-medium text-gray-600 mb-1">SMS to</label>
            <input type="text" name="enquiry_notify_phones" value="<?= e(schoolSetting('enquiry_notify_phones', '')) ?>" placeholder="0722 123 456, 0733 987 654" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none mb-2">
            <label class="block text-xs font-medium text-gray-600 mb-1">Email to</label>
            <input type="text" name="enquiry_notify_emails" value="<?= e(schoolSetting('enquiry_notify_emails', '')) ?>" placeholder="office@school.ac.ke, head@school.ac.ke" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <p class="text-[11px] text-gray-400 mt-1">Comma-separated. SMS needs Settings → SMS set up<?= function_exists('smsConfigured') && !smsConfigured() ? ' — <span class="text-amber-600">not yet at this school</span>' : '' ?>.</p>
            <button type="submit" class="mt-2 px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Save</button>
        </form>
    </div>
</div>

<!-- Filters -->
<form method="GET" action="<?= baseUrl('enquiries') ?>" class="flex flex-wrap items-center gap-2 mb-4">
    <?php $chips = ['open' => 'Open', 'due' => 'Due', 'mine' => 'Mine', 'new' => 'New', 'contacted' => 'Contacted', 'visit_booked' => 'Visit booked', 'applied' => 'Applied', 'admitted' => 'Admitted', 'lost' => 'Lost', 'spam' => 'Spam', 'archived' => 'Archived', 'all' => 'All'];
    foreach ($chips as $key => $label): $active = $filter === $key; $badge = $counts[$key] ?? null; ?>
        <a href="<?= baseUrl('enquiries') ?>?status=<?= e($key) ?>" class="px-3 py-1.5 rounded-lg text-sm font-medium transition <?= $active ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50' ?>"><?= e($label) ?><?php if ($badge): ?> <span class="<?= $active ? 'text-emerald-100' : 'text-gray-400' ?>">(<?= $badge ?>)</span><?php endif; ?></a>
    <?php endforeach; ?>
    <input type="hidden" name="status" value="<?= e($filter) ?>">
    <input type="search" name="q" value="<?= e((string)input('q')) ?>" placeholder="Search name, phone, child…" class="ml-auto px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none min-w-[16rem]">
</form>

<!-- List -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?php if (!$list): ?>
        <div class="px-5 py-12 text-center text-gray-400 text-sm">Nothing here<?= $q !== '' ? ' for that search' : '' ?>.</div>
    <?php else: ?>
    <div class="divide-y divide-gray-50">
        <?php foreach ($list as $en): $st = $en['status'] ?? 'new'; $isOpen = $openId === $en['id'];
            $due = !empty($en['follow_up_at']) && in_array($st, $openStages, true) && $en['follow_up_at'] <= $today; ?>
        <div class="<?= $isOpen ? 'bg-emerald-50/30' : '' ?>">
            <a href="<?= baseUrl('enquiries') ?>?<?= http_build_query(['status' => $filter, 'q' => (string)input('q'), 'open' => $isOpen ? '' : $en['id']]) ?>" class="block px-5 py-3 hover:bg-gray-50/60">
                <div class="flex items-start justify-between gap-4 flex-wrap">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-semibold text-gray-900"><?= e($en['name']) ?></span>
                            <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium <?= $stageCls[$st] ?? 'bg-gray-100 text-gray-600' ?>"><?= e($STAGES[$st] ?? ucfirst($st)) ?></span>
                            <span class="text-[11px] text-gray-400"><?= e($SOURCES[$en['source'] ?? 'website'] ?? 'Website') ?></span>
                            <?php if (($en['spam_score'] ?? 0) >= 50): ?><span class="text-[11px] text-red-400"> likely spam</span><?php endif; ?>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">
                            <?= e($en['phone'] ?: '') ?><?= !empty($en['phone']) && !empty($en['email']) ? ' · ' : '' ?><?= e($en['email'] ?: '') ?>
                            <?php if (!empty($en['child_name']) || !empty($en['grade_interest'])): ?><span class="text-gray-300 mx-1">·</span><?= e($en['child_name'] ?: 'Child') ?><?= !empty($en['child_dob']) ? ', ' . $age($en['child_dob']) : '' ?><?= !empty($en['grade_interest']) ? ' · ' . e($en['grade_interest']) : '' ?><?php endif; ?>
                        </p>
                    </div>
                    <div class="text-right text-xs flex-shrink-0">
                        <p class="text-gray-400"><?= e($ago($en['created_at'])) ?><?= !empty($en['assigned_to']) ? ' · ' . e($staffName[$en['assigned_to']] ?? $en['assigned_email'] ?? 'assigned') : ' · <span class="text-amber-600">unassigned</span>' ?></p>
                        <?php if (!empty($en['follow_up_at']) && in_array($st, $openStages, true)): ?>
                            <p class="mt-0.5 font-medium <?= $due ? 'text-rose-600' : 'text-gray-600' ?>">Follow up <?= e(date('j M', strtotime($en['follow_up_at']))) ?><?= $due ? ' · due' : '' ?></p>
                        <?php endif; ?>
                    </div>
                </div>
            </a>

            <?php if ($isOpen): ?>
            <div class="px-5 pb-5 pt-1 border-t border-gray-100 bg-white">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div>
                        <?php if (!empty($en['message'])): ?><p class="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg px-3 py-2 mb-3"><?= e($en['message']) ?></p><?php endif; ?>
                        <?php if (!empty($en['lost_reason'])): ?><p class="text-xs text-gray-500 mb-3">Lost: <?= e($en['lost_reason']) ?></p><?php endif; ?>

                        <!-- Stage buttons -->
                        <div class="flex flex-wrap gap-1.5 mb-3">
                            <?php foreach ($STAGES as $k => $lbl): if ($k === $st || $k === 'admitted' || $k === 'lost') continue; ?>
                            <form method="POST" class="inline"><?= csrfField() ?><input type="hidden" name="action" value="set_stage"><input type="hidden" name="id" value="<?= e($en['id']) ?>"><input type="hidden" name="status" value="<?= $k ?>">
                                <button class="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">→ <?= e($lbl) ?></button></form>
                            <?php endforeach; ?>
                            <?php if (empty($en['admission_id']) && in_array($st, $openStages, true)): ?>
                            <form method="POST" class="inline" onsubmit="return confirm('Create an admission from this enquiry? It goes to the Admissions queue.')"><?= csrfField() ?><input type="hidden" name="action" value="convert"><input type="hidden" name="id" value="<?= e($en['id']) ?>">
                                <button class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Convert to admission</button></form>
                            <?php elseif (!empty($en['admission_id'])): ?>
                                <a href="<?= baseUrl('admissions') ?>" class="px-2.5 py-1 text-xs font-medium rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">Admission →</a>
                            <?php endif; ?>
                            <?php if (!empty($en['student_id'])): ?><a href="<?= baseUrl('students/view') ?>?id=<?= e($en['student_id']) ?>" class="px-2.5 py-1 text-xs font-medium rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">Learner →</a><?php endif; ?>
                            <?php if ($st !== 'lost' && $st !== 'admitted'): ?>
                            <form method="POST" class="inline" onsubmit="var r=prompt('Why was this enquiry lost? (e.g. chose another school, fees, moved away)'); if(r===null) return false; this.querySelector('[name=lost_reason]').value=r; return true;"><?= csrfField() ?><input type="hidden" name="action" value="set_stage"><input type="hidden" name="id" value="<?= e($en['id']) ?>"><input type="hidden" name="status" value="lost"><input type="hidden" name="lost_reason" value="">
                                <button class="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Lost</button></form>
                            <?php endif; ?>
                            <?php foreach (['spam' => 'Spam', 'archived' => 'Archive'] as $k => $lbl): if ($k === $st) continue; ?>
                            <form method="POST" class="inline"><?= csrfField() ?><input type="hidden" name="action" value="set_stage"><input type="hidden" name="id" value="<?= e($en['id']) ?>"><input type="hidden" name="status" value="<?= $k ?>">
                                <button class="px-2.5 py-1 text-xs rounded-lg text-gray-400 hover:text-red-600"><?= $lbl ?></button></form>
                            <?php endforeach; ?>
                        </div>

                        <!-- Owner + follow-up -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <form method="POST" class="flex gap-2"><?= csrfField() ?><input type="hidden" name="action" value="assign"><input type="hidden" name="id" value="<?= e($en['id']) ?>">
                                <select name="assigned_to" class="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white"><option value="">— unassigned —</option>
                                    <?php foreach ($staffRows as $r): ?><option value="<?= e($r['id']) ?>"<?= ($en['assigned_to'] ?? '') === $r['id'] ? ' selected' : '' ?>><?= e($r['label']) ?></option><?php endforeach; ?>
                                </select><button class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">Assign</button></form>
                            <form method="POST" class="flex gap-2"><?= csrfField() ?><input type="hidden" name="action" value="set_follow_up"><input type="hidden" name="id" value="<?= e($en['id']) ?>">
                                <input type="date" name="follow_up_at" value="<?= e($en['follow_up_at'] ?? '') ?>" class="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs"><button class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">Follow up</button></form>
                        </div>
                    </div>
                    <div>
                        <form method="POST" class="flex gap-2 mb-3"><?= csrfField() ?><input type="hidden" name="action" value="add_note"><input type="hidden" name="id" value="<?= e($en['id']) ?>">
                            <input type="text" name="note" placeholder="Add a note — called, mum will visit Thursday…" class="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"><button class="px-3 py-1.5 text-xs font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900">Add</button></form>
                        <div class="space-y-2 max-h-64 overflow-y-auto">
                            <?php if (!$notes): ?><p class="text-xs text-gray-400">No notes yet.</p><?php endif; ?>
                            <?php foreach ($notes as $n): ?>
                            <div class="text-xs"><span class="text-gray-400"><?= e(date('j M H:i', strtotime((string)$n['created_at']))) ?> · <?= e($n['author_email'] ? explode('@', $n['author_email'])[0] : 'system') ?></span>
                                <p class="text-gray-700 <?= $n['kind'] !== 'note' ? 'italic text-gray-500' : '' ?>"><?= e($n['body']) ?></p></div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            </div>
            <?php endif; ?>
        </div>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
</div>

<!-- Add enquiry (walk-in / phone) -->
<div id="addEnqModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Log an enquiry</h3>
        <p class="text-xs text-gray-500 mb-4">A walk-in, a phone call, a referral. It starts as Contacted and assigned to you.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_enquiry">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Parent's name *</label><input type="text" name="name" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Source</label><select name="source" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"><?php foreach ($SOURCES as $k => $l): if ($k === 'website') continue; ?><option value="<?= $k ?>"><?= e($l) ?></option><?php endforeach; ?></select></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Phone</label><input type="tel" name="phone" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" name="email" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Child's name</label><input type="text" name="child_name" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Child's date of birth</label><input type="date" name="child_dob" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"></div>
                <div class="sm:col-span-2"><label class="block text-sm font-medium text-gray-700 mb-1">Grade of interest</label><input type="text" name="grade_interest" placeholder="e.g. Grade 4" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"></div>
            </div>
            <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea name="message" rows="3" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"></textarea></div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Log enquiry</button>
                <button type="button" onclick="closeModal('addEnqModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
        </form>
    </div>
</div>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
