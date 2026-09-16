<?php
/**
 * Buses & zones — the two nouns transport was missing (migration 131).
 *
 * A route was the only grouping there was. When a bus breaks down on the
 * road, the office needs "everyone on Bus 3 right now", and when half a
 * route has been collected it needs "the Kitengela stage children who are
 * still waiting". A bus may serve several routes; a route may have named
 * pickup zones or none at all.
 *
 * This page sets those up. The roster (transport/roster) uses them.
 */
$pageTitle = 'Buses & pickup points';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

if (!userCan('services.manage')) {
    flash('error', 'You do not have permission to manage transport.');
    redirect('transport');
}

$clean = fn($k, $n = 120) => mb_substr(trim((string)input($k)), 0, $n);

if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'save_bus') {
        $id    = input('bus_id');
        $label = $clean('label', 40);
        if ($label === '') {
            flash('error', 'Give the bus a name the staff use — "Bus 3", "The Coaster".');
            redirect('transport/buses');
        }
        $row = [
            'label'           => $label,
            'plate'           => strtoupper($clean('plate', 16)) ?: null,
            'capacity'        => (int)input('capacity') ?: null,
            'driver_name'     => $clean('driver_name', 80) ?: null,
            'driver_phone'    => $clean('driver_phone', 30) ?: null,
            'conductor_name'  => $clean('conductor_name', 80) ?: null,
            'conductor_phone' => $clean('conductor_phone', 30) ?: null,
            'notes'           => $clean('notes', 240) ?: null,
            'updated_at'      => date('c'),
        ];
        if ($id) {
            $r = $sb->from('transport_vehicles')->eq('id', $id)->eq('school_id', $sid)->update($row);
            if (empty($r['error'])) auditLog('update', 'transport_vehicle', $id, ['label' => $label]);
        } else {
            $row['school_id'] = $sid;
            $r = $sb->from('transport_vehicles')->insert($row);
            $id = $r['data'][0]['id'] ?? null;
            if ($id) auditLog('create', 'transport_vehicle', $id, ['label' => $label]);
        }
        flash(empty($r['error']) ? 'success' : 'error', empty($r['error']) ? "$label saved." : $r['error']);
        redirect('transport/buses');
    }

    if ($action === 'retire_bus') {
        $id = input('bus_id');
        // Routes it served go back to "no bus" so the roster shows the gap.
        $sb->from('transport_routes')->eq('school_id', $sid)->eq('vehicle_id', $id)->update(['vehicle_id' => null]);
        $r = $sb->from('transport_vehicles')->eq('id', $id)->eq('school_id', $sid)
            ->update(['is_active' => false, 'updated_at' => date('c')]);
        if (empty($r['error'])) auditLog('retire', 'transport_vehicle', $id, []);
        flash(empty($r['error']) ? 'success' : 'error', empty($r['error']) ? 'Bus retired. Its routes now need a bus.' : $r['error']);
        redirect('transport/buses');
    }

    if ($action === 'assign_routes') {
        // One bus → many routes. Anything unticked that pointed here is released.
        $busId  = input('bus_id');
        $picked = array_values(array_filter((array)($_POST['route_ids'] ?? [])));
        $sb->from('transport_routes')->eq('school_id', $sid)->eq('vehicle_id', $busId)->update(['vehicle_id' => null]);
        if ($picked) {
            $sb->from('transport_routes')->eq('school_id', $sid)->in('id', $picked)->update(['vehicle_id' => $busId]);
        }
        auditLog('assign_routes', 'transport_vehicle', $busId, ['routes' => count($picked)]);
        flash('success', count($picked) . ' route(s) now run on this bus.');
        redirect('transport/buses');
    }

    if ($action === 'save_zone') {
        $routeId = input('route_id');
        $zoneId  = input('zone_id');
        $name    = $clean('zone_name', 60);
        $seq     = max(1, (int)input('sequence') ?: 1);
        if ($name === '') { flash('error', 'A pickup point needs a name.'); redirect('transport/buses'); }
        if ($zoneId) {
            $r = $sb->from('transport_zones')->eq('id', $zoneId)->eq('school_id', $sid)
                ->update(['name' => $name, 'sequence' => $seq]);
        } else {
            $r = $sb->from('transport_zones')->insert([
                'school_id' => $sid, 'route_id' => $routeId, 'name' => $name, 'sequence' => $seq,
            ]);
        }
        flash(empty($r['error']) ? 'success' : 'error', empty($r['error']) ? "$name saved." : $r['error']);
        redirect('transport/buses#route-' . urlencode($routeId));
    }

    if ($action === 'delete_zone') {
        $zoneId = input('zone_id');
        // Riders in it are kept on the route, just no longer pinned to a stop.
        $sb->from('student_transport')->eq('school_id', $sid)->eq('zone_id', $zoneId)->update(['zone_id' => null]);
        $r = $sb->from('transport_zones')->eq('id', $zoneId)->eq('school_id', $sid)->delete();
        flash(empty($r['error']) ? 'success' : 'error', empty($r['error']) ? 'Pickup point removed.' : $r['error']);
        redirect('transport/buses');
    }
}

