<?php
/**
 * Staff Room — internal staff communications (staff only, no parents).
 *
 * Channels are DERIVED from the graph, never created or managed:
 *   Announcements  ann:{school}          admins & head teachers post; everyone reads
 *   Staff Room     staff:{school}        every staff member of the school
 *   Departments    dept:{group|school}:{subject-slug}
 *       – membership = teachers assigned that subject (subject_teachers),
 *         plus head teachers & admins
 *       – when the school belongs to a school group, the channel spans ALL
 *         member schools: Mathematics at every branch is ONE conversation.
 *         That is the cross-branch alignment this module exists for.
 *
 * Messages can reference a work artifact (lesson plan / scheme of work) so
 * discussion attaches to the actual document rather than a forwarded file.
 */
$pageTitle = 'Staff Room';
$sb   = new Supabase();
$sid  = schoolId();
$uid  = $_SESSION['user_id'] ?? '';
$uname = $_SESSION['user_name'] ?? ($_SESSION['user_email'] ?? 'Staff');
$role  = userRole();
$canAnnounce = in_array($role, ['platform_admin', 'school_admin', 'head_teacher'], true);

function srSlug(string $name): string
{
    return preg_replace('/[^a-z0-9]+/', '-', strtolower(trim($name))) ?: 'general';
}

// ── Resolve group context (cross-branch) ─────────────────────────
$groupId = null; $memberSchoolIds = [$sid]; $schoolNames = [];
$gm = $sb->from('school_group_members')->select('group_id')->eq('school_id', $sid)->execute()['data'] ?? [];
if (!empty($gm)) {
    $groupId = $gm[0]['group_id'];
    $mem = $sb->from('school_group_members')->select('school_id')->eq('group_id', $groupId)->execute()['data'] ?? [];
    $memberSchoolIds = array_values(array_unique(array_merge([$sid], array_column($mem, 'school_id'))));
}
// ── Tier-2 fetches — everything needing only the member-school list, in
// ONE concurrent round-trip instead of three sequential ones. ─────
$isLead = in_array($role, ['platform_admin', 'school_admin', 'head_teacher'], true);
$t2q = [
    'schools'  => $sb->from('schools')->select('id,name')->in('id', $memberSchoolIds),
    'subjects' => $sb->from('subjects')->select('id,name,school_id')->in('school_id', $memberSchoolIds)
        ->eq('is_active', 'true')->limit(500),
];
if (!$isLead) {
    $t2q['asn'] = $sb->from('subject_teachers')->select('subject_id')->eq('user_id', $uid)
        ->in('school_id', $memberSchoolIds)->limit(200);
}
$t2 = Supabase::fetchParallel($t2q);

$schRows = $t2['schools'];
foreach ($schRows as $s) $schoolNames[$s['id']] = $s['name'];

// ── Derive department channels ───────────────────────────────────
// Subjects across the group (or just this school); slug merges same-named
// subjects across branches into one channel.
$deptScope = $groupId ?: $sid;
$subs = $t2['subjects'];
$slugName = [];          // slug => display name
$subjectSlug = [];       // subject_id => slug
foreach ($subs as $s) {
    $slug = srSlug($s['name']);
    $subjectSlug[$s['id']] = $slug;
    if (!isset($slugName[$slug]) || strlen($s['name']) > strlen($slugName[$slug])) $slugName[$slug] = trim($s['name']);
}

// Which departments is THIS user in? Teachers: their assignments (fetched in
// the tier-2 batch). Heads/admins: all.
$mySlugs = [];
if ($isLead) {
    $mySlugs = array_keys($slugName);
} else {
    foreach (($t2['asn'] ?? []) as $a) if (isset($subjectSlug[$a['subject_id']])) $mySlugs[] = $subjectSlug[$a['subject_id']];
    $mySlugs = array_values(array_unique($mySlugs));
}
sort($mySlugs);

