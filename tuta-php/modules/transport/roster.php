<?php
/**
 * Transport roster — who is on which bus, and reach their parents.
 *
 * Two questions this exists to answer, both urgent when they come:
 *   "The bus has broken down — message everyone on it."
 *   "Half the route has been collected — message the ones still waiting."
 *
 * The children are grouped bus → route → zone, each with the guardian number
 * to dial. Tick a zone, a route, a bus, or individuals, then hand the set to
 * SMS or WhatsApp. No new messaging machinery: the SMS composer already takes
 * a list of learners, so the roster just fills it.
 *
 * Reads through transport_roster() (migration 131) — one call for the page.
 */
$pageTitle = 'Transport roster';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

if (!userCan('services.manage') && !userCan('comms.send')) {
    flash('error', 'You do not have permission to view the transport roster.');
    redirect('transport');
}

require_once __DIR__ . '/../../includes/whatsapp.php';

$busId    = (string)input('bus_id');
$routeId  = (string)input('route_id');
$dir      = in_array(input('direction'), ['morning', 'evening'], true) ? input('direction') : '';

// ── Actions on a ticked set ───────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $action = input('action');
    $ids    = array_values(array_filter((array)($_POST['student_ids'] ?? [])));
    $back   = 'transport/roster?bus_id=' . urlencode($busId) . '&route_id=' . urlencode($routeId) . '&direction=' . urlencode($dir);

    if (!$ids) {
        flash('error', 'Tick at least one learner first.');
        redirect($back);
    }

    // Pin the ticked children to a zone — how zones get filled in bulk.
    if ($action === 'set_zone' && userCan('services.manage')) {
        $zoneId = input('zone_id') ?: null;
        $r = $sb->from('student_transport')->eq('school_id', $sid)->eq('is_active', 'true')
            ->in('student_id', $ids)->update(['zone_id' => $zoneId, 'updated_at' => date('c')]);
        if (empty($r['error'])) auditLog('set_zone', 'student_transport', $zoneId, ['learners' => count($ids)]);
        flash(empty($r['error']) ? 'success' : 'error', empty($r['error'])
            ? count($ids) . ' learner(s) ' . ($zoneId ? 'given that pickup point.' : 'had their pickup point cleared.')
            : $r['error']);
        redirect($back);
    }

    // Hand the set to the SMS composer with these learners pre-ticked.
    if ($action === 'to_sms') {
        $_SESSION['sms_preselect'] = [
            'ids'   => $ids,
            'label' => trim((string)input('context_label')),
            'draft' => trim((string)input('draft')),
        ];
        redirect('communications/sms');
    }

    // WhatsApp straight from here. Free text only lands inside a parent's
    // 24-hour window; the rest are reported so they can go by SMS instead.
    if ($action === 'to_whatsapp' && userCan('comms.send')) {
        $text = trim((string)input('wa_text'));
        if ($text === '') { flash('error', 'Type the WhatsApp message first.'); redirect($back); }
        if (!whatsappConfigured()) { flash('error', 'WhatsApp is not set up yet — Settings → WhatsApp.'); redirect($back); }
        whatsappSchoolContext($sid);
        $ro = $sb->rpc('transport_roster', ['p_school_id' => $sid])['data'] ?? [];
        $phoneOf = [];
        foreach ((array)($ro['students'] ?? []) as $s) if (!empty($s['guardian_phone'])) $phoneOf[$s['student_id']] = $s['guardian_phone'];
        $sent = 0; $failed = 0; $seen = [];
        foreach ($ids as $id) {
            $ph = whatsappNormalizePhone((string)($phoneOf[$id] ?? ''));
            if ($ph === '' || isset($seen[$ph])) continue;
            $seen[$ph] = true;
            $r = whatsappSendFreeText($ph, $text);
            if (!empty($r['ok'])) $sent++; else $failed++;
        }
        auditLog('whatsapp_send', 'transport_roster', null, ['learners' => count($ids), 'sent' => $sent, 'failed' => $failed]);
        $note = "$sent WhatsApp message(s) accepted";
        if ($failed) $note .= ", $failed could not be delivered — usually a parent who has not messaged the school in the last 24 hours. Send those by SMS.";
        flash($failed && !$sent ? 'error' : 'success', $note . '.');
        redirect($back);
    }

    redirect($back);
}

