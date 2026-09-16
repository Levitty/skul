<?php
/**
 * Teacher Homework board — record assignments per class/subject with due
 * dates and tick them done. Scoped to the classes/subjects this teacher
 * is assigned to. Deterministic; no AI.
 */
$pageTitle = 'Homework';
require_once __DIR__ . '/../../includes/storage.php';
$sb   = new Supabase();
$sid  = schoolId();
$user = currentUser();
$uid  = $user['id'] ?? '';

$mySubjects = teacherSubjectAssignments($uid);   // [{id,class_id,subject_id}]
$myClasses  = teacherClassAssignments($uid);     // [{id,name,level}]
$classMap   = cachedClassMap();
$subjectName = [];
foreach (cachedSubjects() as $s) $subjectName[$s['id']] = $s['name'];
$currentTerm = cachedCurrentTerm();

// Classes this teacher may post homework for (class-teacher OR subject-teacher).
$myClassIds = array_values(array_unique(array_merge(
    array_column($myClasses, 'id'),
    array_column($mySubjects, 'class_id')
)));
// Per-class the subjects they teach (for the subject dropdown).
$subjectsByClass = [];
foreach ($mySubjects as $a) $subjectsByClass[$a['class_id']][] = $a['subject_id'];

if (isPost() && verifyCsrf()) {
    $action = input('action');
    if ($action === 'add') {
        $classId = input('class_id');
        $title   = trim((string)input('title'));
        if (!$classId || !in_array($classId, $myClassIds, true)) {
            flash('error', 'Pick one of your classes.');
        } elseif ($title === '') {
            flash('error', 'Give the homework a title.');
        } else {
            // Optional PDF / Word attachment.
            $attUrl = $attName = null;
            if (!empty($_FILES['attachment']['name'] ?? '')) {
                $up = uploadTeacherDoc($sid, $_FILES['attachment'], 'hw');
                if (!empty($up['ok'])) {
                    $attUrl  = $up['url'];
                    $attName = $_FILES['attachment']['name'];
                } else {
                    flash('error', 'Homework not saved — attachment problem: ' . ($up['error'] ?? 'unknown'));
                    redirect('teacher/homework');
                }
            }
            $sb->from('homework')->insert([
                'school_id'       => $sid,
                'class_id'        => $classId,
                'subject_id'      => input('subject_id') ?: null,
                'term_id'         => $currentTerm['id'] ?? null,
                'title'           => $title,
                'description'     => trim((string)input('description')) ?: null,
                'due_date'        => input('due_date') ?: null,
                'attachment_url'  => $attUrl,
                'attachment_name' => $attName,
                'status'          => 'open',
                'created_by'      => $uid ?: null,
                'created_by_name' => $user['name'] ?? null,
            ]);
            flash('success', 'Homework added.');
        }
        redirect('teacher/homework');
    }
    if (in_array($action, ['done', 'reopen', 'delete'], true)) {
        $id = input('id');
        if ($action === 'delete') {
            $sb->from('homework')->eq('id', $id)->eq('school_id', $sid)->delete();
        } else {
            $sb->from('homework')->eq('id', $id)->eq('school_id', $sid)
                ->update(['status' => $action === 'done' ? 'done' : 'open']);
        }
        redirect('teacher/homework');
    }
}

// Load this teacher's homework (their classes).
$rows = [];
if (!empty($myClassIds)) {
    $rows = $sb->from('homework')
        ->select('id,class_id,subject_id,title,description,due_date,status,created_at,attachment_url,attachment_name')
        ->eq('school_id', $sid)->in('class_id', $myClassIds)
        ->order('due_date', false)->limit(300)->execute()['data'] ?? [];
}
$open = array_filter($rows, fn($r) => ($r['status'] ?? '') === 'open');
$done = array_filter($rows, fn($r) => ($r['status'] ?? '') === 'done');
$today = date('Y-m-d');
// Soonest due first for the open list.
usort($open, fn($a, $b) => ($a['due_date'] ?? '9999') <=> ($b['due_date'] ?? '9999'));

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Homework</h1>
    <p class="text-sm text-gray-500 mt-1">Assignments for your classes, with due dates.</p>
</div>

