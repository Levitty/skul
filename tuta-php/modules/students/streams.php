<?php
/**
 * Streams — sort a class's learners into its streams, in one sitting.
 *
 * The Sections page creates the streams (Grade 4 → Tiger, Lion). This page
 * puts children in them: a dropdown per learner, "fill the unassigned",
 * "share them out evenly", then one Save. Used after admission (new learners
 * arrive without a stream), after promotion (a whole grade moves and is
 * re-shuffled), and whenever a head teacher rebalances.
 *
 * Saves through assign_streams (mig. 142) so only this class's learners move
 * and every change is in the audit log.
 */
$pageTitle = 'Streams';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

if (!userCan('students.manage')) {
    flash('error', 'You do not have permission to sort learners into streams.');
    redirect('dashboard');
}

$classes  = cachedClasses();
$classMap = cachedClassMap();
$classId  = input('class');
if ($classId !== '' && !isset($classMap[$classId])) $classId = '';

$sections = $classes ? Supabase::fetchByChunkedIn(fn($q) => $q->from('sections')->select('id,class_id,name,capacity')->order('name'), 'class_id', array_column($classes, 'id')) : [];
$secByClass = []; foreach ($sections as $sec) $secByClass[$sec['class_id']][] = $sec;

// ── Create, rename, delete a stream — this is the one place for it ──
if (isPost() && verifyCsrf() && in_array(input('action'), ['add_stream', 'edit_stream', 'delete_stream'], true)) {
    $action = input('action');
    $cid = input('class_id') ?: $classId;
    if (!isset($classMap[$cid])) { flash('error', 'Pick a class first.'); redirect('students/streams'); }
    $name = mb_substr(trim((string)input('name')), 0, 40);
    $cap  = (int)input('capacity') ?: null;
    $mine = array_column($secByClass[$cid] ?? [], 'id');
    if ($action === 'add_stream') {
        if ($name === '') { flash('error', 'Give the stream a name — Tiger, North, A.'); redirect('students/streams?class=' . $cid); }
        foreach ($secByClass[$cid] ?? [] as $sec) if (strcasecmp($sec['name'], $name) === 0) { flash('error', $classMap[$cid] . ' already has a stream called ' . $sec['name'] . '.'); redirect('students/streams?class=' . $cid); }
        $r = $sb->from('sections')->insert(['class_id' => $cid, 'name' => $name, 'capacity' => $cap]);
        if (!empty($r['error'])) flash('error', 'Could not add the stream: ' . $r['error']);
        else { auditLog('create', 'section', $r['data'][0]['id'] ?? null, ['class_id' => $cid, 'name' => $name]); flash('success', $classMap[$cid] . ' · ' . $name . ' added. Now sort learners into it below.'); }
        redirect('students/streams?class=' . $cid);
    }
    $secId = input('section_id');
    if (!in_array($secId, $mine, true)) { flash('error', 'That stream is not in this class.'); redirect('students/streams?class=' . $cid); }
    if ($action === 'edit_stream') {
        if ($name === '') { flash('error', 'A stream needs a name.'); redirect('students/streams?class=' . $cid); }
        $r = $sb->from('sections')->eq('id', $secId)->update(['name' => $name, 'capacity' => $cap, 'updated_at' => date('c')]);
        flash(empty($r['error']) ? 'success' : 'error', empty($r['error']) ? 'Stream updated.' : 'Could not update: ' . $r['error']);
        redirect('students/streams?class=' . $cid);
    }
    if ($action === 'delete_stream') {
        $has = $sb->from('students')->select('id')->eq('school_id', $sid)->eq('section_id', $secId)->eq('status', 'active')->limit(1)->execute()['data'] ?? [];
        if ($has) { flash('error', 'That stream still has learners. Move them to another stream first.'); redirect('students/streams?class=' . $cid); }
        $r = $sb->from('sections')->eq('id', $secId)->delete();
        flash(empty($r['error']) ? 'success' : 'error', empty($r['error']) ? 'Stream removed.' : 'Could not remove: ' . $r['error']);
        redirect('students/streams?class=' . $cid);
    }
}