// ── Read ─────────────────────────────────────────────────────────
$buses  = $sb->from('transport_vehicles')->select('*')->eq('school_id', $sid)->eq('is_active', 'true')
    ->order('label')->execute()['data'] ?? [];
$routes = $sb->from('transport_routes')->select('id,name,vehicle_id,fee_amount,is_active')
    ->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute()['data'] ?? [];
$zones  = $sb->from('transport_zones')->select('id,route_id,name,sequence')
    ->eq('school_id', $sid)->eq('is_active', 'true')->order('sequence')->execute()['data'] ?? [];

$zonesByRoute = [];
foreach ($zones as $z) $zonesByRoute[$z['route_id']][] = $z;
$routesByBus = [];
foreach ($routes as $r) if (!empty($r['vehicle_id'])) $routesByBus[$r['vehicle_id']][] = $r;

// Riders per route and per zone, from the same function the roster uses.
$riderCount = []; $zoneCount = [];
$ro = $sb->rpc('transport_roster', ['p_school_id' => $sid])['data'] ?? [];
foreach ((array)($ro['students'] ?? []) as $s) {
    $riderCount[$s['route_id']] = ($riderCount[$s['route_id']] ?? 0) + 1;
    if (!empty($s['zone_id'])) $zoneCount[$s['zone_id']] = ($zoneCount[$s['zone_id']] ?? 0) + 1;
}

require __DIR__ . '/../../includes/layout-top.php';
$f = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none';
?>

<div class="mb-6 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <a href="<?= baseUrl('transport') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Transport</a>
        <h1 class="text-2xl font-bold text-gray-900 mt-2">Buses &amp; pickup points</h1>
        <p class="text-sm text-gray-500 mt-1">Which bus runs which routes, and the named places along each route where children are collected. The roster is built from this.</p>
    </div>
    <div class="flex gap-2">
        <a href="<?= baseUrl('transport/roster') ?>" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50">Open roster</a>
        <button type="button" onclick="openBus(null)" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm">+ Add bus</button>
    </div>
</div>

<!-- Buses -->
<?php if (!$buses): ?>
    <div class="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6 text-sm text-amber-800">
        No buses yet. Add the first one, then tick the routes it runs. Until a route has a bus, the roster can only group by route.
    </div>
<?php endif; ?>

