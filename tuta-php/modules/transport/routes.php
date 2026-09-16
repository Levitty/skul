<?php
/**
 * Transport Routes/Zones — manage transport zones with fees.
 */
$pageTitle = 'Transport Routes';
$sb  = new Supabase();
$sid = schoolId();

// Handle actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'add') {
        $name     = input('name');
        $desc     = input('description');
        $fee      = (float)input('fee_amount');
        $start    = input('start_location');
        $end      = input('end_location');
        $number   = input('route_number');

        if (!$name) {
            flash('error', 'Route name is required.');
        } else {
            $result = $sb->from('transport_routes')->insert([
                'school_id'      => $sid,
                'name'           => $name,
                'route_number'   => $number ?: null,
                'start_location' => $start ?: null,
                'end_location'   => $end ?: null,
                'fee_amount'     => $fee,
                'is_active'      => true,
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                auditLog('create', 'transport_route', $result['data'][0]['id'] ?? null, ['name' => $name]);
                flash('success', 'Transport route added.');
            }
        }
        redirect('transport');
    }

    if ($action === 'edit') {
        $id   = input('route_id');
        $name = input('name');
        $desc = input('description');
        $fee  = (float)input('fee_amount');
        $start = input('start_location');
        $end   = input('end_location');
        $number = input('route_number');

        if (!$name) {
            flash('error', 'Route name is required.');
        } else {
            $sb->from('transport_routes')->eq('id', $id)->eq('school_id', $sid)->update([
                'name'           => $name,
                'route_number'   => $number ?: null,
                'start_location' => $start ?: null,
                'end_location'   => $end ?: null,
                'fee_amount'     => $fee,
                'updated_at'     => date('c'),
            ]);
            flash('success', 'Transport route updated.');
        }
        redirect('transport');
    }

    if ($action === 'delete') {
        $id = input('route_id');
        $sb->from('transport_routes')->eq('id', $id)->eq('school_id', $sid)->update(['is_active' => false]);
        flash('success', 'Transport route removed.');
        redirect('transport');
    }
}

// Fetch routes
$routesResult = $sb->from('transport_routes')->select('*')->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$routes = $routesResult['data'] ?? [];

// Count students per route + load assignments for credit helper
$studentCounts = [];
$assignments = [];
foreach ($routes as $r) {
    $stRes = $sb->from('student_transport')->select('id,student_id,route_id')
        ->eq('route_id', $r['id'])->eq('school_id', $sid)->execute();
    $rows = $stRes['data'] ?? [];
    $studentCounts[$r['id']] = count($rows);
    foreach ($rows as $row) $assignments[] = $row;
}

$assignStuIds = array_values(array_unique(array_filter(array_column($assignments, 'student_id'))));
$assignStuMap = [];
if (!empty($assignStuIds)) {
    foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('students')->select('id,first_name,last_name,admission_number'), 'id', $assignStuIds) as $s) {
        $assignStuMap[$s['id']] = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''));
    }
}

// Find billed transport lines on invoices that already have payments (need credit, not remove)
$transportCreditHints = []; // student_id => [invoice_id, amount, description, reference]
if (!empty($assignStuIds)) {
    $invRows = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('invoices')
            ->select('id,student_id,reference,paid_amount,status,amount')
            ->eq('school_id', $sid)
            ->in('status', ['unpaid', 'partial', 'overdue', 'paid']),
        'student_id',
        $assignStuIds
    );
    $paidInvIds = [];
    $invById = [];
    foreach ($invRows as $inv) {
        if ((float)($inv['paid_amount'] ?? 0) > 0) {
            $paidInvIds[] = $inv['id'];
            $invById[$inv['id']] = $inv;
        }
    }
    if (!empty($paidInvIds)) {
        $items = Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('invoice_items')->select('id,invoice_id,description,amount'),
            'invoice_id',
            $paidInvIds
        );
        foreach ($items as $it) {
            $desc = (string)($it['description'] ?? '');
            if (stripos($desc, 'Transport') === false) continue;
            if ((float)($it['amount'] ?? 0) <= 0) continue; // skip existing credit lines
            $inv = $invById[$it['invoice_id']] ?? null;
            if (!$inv) continue;
            $sidStu = $inv['student_id'] ?? '';
            // Keep the latest / first match per student
            if (!isset($transportCreditHints[$sidStu])) {
                $transportCreditHints[$sidStu] = [
                    'invoice_id'  => $inv['id'],
                    'reference'   => $inv['reference'] ?? '',
                    'amount'      => (float)$it['amount'],
                    'description' => $desc,
                    'item_id'     => $it['id'],
                ];
            }
        }
    }
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Transport Routes</h1>
        <p class="text-sm text-gray-500 mt-1"><?= count($routes) ?> route<?= count($routes) !== 1 ? 's' : '' ?></p>
    </div>
    <button onclick="document.getElementById('addModal').classList.remove('hidden')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
        + Add Route
    </button>
