<?php
/**
 * Classes — manage classes / grade levels.
 */
$pageTitle = 'Classes';
$sb  = new Supabase();
$sid = schoolId();

// Handle add/edit/delete
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'add') {
        $name  = input('name');
        $level = input('level');
        $cap   = input('capacity');
        if ($name) {
            $sb->from('classes')->insert([
                'school_id' => $sid,
                'name'      => $name,
                'level'     => (int)$level ?: 0,
                'capacity'  => ($cap !== '' && (int)$cap > 0) ? (int)$cap : null,
            ]);
            flash('success', 'Class added.');
        }
    } elseif ($action === 'edit') {
        $classId   = input('class_id');
        $name      = input('name');
        $level     = input('level');
        $cap       = input('capacity');
        $teacherId = trim((string)input('class_teacher_id'));
        if ($classId && $name) {
            $sb->from('classes')->eq('id', $classId)->eq('school_id', $sid)->update([
                'name'             => $name,
                'level'            => (int)$level ?: 0,
                'capacity'         => ($cap !== '' && (int)$cap > 0) ? (int)$cap : null,
                'class_teacher_id' => ($teacherId !== '' ? $teacherId : null),
            ]);
            flash('success', 'Class updated.');
        }
    } elseif ($action === 'delete') {
        $classId = input('class_id');
        // Check if class has students
        $check = $sb->from('students')->select('id')->eq('school_id', $sid)->eq('current_class_id', $classId)->eq('status', 'active')->limit(1)->execute();
        if (!empty($check['data'])) {
            flash('error', 'Cannot delete a class that has students. Move students first.');
        } else {
            $sb->from('classes')->eq('id', $classId)->eq('school_id', $sid)->delete();
            flash('success', 'Class deleted.');
        }
    } elseif ($action === 'set_subjects') {
        $classId    = input('class_id');
        $subjectIds = $_POST['subject_ids'] ?? [];
        if ($classId) {
            $diff = setClassSubjects($classId, $subjectIds);
            flash('success', 'Subjects updated for this class. (' . $diff['added'] . ' added, ' . $diff['removed'] . ' removed.)');
        }
    }
    Supabase::clearCache("classes_$sid");
    redirect('classes');
}

// Load class → subject_ids map for the "Edit subjects" modal pre-check.
$allSubjects = cachedSubjects();
$classSubjectMap = [];
$csRes = $sb->from('class_subjects')->select('class_id,subject_id')
    ->eq('school_id', $sid)->execute();
foreach (($csRes['data'] ?? []) as $row) {
    $classSubjectMap[$row['class_id']][] = $row['subject_id'];
}

$classesResult = $sb->from('classes')->select('id,name,level,class_teacher_id,capacity')->eq('school_id', $sid)->order('level')->execute();
$classes = $classesResult['data'] ?? [];

// Teaching staff for the class-teacher dropdown.
$teachingStaff = cachedTeachingStaff();
$staffNameMap  = [];
foreach ($teachingStaff as $t) {
    $staffNameMap[$t['user_id']] = $t['name'];
}

// Count students per class. (There is no get_class_student_counts RPC in this
// database, so we tally active students in PHP — cheap at this scale.)
$classCounts = [];
$countRows = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('students')->select('current_class_id')->eq('school_id', $sid)->eq('status', 'active')
);
foreach ($countRows as $r) {
    $cid = $r['current_class_id'] ?? null;
    if ($cid) $classCounts[$cid] = ($classCounts[$cid] ?? 0) + 1;
}

// School-wide capacity roll-up (only over classes that have a target set).
$totCap = 0; $totEnrolledCapped = 0; $classesWithCap = 0;
foreach ($classes as $c) {
    if (($c['capacity'] ?? null) !== null && (int)$c['capacity'] > 0) {
        $classesWithCap++;
        $totCap += (int)$c['capacity'];
        $totEnrolledCapped += (int)($classCounts[$c['id']] ?? 0);
    }
}
$totFree = max(0, $totCap - $totEnrolledCapped);

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Classes</h1>
        <p class="text-sm text-gray-500 mt-1"><?= count($classes) ?> class<?= count($classes) !== 1 ? 'es' : '' ?></p>
    </div>
    <?php if ($classesWithCap > 0): ?>
    <div class="flex items-center gap-6 bg-white rounded-xl border border-gray-100 px-5 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="text-center"><p class="text-xl font-bold text-gray-900"><?= number_format($totEnrolledCapped) ?><span class="text-gray-300">/</span><?= number_format($totCap) ?></p><p class="text-[11px] text-gray-500 uppercase tracking-wide">Enrolled / capacity</p></div>
        <div class="text-center"><p class="text-xl font-bold <?= $totFree > 0 ? 'text-emerald-600' : 'text-gray-400' ?>"><?= number_format($totFree) ?></p><p class="text-[11px] text-gray-500 uppercase tracking-wide">Free seats to fill</p></div>
    </div>
    <?php endif; ?>