// ── The roster ────────────────────────────────────────────────────
$ro = $sb->rpc('transport_roster', [
    'p_school_id'  => $sid,
    'p_vehicle_id' => $busId ?: null,
    'p_route_id'   => $routeId ?: null,
    'p_direction'  => $dir ?: null,
])['data'] ?? [];

$buses      = (array)($ro['vehicles'] ?? []);
$unassigned = (array)($ro['unassigned_routes'] ?? []);
$students   = (array)($ro['students'] ?? []);
$total      = (int)($ro['total'] ?? 0);
$reachable  = (int)($ro['reachable'] ?? 0);

$busMap = []; foreach ($buses as $b) $busMap[$b['id']] = $b;
$bus    = $busId !== '' ? ($busMap[$busId] ?? null) : null;

// All routes and zones for the filter and the zone picker.
$routes = $sb->from('transport_routes')->select('id,name,vehicle_id')->eq('school_id', $sid)
    ->eq('is_active', 'true')->order('name')->execute()['data'] ?? [];
$zones  = $sb->from('transport_zones')->select('id,route_id,name,sequence')->eq('school_id', $sid)
    ->eq('is_active', 'true')->order('sequence')->execute()['data'] ?? [];
$zonesByRoute = []; foreach ($zones as $z) $zonesByRoute[$z['route_id']][] = $z;

// Group route → zone, preserving the run order the function already sorted by.
$groups = [];
foreach ($students as $s) {
    $rk = $s['route_id'];
    $zk = $s['zone_id'] ?: '';
    $groups[$rk]['name']  = $s['route_name'];
    $groups[$rk]['bus']   = $s['vehicle_label'] ?? null;
    $groups[$rk]['zones'][$zk]['name'] = $s['zone_name'] ?: 'No pickup point set';
    $groups[$rk]['zones'][$zk]['seq']  = (int)($s['zone_seq'] ?? 999);
    $groups[$rk]['zones'][$zk]['rows'][] = $s;
}

$label = $bus ? $bus['label'] : ($routeId ? (array_values(array_filter($routes, fn($r) => $r['id'] === $routeId))[0]['name'] ?? 'Route') : 'All riders');
if ($dir) $label .= ' · ' . ucfirst($dir) . ' run';

require __DIR__ . '/../../includes/layout-top.php';
$f = 'px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none bg-white';
?>

<div class="mb-5 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <a href="<?= baseUrl('transport') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Transport</a>
        <h1 class="text-2xl font-bold text-gray-900 mt-2">Transport roster</h1>
        <p class="text-sm text-gray-500 mt-1">Who is on which bus, and the number to reach their parent. Tick, then message.</p>
    </div>
    <a href="<?= baseUrl('transport/buses') ?>" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50">Buses &amp; pickup points</a>
</div>

<!-- Filter -->
<form method="GET" action="<?= baseUrl('transport/roster') ?>" class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-wrap items-end gap-3">
    <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Bus</label>
        <select name="bus_id" class="<?= $f ?> min-w-[11rem]" onchange="this.form.submit()">
            <option value="">All buses</option>
            <?php foreach ($buses as $b): ?>
                <option value="<?= e($b['id']) ?>" <?= $busId === $b['id'] ? 'selected' : '' ?>><?= e($b['label']) ?> — <?= (int)$b['riders'] ?> riders</option>
            <?php endforeach; ?>
        </select>
    </div>
    <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Route</label>
        <select name="route_id" class="<?= $f ?> min-w-[11rem]" onchange="this.form.submit()">
            <option value="">All routes</option>
            <?php foreach ($routes as $r): if ($busId && ($r['vehicle_id'] ?? '') !== $busId) continue; ?>
                <option value="<?= e($r['id']) ?>" <?= $routeId === $r['id'] ? 'selected' : '' ?>><?= e($r['name']) ?></option>
            <?php endforeach; ?>
        </select>
    </div>
    <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Run</label>
        <select name="direction" class="<?= $f ?>" onchange="this.form.submit()">
            <option value="">Both</option>
            <option value="morning" <?= $dir === 'morning' ? 'selected' : '' ?>>Morning pickup</option>
            <option value="evening" <?= $dir === 'evening' ? 'selected' : '' ?>>Evening drop</option>
        </select>
    </div>
    <div class="ml-auto text-sm text-gray-600 self-center">
        <strong class="text-gray-900"><?= $total ?></strong> riders · <strong class="text-gray-900"><?= $reachable ?></strong> reachable
        <?php if ($total > $reachable): ?><span class="text-amber-600">· <?= $total - $reachable ?> with no number</span><?php endif; ?>
    </div>
