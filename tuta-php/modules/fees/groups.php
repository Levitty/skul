<?php
/**
 * Fee Groups — bundle fee heads together for invoicing.
 */
$pageTitle = 'Fee Groups';
$sb  = new Supabase();
$sid = schoolId();

$classes = cachedClasses();
$classMap = cachedClassMap();

// Get current academic year (required for fee_groups and fee_group_assignments)
$currentYear = cachedCurrentYear();
$academicYearId = $currentYear['id'] ?? null;

// Get fee heads for selection
$headsResult = $sb->from('fee_heads')->select('id,name,category,amount,class_id')->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$feeHeads = $headsResult['data'] ?? [];

// Handle actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'add') {
        $name     = input('name');
        $desc     = input('description');
        $classIds = $_POST['class_ids'] ?? [];
        $headIds  = $_POST['head_ids'] ?? [];

        if (!$name) {
            flash('error', 'Group name is required.');
        } elseif (!$academicYearId) {
            flash('error', 'No active academic year. Set one in Settings first.');
        } else {
            $result = $sb->from('fee_groups')->insert([
                'school_id'        => $sid,
                'name'             => $name,
                'description'      => $desc ?: null,
                'academic_year_id' => $academicYearId,
                'is_active'        => true,
            ]);

            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                $groupId = $result['data'][0]['id'] ?? null;
                if ($groupId) {
                    // Add class assignments
                    foreach ($classIds as $cid) {
                        $sb->from('fee_group_assignments')->insert([
                            'fee_group_id'     => $groupId,
                            'class_id'         => $cid,
                            'academic_year_id' => $academicYearId,
                        ]);
                    }
                    // Add fee head items
                    foreach ($headIds as $hid) {
                        $head = null;
                        foreach ($feeHeads as $fh) { if ($fh['id'] === $hid) { $head = $fh; break; } }
                        $sb->from('fee_group_items')->insert([
                            'fee_group_id' => $groupId,
                            'fee_head_id'  => $hid,
                            'amount'       => (float)($head['amount'] ?? 0),
                        ]);
                    }
                }
                flash('success', 'Fee group created.');
            }
        }
        redirect('fees/groups');
    }

    if ($action === 'edit') {
        $id   = input('group_id');
        $name = input('name');
        $desc = input('description');
        if (!$name) {
            flash('error', 'Group name is required.');
        } else {
            $result = $sb->from('fee_groups')->eq('id', $id)->eq('school_id', $sid)->update([
                'name'        => $name,
                'description' => $desc ?: null,
                'updated_at'  => date('c'),
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Fee group updated.');
            }
        }
        redirect('fees/groups');
    }

    if ($action === 'delete') {
        $id = input('group_id');
        $sb->from('fee_groups')->eq('id', $id)->eq('school_id', $sid)->update(['is_active' => false]);
        flash('success', 'Fee group removed.');
        redirect('fees/groups');
    }
}

// Fetch groups
$groupsResult = $sb->from('fee_groups')->select('*')->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$groups = $groupsResult['data'] ?? [];