if (isPost() && verifyCsrf() && input('action') === 'save' && $classId !== '') {
    $assign = [];
    foreach ((array)($_POST['sec'] ?? []) as $stuId => $secId) {
        if (!is_string($stuId) || !preg_match('/^[0-9a-f-]{36}$/i', $stuId)) continue;
        $assign[] = ['student_id' => $stuId, 'section_id' => ($secId !== '' && preg_match('/^[0-9a-f-]{36}$/i', (string)$secId)) ? (string)$secId : null];
    }
    $r = $sb->rpc('assign_streams', ['p_school_id' => $sid, 'p_class_id' => $classId, 'p_assignments' => $assign,
                                     'p_user_id' => $me['id'] ?? null, 'p_user_email' => $me['email'] ?? null]);
    $p = $r['data'] ?? null;
    if (!is_array($p) || empty($p['success'])) {
        $msg = is_array($p) ? ($p['error'] ?? 'Could not save.') : 'Could not save.';
        if (!is_array($p) && stripos((string)($r['error'] ?? ''), 'assign_streams') !== false) $msg = 'Migration 142 has not been run yet.';
        flash('error', $msg);
    } else {
        flash('success', (int)$p['moved'] . ' learner' . ((int)$p['moved'] === 1 ? '' : 's') . ' moved.' . ((int)$p['skipped'] ? ' ' . (int)$p['skipped'] . ' skipped.' : ''));
    }
    redirect('students/streams?class=' . $classId);
}

$learners = []; $secs = []; $counts = []; $unassigned = 0;
if ($classId !== '') {
    $secs = $secByClass[$classId] ?? [];
    $learners = Supabase::fetchAllPaged(fn($q) => $q->from('students')->select('id,first_name,last_name,admission_number,gender,section_id')
        ->eq('school_id', $sid)->eq('current_class_id', $classId)->eq('status', 'active')->order('first_name')) ?: [];
    foreach ($learners as $l) { if (!empty($l['section_id'])) $counts[$l['section_id']] = ($counts[$l['section_id']] ?? 0) + 1; else $unassigned++; }
}

