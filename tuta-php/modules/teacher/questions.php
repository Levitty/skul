<?php
/**
 * Teacher Question Bank — author and reuse questions per class/subject/strand.
 * Types: MCQ, short answer, structured. Deterministic (teacher-written).
 * A "Generate with Horeb" button is present but inert until the Horeb API is
 * wired — it'll create CBC-tagged questions straight into this same bank.
 */
$pageTitle = 'Question Bank';
$sb   = new Supabase();
$sid  = schoolId();
$user = currentUser();
$uid  = $user['id'] ?? '';

$mySubjects = teacherSubjectAssignments($uid);
$myClasses  = teacherClassAssignments($uid);
$classMap   = cachedClassMap();
$subjectName = [];
foreach (cachedSubjects() as $s) $subjectName[$s['id']] = $s['name'];
$myClassIds = array_values(array_unique(array_merge(array_column($myClasses, 'id'), array_column($mySubjects, 'class_id'))));

if (isPost() && verifyCsrf()) {
    $action = input('action');
    if ($action === 'add') {
        $text = trim((string)input('question_text'));
        $type = in_array(input('type'), ['mcq', 'short', 'structured'], true) ? input('type') : 'short';
        if ($text === '') {
            flash('error', 'Enter the question.');
        } else {
            $options = null;
            if ($type === 'mcq') {
                $opts = array_values(array_filter(array_map('trim', explode("\n", (string)input('options')))));
                $options = $opts ?: null;
            }
            $sb->from('questions')->insert([
                'school_id'       => $sid,
                'class_id'        => input('class_id') ?: null,
                'subject_id'      => input('subject_id') ?: null,
                'strand'          => trim((string)input('strand')) ?: null,
                'topic'           => trim((string)input('topic')) ?: null,
                'type'            => $type,
                'question_text'   => $text,
                'options'         => $options,
                'answer'          => trim((string)input('answer')) ?: null,
                'difficulty'      => in_array(input('difficulty'), ['easy', 'medium', 'hard'], true) ? input('difficulty') : 'medium',
                'source'          => 'teacher',
                'created_by'      => $uid ?: null,
                'created_by_name' => $user['name'] ?? null,
            ]);
            flash('success', 'Question added to the bank.');
        }
        redirect('teacher/questions');
    }
    if ($action === 'delete') {
        $sb->from('questions')->eq('id', input('id'))->eq('school_id', $sid)->delete();
        redirect('teacher/questions');
    }
}

$fClass = input('class_id_f');
$fType  = input('type_f');
$query = $sb->from('questions')
    ->select('id,class_id,subject_id,strand,topic,type,question_text,options,answer,difficulty,source,created_by_name')
    ->eq('school_id', $sid);
if (!empty($myClassIds)) $query = $query->in('class_id', $myClassIds);
if ($fClass) $query = $query->eq('class_id', $fClass);
if ($fType)  $query = $query->eq('type', $fType);
$questions = $query->order('created_at', false)->limit(300)->execute()['data'] ?? [];

$typeLabel = ['mcq' => 'Multiple choice', 'short' => 'Short answer', 'structured' => 'Structured'];
$diffColor = ['easy' => 'bg-emerald-50 text-emerald-700', 'medium' => 'bg-amber-50 text-amber-700', 'hard' => 'bg-red-50 text-red-700'];

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6 flex items-start justify-between gap-3 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Question Bank</h1>
        <p class="text-sm text-gray-500 mt-1">Write and reuse questions for your classes. <?= count($questions) ?> in your bank.</p>
    </div>
    <button type="button" disabled title="Coming soon — connects to Horeb to auto-generate CBC questions"
        class="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded-lg cursor-not-allowed inline-flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        Generate with Horeb <span class="text-[10px]">(soon)</span>
    </button>
</div>

