<?php
/**
 * Fee Heads — manage fee types with amounts per class.
 */
$pageTitle = 'Fee Heads';
$sb  = new Supabase();
$sid = schoolId();

$classes = cachedClasses();
$classMap = [];
foreach ($classes as $c) $classMap[$c['id']] = $c['name'];

// Handle actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'add') {
        $name      = input('name');
        $category  = input('category');
        $amount    = (float)input('amount');
        $billing   = input('billing_period') ?: 'termly';
        $mandatory = isset($_POST['is_mandatory']) ? true : false;
        $classIds  = $_POST['class_ids'] ?? [];

        if (!$name || !$category) {
            flash('error', 'Name and category are required.');
        } else {
            if (!empty($classIds)) {
                $rows = [];
                foreach ($classIds as $cid) {
                    $rows[] = [
                        'school_id'      => $sid,
                        'name'           => $name,
                        'category'       => $category,
                        'amount'         => $amount,
                        'billing_period' => $billing,
                        'is_mandatory'   => $mandatory,
                        'class_id'       => $cid,
                        'is_active'      => true,
                    ];
                }
                $result = $sb->from('fee_heads')->insert($rows);
            } else {
                $result = $sb->from('fee_heads')->insert([
                    'school_id'      => $sid,
                    'name'           => $name,
                    'category'       => $category,
                    'amount'         => $amount,
                    'billing_period' => $billing,
                    'is_mandatory'   => $mandatory,
                    'class_id'       => null,
                    'is_active'      => true,
                ]);
            }

            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Fee head added.');
            }
        }
        redirect('fees/heads');
    }

    if ($action === 'edit') {
        $id        = input('fee_head_id');
        $name      = input('name');
        $category  = input('category');
        $amount    = (float)input('amount');
        $billing   = input('billing_period') ?: 'termly';
        $mandatory = isset($_POST['is_mandatory']) ? true : false;

        if (!$name || !$category) {
            flash('error', 'Name and category are required.');
        } else {
            $result = $sb->from('fee_heads')->eq('id', $id)->eq('school_id', $sid)->update([
                'name'           => $name,
                'category'       => $category,
                'amount'         => $amount,
                'billing_period' => $billing,
                'is_mandatory'   => $mandatory,
                'updated_at'     => date('c'),
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Fee head updated.');
            }
        }
        redirect('fees/heads');
    }

    if ($action === 'delete') {
        $id = input('fee_head_id');
        $sb->from('fee_heads')->eq('id', $id)->eq('school_id', $sid)->update(['is_active' => false]);
        flash('success', 'Fee head removed.');
        redirect('fees/heads');
    }
}

// Fetch fee heads
$headsResult = $sb->from('fee_heads')->select('*')->eq('school_id', $sid)->eq('is_active', 'true')->order('category')->order('name')->execute();
$heads = $headsResult['data'] ?? [];