</div>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Add Class Form -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-4">Add New Class</h2>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add">
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Class Name</label>
                <input type="text" name="name" required placeholder="e.g. Grade 1"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Level (sorting order)</label>
                <input type="number" name="level" placeholder="1" min="0"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm text-gray-600 mb-1">Capacity <span class="text-gray-400">(optional)</span></label>
                <input type="number" name="capacity" placeholder="e.g. 40" min="1"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <p class="text-[11px] text-gray-400 mt-1">Target enrolment — shows free seats so you can see where to recruit.</p>
            </div>
            <button type="submit" class="w-full py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                Add Class
            </button>
        </form>
    </div>

    <!-- Classes List -->
    <div class="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Class Name</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Class Teacher</th>
                    <th class="text-center px-4 py-3 font-semibold text-gray-600">Enrolled</th>
                    <th class="text-center px-4 py-3 font-semibold text-gray-600">Capacity</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600 w-40">Free seats</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($classes)): ?>
                    <tr><td colspan="6" class="px-4 py-12 text-center text-gray-400">No classes yet</td></tr>
                <?php else: ?>
                    <?php foreach ($classes as $c):
                        $enrolled = (int)($classCounts[$c['id']] ?? 0);
                        $cap      = ($c['capacity'] ?? null) !== null ? (int)$c['capacity'] : null;
                        $free     = $cap !== null ? ($cap - $enrolled) : null;
                        $pct      = ($cap !== null && $cap > 0) ? min(100, round($enrolled / $cap * 100)) : null;
                    ?>
                        <tr class="hover:bg-gray-50/50" id="row-<?= e($c['id']) ?>">
                            <td class="px-4 py-3 font-medium text-gray-900"><?= e($c['name']) ?></td>
                            <td class="px-4 py-3 text-gray-700 text-sm">
                                <?php
                                $teacherName = !empty($c['class_teacher_id'])
                                    ? ($staffNameMap[$c['class_teacher_id']] ?? 'Unknown')
                                    : '';
                                ?>
                                <?php if ($teacherName !== ''): ?>
                                    <?= e($teacherName) ?>
                                <?php else: ?>
                                    <span class="text-gray-300 text-xs">Not assigned</span>
                                <?php endif; ?>
                            </td>
                            <td class="px-4 py-3 text-center">
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><?= $enrolled ?></span>
                            </td>
                            <td class="px-4 py-3 text-center text-gray-600"><?= $cap !== null ? $cap : '<span class="text-gray-300">—</span>' ?></td>
                            <td class="px-4 py-3">
                                <?php if ($cap === null): ?>
                                    <span class="text-gray-300 text-xs">No target set</span>
                                <?php elseif ($free > 0): ?>
                                    <div class="flex items-center gap-2">
                                        <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full <?= $pct >= 90 ? 'bg-amber-400' : 'bg-emerald-500' ?>" style="width: <?= $pct ?>%"></div></div>
                                        <span class="text-xs font-medium text-emerald-700 whitespace-nowrap"><?= $free ?> free</span>
                                    </div>
                                <?php elseif ($free === 0): ?>
                                    <span class="text-xs font-medium text-gray-500">Full</span>
                                <?php else: ?>
                                    <span class="text-xs font-medium text-red-600"><?= abs($free) ?> over</span>
                                <?php endif; ?>
                            </td>
                            <td class="px-4 py-3 text-right">
                                <button onclick="editSubjects('<?= e($c['id']) ?>','<?= e(addslashes($c['name'])) ?>')" class="text-blue-600 hover:text-blue-800 text-xs font-medium">Subjects (<?= count($classSubjectMap[$c['id']] ?? []) ?>)</button>
                                <button onclick='editClass(<?= jsonHtml($c, JSON_UNESCAPED_SLASHES) ?>)' class="text-emerald-600 hover:text-emerald-800 text-xs font-medium ml-2">Edit</button>
                                <form method="POST" class="inline ml-2" onsubmit="return confirm('Delete this class?')">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="class_id" value="<?= e($c['id']) ?>">
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

