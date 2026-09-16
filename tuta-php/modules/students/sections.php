<?php
/**
 * Sections — manage class sections (e.g. Grade 1-A, Grade 1-B).
 */
$pageTitle = 'Sections';
$sb  = new Supabase();
$sid = schoolId();

$classes = cachedClasses();
$classMap = cachedClassMap();

// `sections` has no school_id column — it's scoped only through class_id →
// classes. Running with the service-role key (RLS off), every read/write MUST
// be constrained to THIS school's class ids, or a forged class_id/section_id
// lets a user read, edit, or delete another tenant's sections.
$schoolClassIds = array_column($classes, 'id');

// Handle add/edit/delete
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'add') {
        $classId  = input('class_id');
        $name     = input('name');
        $capacity = input('capacity');
        if (!in_array($classId, $schoolClassIds, true)) {
            flash('error', 'Pick a valid class.');
        } elseif ($name) {
            $sb->from('sections')->insert([
                'class_id' => $classId,
                'name'     => $name,
                'capacity' => $capacity ? (int)$capacity : null,
            ]);
            flash('success', 'Section added.');
        }
    } elseif ($action === 'edit') {
        $secId    = input('section_id');
        $classId  = input('class_id');
        $name     = input('name');
        $capacity = input('capacity');
        if (!in_array($classId, $schoolClassIds, true)) {
            flash('error', 'Pick a valid class.');
        } elseif ($secId && $name) {
            // The ->in('class_id', …) filter means the UPDATE only touches a
            // section that currently belongs to one of this school's classes.
            $sb->from('sections')->eq('id', $secId)->in('class_id', $schoolClassIds)->update([
                'class_id' => $classId,
                'name'     => $name,
                'capacity' => $capacity ? (int)$capacity : null,
                'updated_at' => date('c'),
            ]);
            flash('success', 'Section updated.');
        }
    } elseif ($action === 'delete') {
        $secId = input('section_id');
        // Check if section has students
        $check = $sb->from('students')->select('id')->eq('school_id', $sid)->eq('section_id', $secId)->eq('status', 'active')->limit(1)->execute();
        if (!empty($check['data'])) {
            flash('error', 'Cannot delete a section that has students. Move students first.');
        } elseif (!empty($schoolClassIds)) {
            $sb->from('sections')->eq('id', $secId)->in('class_id', $schoolClassIds)->delete();
            flash('success', 'Section deleted.');
        }
    }
    redirect('sections');
}

// Fetch THIS school's sections only (scoped through its class ids).
$sections = [];
if (!empty($schoolClassIds)) {
    $sectionsResult = $sb->from('sections')->select('id,class_id,name,capacity')
        ->in('class_id', $schoolClassIds)->order('class_id')->execute();
    $sections = $sectionsResult['data'] ?? [];
}

// Count students per section
$studentsResult = $sb->from('students')->select('id,section_id')->eq('school_id', $sid)->eq('status', 'active')->execute();
$sectionCounts = [];
foreach (($studentsResult['data'] ?? []) as $s) {
    $secId = $s['section_id'] ?? 'none';
    $sectionCounts[$secId] = ($sectionCounts[$secId] ?? 0) + 1;
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Sections</h1>
        <p class="text-sm text-gray-500 mt-1"><?= count($sections) ?> section<?= count($sections) !== 1 ? 's' : '' ?> across <?= count($classes) ?> classes</p>
    </div>
</div>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Add Section Form -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-4">Add New Section</h2>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add">
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Class</label>
                <select name="class_id" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="">Select class</option>
                    <?php foreach ($classes as $c): ?>
                        <option value="<?= e($c['id']) ?>"><?= e($c['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Section Name</label>
                <input type="text" name="name" required placeholder="e.g. A, B, Blue"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm text-gray-600 mb-1">Capacity (optional)</label>
                <input type="number" name="capacity" placeholder="e.g. 40" min="1"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <button type="submit" class="w-full py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                Add Section
            </button>
        </form>
    </div>

    <!-- Sections List -->
    <div class="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Section</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                    <th class="text-center px-4 py-3 font-semibold text-gray-600">Students</th>
                    <th class="text-center px-4 py-3 font-semibold text-gray-600">Capacity</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($sections)): ?>
                    <tr><td colspan="5" class="px-4 py-12 text-center text-gray-400">No sections yet</td></tr>
                <?php else: ?>
                    <?php foreach ($sections as $sec): ?>
                        <tr class="hover:bg-gray-50/50">
                            <td class="px-4 py-3 font-medium text-gray-900"><?= e($sec['name']) ?></td>
                            <td class="px-4 py-3 text-gray-600"><?= e($classMap[$sec['class_id']] ?? '—') ?></td>
                            <td class="px-4 py-3 text-center">
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                                    <?= $sectionCounts[$sec['id']] ?? 0 ?>
                                </span>
                            </td>
                            <td class="px-4 py-3 text-center text-gray-600"><?= $sec['capacity'] ? (int)$sec['capacity'] : '—' ?></td>
                            <td class="px-4 py-3 text-right">
                                <button onclick="editSection('<?= e(addslashes($sec['id'])) ?>','<?= e(addslashes($sec['class_id'])) ?>','<?= e(addslashes($sec['name'])) ?>',<?= (int)($sec['capacity'] ?? 0) ?>)" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Edit</button>
                                <form method="POST" class="inline ml-2" onsubmit="return confirm('Delete this section?')">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="section_id" value="<?= e($sec['id']) ?>">
                                    <button type="submit" class="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Edit Modal -->
<div id="editModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Section</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="section_id" id="editSecId">
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Class</label>
                <select name="class_id" id="editClassId" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <?php foreach ($classes as $c): ?>
                        <option value="<?= e($c['id']) ?>"><?= e($c['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Section Name</label>
                <input type="text" name="name" id="editName" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm text-gray-600 mb-1">Capacity</label>
                <input type="number" name="capacity" id="editCapacity" min="1" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save</button>
                <button type="button" onclick="document.getElementById('editModal').classList.add('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
function editSection(id, classId, name, capacity) {
    document.getElementById('editSecId').value = id;
    document.getElementById('editClassId').value = classId;
    document.getElementById('editName').value = name;
    document.getElementById('editCapacity').value = capacity || '';
    document.getElementById('editModal').classList.remove('hidden');
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
