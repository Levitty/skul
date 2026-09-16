<?php
/**
 * Class Teacher Remarks — pick a term, write the class-teacher's overall
 * remark per student in your class. Saves to report_cards.teacher_remarks.
 *
 * Permission: must be the assigned class_teacher_id of the class, or an admin.
 */
$pageTitle = 'Class Remarks';
$user = currentUser();
$sb   = new Supabase();
$sid  = schoolId();

$classId = trim((string)input('class_id'));
$termId  = trim((string)input('term_id'));

// ── Permission gate ────────────────────────────────────────────
if ($classId === '') {
    flash('error', 'No class specified.');
    redirect('dashboard');
}
$clsRes = $sb->from('classes')->select('id,name,class_teacher_id')
    ->eq('id', $classId)->eq('school_id', $sid)->single()->execute();
$class = $clsRes['data'][0] ?? null;
if (!$class) {
    flash('error', 'Class not found.');
    redirect('dashboard');
}
$isClassTeacher = ($class['class_teacher_id'] ?? '') === ($user['id'] ?? '');
if (!$isClassTeacher && !isAdmin() && !hasRole(['head_teacher'])) {
    flash('error', 'Only the assigned class teacher (or an administrator) can write remarks here.');
    redirect('dashboard');
}

// ── Term selection ────────────────────────────────────────────
$terms = cachedTerms();
if ($termId === '') {
    $current = cachedCurrentTerm();
    $termId = $current['id'] ?? '';
}

// ── Handle save ───────────────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $remarks = $_POST['remarks'] ?? [];
    $saved = 0;
    foreach ($remarks as $cardId => $remark) {
        $clean = trim((string)$remark);
        $r = $sb->from('report_cards')
            ->eq('id', $cardId)->eq('school_id', $sid)
            ->update([
                'teacher_remarks' => ($clean !== '' ? $clean : null),
                'updated_at'      => date('c'),
            ]);
        if (empty($r['error'])) $saved++;
    }
    auditLog('save', 'class_remarks', $classId, ['term_id' => $termId, 'count' => $saved]);
    flash('success', $saved . ' remark(s) saved.');
    redirect("grades/class-remarks?class_id=" . urlencode($classId) . "&term_id=" . urlencode($termId));
}

// ── Load report cards for this class + term ───────────────────
$cards = [];
$students = [];
if ($termId !== '') {
    $cardsRes = $sb->from('report_cards')
        ->select('id,student_id,teacher_remarks,overall_percentage,overall_grade,status')
        ->eq('school_id', $sid)->eq('class_id', $classId)->eq('term_id', $termId)->execute();
    $cards = $cardsRes['data'] ?? [];

    $studentIds = array_column($cards, 'student_id');
    if (!empty($studentIds)) {
        $stuRes = $sb->from('students')->select('id,first_name,last_name,admission_number')
            ->in('id', $studentIds)->execute();
        foreach (($stuRes['data'] ?? []) as $s) $students[$s['id']] = $s;
    }

    usort($cards, function ($a, $b) use ($students) {
        $na = $students[$a['student_id']] ?? ['first_name' => '', 'last_name' => ''];
        $nb = $students[$b['student_id']] ?? ['first_name' => '', 'last_name' => ''];
        return strcasecmp(
            ($na['first_name'] ?? '') . ' ' . ($na['last_name'] ?? ''),
            ($nb['first_name'] ?? '') . ' ' . ($nb['last_name'] ?? '')
        );
    });
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <a href="<?= baseUrl('dashboard') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to dashboard</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">Class Remarks &mdash; <?= e($class['name']) ?></h1>
    <p class="text-sm text-gray-500 mt-1">Write the overall class-teacher remark for each student. Appears on their term report card.</p>
</div>

<!-- Term picker -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('grades/class-remarks') ?>" class="flex items-center gap-3 flex-wrap">
        <input type="hidden" name="class_id" value="<?= e($classId) ?>">
        <label class="text-sm font-medium text-gray-600">Term:</label>
        <select name="term_id" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <option value="">— Pick a term —</option>
            <?php foreach ($terms as $t): ?>
                <option value="<?= e($t['id']) ?>"<?= selectedIf($termId, $t['id']) ?>><?= e($t['name']) ?></option>
            <?php endforeach; ?>
        </select>
    </form>
</div>

<?php if ($termId === ''): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-sm text-gray-500">
        Pick a term above.
    </div>
<?php elseif (empty($cards)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-sm text-gray-500">No report cards have been generated for this class in the selected term yet.</p>
        <p class="text-xs text-gray-400 mt-1">Ask the head teacher or admin to generate them (<strong>Grades &rarr; Reports &rarr; Generate</strong>) before adding remarks.</p>
    </div>
<?php else: ?>

<form method="POST" class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?= csrfField() ?>
    <div class="divide-y divide-gray-50">
        <?php foreach ($cards as $card): ?>
            <?php
            $stu  = $students[$card['student_id']] ?? null;
            $pub  = ($card['status'] ?? '') === 'published';
            ?>
            <div class="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                <div class="md:col-span-1">
                    <p class="text-sm font-semibold text-gray-900"><?= e(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? 'Student')) ?></p>
                    <p class="text-xs text-gray-400"><?= e($stu['admission_number'] ?? '') ?></p>
                    <p class="text-xs text-gray-500 mt-1">
                        Term avg <strong><?= number_format((float)($card['overall_percentage'] ?? 0), 1) ?>%</strong>
                        &middot; <?= e($card['overall_grade'] ?? '—') ?>
                    </p>
                    <?php if ($pub): ?>
                        <span class="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-medium">Published</span>
                    <?php endif; ?>
                </div>
                <textarea name="remarks[<?= e($card['id']) ?>]" rows="3"
                          placeholder="Class teacher's remark for this student..."
                          class="md:col-span-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"><?= e($card['teacher_remarks'] ?? '') ?></textarea>
            </div>
        <?php endforeach; ?>
    </div>
    <div class="px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
        <p class="text-xs text-gray-400">Blank remarks clear the field.</p>
        <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Remarks</button>
    </div>
</form>

<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