// Get assignments & items for each group
$groupDetails = [];
foreach ($groups as $g) {
    $gid = $g['id'];
    $assignments = $sb->from('fee_group_assignments')->select('class_id')->eq('fee_group_id', $gid)->execute();
    $items = $sb->from('fee_group_items')->select('fee_head_id,amount')->eq('fee_group_id', $gid)->execute();
    $groupDetails[$gid] = [
        'classes' => array_column($assignments['data'] ?? [], 'class_id'),
        'items'   => $items['data'] ?? [],
    ];
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Fee Groups</h1>
        <p class="text-sm text-gray-500 mt-1">Bundle fee heads together for invoicing</p>
    </div>
    <button onclick="document.getElementById('addModal').classList.remove('hidden')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
        + Add Fee Group
    </button>
</div>

<!-- Groups List -->
<div class="space-y-4">
    <?php if (empty($groups)): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            No fee groups yet. Create one to bundle fee heads for invoicing.
        </div>
    <?php else: ?>
        <?php foreach ($groups as $g): ?>
            <?php
            $gid = $g['id'];
            $details = $groupDetails[$gid] ?? ['classes' => [], 'items' => []];
            $classNames = array_map(fn($cid) => $classMap[$cid] ?? '?', $details['classes']);
            $totalAmt = array_sum(array_column($details['items'], 'amount'));
            ?>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div class="flex items-start justify-between">
                    <div>
                        <h3 class="font-semibold text-gray-900"><?= e($g['name']) ?></h3>
                        <?php if ($g['description']): ?>
                            <p class="text-sm text-gray-500 mt-0.5"><?= e($g['description']) ?></p>
                        <?php endif; ?>
                        <div class="flex flex-wrap gap-1 mt-2">
                            <?php foreach ($classNames as $cn): ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700"><?= e($cn) ?></span>
                            <?php endforeach; ?>
                            <?php if (empty($classNames)): ?>
                                <span class="text-xs text-gray-400">No classes assigned</span>
                            <?php endif; ?>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-lg font-bold text-gray-900"><?= money($totalAmt) ?></p>
                        <p class="text-xs text-gray-500"><?= count($details['items']) ?> fee head(s)</p>
                        <div class="mt-2 flex items-center gap-2">
                            <button onclick="editGroup('<?= e($gid) ?>','<?= e(addslashes($g['name'])) ?>','<?= e(addslashes($g['description'] ?? '')) ?>')" class="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                            <form method="POST" class="inline" onsubmit="return confirm('Remove this group?')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="delete">
                                <input type="hidden" name="group_id" value="<?= e($gid) ?>">
                                <button type="submit" class="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>

<!-- Add Modal -->
<div id="addModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Create Fee Group</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
                <input type="text" name="name" required placeholder="e.g. Term 1 Fees"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" name="description" placeholder="Optional description"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>

            <!-- Class Selection -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Assign to Classes</label>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto border border-gray-100 rounded-lg p-3">
                    <?php foreach ($classes as $c): ?>
                        <label class="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="checkbox" name="class_ids[]" value="<?= e($c['id']) ?>" class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 fg-class-chk">
                            <span class="text-gray-700"><?= e($c['name']) ?></span>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>

            <!-- Fee Heads Selection — narrows to the classes ticked above -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Include Fee Heads</label>
                <div id="fgHeadList" class="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-3 space-y-2">
                    <?php foreach ($feeHeads as $fh): ?>
                        <label class="flex items-center justify-between cursor-pointer text-sm fg-head-row" data-class="<?= e($fh['class_id'] ?? '') ?>">
                            <div class="flex items-center gap-2">
                                <input type="checkbox" name="head_ids[]" value="<?= e($fh['id']) ?>" class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                                <span class="text-gray-700"><?= e($fh['name']) ?></span>
                                <span class="text-xs text-gray-400"><?= e($classMap[$fh['class_id'] ?? ''] ?? 'All') ?></span>
                            </div>
                            <span class="text-gray-500 font-medium"><?= money((float)($fh['amount'] ?? 0)) ?></span>
                        </label>
                    <?php endforeach; ?>
                </div>
                <p id="fgHeadHint" class="text-xs text-gray-400 mt-1">Tick classes above to narrow this list to their fee heads.</p>
            </div>
            <script>
            (function () {
                const chks = document.querySelectorAll('.fg-class-chk');
                const rows = document.querySelectorAll('.fg-head-row');
                const hint = document.getElementById('fgHeadHint');
                function refresh() {
                    const picked = Array.from(chks).filter(c => c.checked).map(c => c.value);
                    let shown = 0;
                    rows.forEach(r => {
                        const cls = r.dataset.class || '';
                        const show = picked.length === 0 || cls === '' || picked.includes(cls);
                        r.style.display = show ? '' : 'none';
                        if (!show) { const b = r.querySelector('input'); if (b) b.checked = false; }
                        if (show) shown++;
                    });
                    if (hint) hint.textContent = picked.length
                        ? 'Showing ' + shown + ' fee heads for the ticked classes (hidden ones are unticked automatically).'
                        : 'Tick classes above to narrow this list to their fee heads.';
                }
                chks.forEach(c => c.addEventListener('change', refresh));
            })();
            </script>

            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                    Create Group
                </button>
                <button type="button" onclick="document.getElementById('addModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                    Cancel
                </button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Group Modal -->
<div id="editGroupModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Fee Group</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="group_id" id="egId">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
                <input type="text" name="name" id="egName" required
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" name="description" id="egDesc" placeholder="Optional"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Changes</button>
                <button type="button" onclick="document.getElementById('editGroupModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
function editGroup(id, name, desc) {
    document.getElementById('egId').value = id;
    document.getElementById('egName').value = name;
    document.getElementById('egDesc').value = desc;
    document.getElementById('editGroupModal').classList.remove('hidden');
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