</div>

<?php if (!empty($transportCreditHints) && userCan('fees.manage')): ?>
<div class="mb-6 bg-amber-50 border border-amber-100 rounded-xl p-4">
    <h2 class="text-sm font-semibold text-amber-900 mb-1">Transport already on a paid invoice?</h2>
    <p class="text-xs text-amber-800 mb-3">After any payment, do not delete the Transport line — issue a credit note. These students have a Transport charge on an invoice with money recorded:</p>
    <ul class="space-y-2">
        <?php foreach ($transportCreditHints as $stuId => $hint): ?>
            <li class="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span class="text-amber-950"><?= e($assignStuMap[$stuId] ?? 'Student') ?> · <?= e($hint['reference']) ?> · <?= e($hint['description']) ?> (<?= money($hint['amount']) ?>)</span>
                <a href="<?= baseUrl('fees/credits?invoice_id=' . urlencode($hint['invoice_id'])
                    . '&amount=' . urlencode((string)$hint['amount'])
                    . '&reason_code=transport_withdrawn'
                    . '&description=' . urlencode('Credit — ' . $hint['description'])
                    . '&item_id=' . urlencode($hint['item_id'])) ?>"
                   class="text-xs font-medium text-amber-900 underline hover:no-underline">Create transport credit</a>
            </li>
        <?php endforeach; ?>
    </ul>
</div>
<?php endif; ?>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Route Name</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Route No.</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">From → To</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Fee (per term)</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Students</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($routes)): ?>
                <tr><td colspan="6" class="px-4 py-12 text-center text-gray-400">No transport routes yet</td></tr>
            <?php else: ?>
                <?php foreach ($routes as $r): ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($r['name']) ?></td>
                        <td class="px-4 py-3 text-gray-600"><?= e($r['route_number'] ?? '—') ?></td>
                        <td class="px-4 py-3 text-gray-600">
                            <?= e($r['start_location'] ?? '—') ?> → <?= e($r['end_location'] ?? '—') ?>
                        </td>
                        <td class="px-4 py-3 text-right font-medium text-gray-900"><?= money((float)($r['fee_amount'] ?? 0)) ?></td>
                        <td class="px-4 py-3 text-center">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700"><?= $studentCounts[$r['id']] ?? 0 ?></span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <button onclick="editRoute('<?= e($r['id']) ?>','<?= e(addslashes($r['name'])) ?>','<?= e(addslashes($r['route_number'] ?? '')) ?>','<?= e(addslashes($r['start_location'] ?? '')) ?>','<?= e(addslashes($r['end_location'] ?? '')) ?>',<?= (float)($r['fee_amount'] ?? 0) ?>)" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium mr-2">Edit</button>
                            <form method="POST" class="inline" onsubmit="return confirm('Remove this route?')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="delete">
                                <input type="hidden" name="route_id" value="<?= e($r['id']) ?>">
                                <button type="submit" class="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<!-- Add Modal -->
<div id="addModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Add Transport Route</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add">
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Route Name *</label>
                    <input type="text" name="name" required placeholder="e.g. Zone A - Langata"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Route Number</label>
                    <input type="text" name="route_number" placeholder="e.g. R1"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fee Amount (per term)</label>
                    <input type="number" name="fee_amount" step="0.01" min="0" value="0"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Start Location</label>
                    <input type="text" name="start_location" placeholder="e.g. Langata Mall"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">End Location</label>
                    <input type="text" name="end_location" placeholder="e.g. School Gate"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Add Route</button>
                <button type="button" onclick="document.getElementById('addModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Modal -->
<div id="editModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Transport Route</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="route_id" id="erRouteId">
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Route Name *</label>
                    <input type="text" name="name" id="erName" required
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Route Number</label>
                    <input type="text" name="route_number" id="erNumber"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fee Amount (per term)</label>
                    <input type="number" name="fee_amount" id="erFee" step="0.01" min="0"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Start Location</label>
                    <input type="text" name="start_location" id="erStart"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">End Location</label>
                    <input type="text" name="end_location" id="erEnd"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Changes</button>
                <button type="button" onclick="document.getElementById('editModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
function editRoute(id, name, number, start, end, fee) {
    document.getElementById('erRouteId').value = id;
    document.getElementById('erName').value = name;
    document.getElementById('erNumber').value = number;
    document.getElementById('erStart').value = start;
    document.getElementById('erEnd').value = end;
    document.getElementById('erFee').value = fee;
    document.getElementById('editModal').classList.remove('hidden');
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
