<?php
/**
 * Send SMS — broadcast to guardians, a class, or fee defaulters.
 * Uses the provider-agnostic seam in includes/sms.php.
 */
$pageTitle = 'Send SMS';
$sb  = new Supabase();
$sid = schoolId();

$currentTerm   = cachedCurrentTerm();
$currentTermId = $currentTerm['id'] ?? null;

$classMap = [];
foreach (cachedClasses() as $c) $classMap[$c['id']] = $c['name'];

// Active students with guardian phones + class (chunk-safe).
// guardian_phone_2 is the optional second contact (migration 111).
$students = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('students')->select('id,first_name,last_name,admission_number,guardian_name,guardian_phone,guardian_name_2,guardian_phone_2,current_class_id')
        ->eq('school_id', $sid)->eq('status', 'active'));

/** Every guardian phone on a learner (first + optional second), non-empty. */
$phonesOf = function (array $s): array {
    $out = [];
    foreach ([$s['guardian_phone'] ?? '', $s['guardian_phone_2'] ?? ''] as $p) {
        $p = trim((string)$p);
        if ($p !== '') $out[] = $p;
    }
    return $out;
};

// Outstanding balance per student (current term) → defaulters.
$invoices = Supabase::fetchAllPaged(function ($_sb) use ($sid, $currentTermId) {
    $q = $_sb->from('invoices')->select('student_id,amount,paid_amount,status')
        ->eq('school_id', $sid)->neq('status', 'cancelled');
    if ($currentTermId) $q = $q->eq('term_id', $currentTermId);
    return $q;
});
$balByStu = [];
foreach ($invoices as $iv) {
    if (($iv['status'] ?? '') === 'draft') continue;
    $bal = (float)($iv['amount'] ?? 0) - (float)($iv['paid_amount'] ?? 0);
    if ($bal <= 0) continue;
    $balByStu[$iv['student_id']] = ($balByStu[$iv['student_id']] ?? 0) + $bal;
}

// Helper: the learners a selection targets.
// $picked = explicit student ids (individual send), used when $sel === 'selected'.
$studentsFor = function (string $sel, array $picked = []) use ($students, $balByStu, $phonesOf): array {
    $out = [];
    foreach ($students as $s) {
        if (!$phonesOf($s)) continue;
        $match = false;
        if ($sel === 'all') {
            $match = true;
        } elseif ($sel === 'defaulters') {
            $match = ($balByStu[$s['id']] ?? 0) > 0;
        } elseif ($sel === 'selected') {
            $match = in_array($s['id'], $picked, true);
        } elseif (strpos($sel, 'class:') === 0) {
            $match = ($s['current_class_id'] ?? '') === substr($sel, 6);
        }
        if ($match) $out[] = $s;
    }
    return $out;
};

// Counts. We track the WHOLE roster per class as well as who is reachable, so
// a class is never hidden just because nobody has a phone on file — that gap
// is exactly what the office needs to see and fix.
$countAll = 0; $countDef = 0; $countByClass = []; $rosterByClass = []; $noPhone = 0;
foreach ($students as $s) {
    $cid = $s['current_class_id'] ?? '';
    if ($cid) $rosterByClass[$cid] = ($rosterByClass[$cid] ?? 0) + 1;
    if (!$phonesOf($s)) { $noPhone++; continue; }
    $countAll++;
    if (($balByStu[$s['id']] ?? 0) > 0) $countDef++;
    if ($cid) $countByClass[$cid] = ($countByClass[$cid] ?? 0) + 1;
}

// Searchable list for the individual picker. Carries the class id so the
// picker can be narrowed by class — essential once a school has hundreds.
$pickList = [];
foreach ($students as $s) {
    $n = count($phonesOf($s));
    if ($n === 0) continue;
    $name = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''));
    $pickList[] = [
        'id'      => $s['id'],
        'name'    => $name,
        'adm'     => (string)($s['admission_number'] ?? ''),
        'classId' => (string)($s['current_class_id'] ?? ''),
        'class'   => $classMap[$s['current_class_id'] ?? ''] ?? '',
        'g'       => trim((string)($s['guardian_name'] ?? '')),
        'n'       => $n,
    ];
}
usort($pickList, fn($a, $b) => strcasecmp($a['name'], $b['name']));