// ── Build the user's channel list ────────────────────────────────
$channels = [];
$channels['ann:' . $sid]   = ['name' => 'Announcements', 'kind' => 'ann',   'hint' => 'Official — ' . ($schoolNames[$sid] ?? 'school')];
$channels['staff:' . $sid] = ['name' => 'Staff Room',    'kind' => 'staff', 'hint' => 'All staff — ' . ($schoolNames[$sid] ?? 'school')];
foreach ($mySlugs as $slug) {
    $channels['dept:' . $deptScope . ':' . $slug] = [
        'name' => $slugName[$slug] ?? ucfirst($slug), 'kind' => 'dept',
        'hint' => $groupId ? 'Department — all branches' : 'Department',
    ];
}

// ── POST: send a message ─────────────────────────────────────────
if (isPost() && verifyCsrf() && input('action') === 'post') {
    $ck   = trim((string)input('channel'));
    $body = trim((string)input('body'));
    if (!isset($channels[$ck])) {
        flash('error', 'You are not a member of that channel.');
    } elseif ($channels[$ck]['kind'] === 'ann' && !$canAnnounce) {
        flash('error', 'Only administrators and head teachers can post announcements.');
    } elseif ($body === '') {
        flash('error', 'Write a message first.');
    } elseif (mb_strlen($body) > 4000) {
        flash('error', 'Message is too long (4000 characters max).');
    } else {
        $row = [
            'channel_key' => $ck, 'school_id' => $sid, 'user_id' => $uid,
            'user_name' => mb_substr($uname, 0, 80), 'body' => $body,
        ];
        $at = trim((string)input('artifact_type')); $ai = trim((string)input('artifact_id'));
        if ($at !== '' && $ai !== '' && in_array($at, ['lesson_plan', 'scheme_of_work', 'exam'], true)) {
            $row['artifact_type'] = $at; $row['artifact_id'] = $ai;
        }
        $res = $sb->from('staff_messages')->insert($row);
        if (!empty($res['error'])) flash('error', 'Could not send: ' . $res['error']);
    }
    redirect('staff-room?c=' . urlencode($ck));
}

// ── Active channel ───────────────────────────────────────────────
$active = trim((string)input('c'));
if ($active === '' || !isset($channels[$active])) $active = 'ann:' . $sid;

// ── Tier-3 fetches: unread scan + my reads + the active thread, in ONE
// concurrent round-trip. The read-marker upsert (a write) follows after —
// its ordering doesn't matter because unread excludes the active channel. ──
$keys = array_keys($channels);
$t3 = Supabase::fetchParallel([
    'recent' => $sb->from('staff_messages')->select('channel_key,created_at')
        ->in('channel_key', $keys)->order('created_at', false)->limit(300),
    'reads'  => $sb->from('staff_channel_reads')->select('channel_key,last_read_at')
        ->eq('user_id', $uid)->in('channel_key', $keys)->limit(100),
    'msgs'   => $sb->from('staff_messages')->select('user_id,user_name,school_id,body,artifact_type,artifact_id,created_at')
        ->eq('channel_key', $active)->order('created_at', false)->limit(50),
]);

// Mark active channel read.
$sb->upsert('staff_channel_reads', [[
    'user_id' => $uid, 'channel_key' => $active, 'last_read_at' => date('c'),
]], 'user_id,channel_key');

// ── Unread badges: latest message per channel vs my last reads ───
$latest = [];
foreach ($t3['recent'] as $m) if (!isset($latest[$m['channel_key']])) $latest[$m['channel_key']] = $m['created_at'];
$readAt = [];
foreach ($t3['reads'] as $r) $readAt[$r['channel_key']] = $r['last_read_at'];
foreach ($channels as $k => &$c) {
    $c['unread'] = isset($latest[$k]) && ($k !== $active)
        && (!isset($readAt[$k]) || strtotime($latest[$k]) > strtotime($readAt[$k]));
}
unset($c);

// ── Messages for the active channel ──────────────────────────────
$msgs = array_reverse($t3['msgs']);
$activeMeta = $channels[$active];
$artifactLabels = ['lesson_plan' => 'Lesson plan', 'scheme_of_work' => 'Scheme of work', 'exam' => 'Exam'];

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="flex items-start justify-between mb-5 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Staff Room</h1>
        <p class="text-sm text-gray-500 mt-1">Departments span every branch<?= $groupId ? ' in ' . e(count($memberSchoolIds)) . ' schools' : '' ?> — membership follows your teaching assignments automatically.</p>
    </div>
