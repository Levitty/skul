<?php
/**
 * Student Promotion — year-to-year bulk promotion with history tracking.
 *
 * Flow:
 * 1. Select "From Year" and "To Year" (defaults: current year → next year)
 * 2. Select "From Class" → load students in that class
 * 3. Select "To Class" (and optional section)
 * 4. Check students to promote → submit
 * 5. System: updates student class, records promotion_history, audit logs
 *
 * Also supports Graduation (marks students as graduated in the from-year)
 * and Repeat (keeps student in the same class but records the year transition).
 */
$pageTitle = 'Promote Students';
$sb  = new Supabase();
$sid = schoolId();

$classes  = cachedClasses();
$classMap = cachedClassMap();
$years    = cachedYears(); // all years, sorted by start_date DESC
$currentYear = cachedCurrentYear();

// Build year map for quick lookup
$yearMap = [];
foreach ($years as $y) $yearMap[$y['id']] = $y;

// ── Filters ──
$fromYearId = input('from_year') ?: ($currentYear['id'] ?? '');
$toYearId   = input('to_year');
$fromClass  = input('from_class');
$toClass    = input('to_class');

// Auto-suggest "To Year" = the closest next year after "From Year"
if ($fromYearId && !$toYearId) {
    $fromYear = $yearMap[$fromYearId] ?? null;
    if ($fromYear) {
        // years are sorted DESC by start_date; first match with start_date > from-year is closest next
        foreach ($years as $y) {
            if ($y['id'] !== $fromYearId && $y['start_date'] > $fromYear['start_date']) {
                $toYearId = $y['id'];
                break; // first DESC match = closest next year
            }
        }
    }
}

// ── Fetch students in the source class ──
$students = [];
if ($fromClass) {
    $studentsResult = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,roll_number,current_class_id')
        ->eq('school_id', $sid)
        ->eq('status', 'active')
        ->eq('current_class_id', $fromClass)
        ->order('first_name')
        ->execute();
    $students = $studentsResult['data'] ?? [];
}

// ── Check which students already promoted for this year transition ──
$alreadyPromoted = [];
if ($fromClass && $fromYearId && $toYearId && !empty($students)) {
    $studentIds = array_column($students, 'id');
    $promoCheck = $sb->from('promotion_history')
        ->select('student_id')
        ->eq('school_id', $sid)
        ->eq('from_year_id', $fromYearId)
        ->eq('to_year_id', $toYearId)
        ->in('student_id', $studentIds)
        ->in('promotion_type', ['promoted', 'graduated'])
        ->execute();
    foreach (($promoCheck['data'] ?? []) as $pc) {
        $alreadyPromoted[$pc['student_id']] = true;
    }
}

