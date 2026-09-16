<?php
/**
 * Activities — manage extracurricular activities with fees.
 */
$pageTitle = 'Activities';
$sb  = new Supabase();
$sid = schoolId();

// Handle actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'add') {
        $name = input('name');
        $desc = input('description');
        $fee  = (float)input('fee_amount');

        if (!$name) {
            flash('error', 'Activity name is required.');
        } else {
            $result = $sb->from('activities')->insert([
                'school_id'   => $sid,
                'name'        => $name,
                'description' => $desc ?: null,
                'fee_amount'  => $fee,
                'is_active'   => true,
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                auditLog('create', 'activity', $result['data'][0]['id'] ?? null, ['name' => $name]);
                flash('success', 'Activity added.');
            }
        }
        redirect('activities');
    }

    if ($action === 'edit') {
        $id   = input('activity_id');
        $name = input('name');
        $desc = input('description');
        $fee  = (float)input('fee_amount');

        if (!$name) {
            flash('error', 'Activity name is required.');
        } else {
            $sb->from('activities')->eq('id', $id)->eq('school_id', $sid)->update([
                'name'        => $name,
                'description' => $desc ?: null,
                'fee_amount'  => $fee,
                'updated_at'  => date('c'),
            ]);
            flash('success', 'Activity updated.');
        }
        redirect('activities');
    }

    if ($action === 'delete') {
        $id = input('activity_id');
        $sb->from('activities')->eq('id', $id)->eq('school_id', $sid)->update(['is_active' => false]);
        flash('success', 'Activity removed.');
        redirect('activities');
    }
}

// Fetch activities
$activitiesResult = $sb->from('activities')->select('*')->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$activities = $activitiesResult['data'] ?? [];

// Count students per activity
$studentCounts = [];
foreach ($activities as $a) {
    $countResult = $sb->from('student_activities')->select('id')->eq('activity_id', $a['id'])->eq('school_id', $sid)->execute();
    $studentCounts[$a['id']] = is_array($countResult['data']) ? count($countResult['data']) : 0;
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Activities</h1>
        <p class="text-sm text-gray-500 mt-1">Extracurricular activities with fees</p>
    </div>
    <button onclick="document.getElementById('addModal').classList.remove('hidden')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
        + Add Activity
    </button>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Activity</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Description</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Fee (per term)</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Students</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($activities)): ?>
                <tr><td colspan="5" class="px-4 py-12 text-center text-gray-400">No activities yet</td></tr>
            <?php else: ?>
                <?php foreach ($activities as $a): ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($a['name']) ?></td>
                        <td class="px-4 py-3 text-gray-600"><?= e($a['description'] ?? '—') ?></td>
                        <td class="px-4 py-3 text-right font-medium text-gray-900"><?= money((float)($a['fee_amount'] ?? 0)) ?></td>
                        <td class="px-4 py-3 text-center">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700"><?= $studentCounts[$a['id']] ?? 0 ?></span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <button onclick="editActivity('<?= e($a['id']) ?>','<?= e(addslashes($a['name'])) ?>','<?= e(addslashes($a['description'] ?? '')) ?>',<?= (float)($a['fee_amount'] ?? 0) ?>)" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium mr-2">Edit</button>
                            <form method="POST" class="inline" onsubmit="return confirm('Remove this activity?')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="delete">
                                <input type="hidden" name="activity_id" value="<?= e($a['id']) ?>">
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
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Add Activity</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Activity Name *</label>
                <input type="text" name="name" required placeholder="e.g. Swimming"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" name="description" placeholder="Optional"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Fee Amount (per term)</label>
                <input type="number" name="fee_amount" step="0.01" min="0" value="0"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Add Activity</button>
                <button type="button" onclick="document.getElementById('addModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Modal -->
<div id="editModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Activity</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="activity_id" id="eaId">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Activity Name *</label>
                <input type="text" name="name" id="eaName" required
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" name="description" id="eaDesc" placeholder="Optional"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Fee Amount (per term)</label>
                <input type="number" name="fee_amount" id="eaFee" step="0.01" min="0"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Changes</button>
                <button type="button" onclick="document.getElementById('editModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
function editActivity(id, name, desc, fee) {
    document.getElementById('eaId').value = id;
    document.getElementById('eaName').value = name;
    document.getElementById('eaDesc').value = desc;
    document.getElementById('eaFee').value = fee;
    document.getElementById('editModal').classList.remove('hidden');
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