</form>

<?php if ($bus): ?>
<!-- The first thing the office does is call the driver. -->
<div class="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
    <span class="font-semibold text-amber-900"><?= e($bus['label']) ?><?= $bus['plate'] ? ' · ' . e($bus['plate']) : '' ?></span>
    <?php if ($bus['driver_name'] || $bus['driver_phone']): ?>
        <span class="text-amber-800">Driver <?= e($bus['driver_name'] ?: '') ?> <?= $bus['driver_phone'] ? '<a class="font-semibold underline" href="tel:' . e($bus['driver_phone']) . '">' . e($bus['driver_phone']) . '</a>' : '' ?></span>
    <?php endif; ?>
    <?php if ($bus['conductor_name'] || $bus['conductor_phone']): ?>
        <span class="text-amber-800">Matron <?= e($bus['conductor_name'] ?: '') ?> <?= $bus['conductor_phone'] ? '<a class="font-semibold underline" href="tel:' . e($bus['conductor_phone']) . '">' . e($bus['conductor_phone']) . '</a>' : '' ?></span>
    <?php endif; ?>
</div>
<?php endif; ?>

<?php if ($unassigned && !$busId && !$routeId): ?>
<div class="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 mb-4 text-sm text-gray-600">
    <?= count($unassigned) ?> route(s) have no bus yet: <?= e(implode(', ', array_column($unassigned, 'name'))) ?>.
    <a href="<?= baseUrl('transport/buses') ?>" class="text-emerald-600 font-medium">Assign them</a> to group by bus.
</div>
<?php endif; ?>