// Enrolled + unassigned per class for the picker.
$enrolledAll = []; $unassignedAll = [];
foreach (Supabase::fetchAllPaged(fn($q) => $q->from('students')->select('current_class_id,section_id')->eq('school_id', $sid)->eq('status', 'active')) ?: [] as $st) {
    $cid = $st['current_class_id'] ?? '';
    $enrolledAll[$cid] = ($enrolledAll[$cid] ?? 0) + 1;
    if (empty($st['section_id']) && !empty($secByClass[$cid])) $unassignedAll[$cid] = ($unassignedAll[$cid] ?? 0) + 1;
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-5 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Streams</h1>
        <p class="text-sm text-gray-500 mt-1">Create a class's streams here and put each learner in one, so registers, mark sheets and report cards run by stream.</p>
    </div>
    <form method="GET" action="<?= baseUrl('students/streams') ?>" class="flex items-end gap-2">
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select name="class" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:border-emerald-400 outline-none min-w-[220px]">
                <option value="">Choose a class…</option>
                <?php foreach ($classes as $c): $n = (int)($enrolledAll[$c['id']] ?? 0); $u = (int)($unassignedAll[$c['id']] ?? 0); $ns = count($secByClass[$c['id']] ?? []); ?>
                    <option value="<?= e($c['id']) ?>"<?= $classId === $c['id'] ? ' selected' : '' ?>><?= e($c['name']) ?> — <?= $n ?> learners<?= $ns ? ', ' . $ns . ' streams' : ', no streams' ?><?= $u ? ', ' . $u . ' unsorted' : '' ?></option>
                <?php endforeach; ?>
            </select>
        </div>
    </form>
</div>

<?php if ($classId === ''): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 text-center text-sm text-gray-500">Pick a class above. Classes with unsorted learners say so in the list.</div>

<?php else: ?>
<!-- The class's streams: add one, rename, set capacity, remove an empty one -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 mb-4">
    <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 class="text-sm font-semibold text-gray-800"><?= e($classMap[$classId]) ?> · <?= count($secs) ?> stream<?= count($secs) === 1 ? '' : 's' ?></h2>
        <form method="POST" class="flex items-end gap-2 flex-wrap">
            <?= csrfField() ?><input type="hidden" name="action" value="add_stream"><input type="hidden" name="class_id" value="<?= e($classId) ?>">
            <div><label class="block text-[11px] text-gray-500 mb-0.5">New stream</label><input name="name" required maxlength="40" placeholder="Tiger, North, A…" class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none w-40"></div>
            <div><label class="block text-[11px] text-gray-500 mb-0.5">Capacity</label><input name="capacity" inputmode="numeric" placeholder="—" class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none w-20"></div>
            <button class="px-4 py-1.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Add stream</button>
        </form>
    </div>
    <?php if (!$secs): ?>
        <p class="text-sm text-gray-500"><?= e($classMap[$classId]) ?> has no streams yet. Add the first one above, then sort the <?= count($learners) ?> learners into it.</p>
    <?php else: ?>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        <?php foreach ($secs as $sec): $n = (int)($counts[$sec['id']] ?? 0); ?>
        <form method="POST" class="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
            <?= csrfField() ?><input type="hidden" name="action" value="edit_stream"><input type="hidden" name="class_id" value="<?= e($classId) ?>"><input type="hidden" name="section_id" value="<?= e($sec['id']) ?>">
            <input name="name" value="<?= e($sec['name']) ?>" maxlength="40" class="flex-1 min-w-0 px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-emerald-400 outline-none text-sm font-medium text-gray-900" title="Rename and press Enter">
            <span class="text-xs text-gray-500 tabular-nums flex-none"><?= $n ?> /</span>
            <input name="capacity" value="<?= (int)($sec['capacity'] ?? 0) ?: '' ?>" placeholder="—" inputmode="numeric" class="w-12 px-1 py-1 text-center rounded border border-transparent hover:border-gray-200 focus:border-emerald-400 outline-none text-xs tabular-nums" title="Capacity — type and press Enter">
            <button class="text-[11px] text-emerald-700 font-medium">Save</button>
            <button type="submit" name="action" value="delete_stream" onclick="return <?= $n > 0 ? 'alert(\'Move its ' . $n . ' learners first.\') && false' : 'confirm(\'Remove this stream?\')' ?>" class="text-[11px] <?= $n > 0 ? 'text-gray-300' : 'text-red-500 hover:text-red-700' ?>">Remove</button>
        </form>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
</div>

<?php if (!$secs): ?>
<?php else: ?>
<form method="POST" id="streamsForm">
    <?= csrfField() ?>
    <input type="hidden" name="action" value="save">

    <!-- Counts per stream, live as dropdowns change -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <?php foreach ($secs as $sec): $cap = (int)($sec['capacity'] ?? 0); ?>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-xs text-gray-500"><?= e($sec['name']) ?></p>
            <p class="text-lg font-bold text-gray-900 tabular-nums"><span data-count="<?= e($sec['id']) ?>"><?= (int)($counts[$sec['id']] ?? 0) ?></span><?= $cap ? ' <span class="text-sm font-normal text-gray-400">/ ' . $cap . '</span>' : '' ?></p>
        </div>
        <?php endforeach; ?>
        <div class="bg-white rounded-xl border border-amber-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-xs text-amber-700">Not in a stream</p>
            <p class="text-lg font-bold text-amber-700 tabular-nums" data-count="">
                <?= $unassigned ?></p>
        </div>
    </div>

    <!-- Quick actions -->
    <div class="bg-white rounded-xl border border-emerald-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3 mb-4 flex items-center gap-3 flex-wrap text-sm">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Quick sort</span>
        <label class="flex items-center gap-2">Put everyone without a stream into
            <select id="fillTo" class="px-2 py-1 rounded-lg border border-gray-200 bg-white text-sm">
                <?php foreach ($secs as $sec): ?><option value="<?= e($sec['id']) ?>"><?= e($sec['name']) ?></option><?php endforeach; ?>
            </select>
            <button type="button" onclick="fillUnassigned()" class="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50">Apply</button>
        </label>
        <button type="button" onclick="shareOut(false)" class="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50" title="Unsorted learners only, in name order, round-robin">Share out the unsorted evenly</button>
        <button type="button" onclick="shareOut(true)" class="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50" title="Everyone, alphabetically, round-robin — a full reshuffle">Reshuffle the whole class evenly</button>
        <input type="search" id="filter" placeholder="Find a name…" oninput="filterRows(this.value)" class="ml-auto px-3 py-1 rounded-lg border border-gray-200 text-sm w-44">
    </div>

    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <table class="w-full text-sm">
            <thead class="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500"><tr>
                <th class="text-left px-5 py-2 font-medium">Learner</th><th class="text-left px-3 py-2 font-medium">Adm no.</th><th class="text-left px-3 py-2 font-medium w-8"></th><th class="text-left px-3 py-2 font-medium w-56">Stream</th></tr></thead>
            <tbody class="divide-y divide-gray-50" id="rows">
            <?php foreach ($learners as $l): ?>
                <tr data-name="<?= e(strtolower($l['first_name'] . ' ' . $l['last_name'] . ' ' . $l['admission_number'])) ?>" class="<?= empty($l['section_id']) ? 'bg-amber-50/30' : '' ?>">
                    <td class="px-5 py-2 text-gray-900"><?= e(trim($l['first_name'] . ' ' . $l['last_name'])) ?></td>
                    <td class="px-3 py-2 text-gray-500 font-mono text-xs"><?= e($l['admission_number'] ?? '') ?></td>
                    <td class="px-3 py-2 text-gray-400 text-xs"><?= e(strtoupper(substr((string)($l['gender'] ?? ''), 0, 1))) ?></td>
                    <td class="px-3 py-2">
                        <select name="sec[<?= e($l['id']) ?>]" data-orig="<?= e($l['section_id'] ?? '') ?>" onchange="recount()" class="w-full px-2 py-1 rounded-lg border border-gray-200 bg-white text-sm focus:border-emerald-400 outline-none">
                            <option value="">— not in a stream —</option>
                            <?php foreach ($secs as $sec): ?><option value="<?= e($sec['id']) ?>"<?= ($l['section_id'] ?? '') === $sec['id'] ? ' selected' : '' ?>><?= e($sec['name']) ?></option><?php endforeach; ?>
                        </select>
                    </td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$learners): ?><tr><td colspan="4" class="px-5 py-8 text-center text-gray-400">No active learners in this class.</td></tr><?php endif; ?>
            </tbody>
        </table>
        <div class="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/60">
            <span class="text-xs text-gray-500"><span id="changed">0</span> change<span id="changedS">s</span> pending · registers, mark sheets and report cards follow the stream from the next save</span>
            <button type="submit" class="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm">Save streams</button>
        </div>
    </div>
