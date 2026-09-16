<?php
/**
 * Fee Penalties — manage late payment penalty rules.
 */
$pageTitle = 'Fee Penalties';
$sb  = new Supabase();
$sid = schoolId();

// Handle actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'add') {
        $name       = input('name');
        $type       = input('type');
        $value      = (float)input('value');
        $frequency  = input('frequency');
        $graceDays  = (int)input('grace_days');

        if (!$name || !$type || !$frequency) {
            flash('error', 'Name, type and frequency are required.');
        } elseif ($value <= 0) {
            flash('error', 'Value must be greater than zero.');
        } else {
            $result = $sb->from('fee_penalties')->insert([
                'school_id'  => $sid,
                'name'       => $name,
                'type'       => $type,
                'value'      => $value,
                'frequency'  => $frequency,
                'grace_days' => $graceDays,
                'is_active'  => true,
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Penalty rule added.');
            }
        }
        redirect('fees/penalties');
    }

    if ($action === 'edit') {
        $id         = input('penalty_id');
        $name       = input('name');
        $type       = input('type');
        $value      = (float)input('value');
        $frequency  = input('frequency');
        $graceDays  = (int)input('grace_days');

        if (!$name || !$type || !$frequency) {
            flash('error', 'Name, type and frequency are required.');
        } elseif ($value <= 0) {
            flash('error', 'Value must be greater than zero.');
        } else {
            $result = $sb->from('fee_penalties')->eq('id', $id)->eq('school_id', $sid)->update([
                'name'       => $name,
                'type'       => $type,
                'value'      => $value,
                'frequency'  => $frequency,
                'grace_days' => $graceDays,
                'updated_at' => date('c'),
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Penalty rule updated.');
            }
        }
        redirect('fees/penalties');
    }

    if ($action === 'toggle') {
        $id       = input('penalty_id');
        $newState = input('new_state') === '1' ? true : false;
        $result   = $sb->from('fee_penalties')->eq('id', $id)->eq('school_id', $sid)->update([
            'is_active'  => $newState,
            'updated_at' => date('c'),
        ]);
        if ($result['error']) {
            flash('error', $result['error']);
        } else {
            flash('success', $newState ? 'Penalty activated.' : 'Penalty deactivated.');
        }
        redirect('fees/penalties');
    }
}

// Fetch penalties
$penaltiesResult = $sb->from('fee_penalties')->select('*')->eq('school_id', $sid)->order('name')->execute();
$penalties = $penaltiesResult['data'] ?? [];

// Stats
$totalPenalties = count($penalties);
$activePenalties = 0;
foreach ($penalties as $p) {
    if ($p['is_active'] ?? false) $activePenalties++;
}
$inactivePenalties = $totalPenalties - $activePenalties;

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Fee Penalties</h1>
        <p class="text-sm text-gray-500 mt-1">Manage late payment penalty rules</p>
    </div>
    <button onclick="document.getElementById('addModal').classList.remove('hidden')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
        + Add Penalty
    </button>
</div>

<!-- Summary Stats -->
<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-gray-400"></div>
            <span class="text-sm text-gray-500">Total Penalties</span>
        </div>
        <p class="text-2xl font-bold text-gray-900 mt-1"><?= $totalPenalties ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span class="text-sm text-gray-500">Active</span>
        </div>
        <p class="text-2xl font-bold text-emerald-600 mt-1"><?= $activePenalties ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-red-400"></div>
            <span class="text-sm text-gray-500">Inactive</span>
        </div>
        <p class="text-2xl font-bold text-red-500 mt-1"><?= $inactivePenalties ?></p>
    </div>
</div>

