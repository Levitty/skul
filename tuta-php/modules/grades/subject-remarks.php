<?php
/**
 * Subject Teacher Remarks — pick a term, write per-subject per-student remarks
 * for the (class, subject) you teach. Saves to
 * report_card_subjects.teacher_remarks for every row matching the
 * (report_card_id, subject_id) — so display can read any of them.
 *
 * Permission: must have a subject_teachers row for this (class, subject), or
 * be an admin/head_teacher.
 */
$pageTitle = 'Subject Remarks';
$user = currentUser();
$sb   = new Supabase();
$sid  = schoolId();

$classId   = trim((string)input('class_id'));
$subjectId = trim((string)input('subject_id'));
$termId    = trim((string)input('term_id'));

if ($classId === '' || $subjectId === '') {
    flash('error', 'No class or subject specified.');
    redirect('dashboard');
}

// ── Permission gate ────────────────────────────────────────────
$assignRes = $sb->from('subject_teachers')->select('id')
    ->eq('school_id', $sid)
    ->eq('user_id',   $user['id'] ?? '')
    ->eq('class_id',  $classId)
    ->eq('subject_id', $subjectId)
    ->single()->execute();
$isAssigned = !empty($assignRes['data']);
if (!$isAssigned && !isAdmin() && !hasRole(['head_teacher'])) {
    flash('error', 'You are not assigned to teach this subject in this class.');
    redirect('dashboard');
}

// ── Class + subject names for the header ──────────────────────
$clsRes = $sb->from('classes')->select('name')->eq('id', $classId)->eq('school_id', $sid)->single()->execute();
$className   = $clsRes['data'][0]['name'] ?? 'Class';
$subRes      = $sb->from('subjects')->select('name')->eq('id', $subjectId)->eq('school_id', $sid)->single()->execute();
$subjectName = $subRes['data'][0]['name'] ?? 'Subject';

$terms = cachedTerms();
if ($termId === '') {
    $current = cachedCurrentTerm();
    $termId = $current['id'] ?? '';
}

// ── Handle save ───────────────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $remarks = $_POST['remarks'] ?? []; // report_card_id => text
    // report_card_subjects has no school_id; the POST supplies arbitrary
    // report_card_id keys. Constrain writes to the cards that actually belong
    // to THIS school + class + term, or a teacher could overwrite remarks on
    // another class's (or tenant's) report cards by forging ids.
    $validCardIds = [];
    if ($termId !== '') {
        $vc = $sb->from('report_cards')->select('id')
            ->eq('school_id', $sid)->eq('class_id', $classId)->eq('term_id', $termId)->execute();
        $validCardIds = array_column($vc['data'] ?? [], 'id');
    }
    $saved = 0;
    foreach ($remarks as $cardId => $remark) {
        if (!in_array($cardId, $validCardIds, true)) continue;
        $clean = trim((string)$remark);
        // One subject_id has multiple exam rows for the same card — write the
        // same remark to all of them so reading any row yields the text.
        $r = $sb->from('report_card_subjects')
            ->eq('report_card_id', $cardId)
            ->eq('subject_id', $subjectId)
            ->update(['teacher_remarks' => ($clean !== '' ? $clean : null)]);
        if (empty($r['error'])) $saved++;
    }
    auditLog('save', 'subject_remarks', $classId, ['subject_id' => $subjectId, 'term_id' => $termId, 'count' => $saved]);
    flash('success', $saved . ' remark(s) saved.');
    redirect("grades/subject-remarks?class_id=" . urlencode($classId)
        . "&subject_id=" . urlencode($subjectId)
        . "&term_id="    . urlencode($termId));
}

// ── Load report cards for this class + term, with this subject's stats ─
$cards = [];
$students = [];
$subjPerf = [];        // card_id => ['avg' => float, 'grade' => string, 'has_subject' => bool]
$remarksByCard = [];   // card_id => current remark text
if ($termId !== '') {
    $cardsRes = $sb->from('report_cards')
        ->select('id,student_id,overall_percentage,overall_grade,status')
        ->eq('school_id', $sid)->eq('class_id', $classId)->eq('term_id', $termId)->execute();
    $cards = $cardsRes['data'] ?? [];

    if (!empty($cards)) {
        $cardIds = array_column($cards, 'id');
        // All report_card_subjects rows for this subject across the cards
        $rcsRes = $sb->from('report_card_subjects')
            ->select('report_card_id,percentage,grade,teacher_remarks')
            ->in('report_card_id', $cardIds)->eq('subject_id', $subjectId)->execute();
        $pctsByCard = [];
        foreach (($rcsRes['data'] ?? []) as $r) {
            $cid = $r['report_card_id'];
            $pctsByCard[$cid][] = (float)($r['percentage'] ?? 0);
            if (!isset($remarksByCard[$cid]) && !empty($r['teacher_remarks'])) {
                $remarksByCard[$cid] = $r['teacher_remarks'];
            }
        }
        foreach ($pctsByCard as $cid => $pcts) {
            $avg = !empty($pcts) ? array_sum($pcts) / count($pcts) : 0;
            $subjPerf[$cid] = [
                'avg'         => $avg,
                'has_subject' => true,
            ];
        }

        // Filter cards to only those that have this subject (i.e., student sat it)
        $cards = array_values(array_filter($cards, fn ($c) => isset($subjPerf[$c['id']])));

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
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <a href="<?= baseUrl('dashboard') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to dashboard</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2"><?= e($subjectName) ?> Remarks &mdash; <?= e($className) ?></h1>
    <p class="text-sm text-gray-500 mt-1">One remark per student for <strong><?= e($subjectName) ?></strong>, the subject you teach here.</p>
</div>

<!-- Term picker -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('grades/subject-remarks') ?>" class="flex items-center gap-3 flex-wrap">
        <input type="hidden" name="class_id" value="<?= e($classId) ?>">
        <input type="hidden" name="subject_id" value="<?= e($subjectId) ?>">
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
        <p class="text-sm text-gray-500">No report cards include <?= e($subjectName) ?> for this class in the selected term yet.</p>
        <p class="text-xs text-gray-400 mt-1">Make sure marks have been entered, then ask the head teacher or admin to generate the report cards (<strong>Grades &rarr; Reports &rarr; Generate</strong>).</p>
    </div>
<?php else: ?>

<form method="POST" class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?= csrfField() ?>
    <div class="divide-y divide-gray-50">
        <?php foreach ($cards as $card): ?>
            <?php
            $stu  = $students[$card['student_id']] ?? null;
            $perf = $subjPerf[$card['id']] ?? null;
            $remark = $remarksByCard[$card['id']] ?? '';
            ?>
            <div class="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                <div class="md:col-span-1">
                    <p class="text-sm font-semibold text-gray-900"><?= e(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? 'Student')) ?></p>
                    <p class="text-xs text-gray-400"><?= e($stu['admission_number'] ?? '') ?></p>
                    <?php if ($perf): ?>
                    <p class="text-xs text-gray-500 mt-1">
                        Subject avg <strong><?= number_format($perf['avg'], 1) ?>%</strong>
                    </p>
                    <?php endif; ?>
                </div>
                <textarea name="remarks[<?= e($card['id']) ?>]" rows="3"
                          placeholder="<?= e($subjectName) ?> teacher's remark..."
                          class="md:col-span-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"><?= e($remark) ?></textarea>
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