<!-- Edit Modal (hidden by default) -->
<div id="editModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Class</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="class_id" id="editClassId">
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Class Name</label>
                <input type="text" name="name" id="editName" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="block text-sm text-gray-600 mb-1">Level</label>
                    <input type="number" name="level" id="editLevel" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm text-gray-600 mb-1">Capacity</label>
                    <input type="number" name="capacity" id="editCapacity" min="1" placeholder="e.g. 40" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mb-4">
                <label class="block text-sm text-gray-600 mb-1">Class Teacher</label>
                <select name="class_teacher_id" id="editClassTeacher" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="">— Not assigned —</option>
                    <?php foreach ($teachingStaff as $t): ?>
                        <option value="<?= e($t['user_id']) ?>"><?= e($t['name']) ?> <span class="text-gray-400">(<?= e(roleLabel($t['role'] ?? '')) ?>)</span></option>
                    <?php endforeach; ?>
                </select>
                <p class="text-[11px] text-gray-400 mt-1">The class teacher writes the overall class-teacher remark on this class's report cards.</p>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save</button>
                <button type="button" onclick="document.getElementById('editModal').classList.add('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Subjects Modal -->
<div id="subjectsModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[80vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Subjects for <span id="subjectsClassName" class="text-emerald-700"></span></h3>
        <p class="text-xs text-gray-500 mb-4">Tick the subjects this class takes. Mark entry and report cards will use these.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="set_subjects">
            <input type="hidden" name="class_id" id="subjectsClassId">
            <div class="space-y-1.5 mb-5 border-y border-gray-100 py-3">
                <?php if (empty($allSubjects)): ?>
                    <p class="text-sm text-gray-400">No subjects defined for this school yet. Add them in Settings → Subjects, then come back.</p>
                <?php endif; ?>
                <?php foreach ($allSubjects as $sub): ?>
                    <label class="flex items-center gap-2 cursor-pointer py-0.5">
                        <input type="checkbox" name="subject_ids[]" value="<?= e($sub['id']) ?>"
                               data-subject-id="<?= e($sub['id']) ?>"
                               class="subject-checkbox rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                        <span class="text-sm text-gray-800"><?= e($sub['name']) ?></span>
                        <?php if (!empty($sub['code'])): ?>
                            <span class="text-xs text-gray-400">(<?= e($sub['code']) ?>)</span>
                        <?php endif; ?>
                    </label>
                <?php endforeach; ?>
            </div>
            <div class="flex items-center justify-between">
                <div class="flex gap-3">
                    <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save Subjects</button>
                    <button type="button" onclick="document.getElementById('subjectsModal').classList.add('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                </div>
                <div class="flex gap-2 text-xs">
                    <button type="button" onclick="toggleAllSubjects(true)" class="text-gray-500 hover:text-emerald-600">Select all</button>
                    <span class="text-gray-300">·</span>
                    <button type="button" onclick="toggleAllSubjects(false)" class="text-gray-500 hover:text-red-600">Clear</button>
                </div>
            </div>
        </form>
    </div>
</div>

<script>
const classSubjectMap = <?= jsonHtml($classSubjectMap, JSON_UNESCAPED_SLASHES) ?>;

function editClass(cls) {
    document.getElementById('editClassId').value = cls.id || '';
    document.getElementById('editName').value = cls.name || '';
    document.getElementById('editLevel').value = cls.level || 0;
    document.getElementById('editCapacity').value = cls.capacity || '';
    document.getElementById('editClassTeacher').value = cls.class_teacher_id || '';
    document.getElementById('editModal').classList.remove('hidden');
}

function editSubjects(classId, className) {
    document.getElementById('subjectsClassId').value = classId;
    document.getElementById('subjectsClassName').textContent = className;
    const enabled = new Set(classSubjectMap[classId] || []);
    document.querySelectorAll('.subject-checkbox').forEach(cb => {
        cb.checked = enabled.has(cb.dataset.subjectId);
    });
    document.getElementById('subjectsModal').classList.remove('hidden');
}

function toggleAllSubjects(checked) {
    document.querySelectorAll('.subject-checkbox').forEach(cb => { cb.checked = checked; });
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