// Group by category
$grouped = [];
$totalAmount = 0;
foreach ($heads as $h) {
    $cat = $h['category'] ?? 'Uncategorized';
    $grouped[$cat][] = $h;
    $totalAmount += (float)($h['amount'] ?? 0);
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Fee Heads</h1>
        <p class="text-sm text-gray-500 mt-1"><?= count($heads) ?> fee head<?= count($heads) !== 1 ? 's' : '' ?> &middot; Total: <?= money($totalAmount) ?></p>
    </div>
    <button onclick="document.getElementById('addModal').classList.remove('hidden')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
        + Add Fee Head
    </button>
</div>

<!-- Fee Heads Table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Billing</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Mandatory</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php
            $billingLabels = [
                'one_time'    => 'One-Time',
                'monthly'     => 'Monthly',
                'termly'      => 'Termly',
                'quarterly'   => 'Quarterly',
                'half_yearly' => 'Half-Yearly',
                'annually'    => 'Annually',
            ];
            $billingColors = [
                'one_time'    => 'bg-gray-100 text-gray-600',
                'monthly'     => 'bg-blue-50 text-blue-700',
                'termly'      => 'bg-emerald-50 text-emerald-700',
                'quarterly'   => 'bg-amber-50 text-amber-700',
                'half_yearly' => 'bg-purple-50 text-purple-700',
                'annually'    => 'bg-indigo-50 text-indigo-700',
            ];
            ?>
            <?php if (empty($heads)): ?>
                <tr><td colspan="7" class="px-4 py-12 text-center text-gray-400">No fee heads yet</td></tr>
            <?php else: ?>
                <?php foreach ($heads as $h): ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($h['name']) ?></td>
                        <td class="px-4 py-3 text-gray-600">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                <?= e(ucfirst($h['category'])) ?>
                            </span>
                        </td>
                        <td class="px-4 py-3 text-gray-600"><?= e($classMap[$h['class_id'] ?? ''] ?? 'All Classes') ?></td>
                        <?php $bp = $h['billing_period'] ?? 'termly'; ?>
                        <td class="px-4 py-3 text-center">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium <?= $billingColors[$bp] ?? 'bg-gray-100 text-gray-600' ?>">
                                <?= $billingLabels[$bp] ?? ucfirst($bp) ?>
                            </span>
                        </td>
                        <td class="px-4 py-3 text-right font-medium text-gray-900"><?= money((float)($h['amount'] ?? 0)) ?></td>
                        <td class="px-4 py-3 text-center">
                            <?php if ($h['is_mandatory'] ?? true): ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Yes</span>
                            <?php else: ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">No</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <button onclick="editHead('<?= e($h['id']) ?>','<?= e(addslashes($h['name'])) ?>','<?= e($h['category']) ?>',<?= (float)($h['amount'] ?? 0) ?>,<?= ($h['is_mandatory'] ?? true) ? 'true' : 'false' ?>,'<?= e($bp) ?>')" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium mr-2">Edit</button>
                            <form method="POST" class="inline" onsubmit="return confirm('Remove this fee head?')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="delete">
                                <input type="hidden" name="fee_head_id" value="<?= e($h['id']) ?>">
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
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Add Fee Head</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add">

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input type="text" name="name" required placeholder="e.g. Tuition Fee"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select name="category" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select</option>
                        <option value="academic">Academic</option>
                        <option value="transport">Transport</option>
                        <option value="boarding">Boarding</option>
                        <option value="exam">Exam</option>
                        <option value="activity">Activity</option>
                        <option value="library">Library</option>
                        <option value="technology">Technology</option>
                        <option value="uniform">Uniform</option>
                        <option value="meals">Meals</option>
                        <option value="admission">Admission</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <input type="number" name="amount" step="0.01" min="0" value="0"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Billing Period *</label>
                    <select name="billing_period" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="termly">Termly</option>
                        <option value="annually">Annually</option>
                        <option value="one_time">One-Time</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="half_yearly">Half-Yearly</option>
                    </select>
                </div>
                <div class="flex items-end">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="is_mandatory" checked class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                        <span class="text-sm text-gray-700">Mandatory</span>
                    </label>
                </div>
            </div>

            <!-- Class Selection -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Assign to Classes</label>
                <p class="text-xs text-gray-500 mb-2">Leave empty to apply to all classes</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-3">
                    <?php foreach ($classes as $c): ?>
                        <label class="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="checkbox" name="class_ids[]" value="<?= e($c['id']) ?>" class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-gray-700"><?= e($c['name']) ?></span>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>

            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                    Add Fee Head
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
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Fee Head</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="fee_head_id" id="editId">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" name="name" id="editName" required
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select name="category" id="editCategory" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="academic">Academic</option>
                    <option value="transport">Transport</option>
                    <option value="boarding">Boarding</option>
                    <option value="exam">Exam</option>
                    <option value="activity">Activity</option>
                    <option value="library">Library</option>
                    <option value="technology">Technology</option>
                    <option value="uniform">Uniform</option>
                    <option value="meals">Meals</option>
                    <option value="admission">Admission</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input type="number" name="amount" id="editAmount" step="0.01" min="0"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Billing Period</label>
                <select name="billing_period" id="editBilling" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="termly">Termly</option>
                    <option value="annually">Annually</option>
                    <option value="one_time">One-Time</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half-Yearly</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="is_mandatory" id="editMandatory" class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-700">Mandatory</span>
                </label>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Changes</button>
                <button type="button" onclick="document.getElementById('editModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
function editHead(id, name, category, amount, mandatory, billing) {
    document.getElementById('editId').value = id;
    document.getElementById('editName').value = name;
    document.getElementById('editCategory').value = category;
    document.getElementById('editAmount').value = amount;
    document.getElementById('editMandatory').checked = mandatory;
    document.getElementById('editBilling').value = billing || 'termly';
    document.getElementById('editModal').classList.remove('hidden');
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