<div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
<?php foreach ($buses as $b):
    $mine = $routesByBus[$b['id']] ?? [];
    $riders = 0; foreach ($mine as $r) $riders += $riderCount[$r['id']] ?? 0; ?>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div class="flex items-start justify-between gap-3 mb-3">
            <div class="min-w-0">
                <h2 class="text-base font-bold text-gray-900 truncate"><?= e($b['label']) ?></h2>
                <p class="text-xs text-gray-500"><?= e($b['plate'] ?: 'no plate') ?><?= $b['capacity'] ? ' · ' . (int)$b['capacity'] . ' seats' : '' ?> · <strong class="text-gray-700"><?= $riders ?></strong> riders</p>
            </div>
            <button type="button" onclick='openBus(<?= jsonHtml($b) ?>)' class="text-xs font-medium text-emerald-600 hover:text-emerald-800 shrink-0">Edit</button>
        </div>
        <dl class="text-sm space-y-1 mb-4">
            <div class="flex justify-between gap-3"><dt class="text-gray-500">Driver</dt><dd class="text-gray-900 text-right"><?= e($b['driver_name'] ?: '—') ?><?= $b['driver_phone'] ? ' <a href="tel:' . e($b['driver_phone']) . '" class="text-emerald-600">' . e($b['driver_phone']) . '</a>' : '' ?></dd></div>
            <div class="flex justify-between gap-3"><dt class="text-gray-500">Matron</dt><dd class="text-gray-900 text-right"><?= e($b['conductor_name'] ?: '—') ?><?= $b['conductor_phone'] ? ' <a href="tel:' . e($b['conductor_phone']) . '" class="text-emerald-600">' . e($b['conductor_phone']) . '</a>' : '' ?></dd></div>
        </dl>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="assign_routes">
            <input type="hidden" name="bus_id" value="<?= e($b['id']) ?>">
            <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Routes on this bus</p>
            <div class="space-y-1 mb-3">
                <?php foreach ($routes as $r):
                    $onThis  = ($r['vehicle_id'] ?? '') === $b['id'];
                    $onOther = !empty($r['vehicle_id']) && !$onThis; ?>
                    <label class="flex items-center gap-2 text-sm <?= $onOther ? 'text-gray-400' : 'text-gray-700' ?>">
                        <input type="checkbox" name="route_ids[]" value="<?= e($r['id']) ?>" <?= $onThis ? 'checked' : '' ?> class="w-4 h-4 rounded border-gray-300 text-emerald-600">
                        <span class="flex-1 truncate"><?= e($r['name']) ?></span>
                        <span class="text-xs text-gray-400"><?= (int)($riderCount[$r['id']] ?? 0) ?></span>
                        <?php if ($onOther): ?><span class="text-[10px] text-amber-600">other bus</span><?php endif; ?>
                    </label>
                <?php endforeach; ?>
                <?php if (!$routes): ?><p class="text-xs text-gray-400 italic">No routes yet — add them under Transport.</p><?php endif; ?>
            </div>
            <div class="flex items-center gap-2">
                <button type="submit" class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Save routes</button>
                <button type="submit" form="retire-<?= e($b['id']) ?>" onclick="return confirm('Retire this bus? Its routes will need a new one.')" class="ml-auto text-xs text-gray-400 hover:text-red-600">Retire</button>
            </div>
        </form>
        <form method="POST" id="retire-<?= e($b['id']) ?>" class="hidden"><?= csrfField() ?><input type="hidden" name="action" value="retire_bus"><input type="hidden" name="bus_id" value="<?= e($b['id']) ?>"></form>
    </div>
<?php endforeach; ?>
</div>

<!-- Zones, per route -->
<div class="mb-3">
    <h2 class="text-lg font-bold text-gray-900">Pickup points</h2>
    <p class="text-sm text-gray-500">Optional. Your routes are already zones — Athi River Zone 1, Mlolongo Zone 2. These are the specific places inside them: Greatwall, the stage, the estate gate. A route with none is one flat list on the roster; with them, children are grouped by where they are collected.</p>
</div>
<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
<?php foreach ($routes as $r):
    $zs = $zonesByRoute[$r['id']] ?? [];
    $busLabel = null; foreach ($buses as $b) if ($b['id'] === ($r['vehicle_id'] ?? '')) $busLabel = $b['label']; ?>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5" id="route-<?= e($r['id']) ?>">
        <div class="flex items-baseline justify-between gap-3 mb-3">
            <h3 class="text-sm font-bold text-gray-900"><?= e($r['name']) ?></h3>
            <span class="text-xs <?= $busLabel ? 'text-gray-500' : 'text-amber-600' ?>"><?= $busLabel ? e($busLabel) : 'no bus assigned' ?> · <?= (int)($riderCount[$r['id']] ?? 0) ?> riders</span>
        </div>
        <?php if ($zs): ?>
        <ol class="space-y-1.5 mb-3">
            <?php foreach ($zs as $z): ?>
            <li class="flex items-center gap-2 text-sm">
                <span class="w-6 h-6 rounded-md bg-gray-100 text-[11px] font-bold text-gray-600 flex items-center justify-center shrink-0"><?= (int)$z['sequence'] ?></span>
                <span class="flex-1 text-gray-800"><?= e($z['name']) ?></span>
                <span class="text-xs text-gray-400"><?= (int)($zoneCount[$z['id']] ?? 0) ?></span>
                <button type="button" onclick='openZone(<?= jsonHtml(['route_id' => $r['id'], 'route' => $r['name'], 'zone' => $z]) ?>)' class="text-xs text-emerald-600 hover:text-emerald-800">Edit</button>
                <form method="POST" class="inline" onsubmit="return confirm('Remove this pickup point? Riders stay on the route.')"><?= csrfField() ?><input type="hidden" name="action" value="delete_zone"><input type="hidden" name="zone_id" value="<?= e($z['id']) ?>"><button type="submit" class="text-xs text-gray-400 hover:text-red-600">Remove</button></form>
            </li>
            <?php endforeach; ?>
        </ol>
        <?php else: ?>
            <p class="text-xs text-gray-400 italic mb-3">No pickup points — one flat list.</p>
        <?php endif; ?>
        <button type="button" onclick='openZone(<?= jsonHtml(['route_id' => $r['id'], 'route' => $r['name'], 'zone' => null, 'next' => count($zs) + 1]) ?>)' class="text-xs font-medium text-emerald-600 hover:text-emerald-800">+ Add pickup point</button>
    </div>
