<?php
/**
 * Lesson Plans — oversight for head teachers / admins.
 * Read-only view of every teacher's lesson plans across the school, so leaders
 * can see how planning is going. Filter by class / subject / status / teacher.
 */
$pageTitle = 'Lesson Plans';
$sb  = new Supabase();
$sid = schoolId();

if (!isAdmin() && !hasRole(['head_teacher'])) {
    flash('error', 'Only head teachers and admins can view all lesson plans.');
    redirect('dashboard');
}

$classMap = cachedClassMap();
$subjectName = [];
foreach (cachedSubjects() as $s) $subjectName[$s['id']] = $s['name'];
$classes = cachedClasses();

$fClass   = input('class_id');
$fSubject = input('subject_id');
$fStatus  = input('status') ?: 'all';
$q        = trim((string)input('q'));

$query = $sb->from('lesson_plans')
    ->select('id,class_id,subject_id,title,lesson_date,strand,sub_strand,learning_outcomes,key_inquiry,learning_resources,organisation,introduction,lesson_dev_1,lesson_dev_2,lesson_dev_3,extended_activities,conclusion,reflection,status,created_by_name,created_at')
    ->eq('school_id', $sid);
if ($fClass)   $query = $query->eq('class_id', $fClass);
if ($fSubject) $query = $query->eq('subject_id', $fSubject);
if ($fStatus !== 'all') $query = $query->eq('status', $fStatus);
$plans = $query->order('lesson_date', false)->limit(500)->execute()['data'] ?? [];

if ($q !== '') {
    $needle = strtolower($q);
    $plans = array_filter($plans, fn($p) => str_contains(strtolower(($p['created_by_name'] ?? '') . ' ' . ($p['title'] ?? '') . ' ' . ($p['strand'] ?? '')), $needle));
}

$total   = count($plans);
$taught  = count(array_filter($plans, fn($p) => ($p['status'] ?? '') === 'taught'));

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Lesson Plans</h1>
    <p class="text-sm text-gray-500 mt-1">Every teacher's lesson plans — <?= number_format($total) ?> shown, <?= number_format($taught) ?> marked taught.</p>
</div>

<!-- Filters -->
<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <form method="GET" action="<?= baseUrl('lesson-plans') ?>" class="flex flex-wrap items-end gap-3">
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select name="class_id" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none min-w-[140px]">
                <option value="">All</option>
                <?php foreach ($classes as $c): ?><option value="<?= e($c['id']) ?>"<?= selectedIf($fClass, $c['id']) ?>><?= e($c['name']) ?></option><?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Subject</label>
            <select name="subject_id" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none min-w-[140px]">
                <option value="">All</option>
                <?php foreach (cachedSubjects() as $s): ?><option value="<?= e($s['id']) ?>"<?= selectedIf($fSubject, $s['id']) ?>><?= e($s['name']) ?></option><?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select name="status" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="all"<?= selectedIf($fStatus, 'all') ?>>All</option>
                <option value="planned"<?= selectedIf($fStatus, 'planned') ?>>Planned</option>
                <option value="taught"<?= selectedIf($fStatus, 'taught') ?>>Taught</option>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Teacher / topic</label>
            <input type="text" name="q" value="<?= e($q) ?>" placeholder="search…" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none w-44">
        </div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Apply</button>
        <a href="<?= baseUrl('lesson-plans') ?>" class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Reset</a>
    </form>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?php if (empty($plans)): ?>
        <div class="px-5 py-12 text-center text-gray-400 text-sm">No lesson plans match these filters.</div>
    <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($plans as $p): ?>
                <details class="group">
                    <summary class="px-5 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/50 list-none">
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate"><?= e($p['title'] ?: 'Untitled lesson') ?></p>
                            <p class="text-xs text-gray-500 mt-0.5">
                                <span class="text-gray-700"><?= e($p['created_by_name'] ?: 'Teacher') ?></span>
                                <span class="text-gray-300 mx-1">·</span><?= e($classMap[$p['class_id']] ?? 'Class') ?>
                                <?php if (!empty($p['subject_id'])): ?><span class="text-gray-300 mx-1">·</span><?= e($subjectName[$p['subject_id']] ?? '') ?><?php endif; ?>
                                <?php if (!empty($p['strand'])): ?><span class="text-gray-300 mx-1">·</span><?= e($p['strand']) ?><?php endif; ?>
                                <?php if (!empty($p['lesson_date'])): ?><span class="text-gray-300 mx-1">·</span><?= e(date('j M', strtotime($p['lesson_date']))) ?><?php endif; ?>
                            </p>
                        </div>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 <?= ($p['status'] ?? '') === 'taught' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700' ?>"><?= e(ucfirst($p['status'] ?? 'planned')) ?></span>
                    </summary>
                    <?php
                    $cbc = ['sub_strand'=>'Sub-strand','learning_outcomes'=>'Learning outcomes','key_inquiry'=>'Key inquiry','learning_resources'=>'Learning resources','organisation'=>'Organisation','introduction'=>'Introduction','lesson_dev_1'=>'Step 1','lesson_dev_2'=>'Step 2','lesson_dev_3'=>'Step 3','extended_activities'=>'Extended activities','conclusion'=>'Conclusion','reflection'=>'Reflection'];
                    $present = array_filter($cbc, fn($lbl, $k) => !empty($p[$k]), ARRAY_FILTER_USE_BOTH);
                    ?>
                    <div class="px-5 pb-4 -mt-1">
                        <?php if ($present): ?>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                            <?php foreach ($present as $k => $lbl): ?>
                                <div class="bg-gray-50 rounded-lg px-3 py-2"><span class="text-gray-400 uppercase tracking-wider text-[10px]"><?= $lbl ?></span><p class="whitespace-pre-line mt-0.5"><?= e($p[$k]) ?></p></div>
                            <?php endforeach; ?>
                        </div>
                        <?php else: ?><p class="text-xs text-gray-400">No detail filled in.</p><?php endif; ?>
                    </div>
                </details>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