</div>

<div class="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">

    <!-- Channel list -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <?php
        $sections = [
            'ann'   => 'Official',
            'staff' => 'General',
            'dept'  => $groupId ? 'Departments · cross-branch' : 'Departments',
        ];
        foreach ($sections as $kind => $label): ?>
            <p class="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400"><?= e($label) ?></p>
            <?php foreach ($channels as $k => $c): if ($c['kind'] !== $kind) continue; ?>
                <a href="<?= baseUrl('staff-room') ?>?c=<?= urlencode($k) ?>"
                   class="flex items-center justify-between px-4 py-2 text-sm <?= $k === $active ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-600 hover:bg-gray-50' ?>">
                    <span class="truncate"><?= e($c['name']) ?></span>
                    <?php if (!empty($c['unread'])): ?><span class="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 ml-2"></span><?php endif; ?>
                </a>
            <?php endforeach; ?>
        <?php endforeach; ?>
        <?php if (count($channels) === 2): ?>
            <p class="px-4 py-3 text-xs text-gray-400">No department channels yet — you'll join them automatically when you're assigned subjects in Settings → Teachers.</p>
        <?php endif; ?>
    </div>

    <!-- Thread -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col min-h-[420px]">
        <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
            <div>
                <h2 class="text-sm font-semibold text-gray-800"><?= e($activeMeta['name']) ?></h2>
                <p class="text-xs text-gray-400"><?= e($activeMeta['hint']) ?></p>
            </div>
            <?php if ($activeMeta['kind'] === 'ann'): ?>
                <span class="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">read-only for staff</span>
            <?php endif; ?>
        </div>

        <div class="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            <?php if (empty($msgs)): ?>
                <p class="text-sm text-gray-400 text-center py-10">
                    <?= $activeMeta['kind'] === 'dept'
                        ? 'No messages yet. Start the conversation — every branch\'s ' . e($activeMeta['name']) . ' teachers will see it.'
                        : 'No messages yet.' ?>
                </p>
            <?php else: foreach ($msgs as $m): $mine = ($m['user_id'] === $uid); ?>
                <div class="flex <?= $mine ? 'justify-end' : 'justify-start' ?>">
                    <div class="max-w-[85%] <?= $mine ? 'bg-emerald-50' : 'bg-gray-50' ?> rounded-xl px-4 py-2.5">
                        <div class="flex items-baseline gap-2 flex-wrap">
                            <span class="text-xs font-semibold <?= $mine ? 'text-emerald-700' : 'text-gray-700' ?>"><?= e($mine ? 'You' : ($m['user_name'] ?: 'Staff')) ?></span>
                            <?php if (($m['school_id'] ?? '') !== $sid && isset($schoolNames[$m['school_id']])): ?>
                                <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700"><?= e($schoolNames[$m['school_id']]) ?></span>
                            <?php endif; ?>
                            <span class="text-[10px] text-gray-400"><?= e(date('j M · H:i', strtotime($m['created_at']))) ?></span>
                        </div>
                        <?php if (!empty($m['artifact_type'])): ?>
                            <span class="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium"> <?= e($artifactLabels[$m['artifact_type']] ?? $m['artifact_type']) ?></span>
                        <?php endif; ?>
                        <p class="text-sm text-gray-800 mt-1 whitespace-pre-wrap break-words"><?= e($m['body']) ?></p>
                    </div>
                </div>
            <?php endforeach; endif; ?>
        </div>

        <?php if ($activeMeta['kind'] !== 'ann' || $canAnnounce): ?>
            <form method="POST" class="border-t border-gray-100 p-3 flex gap-2 items-end">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="post">
                <input type="hidden" name="channel" value="<?= e($active) ?>">
                <textarea name="body" rows="2" required maxlength="4000"
                    placeholder="<?= $activeMeta['kind'] === 'ann' ? 'Write an announcement…' : 'Message ' . e($activeMeta['name']) . '…' ?>"
                    class="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-y"></textarea>
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Send</button>
            </form>
        <?php endif; ?>
    </div>

</div>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