// ── Send ─────────────────────────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $sel = trim((string)input('recipients'));
    $msg = trim((string)($_POST['message'] ?? ''));

    if (!smsConfigured()) {
        flash('error', 'SMS is not set up yet. Configure a provider in Settings → SMS first.');
    } elseif ($msg === '') {
        flash('error', 'Type a message before sending.');
    } elseif ($sel === '') {
        flash('error', 'Choose who to send to.');
    } else {
        $picked = array_values(array_filter((array)($_POST['student_ids'] ?? [])));
        if ($sel === 'selected' && empty($picked)) {
            flash('error', 'Pick at least one learner to message.');
            redirect('communications/sms');
        }
        // Build one message per guardian, filling the placeholders from that
        // learner's own record — so {balance} is the family's real figure.
        $targets = $studentsFor($sel, $picked);
        $items = [];
        foreach ($targets as $s) {
            $bal  = (float)($balByStu[$s['id']] ?? 0);
            $body = strtr($msg, [
                '{name}'    => trim((string)($s['first_name'] ?? '')),
                '{student}' => trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? '')),
                '{balance}' => money($bal),
                '{class}'   => $classMap[$s['current_class_id'] ?? ''] ?? '',
                '{adm}'     => (string)($s['admission_number'] ?? ''),
                '{school}'  => (string)schoolSetting('school_name', ''),
            ]);
            foreach ($phonesOf($s) as $ph) $items[] = ['phone' => $ph, 'message' => $body];
        }
        // A whole-school send is hundreds of numbers = dozens of sequential API
        // calls. Shared hosting defaults (30s) would abort mid-send and lose the
        // result, so give the request room to finish.
        @set_time_limit(600);

        $phones = array_column($items, 'phone');
        if (empty($phones)) {
            flash('error', 'No guardians with a phone number match that selection.');
        } else {
            $r = smsSendEach($items);
            auditLog('sms_send', 'broadcast', null, [
                'to' => $sel, 'sent' => $r['sent'], 'failed' => $r['failed'],
                'students' => $sel === 'selected' ? count($picked) : null,
            ]);
            if ($r['error']) {
                flash('error', 'Send failed: ' . $r['error']);
            } else {
                $note = $r['sent'] . ' SMS sent';
                if ($r['failed']  > 0) $note .= ', ' . $r['failed'] . ' failed';
                if ($r['invalid'] > 0) $note .= ', ' . $r['invalid'] . ' skipped (bad number)';
                flash($r['failed'] > 0 ? 'error' : 'success', $note . '.');
            }
        }
    }
    redirect('communications/sms');
}

// A set of learners handed over by the transport roster: pre-tick them,
// switch the audience to "Specific learners", and drop the draft in. One-shot.
$pre = $_SESSION['sms_preselect'] ?? null;
if ($pre) unset($_SESSION['sms_preselect']);
$preIds   = array_values(array_filter((array)($pre['ids'] ?? [])));
$preLabel = (string)($pre['label'] ?? '');
$preDraft = (string)($pre['draft'] ?? '');

require __DIR__ . '/../../includes/layout-top.php';
$configured = smsConfigured();
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Send SMS</h1>
    <p class="text-sm text-gray-500 mt-1">Message guardians directly — fee reminders, alerts, announcements.</p>
</div>

<?php if ($preIds): ?>
<div class="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-900 flex items-center justify-between gap-3">
    <span><strong><?= count($preIds) ?> learner(s)</strong> brought over from the transport roster<?= $preLabel ? ' — ' . e($preLabel) : '' ?>. They are ticked below; check the list, then send.</span>
    <a href="<?= baseUrl('transport/roster') ?>" class="text-xs font-medium underline shrink-0">Back to roster</a>
</div>
<?php endif; ?>
<?php if (!$configured): ?>
<div class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
    <strong>SMS isn't set up yet.</strong> Add your provider's API key and sender ID in
    <a href="<?= baseUrl('settings?tab=sms') ?>" class="underline font-medium">Settings → SMS</a>.
    You can compose here, but sending is disabled until then.