<?php if (empty($myClassIds)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        You're not assigned to any class or subject yet. Ask the admin to assign you in Settings → Teachers.
    </div>
<?php else: ?>

<!-- Add homework -->
<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <form method="POST" action="<?= baseUrl('teacher/homework') ?>" enctype="multipart/form-data" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="add">
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Class *</label>
            <select name="class_id" id="hwClass" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">—</option>
                <?php foreach ($myClassIds as $cid): ?>
                    <option value="<?= e($cid) ?>"><?= e($classMap[$cid] ?? 'Class') ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Subject</label>
            <select name="subject_id" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">General</option>
                <?php foreach ($mySubjects as $a): ?>
                    <option value="<?= e($a['subject_id']) ?>" data-class="<?= e($a['class_id']) ?>"><?= e($subjectName[$a['subject_id']] ?? 'Subject') ?> · <?= e($classMap[$a['class_id']] ?? '') ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Title *</label>
            <input type="text" name="title" required placeholder="e.g. Fractions worksheet 3" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Due date</label>
            <input type="date" name="due_date" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
        </div>
        <div class="sm:col-span-2 lg:col-span-2">
            <label class="block text-xs font-medium text-gray-500 mb-1">Details (optional)</label>
            <input type="text" name="description" placeholder="Pages, instructions…" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Attach (PDF/Word)</label>
            <input type="file" name="attachment" accept=".pdf,.doc,.docx" class="w-full text-xs text-gray-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:text-xs file:font-medium">
        </div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Add</button>
    </form>
</div>

<!-- Open homework -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
    <div class="px-5 py-4 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Open <span class="text-gray-400 font-normal">(<?= count($open) ?>)</span></h2></div>
    <?php if (empty($open)): ?>
        <div class="px-5 py-10 text-center text-gray-400 text-sm">No open homework.</div>
    <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($open as $h):
                $overdue = !empty($h['due_date']) && $h['due_date'] < $today; ?>
                <div class="px-5 py-3 flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-gray-900"><?= e($h['title']) ?></p>
                        <p class="text-xs text-gray-500 mt-0.5">
                            <?= e($classMap[$h['class_id']] ?? 'Class') ?>
                            <?php if (!empty($h['subject_id'])): ?><span class="text-gray-300 mx-1">·</span><?= e($subjectName[$h['subject_id']] ?? '') ?><?php endif; ?>
                            <?php if (!empty($h['due_date'])): ?>
                                <span class="text-gray-300 mx-1">·</span>
                                <span class="<?= $overdue ? 'text-red-600 font-medium' : 'text-gray-500' ?>">due <?= e(date('j M', strtotime($h['due_date']))) ?><?= $overdue ? ' (overdue)' : '' ?></span>
                            <?php endif; ?>
                        </p>
                        <?php if (!empty($h['description'])): ?><p class="text-xs text-gray-600 mt-1"><?= e($h['description']) ?></p><?php endif; ?>
                        <?php if (!empty($h['attachment_url'])): ?><a href="<?= e($h['attachment_url']) ?>" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 mt-1">&#128206; <?= e($h['attachment_name'] ?: 'attachment') ?></a><?php endif; ?>
                    </div>
                    <div class="flex gap-1.5 flex-shrink-0">
                        <form method="POST" action="<?= baseUrl('teacher/homework') ?>"><?= csrfField() ?><input type="hidden" name="action" value="done"><input type="hidden" name="id" value="<?= e($h['id']) ?>"><button class="px-3 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">Done</button></form>
                        <form method="POST" action="<?= baseUrl('teacher/homework') ?>" onsubmit="return confirm('Delete this homework?')"><?= csrfField() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= e($h['id']) ?>"><button class="px-2.5 py-1 text-xs font-medium text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition"></button></form>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php if (!empty($done)): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Done <span class="text-gray-400 font-normal">(<?= count($done) ?>)</span></h2></div>
    <div class="divide-y divide-gray-50">
        <?php foreach (array_slice($done, 0, 30) as $h): ?>
            <div class="px-5 py-2.5 flex items-center justify-between gap-3 opacity-70">
                <p class="text-sm text-gray-600 line-through truncate"><?= e($h['title']) ?> <span class="text-xs text-gray-400 no-underline">· <?= e($classMap[$h['class_id']] ?? '') ?></span></p>
                <form method="POST" action="<?= baseUrl('teacher/homework') ?>"><?= csrfField() ?><input type="hidden" name="action" value="reopen"><input type="hidden" name="id" value="<?= e($h['id']) ?>"><button class="text-xs text-gray-400 hover:text-gray-600">reopen</button></form>
            </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