<form method="POST" id="rosterForm">
    <?= csrfField() ?>
    <input type="hidden" name="action" id="rosterAction" value="">
    <input type="hidden" name="context_label" value="<?= e($label) ?>">
    <input type="hidden" name="draft" id="draftField" value="">
    <input type="hidden" name="wa_text" id="waField" value="">
    <input type="hidden" name="zone_id" id="zoneField" value="">

    <?php if (!$students): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 text-sm">No riders match this selection.</div>
    <?php endif; ?>

    <?php foreach ($groups as $rid => $g):
        uasort($g['zones'], fn($a, $b) => $a['seq'] <=> $b['seq']);
        $n = 0; foreach ($g['zones'] as $z) $n += count($z['rows']); ?>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4 overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50/60">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" class="w-4 h-4 rounded border-gray-300 text-emerald-600 grp" data-grp="r-<?= e($rid) ?>" onchange="tickGroup(this)">
                <span class="text-sm font-bold text-gray-900"><?= e($g['name']) ?></span>
            </label>
            <span class="text-xs text-gray-500"><?= $g['bus'] ? e($g['bus']) . ' · ' : '' ?><?= $n ?> riders</span>
        </div>
        <?php foreach ($g['zones'] as $zk => $z): ?>
        <div class="px-5 py-2 border-b border-gray-50 flex items-center gap-3 <?= $zk === '' ? 'bg-amber-50/40' : '' ?>">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" class="w-4 h-4 rounded border-gray-300 text-emerald-600 grp" data-grp="z-<?= e($rid . '-' . $zk) ?>" data-parent="r-<?= e($rid) ?>" onchange="tickGroup(this)">
                <span class="text-xs font-semibold uppercase tracking-wide <?= $zk === '' ? 'text-amber-700' : 'text-gray-600' ?>"><?= e($z['name']) ?></span>
            </label>
            <span class="text-xs text-gray-400"><?= count($z['rows']) ?></span>
        </div>
        <table class="w-full text-sm">
            <tbody class="divide-y divide-gray-50">
            <?php foreach ($z['rows'] as $s): ?>
                <tr class="hover:bg-gray-50/50">
                    <td class="pl-5 pr-2 py-2 w-10">
                        <input type="checkbox" name="student_ids[]" value="<?= e($s['student_id']) ?>"
                               class="w-4 h-4 rounded border-gray-300 text-emerald-600 rider r-<?= e($rid) ?> z-<?= e($rid . '-' . $zk) ?>"
                               onchange="recount()">
                    </td>
                    <td class="py-2 font-medium text-gray-900"><?= e($s['student_name']) ?></td>
                    <td class="py-2 text-gray-500"><?= e($s['class_name'] ?: '—') ?></td>
                    <td class="py-2 text-gray-500"><?= e($s['guardian_name'] ?: '—') ?></td>
                    <td class="py-2 pr-5 text-right">
                        <?php if (!empty($s['guardian_phone'])): ?>
                            <a href="tel:<?= e($s['guardian_phone']) ?>" class="text-emerald-600 font-mono text-xs"><?= e($s['guardian_phone']) ?></a>
                        <?php else: ?>
                            <span class="text-xs text-amber-600">no number</span>
                        <?php endif; ?>
                        <?php if (($s['transport_type'] ?? 'both') !== 'both'): ?>
                            <span class="ml-2 text-[10px] uppercase tracking-wide text-gray-400"><?= e($s['transport_type']) ?> only</span>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        <?php endforeach; ?>
    </div>
    <?php endforeach; ?>
</form>

<!-- Sticky action bar -->
<div id="bar" class="hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
    <div class="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <span class="text-sm text-gray-700"><strong id="cnt">0</strong> selected</span>
        <button type="button" onclick="clearAll()" class="text-xs text-gray-500 hover:text-gray-800">Clear</button>
        <div class="ml-auto flex flex-wrap gap-2">
            <?php if (userCan('services.manage') && $zones): ?>
            <select id="zonePick" class="<?= $f ?> text-xs">
                <option value="">Set pickup point…</option>
                <?php foreach ($routes as $r): if (empty($zonesByRoute[$r['id']])) continue; ?>
                    <optgroup label="<?= e($r['name']) ?>">
                        <?php foreach ($zonesByRoute[$r['id']] as $z): ?><option value="<?= e($z['id']) ?>"><?= e($z['name']) ?></option><?php endforeach; ?>
                    </optgroup>
                <?php endforeach; ?>
                <option value="__none">— Clear pickup point —</option>
            </select>
            <button type="button" onclick="setZone()" class="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Apply</button>
            <?php endif; ?>
            <?php if (userCan('comms.send')): ?>
            <button type="button" onclick="openMsg('sms')" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Message by SMS</button>
            <button type="button" onclick="openMsg('wa')" class="px-4 py-2 text-sm font-semibold text-white bg-[#25D366] rounded-lg hover:opacity-90">Message by WhatsApp</button>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- Message dialog -->