</div>
<?php endif; ?>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <form method="POST" onsubmit="return confirmSend()">
            <?= csrfField() ?>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Send to</label>
                <input type="hidden" name="recipients" id="recipients" value="all">

                <!-- Three primary audiences, always visible -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button type="button" data-r="all" onclick="pickAudience(this)"
                        class="aud text-left px-3 py-2.5 rounded-lg border text-sm transition">
                        <span class="block font-medium text-gray-900">All guardians</span>
                        <span class="block text-[11px] text-gray-500"><?= $countAll ?> learners</span>
                    </button>
                    <button type="button" data-r="defaulters" onclick="pickAudience(this)"
                        class="aud text-left px-3 py-2.5 rounded-lg border text-sm transition">
                        <span class="block font-medium text-gray-900">Fee defaulters</span>
                        <span class="block text-[11px] text-gray-500"><?= $countDef ?> owe a balance</span>
                    </button>
                    <button type="button" data-r="selected" onclick="pickAudience(this)"
                        class="aud text-left px-3 py-2.5 rounded-lg border text-sm transition">
                        <span class="block font-medium text-gray-900">Specific learners</span>
                        <span class="block text-[11px] text-gray-500">choose below</span>
                    </button>
                </div>

                <!-- Every class is listed. A class with no reachable guardians is
                     shown greyed with a reason, never hidden — otherwise staff
                     assume the class is missing from the system. -->
                <?php if (!empty($classMap)): ?>
                <div class="mt-3">
                    <p class="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Or one class</p>
                    <div class="flex flex-wrap gap-1.5">
                        <?php foreach ($classMap as $cid => $cname):
                            $reach  = (int)($countByClass[$cid] ?? 0);
                            $roster = (int)($rosterByClass[$cid] ?? 0);
                            if ($roster === 0) continue;             // genuinely empty class
                        ?>
                            <?php if ($reach === 0): ?>
                                <span title="No guardian phone numbers on file for this class"
                                    class="px-2.5 py-1 rounded-full border border-gray-100 bg-gray-50 text-xs text-gray-400 cursor-not-allowed">
                                    <?= e($cname) ?> <span class="text-gray-300">· no numbers</span>
                                </span>
                            <?php else: ?>
                                <button type="button" data-r="class:<?= e($cid) ?>" onclick="pickAudience(this)"
                                    title="<?= $reach ?> of <?= $roster ?> learners have a guardian phone"
                                    class="aud px-2.5 py-1 rounded-full border text-xs transition">
                                    <?= e($cname) ?>
                                    <span class="text-gray-400">(<?= $reach ?><?= $reach < $roster ? '/' . $roster : '' ?>)</span>
                                </button>
                            <?php endif; ?>
                        <?php endforeach; ?>
                    </div>
                    <?php if ($noPhone > 0): ?>
                        <p class="text-[11px] text-amber-700 mt-2">
                            <?= $noPhone ?> learner<?= $noPhone === 1 ? '' : 's' ?> can't be reached — no guardian phone on file.
                            <a href="<?= baseUrl('students') ?>" class="underline font-medium">Add numbers in Students</a>
                        </p>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
            </div>

            <!-- Individual picker: search by name / admission no, tick one or many -->
            <div id="pickBox" class="mb-4 hidden">
                <div class="flex items-center justify-between mb-1">
                    <label class="block text-sm font-medium text-gray-700">Choose learners</label>
                    <span class="text-[11px] text-gray-500"><span id="pickCount">0</span> selected</span>
                </div>
                <div class="flex gap-2 mb-2">
                    <input type="text" id="pickSearch" oninput="pickFilter()" placeholder="Search name or admission number…"
                        class="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <select id="pickClass" onchange="pickFilter()"
                        class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">All classes</option>
                        <?php foreach ($classMap as $cid => $cname): if (empty($countByClass[$cid])) continue; ?>
                            <option value="<?= e($cid) ?>"><?= e($cname) ?> (<?= (int)$countByClass[$cid] ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="flex items-center gap-3 mb-2 text-[11px]">
                    <button type="button" onclick="pickAll(true)" class="text-emerald-700 hover:underline font-medium">Select all shown</button>
                    <button type="button" onclick="pickAll(false)" class="text-gray-500 hover:underline">Clear selection</button>
                    <span class="text-gray-400" id="pickShown"></span>
                </div>
                <div class="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
                    <?php foreach ($pickList as $p): ?>
                    <label class="pickrow flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                           data-c="<?= e($p['classId']) ?>"
                           data-s="<?= e(strtolower($p['name'] . ' ' . $p['adm'] . ' ' . $p['class'] . ' ' . $p['g'])) ?>">
                        <input type="checkbox" name="student_ids[]" value="<?= e($p['id']) ?>" onchange="pickCount()"
                               class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                        <span class="min-w-0 flex-1">
                            <span class="block text-sm text-gray-900 truncate"><?= e($p['name']) ?></span>
                            <span class="block text-[11px] text-gray-400 truncate">
                                <?= e($p['adm']) ?><?= $p['class'] !== '' ? ' · ' . e($p['class']) : '' ?><?= $p['g'] !== '' ? ' · ' . e($p['g']) : '' ?><?= $p['n'] > 1 ? ' · 2 contacts' : '' ?>
                            </span>
                        </span>
                    </label>
                    <?php endforeach; ?>
                    <?php if (empty($pickList)): ?>
                        <div class="px-3 py-6 text-center text-sm text-gray-400">No learners have a guardian phone number yet.</div>
                    <?php endif; ?>
                </div>
                <p class="text-[11px] text-gray-400 mt-1">Tick one learner to message a single family, or several for a custom group.</p>
            </div>
            <div class="mb-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea name="message" id="message" rows="5" maxlength="640" oninput="updateCount()" placeholder="e.g. Dear parent, kindly clear the outstanding fee balance before end of week. Thank you — Utawala Springs Academy." class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></textarea>
                <div class="flex items-center justify-between mt-1">
                    <p class="text-[11px] text-gray-400"><span id="charCount">0</span> chars · <span id="segCount">1</span> SMS each<span id="tagNote" class="hidden text-amber-600"> · length varies once names/amounts fill in</span></p>
                    <p class="text-[11px] text-gray-400">Avoid special characters to keep it 1 SMS (160 chars).</p>
                </div>
            </div>
            <button type="submit" id="sendBtn" <?= $configured ? '' : 'disabled' ?> class="mt-3 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed <?= $configured ? '' : 'opacity-50 cursor-not-allowed' ?>">
                Send SMS
            </button>
        </form>
    </div>

    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
        <h3 class="text-sm font-semibold text-gray-700 mb-3">Quick templates</h3>
        <div class="space-y-2">
            <button type="button" onclick="setMsg(this)" data-t="Dear parent, the fee balance for {student} is {balance}. Kindly clear it at your earliest convenience. Thank you." class="w-full text-left text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">Fee balance reminder</button>
            <button type="button" onclick="setMsg(this)" data-t="Reminder: this term's fees for {student} are due — outstanding balance {balance}. Please pay via the usual paybill. Thank you." class="w-full text-left text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">Term fees due</button>
            <button type="button" onclick="setMsg(this)" data-t="Dear parent, please note the school will be closed on [DATE]. Kindly make appropriate arrangements. Thank you." class="w-full text-left text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">Closure / holiday notice</button>
        </div>

        <!-- Placeholders: filled per family at send time. -->
        <div class="mt-4 pt-4 border-t border-gray-100">
            <p class="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">Personalise</p>
            <div class="flex flex-wrap gap-1">
                <?php foreach ([
                    '{student}' => "child's full name",
                    '{name}'    => 'first name',
                    '{balance}' => 'their fee balance',
                    '{class}'   => 'their class',
                    '{adm}'     => 'admission no.',
                    '{school}'  => 'school name',
                ] as $tag => $desc): ?>
                    <button type="button" onclick="insertTag('<?= e($tag) ?>')" title="<?= e($desc) ?>"
                        class="px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-[11px] font-mono text-gray-600 hover:bg-emerald-50 hover:border-emerald-300"><?= e($tag) ?></button>
                <?php endforeach; ?>
            </div>
            <p class="text-[11px] text-gray-400 mt-2">Each guardian receives their own figures — <span class="font-mono">{balance}</span> becomes that family's actual amount.</p>
        </div>

        <p class="text-[11px] text-gray-400 mt-4">Guardians without a phone number are skipped automatically.</p>
    </div>
</div>

<script>
function updateCount() {
    var el = document.getElementById('message');
    var n = el.value.length;
    document.getElementById('charCount').textContent = n;
    document.getElementById('segCount').textContent = Math.max(1, Math.ceil(n / 160));
    document.getElementById('tagNote').classList.toggle('hidden', !/\{\w+\}/.test(el.value));
}
function setMsg(btn) {
    document.getElementById('message').value = btn.getAttribute('data-t');
    updateCount();
}
var AUD_ON  = 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200';
var AUD_OFF = 'border-gray-200 bg-white hover:bg-gray-50';
function pickAudience(btn) {
    document.getElementById('recipients').value = btn.dataset.r;
    document.querySelectorAll('.aud').forEach(function (b) {
        var on = b === btn;
        AUD_ON.split(' ').forEach(c => b.classList.toggle(c, on));
        AUD_OFF.split(' ').forEach(c => b.classList.toggle(c, !on));
    });
    pickToggle();
}
function pickToggle() {
    var on = document.getElementById('recipients').value === 'selected';
    document.getElementById('pickBox').classList.toggle('hidden', !on);
}
// Paint the default selection on load and prime the picker counts.
(function () {
    var PRE = <?= jsonHtml($preIds) ?>;
    var first = document.querySelector('.aud[data-r="' + (PRE.length ? 'selected' : 'all') + '"]');
    if (first) pickAudience(first);
    if (PRE.length) {
        var want = {}; PRE.forEach(function (id) { want[id] = true; });
        document.querySelectorAll('#pickBox input[type=checkbox]').forEach(function (cb) { cb.checked = !!want[cb.value]; });
        var m = document.getElementById('message');
        if (m && !m.value) { m.value = <?= jsonHtml($preDraft) ?>; if (typeof updateCount === 'function') updateCount(); }
        pickCount();
    }
    if (document.getElementById('pickSearch')) pickFilter();
})();
function pickCount() {
    var n = document.querySelectorAll('#pickBox input[type=checkbox]:checked').length;
    document.getElementById('pickCount').textContent = n;
}
function pickFilter() {
    var q  = document.getElementById('pickSearch').value.trim().toLowerCase();
    var cf = document.getElementById('pickClass').value;
    var shown = 0;
    document.querySelectorAll('.pickrow').forEach(function (row) {
        var okText  = q === '' || row.dataset.s.indexOf(q) > -1;
        var okClass = cf === '' || row.dataset.c === cf;
        var show = okText && okClass;
        row.classList.toggle('hidden', !show);
        if (show) shown++;
    });
    document.getElementById('pickShown').textContent = shown + ' shown';
}
// Bulk-tick everything currently visible — the fast path for "this class".
function pickAll(on) {
    document.querySelectorAll('.pickrow').forEach(function (row) {
        if (on && row.classList.contains('hidden')) return;
        var cb = row.querySelector('input[type=checkbox]');
        if (cb) cb.checked = on;
    });
    pickCount();
}
function insertTag(tag) {
    var el = document.getElementById('message');
    var s = el.selectionStart || el.value.length, e = el.selectionEnd || s;
    el.value = el.value.slice(0, s) + tag + el.value.slice(e);
    el.focus();
    el.selectionStart = el.selectionEnd = s + tag.length;
    updateCount();
}
function confirmSend() {
    var val = document.getElementById('recipients').value;
    var btn = document.querySelector('.aud[data-r="' + val + '"]');
    var label = btn ? btn.textContent.trim().replace(/\s+/g, ' ') : val;
    if (val === 'selected') {
        var n = document.querySelectorAll('#pickBox input[type=checkbox]:checked').length;
        if (n === 0) { alert('Pick at least one learner first.'); return false; }
        label = n + ' selected learner' + (n === 1 ? '' : 's');
    }
    var warn = '\n\nThis will use SMS credits.';
    // A large send takes a while — tell them rather than let it look frozen.
    var m = label.match(/(\d+)/);
    if (m && parseInt(m[1], 10) >= 100) {
        warn += '\nLarge send — keep this page open until it finishes.';
    }
    var btnEl = document.getElementById('sendBtn');
    var ok = confirm('Send this SMS to: ' + label + '?' + warn);
    if (ok && btnEl) { btnEl.disabled = true; btnEl.textContent = 'Sending…'; }
    return ok;
}
pickToggle();
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
