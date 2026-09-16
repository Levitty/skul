<?php
/**
 * Exams — manage exam sessions.
 */
$pageTitle = 'Exams';
$sb  = new Supabase();
$sid = schoolId();

// Get current academic year (required for exams)
$currentYear = cachedCurrentYear();
$academicYearId = $currentYear['id'] ?? null;

// Handle actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'add') {
        $name      = input('name');
        $termId    = input('term_id');
        $startDate = input('start_date');
        $endDate   = input('end_date');
        $maxMarks  = (int)input('max_marks') ?: 100;

        if (!$name) {
            flash('error', 'Exam name is required.');
        } elseif (!$academicYearId) {
            flash('error', 'No active academic year. Set one in Settings first.');
        } else {
            $result = $sb->from('exams')->insert([
                'school_id'        => $sid,
                'name'             => $name,
                'academic_year_id' => $academicYearId,
                'term_id'          => $termId ?: null,
                'start_date'       => $startDate ?: null,
                'end_date'         => $endDate ?: null,
                'max_marks'        => $maxMarks,
                'status'           => 'upcoming',
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Exam created.');
            }
        }
        redirect('exams');
    }

    if ($action === 'edit') {
        $examId    = input('exam_id');
        $name      = input('name');
        $termId    = input('term_id');
        $startDate = input('start_date');
        $endDate   = input('end_date');
        $maxMarks  = (int)input('max_marks') ?: 100;
        $status    = input('status') ?: 'upcoming';

        if (!$name) {
            flash('error', 'Exam name is required.');
        } else {
            $result = $sb->from('exams')->eq('id', $examId)->eq('school_id', $sid)->update([
                'name'       => $name,
                'term_id'    => $termId ?: null,
                'start_date' => $startDate ?: null,
                'end_date'   => $endDate ?: null,
                'max_marks'  => $maxMarks,
                'status'     => $status,
                'updated_at' => date('c'),
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Exam updated.');
            }
        }
        redirect('exams');
    }

    if ($action === 'delete') {
        $examId = input('exam_id');
        $sb->from('exams')->eq('id', $examId)->eq('school_id', $sid)->delete();
        flash('success', 'Exam deleted.');
        redirect('exams');
    }
}

// Get terms
$terms = cachedTerms();

// Get exams
$examsResult = $sb->from('exams')->select('*')->eq('school_id', $sid)->order('created_at', false)->execute();
$exams = $examsResult['data'] ?? [];

$termMap = [];
foreach ($terms as $t) $termMap[$t['id']] = $t['name'];

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Exams</h1>
        <p class="text-sm text-gray-500 mt-1"><?= count($exams) ?> exam<?= count($exams) !== 1 ? 's' : '' ?></p>
    </div>
    <button onclick="document.getElementById('addModal').classList.remove('hidden')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
        + Add Exam
    </button>
</div>

<!-- Exams Grid -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <?php if (empty($exams)): ?>
        <div class="col-span-full bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            No exams created yet.
        </div>
    <?php else: ?>
        <?php foreach ($exams as $ex): ?>
            <?php
            $statusColors = [
                'upcoming'    => 'bg-blue-50 text-blue-700',
                'in_progress' => 'bg-amber-50 text-amber-700',
                'completed'   => 'bg-emerald-50 text-emerald-700',
            ];
            $status = $ex['status'] ?? 'upcoming';
            ?>
            <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div class="flex items-start justify-between mb-3">
                    <h3 class="font-semibold text-gray-900"><?= e($ex['name']) ?></h3>
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium <?= $statusColors[$status] ?? $statusColors['upcoming'] ?>">
                        <?= ucfirst(str_replace('_', ' ', $status)) ?>
                    </span>
                </div>
                <div class="space-y-1 text-sm text-gray-500">
                    <p>Term: <?= e($termMap[$ex['term_id'] ?? ''] ?? '—') ?></p>
                    <p>Max Marks: <?= (int)($ex['max_marks'] ?? 100) ?></p>
                    <?php if ($ex['start_date']): ?>
                        <p>Date: <?= formatDate($ex['start_date']) ?><?= $ex['end_date'] ? ' — ' . formatDate($ex['end_date']) : '' ?></p>
                    <?php endif; ?>
                </div>
                <div class="mt-3 flex gap-2">
                    <a href="<?= baseUrl('grades/entry?exam_id=' . $ex['id']) ?>" class="text-xs font-medium text-emerald-600 hover:text-emerald-800">Enter Grades</a>
                    <button onclick="editExam('<?= e($ex['id']) ?>','<?= e(addslashes($ex['name'])) ?>','<?= e($ex['term_id'] ?? '') ?>','<?= e($ex['start_date'] ?? '') ?>','<?= e($ex['end_date'] ?? '') ?>',<?= (int)($ex['max_marks'] ?? 100) ?>,'<?= e($status) ?>')" class="text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>
                    <form method="POST" class="inline" onsubmit="return confirm('Delete this exam?')">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="exam_id" value="<?= e($ex['id']) ?>">
                        <button type="submit" class="text-xs font-medium text-red-500 hover:text-red-700">Delete</button>
                    </form>
                </div>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>

<!-- Add Modal -->
<div id="addModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Create Exam</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Exam Name *</label>
                <input type="text" name="name" required placeholder="e.g. Mid-Term Exam 2026"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Term</label>
                <select name="term_id" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="">Select term</option>
                    <?php foreach ($terms as $t): ?>
                        <option value="<?= e($t['id']) ?>"><?= e($t['name']) ?><?= ($t['is_current'] ?? false) ? ' (current)' : '' ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Max Marks</label>
                <input type="number" name="max_marks" value="100" min="1"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input type="date" name="start_date" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input type="date" name="end_date" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>

            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                    Create Exam
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
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Exam</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="exam_id" id="editExamId">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Exam Name *</label>
                <input type="text" name="name" id="editName" required
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Term</label>
                <select name="term_id" id="editTermId" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="">Select term</option>
                    <?php foreach ($terms as $t): ?>
                        <option value="<?= e($t['id']) ?>"><?= e($t['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select name="status" id="editStatus" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="upcoming">Upcoming</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Max Marks</label>
                <input type="number" name="max_marks" id="editMaxMarks" min="1"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input type="date" name="start_date" id="editStartDate" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input type="date" name="end_date" id="editEndDate" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
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
function editExam(id, name, termId, startDate, endDate, maxMarks, status) {
    document.getElementById('editExamId').value = id;
    document.getElementById('editName').value = name;
    document.getElementById('editTermId').value = termId;
    document.getElementById('editStartDate').value = startDate ? startDate.substring(0, 10) : '';
    document.getElementById('editEndDate').value = endDate ? endDate.substring(0, 10) : '';
    document.getElementById('editMaxMarks').value = maxMarks;
    document.getElementById('editStatus').value = status;
    document.getElementById('editModal').classList.remove('hidden');
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