<!-- Penalties Table -->
<?php
$typeLabels = [
    'percentage' => 'Percentage',
    'fixed'      => 'Fixed',
];
$typeColors = [
    'percentage' => 'bg-purple-50 text-purple-700',
    'fixed'      => 'bg-blue-50 text-blue-700',
];
$freqLabels = [
    'one_time' => 'One-Time',
    'daily'    => 'Daily',
    'monthly'  => 'Monthly',
];
$freqColors = [
    'one_time' => 'bg-gray-100 text-gray-600',
    'daily'    => 'bg-amber-50 text-amber-700',
    'monthly'  => 'bg-indigo-50 text-indigo-700',
];
?>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Type</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Value</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Frequency</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Grace Days</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($penalties)): ?>
                <tr><td colspan="7" class="px-4 py-12 text-center text-gray-400">No penalty rules yet</td></tr>
            <?php else: ?>
                <?php foreach ($penalties as $p):
                    $pType = $p['type'] ?? 'fixed';
                    $pFreq = $p['frequency'] ?? 'one_time';
                    $isActive = $p['is_active'] ?? false;
                    $pValue = (float)($p['value'] ?? 0);
                ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($p['name']) ?></td>
                        <td class="px-4 py-3 text-center">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium <?= $typeColors[$pType] ?? 'bg-gray-100 text-gray-600' ?>">
                                <?= $typeLabels[$pType] ?? ucfirst($pType) ?>
                            </span>
                        </td>
                        <td class="px-4 py-3 text-right font-medium text-gray-900">
                            <?= $pType === 'percentage' ? number_format($pValue, 2) . '%' : money($pValue) ?>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium <?= $freqColors[$pFreq] ?? 'bg-gray-100 text-gray-600' ?>">
                                <?= $freqLabels[$pFreq] ?? ucfirst($pFreq) ?>
                            </span>
                        </td>
                        <td class="px-4 py-3 text-center text-gray-600"><?= (int)($p['grace_days'] ?? 0) ?> day<?= (int)($p['grace_days'] ?? 0) !== 1 ? 's' : '' ?></td>
                        <td class="px-4 py-3 text-center">
                            <?php if ($isActive): ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                            <?php else: ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">Inactive</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-right whitespace-nowrap">
                            <button onclick="editPenalty('<?= e($p['id']) ?>','<?= e(addslashes($p['name'])) ?>','<?= e($pType) ?>',<?= $pValue ?>,'<?= e($pFreq) ?>',<?= (int)($p['grace_days'] ?? 0) ?>)" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium mr-2">Edit</button>
                            <form method="POST" class="inline">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="toggle">
                                <input type="hidden" name="penalty_id" value="<?= e($p['id']) ?>">
                                <input type="hidden" name="new_state" value="<?= $isActive ? '0' : '1' ?>">
                                <button type="submit" class="text-xs font-medium <?= $isActive ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800' ?>">
                                    <?= $isActive ? 'Deactivate' : 'Activate' ?>
                                </button>
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
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Add Penalty Rule</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add">

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div class="sm:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input type="text" name="name" required placeholder="e.g. Late Payment Fee"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <select name="type" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select</option>
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Value *</label>
                    <input type="number" name="value" step="0.01" min="0.01" required placeholder="e.g. 5.00"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Frequency *</label>
                    <select name="frequency" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select</option>
                        <option value="one_time">One-Time</option>
                        <option value="daily">Daily</option>
                        <option value="monthly">Monthly</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Grace Days</label>
                    <input type="number" name="grace_days" min="0" value="0" placeholder="0"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <p class="text-xs text-gray-400 mt-1">Days after due date before penalty applies</p>
                </div>
            </div>

            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                    Add Penalty
                </button>
                <button type="button" onclick="document.getElementById('addModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                    Cancel
                </button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Modal -->
<div id="editModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Penalty Rule</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="penalty_id" id="editId">

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div class="sm:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input type="text" name="name" id="editName" required
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <select name="type" id="editType" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Value *</label>
                    <input type="number" name="value" id="editValue" step="0.01" min="0.01" required
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Frequency *</label>
                    <select name="frequency" id="editFrequency" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="one_time">One-Time</option>
                        <option value="daily">Daily</option>
                        <option value="monthly">Monthly</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Grace Days</label>
                    <input type="number" name="grace_days" id="editGraceDays" min="0"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <p class="text-xs text-gray-400 mt-1">Days after due date before penalty applies</p>
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
function editPenalty(id, name, type, value, frequency, graceDays) {
    document.getElementById('editId').value = id;
    document.getElementById('editName').value = name;
    document.getElementById('editType').value = type;
    document.getElementById('editValue').value = value;
    document.getElementById('editFrequency').value = frequency;
    document.getElementById('editGraceDays').value = graceDays;
    document.getElementById('editModal').classList.remove('hidden');
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