<?php endforeach; ?>
</div>

<!-- Bus dialog -->
<div id="busModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(17,24,20,.45)" onclick="if(event.target===this) closeM('busModal')">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-lg" role="dialog" aria-modal="true">
    <form method="POST">
      <?= csrfField() ?>
      <input type="hidden" name="action" value="save_bus">
      <input type="hidden" name="bus_id" id="b_id">
      <div class="px-5 py-4 border-b border-gray-100"><h3 class="text-base font-bold text-gray-900" id="busTitle">Add bus</h3></div>
      <div class="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">What staff call it *</label><input name="label" id="b_label" required maxlength="40" placeholder="Bus 3" class="<?= $f ?>"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Plate</label><input name="plate" id="b_plate" maxlength="16" placeholder="KDA 123F" class="<?= $f ?>"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Seats</label><input name="capacity" id="b_capacity" type="number" min="1" class="<?= $f ?>"></div>
        <div></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Driver</label><input name="driver_name" id="b_driver_name" maxlength="80" class="<?= $f ?>"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Driver phone</label><input name="driver_phone" id="b_driver_phone" maxlength="30" placeholder="07XX XXX XXX" class="<?= $f ?>"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Matron / bus teacher</label><input name="conductor_name" id="b_conductor_name" maxlength="80" class="<?= $f ?>"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Matron phone</label><input name="conductor_phone" id="b_conductor_phone" maxlength="30" class="<?= $f ?>"></div>
        <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 mb-1">Notes</label><input name="notes" id="b_notes" maxlength="240" class="<?= $f ?>"></div>
      </div>
      <div class="px-5 py-4 bg-gray-50 flex justify-end gap-2">
        <button type="button" onclick="closeM('busModal')" class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-white">Cancel</button>
        <button type="submit" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Save bus</button>
      </div>
    </form>
  </div>
</div>

<!-- Zone dialog -->
<div id="zoneModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(17,24,20,.45)" onclick="if(event.target===this) closeM('zoneModal')">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-sm" role="dialog" aria-modal="true">
    <form method="POST">
      <?= csrfField() ?>
      <input type="hidden" name="action" value="save_zone">
      <input type="hidden" name="route_id" id="z_route">
      <input type="hidden" name="zone_id" id="z_id">
      <div class="px-5 py-4 border-b border-gray-100"><h3 class="text-base font-bold text-gray-900" id="zoneTitle">Add pickup point</h3><p class="text-xs text-gray-500" id="zoneRoute"></p></div>
      <div class="px-5 py-4 space-y-4">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Pickup point *</label><input name="zone_name" id="z_name" required maxlength="60" placeholder="Greatwall" class="<?= $f ?>"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Order along the run</label><input name="sequence" id="z_seq" type="number" min="1" class="<?= $f ?> w-24"></div>
      </div>
      <div class="px-5 py-4 bg-gray-50 flex justify-end gap-2">
        <button type="button" onclick="closeM('zoneModal')" class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-white">Cancel</button>
        <button type="submit" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Save pickup point</button>
      </div>
    </form>
  </div>
</div>

<script>
function closeM(id){ document.getElementById(id).classList.add('hidden'); }
function openBus(b){
    var f = ['id','label','plate','capacity','driver_name','driver_phone','conductor_name','conductor_phone','notes'];
    f.forEach(function(k){ var el = document.getElementById('b_'+k); if (el) el.value = b && b[k] != null ? b[k] : ''; });
    document.getElementById('busTitle').textContent = b ? 'Edit ' + b.label : 'Add bus';
    document.getElementById('busModal').classList.remove('hidden');
    document.getElementById('b_label').focus();
}
function openZone(o){
    document.getElementById('z_route').value = o.route_id;
    document.getElementById('z_id').value    = o.zone ? o.zone.id : '';
    document.getElementById('z_name').value  = o.zone ? o.zone.name : '';
    document.getElementById('z_seq').value   = o.zone ? o.zone.sequence : (o.next || 1);
    document.getElementById('zoneTitle').textContent = o.zone ? 'Edit pickup point' : 'Add pickup point';
    document.getElementById('zoneRoute').textContent = o.route;
    document.getElementById('zoneModal').classList.remove('hidden');
    document.getElementById('z_name').focus();
}
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') { closeM('busModal'); closeM('zoneModal'); } });
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