</form>

<script>
(function () {
    var secs = <?= json_encode(array_column($secs, 'id')) ?>;
    function selects() { return Array.prototype.slice.call(document.querySelectorAll('#rows select')); }
    window.recount = function () {
        var c = {}; secs.forEach(function (s) { c[s] = 0; }); c[''] = 0; var changed = 0;
        selects().forEach(function (s) { c[s.value] = (c[s.value] || 0) + 1; if (s.value !== s.dataset.orig) changed++; s.closest('tr').classList.toggle('bg-amber-50/30', s.value === ''); });
        document.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = c[el.dataset.count] || 0; });
        document.getElementById('changed').textContent = changed; document.getElementById('changedS').textContent = changed === 1 ? '' : 's';
    };
    window.fillUnassigned = function () { var to = document.getElementById('fillTo').value; selects().forEach(function (s) { if (s.value === '') s.value = to; }); recount(); };
    window.shareOut = function (all) {
        // Round-robin in the order shown (alphabetical), so streams end up equal in size.
        var i = 0;
        selects().forEach(function (s) { if (all || s.value === '') { s.value = secs[i % secs.length]; i++; } });
        recount();
    };
    window.filterRows = function (q) { q = q.toLowerCase(); document.querySelectorAll('#rows tr').forEach(function (r) { r.style.display = !q || (r.dataset.name || '').indexOf(q) >= 0 ? '' : 'none'; }); };
    document.getElementById('streamsForm').addEventListener('submit', function (e) {
        var n = parseInt(document.getElementById('changed').textContent, 10) || 0;
        if (n === 0) { e.preventDefault(); alert('Nothing has changed.'); return; }
        if (!confirm('Move ' + n + ' learner' + (n === 1 ? '' : 's') + ' between streams?')) e.preventDefault();
    });
})();
</script>
<?php endif; ?>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