<div id="msgModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(17,24,20,.45)" onclick="if(event.target===this) closeMsg()">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-lg" role="dialog" aria-modal="true">
    <div class="px-5 py-4 border-b border-gray-100">
        <h3 class="text-base font-bold text-gray-900" id="msgTitle">Message parents</h3>
        <p class="text-xs text-gray-500 mt-0.5"><span id="msgCnt">0</span> learners · <?= e($label) ?></p>
    </div>
    <div class="px-5 py-4 space-y-3">
        <div class="flex flex-wrap gap-1.5">
            <button type="button" class="tpl px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50" data-t="Dear parent, <?= e(schoolSetting('school_name', 'the school')) ?> bus <?= $bus ? e($bus['label']) : '' ?> has been delayed this morning. Your child will be collected shortly. We are sorry for the inconvenience.">Bus delayed</button>
            <button type="button" class="tpl px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50" data-t="Dear parent, the <?= $bus ? e($bus['label']) : 'school bus' ?> has developed a mechanical problem. Please make alternative arrangements for your child today. We apologise.">Breakdown</button>
            <button type="button" class="tpl px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50" data-t="Dear parent, the bus was unable to collect your child this morning. Kindly bring them to school or call the office. We apologise.">Not collected</button>
            <button type="button" class="tpl px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50" data-t="Dear parent, the evening bus will leave school late today at [TIME]. Please expect your child accordingly.">Late departure</button>
        </div>
        <textarea id="msgText" rows="4" maxlength="480" class="w-full <?= $f ?>" placeholder="Type the message parents will receive…"></textarea>
        <p class="text-xs text-gray-500" id="msgHint"></p>
    </div>
    <div class="px-5 py-4 bg-gray-50 flex justify-end gap-2">
        <button type="button" onclick="closeMsg()" class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-white">Cancel</button>
        <button type="button" id="msgGo" onclick="sendMsg()" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Continue</button>
    </div>
  </div>
</div>

<script>
var channel = 'sms';
function riders(){ return Array.from(document.querySelectorAll('input.rider')); }
function recount(){
    var n = riders().filter(function(c){ return c.checked; }).length;
    document.getElementById('cnt').textContent = n;
    document.getElementById('bar').classList.toggle('hidden', n === 0);
    document.body.style.paddingBottom = n ? '72px' : '';
}
function tickGroup(box){
    var cls = box.getAttribute('data-grp');
    riders().forEach(function(c){ if (c.classList.contains(cls)) c.checked = box.checked; });
    // ticking a whole route ticks its zone headers too
    document.querySelectorAll('.grp[data-parent="' + cls + '"]').forEach(function(z){ z.checked = box.checked; });
    recount();
}
function clearAll(){ riders().forEach(function(c){ c.checked = false; }); document.querySelectorAll('.grp').forEach(function(g){ g.checked = false; }); recount(); }
function setZone(){
    var v = document.getElementById('zonePick').value; if (!v) return;
    document.getElementById('zoneField').value = v === '__none' ? '' : v;
    document.getElementById('rosterAction').value = 'set_zone';
    document.getElementById('rosterForm').submit();
}
function openMsg(ch){
    channel = ch;
    var n = riders().filter(function(c){ return c.checked; }).length; if (!n) return;
    document.getElementById('msgCnt').textContent = n;
    document.getElementById('msgTitle').textContent = ch === 'sms' ? 'Message by SMS' : 'Message by WhatsApp';
    document.getElementById('msgGo').textContent = ch === 'sms' ? 'Continue to SMS' : 'Send on WhatsApp';
    document.getElementById('msgHint').textContent = ch === 'sms'
        ? 'You will see the full recipient list on the SMS page before anything is sent.'
        : 'WhatsApp free text only reaches parents who have messaged the school in the last 24 hours. Anyone it cannot reach is reported so you can send them by SMS.';
    document.getElementById('msgModal').classList.remove('hidden');
    document.getElementById('msgText').focus();
}
function closeMsg(){ document.getElementById('msgModal').classList.add('hidden'); }
function sendMsg(){
    var t = document.getElementById('msgText').value.trim();
    if (channel === 'wa' && !t) { alert('Type the message first.'); return; }
    if (channel === 'wa' && !confirm('Send this on WhatsApp now to the selected parents?')) return;
    document.getElementById(channel === 'sms' ? 'draftField' : 'waField').value = t;
    document.getElementById('rosterAction').value = channel === 'sms' ? 'to_sms' : 'to_whatsapp';
    document.getElementById('rosterForm').submit();
}
document.querySelectorAll('.tpl').forEach(function(b){ b.addEventListener('click', function(){ document.getElementById('msgText').value = b.getAttribute('data-t'); }); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeMsg(); });
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