// ═══════════════════════════════════════════════════════════
// POST HANDLER
// ═══════════════════════════════════════════════════════════
if (isPost() && verifyCsrf()) {
    $action      = input('action');
    $postFromYear = input('from_year');
    $postToYear   = input('to_year');
    $targetClass  = input('to_class');
    $targetSection = input('to_section') ?: null;
    $ids          = $_POST['student_ids'] ?? [];

    if (empty($ids)) {
        flash('error', 'No students selected.');
        redirect('students/promote?from_year=' . $postFromYear . '&from_class=' . $fromClass);
    }

    if (!$postFromYear || !$postToYear) {
        flash('error', 'Both "From Year" and "To Year" are required.');
        redirect('students/promote?from_year=' . $postFromYear . '&from_class=' . $fromClass);
    }

    // ── PROMOTE ──
    if ($action === 'promote') {
        if (!$targetClass) {
            flash('error', 'Please select a destination class.');
            redirect('students/promote?from_year=' . $postFromYear . '&to_year=' . $postToYear . '&from_class=' . $fromClass);
        }

        // One atomic action: promote_students (mig. 106) does the dup-check,
        // student update and promotion_history insert for the whole batch in a
        // single transaction, then audits — no more half-promoted students.
        $me  = currentUser();
        $res = $sb->rpc('promote_students', [
            'p_school_id'   => $sid,
            'p_student_ids' => array_values($ids),
            'p_from_class'  => $fromClass ?: null,
            'p_to_class'    => $targetClass,
            'p_to_section'  => $targetSection ?: null,
            'p_from_year'   => $postFromYear,
            'p_to_year'     => $postToYear,
            'p_type'        => 'promoted',
            'p_user_id'     => $me['id']    ?? null,
            'p_user_email'  => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
            flash('error', ($p['error'] ?? null) ?: 'Could not complete the promotion. Please try again.');
            redirect('students/promote?from_year=' . $postToYear . '&from_class=' . $targetClass);
        }
        $count   = (int)($p['promoted'] ?? 0);
        $skipped = (int)($p['skipped'] ?? 0);

        $msg = $count . ' student' . ($count !== 1 ? 's' : '') . ' promoted to ' . ($classMap[$targetClass] ?? 'new class') . '.';
        if ($skipped > 0) {
            $msg .= " $skipped already promoted (skipped).";
        }
        // A whole grade just moved; if the new class has streams, the next job is sorting them.
        $hasStreams = !empty($sb->from('sections')->select('id')->eq('class_id', $targetClass)->limit(1)->execute()['data']);
        if ($hasStreams) flashLink('success', $msg . ' Now sort them into streams.', 'students/streams?class=' . $targetClass, 'Open Streams →');
        else flash('success', $msg);
        redirect('students/promote?from_year=' . $postToYear . '&from_class=' . $targetClass);
    }

    // ── GRADUATE ──
    if ($action === 'graduate') {
        // Atomic batch via promote_students (mig. 106).
        $me  = currentUser();
        $res = $sb->rpc('promote_students', [
            'p_school_id'   => $sid,
            'p_student_ids' => array_values($ids),
            'p_from_class'  => $fromClass ?: null,
            'p_to_class'    => null,
            'p_to_section'  => null,
            'p_from_year'   => $postFromYear,
            'p_to_year'     => $postToYear,
            'p_type'        => 'graduated',
            'p_user_id'     => $me['id']    ?? null,
            'p_user_email'  => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
            flash('error', ($p['error'] ?? null) ?: 'Could not complete graduation. Please try again.');
            redirect('students/promote?from_year=' . $postFromYear . '&from_class=' . $fromClass);
        }
        $count   = (int)($p['promoted'] ?? 0);
        $skipped = (int)($p['skipped'] ?? 0);

        $msg = $count . ' student' . ($count !== 1 ? 's' : '') . ' graduated.';
        if ($skipped > 0) $msg .= " $skipped already processed (skipped).";
        flash('success', $msg);
        redirect('students/promote?from_year=' . $postFromYear . '&from_class=' . $fromClass);
    }

    // ── REPEAT ──
    if ($action === 'repeat') {
        // Atomic batch via promote_students (mig. 106).
        $me  = currentUser();
        $res = $sb->rpc('promote_students', [
            'p_school_id'   => $sid,
            'p_student_ids' => array_values($ids),
            'p_from_class'  => $fromClass ?: null,
            'p_to_class'    => $fromClass ?: null,
            'p_to_section'  => null,
            'p_from_year'   => $postFromYear,
            'p_to_year'     => $postToYear,
            'p_type'        => 'repeated',
            'p_user_id'     => $me['id']    ?? null,
            'p_user_email'  => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
            flash('error', ($p['error'] ?? null) ?: 'Could not mark repeats. Please try again.');
            redirect('students/promote?from_year=' . $postFromYear . '&from_class=' . $fromClass);
        }
        $count   = (int)($p['promoted'] ?? 0);
        $skipped = (int)($p['skipped'] ?? 0);

        $msg = $count . ' student' . ($count !== 1 ? 's' : '') . ' marked as repeating.';
        if ($skipped > 0) $msg .= " $skipped already processed (skipped).";
        flash('success', $msg);
        redirect('students/promote?from_year=' . $postFromYear . '&from_class=' . $fromClass);
    }
}

// ── Sections for destination class ──
// The `sections` table has no school_id column, so we scope by this school's
// class IDs instead (classes are already tenant-scoped via cachedClasses()).
$schoolClassIds = array_values(array_filter(array_column($classes, 'id')));
$sectionsByClass = [];
if (!empty($schoolClassIds)) {
    $sectionRows = $sb->from('sections')->select('id,class_id,name')->in('class_id', $schoolClassIds)->execute();
    foreach (($sectionRows['data'] ?? []) as $sec) {
        $sectionsByClass[$sec['class_id']][] = $sec;
    }
}

// ── Promotion stats for current year transition ──
$promoStats = ['promoted' => 0, 'graduated' => 0, 'repeated' => 0];
if ($fromYearId && $toYearId) {
    $statsResult = $sb->from('promotion_history')
        ->select('promotion_type')
        ->eq('school_id', $sid)
        ->eq('from_year_id', $fromYearId)
        ->eq('to_year_id', $toYearId)
        ->execute();
    foreach (($statsResult['data'] ?? []) as $row) {
        $type = $row['promotion_type'] ?? '';
        if (isset($promoStats[$type])) $promoStats[$type]++;
    }
}
$promoStatsTotal = array_sum($promoStats);

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Promote Students</h1>
    <p class="text-sm text-gray-500 mt-1">Year-to-year promotion with full history tracking</p>
</div>

<!-- ═══════ Year + Class Selection ═══════ -->
<div class="bg-white rounded-xl border border-gray-100 p-5 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('students/promote') ?>" class="flex flex-wrap items-end gap-4">

        <!-- From Year -->
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">From Academic Year</label>
            <select name="from_year" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none min-w-[160px]">
                <option value="">Select year...</option>
                <?php foreach ($years as $y): ?>
                    <option value="<?= e($y['id']) ?>"<?= selectedIf($fromYearId, $y['id']) ?>>
                        <?= e($y['name']) ?><?= !empty($y['is_current']) ? ' (current)' : '' ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>

        <!-- Arrow -->
        <div class="text-gray-400 text-lg font-bold pb-1">&rarr;</div>

        <!-- To Year -->
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">To Academic Year</label>
            <select name="to_year" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none min-w-[160px]">
                <option value="">Select year...</option>
                <?php foreach ($years as $y): ?>
                    <?php if ($y['id'] !== $fromYearId): ?>
                        <option value="<?= e($y['id']) ?>"<?= selectedIf($toYearId, $y['id']) ?>>
                            <?= e($y['name']) ?>
                        </option>
                    <?php endif; ?>
                <?php endforeach; ?>
            </select>
        </div>

        <div class="text-gray-300 text-lg pb-1">|</div>

        <!-- From Class -->
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">From Class</label>
            <select name="from_class" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none min-w-[140px]">
                <option value="">Select class...</option>
                <?php foreach ($classes as $c): ?>
                    <option value="<?= e($c['id']) ?>"<?= selectedIf($fromClass, $c['id']) ?>><?= e($c['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
    </form>
</div>

<?php if (!$fromYearId || !$toYearId): ?>
    <div class="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm max-w-2xl">
        Select both an academic year to promote <strong>from</strong> and one to promote <strong>to</strong>, then pick a class.
        <?php if (count($years) < 2): ?>
            <p class="mt-2">You only have <?= count($years) ?> academic year. Go to <a href="<?= baseUrl('settings') ?>" class="text-blue-900 underline font-medium">Settings</a> to add the next academic year first.</p>
        <?php endif; ?>
    </div>
<?php elseif (!$fromClass): ?>
    <!-- Promotion stats for this year transition -->
    <?php if ($promoStatsTotal > 0): ?>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 max-w-3xl">
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                </div>
                <div>
                    <p class="text-lg font-bold text-gray-900"><?= $promoStatsTotal ?></p>
                    <p class="text-xs text-gray-500">Total Processed</p>
                </div>
            </div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                </div>
                <div>
                    <p class="text-lg font-bold text-gray-900"><?= $promoStats['promoted'] ?></p>
                    <p class="text-xs text-gray-500">Promoted</p>
                </div>
            </div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342"/></svg>
                </div>
                <div>
                    <p class="text-lg font-bold text-gray-900"><?= $promoStats['graduated'] ?></p>
                    <p class="text-xs text-gray-500">Graduated</p>
                </div>
            </div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                </div>
                <div>
                    <p class="text-lg font-bold text-gray-900"><?= $promoStats['repeated'] ?></p>
                    <p class="text-xs text-gray-500">Repeated</p>
                </div>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <p class="text-gray-400 text-sm">
        Now select a class to load students for promotion from
        <strong class="text-gray-600"><?= e($yearMap[$fromYearId]['name'] ?? '') ?></strong> to
        <strong class="text-gray-600"><?= e($yearMap[$toYearId]['name'] ?? '') ?></strong>.
    </p>

<?php elseif ($fromClass): ?>

<!-- ═══════ Promotion Form ═══════ -->
<form method="POST" id="promoteForm">
    <?= csrfField() ?>
    <input type="hidden" name="action" id="formAction" value="promote">
    <input type="hidden" name="from_year" value="<?= e($fromYearId) ?>">
    <input type="hidden" name="to_year" value="<?= e($toYearId) ?>">
    <input type="hidden" name="from_class" value="<?= e($fromClass) ?>">

    <!-- Year transition badge + destination controls -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex flex-wrap items-end gap-4">
            <!-- Year badge -->
            <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm self-end">
                <span class="font-medium text-blue-800"><?= e($yearMap[$fromYearId]['name'] ?? '?') ?></span>
                <span class="text-blue-400">&rarr;</span>
                <span class="font-medium text-blue-800"><?= e($yearMap[$toYearId]['name'] ?? '?') ?></span>
            </div>

            <!-- To Class -->
            <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Promote To Class</label>
                <select name="to_class" id="toClassSelect" onchange="updateToSections()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none min-w-[150px]">
                    <option value="">Select destination...</option>
                    <?php foreach ($classes as $c): ?>
                        <?php if ($c['id'] !== $fromClass): ?>
                            <option value="<?= e($c['id']) ?>"><?= e($c['name']) ?></option>
                        <?php endif; ?>
                    <?php endforeach; ?>
                </select>
            </div>

            <!-- Section -->
            <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Section (optional)</label>
                <select name="to_section" id="toSectionSelect" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <option value="">No section</option>
                </select>
            </div>

            <!-- Action buttons -->
            <div class="flex gap-2">
                <button type="submit" onclick="document.getElementById('formAction').value='promote'"
                    class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                    Promote Selected
                </button>
                <button type="submit" onclick="document.getElementById('formAction').value='repeat'"
                    class="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition">
                    Repeat
                </button>
                <button type="submit" onclick="document.getElementById('formAction').value='graduate'"
                    class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition">
                    Graduate
                </button>
            </div>
        </div>
    </div>

    <!-- Bulk select bar -->
    <div id="bulkBar" class="hidden mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
        <span class="text-sm text-emerald-700 font-medium">
            <span id="selectedCount">0</span> of <?= count($students) ?> students selected
        </span>
    </div>

    <!-- Student table -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="px-4 py-3 w-10">
                        <input type="checkbox" id="selectAll" onclick="toggleAll(this)" class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                    </th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Adm No.</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Roll No.</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Current Class</th>
                    <th class="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($students)): ?>
                    <tr><td colspan="6" class="px-4 py-12 text-center text-gray-400">No active students in this class</td></tr>
                <?php else: ?>
                    <?php foreach ($students as $st):
                        $isPromoted = isset($alreadyPromoted[$st['id']]);
                    ?>
                        <tr class="hover:bg-gray-50/50 <?= $isPromoted ? 'opacity-50' : '' ?>">
                            <td class="px-4 py-3">
                                <?php if ($isPromoted): ?>
                                    <input type="checkbox" disabled class="w-4 h-4 rounded border-gray-200 text-gray-300 cursor-not-allowed">
                                <?php else: ?>
                                    <input type="checkbox" name="student_ids[]" value="<?= e($st['id']) ?>" onclick="updateCount()" class="student-cb w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                                <?php endif; ?>
                            </td>
                            <td class="px-4 py-3 font-medium text-gray-900"><?= e($st['first_name'] . ' ' . $st['last_name']) ?></td>
                            <td class="px-4 py-3 text-gray-600"><?= e($st['admission_number'] ?? '—') ?></td>
                            <td class="px-4 py-3 text-gray-600"><?= e($st['roll_number'] ?? '—') ?></td>
                            <td class="px-4 py-3 text-gray-600"><?= e($classMap[$st['current_class_id'] ?? ''] ?? '—') ?></td>
                            <td class="px-4 py-3 text-center">
                                <?php if ($isPromoted): ?>
                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Already promoted</span>
                                <?php else: ?>
                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Pending</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</form>

<?php endif; ?>

<script>
const sectionsByClass = <?= jsonHtml($sectionsByClass) ?>;

function updateToSections() {
    const classId = document.getElementById('toClassSelect').value;
    const sel = document.getElementById('toSectionSelect');
    sel.innerHTML = '<option value="">No section</option>';
    if (classId && sectionsByClass[classId]) {
        sectionsByClass[classId].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            sel.appendChild(opt);
        });
    }
}

function toggleAll(master) {
    document.querySelectorAll('.student-cb').forEach(cb => cb.checked = master.checked);
    updateCount();
}

function updateCount() {
    const checked = document.querySelectorAll('.student-cb:checked').length;
    const total = document.querySelectorAll('.student-cb').length;
    document.getElementById('selectedCount').textContent = checked;
    document.getElementById('bulkBar').classList.toggle('hidden', checked === 0);
    document.getElementById('selectAll').checked = checked === total && total > 0;
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