<?php if (empty($myClassIds)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">You're not assigned to any class or subject yet.</div>
<?php else: ?>

<!-- Add question -->
<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <h2 class="text-sm font-semibold text-gray-700 mb-3">New question</h2>
    <?php $fc = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none'; $lc = 'block text-xs font-medium text-gray-500 mb-1'; ?>
    <form method="POST" action="<?= baseUrl('teacher/questions') ?>" class="space-y-3" id="qForm">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="add">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
                <label class="<?= $lc ?>">Class</label>
                <select name="class_id" class="<?= $fc ?>"><option value="">—</option><?php foreach ($myClassIds as $cid): ?><option value="<?= e($cid) ?>"><?= e($classMap[$cid] ?? 'Class') ?></option><?php endforeach; ?></select>
            </div>
            <div>
                <label class="<?= $lc ?>">Subject</label>
                <select name="subject_id" class="<?= $fc ?>"><option value="">—</option><?php foreach ($mySubjects as $a): ?><option value="<?= e($a['subject_id']) ?>"><?= e($subjectName[$a['subject_id']] ?? '') ?> · <?= e($classMap[$a['class_id']] ?? '') ?></option><?php endforeach; ?></select>
            </div>
            <div><label class="<?= $lc ?>">Strand</label><input type="text" name="strand" class="<?= $fc ?>"></div>
            <div>
                <label class="<?= $lc ?>">Type</label>
                <select name="type" id="qType" class="<?= $fc ?>" onchange="document.getElementById('mcqOpts').style.display = this.value==='mcq' ? '' : 'none';">
                    <option value="short">Short answer</option>
                    <option value="mcq">Multiple choice</option>
                    <option value="structured">Structured</option>
                </select>
            </div>
            <div>
                <label class="<?= $lc ?>">Difficulty</label>
                <select name="difficulty" class="<?= $fc ?>"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select>
            </div>
        </div>
        <div><label class="<?= $lc ?>">Question *</label><textarea name="question_text" rows="2" required class="<?= $fc ?>"></textarea></div>
        <div id="mcqOpts" style="display:none;"><label class="<?= $lc ?>">Options (one per line)</label><textarea name="options" rows="3" placeholder="A. …&#10;B. …&#10;C. …&#10;D. …" class="<?= $fc ?>"></textarea></div>
        <div><label class="<?= $lc ?>">Answer / marking note (optional)</label><input type="text" name="answer" class="<?= $fc ?>"></div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Add question</button>
    </form>
</div>

<!-- Filter -->
<form method="GET" action="<?= baseUrl('teacher/questions') ?>" class="flex flex-wrap items-end gap-3 mb-4">
    <div>
        <label class="block text-xs font-medium text-gray-500 mb-1">Class</label>
        <select name="class_id_f" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"><option value="">All</option><?php foreach ($myClassIds as $cid): ?><option value="<?= e($cid) ?>"<?= selectedIf($fClass, $cid) ?>><?= e($classMap[$cid] ?? '') ?></option><?php endforeach; ?></select>
    </div>
    <div>
        <label class="block text-xs font-medium text-gray-500 mb-1">Type</label>
        <select name="type_f" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"><option value="">All</option><option value="mcq"<?= selectedIf($fType,'mcq') ?>>MCQ</option><option value="short"<?= selectedIf($fType,'short') ?>>Short</option><option value="structured"<?= selectedIf($fType,'structured') ?>>Structured</option></select>
    </div>
    <button type="submit" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Filter</button>
</form>

<!-- List -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?php if (empty($questions)): ?>
        <div class="px-5 py-12 text-center text-gray-400 text-sm">No questions yet. Add your first above.</div>
    <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($questions as $qn):
                $opts = $qn['options'] ?? null;
                if (is_string($opts)) { $d = json_decode($opts, true); $opts = is_array($d) ? $d : null; }
            ?>
                <div class="px-5 py-3">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-sm text-gray-900 whitespace-pre-line"><?= e($qn['question_text']) ?></p>
                            <?php if (is_array($opts) && $opts): ?>
                                <ul class="mt-1.5 space-y-0.5">
                                    <?php foreach ($opts as $o): ?><li class="text-xs text-gray-600">• <?= e($o) ?></li><?php endforeach; ?>
                                </ul>
                            <?php endif; ?>
                            <?php if (!empty($qn['answer'])): ?><p class="text-xs text-emerald-700 mt-1">Answer: <?= e($qn['answer']) ?></p><?php endif; ?>
                            <p class="text-[11px] text-gray-400 mt-1.5">
                                <span class="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-600"><?= e($typeLabel[$qn['type']] ?? $qn['type']) ?></span>
                                <span class="inline-flex items-center px-1.5 py-0.5 rounded <?= $diffColor[$qn['difficulty']] ?? 'bg-gray-100 text-gray-600' ?> ml-1"><?= e(ucfirst($qn['difficulty'] ?? '')) ?></span>
                                <?php if (!empty($qn['class_id'])): ?><span class="ml-1"><?= e($classMap[$qn['class_id']] ?? '') ?></span><?php endif; ?>
                                <?php if (!empty($qn['subject_id'])): ?><span class="text-gray-300 mx-1">·</span><?= e($subjectName[$qn['subject_id']] ?? '') ?><?php endif; ?>
                                <?php if (!empty($qn['strand'])): ?><span class="text-gray-300 mx-1">·</span><?= e($qn['strand']) ?><?php endif; ?>
                                <?php if (($qn['source'] ?? '') === 'horeb'): ?><span class="text-violet-500 ml-1">· Horeb</span><?php endif; ?>
                            </p>
                        </div>
                        <form method="POST" action="<?= baseUrl('teacher/questions') ?>" onsubmit="return confirm('Delete this question?')" class="flex-shrink-0"><?= csrfField() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= e($qn['id']) ?>"><button class="px-2.5 py-1 text-xs font-medium text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition"></button></form>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
