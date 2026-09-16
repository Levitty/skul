<?php
/**
 * Students — List all students with class filter.
 */
$pageTitle = 'Students';
$sb  = new Supabase();
$sid = schoolId();

$classes = cachedClasses();

$filterClass   = input('class_id');
$filterSection = input('section_id');

// Streams belong to a class; only offer them once a class is chosen.
$sectionsForClass = [];
if ($filterClass) {
    $sectionsForClass = (new Supabase())->from('sections')->select('id,name')
        ->eq('class_id', $filterClass)->order('name')->execute()['data'] ?? [];
}
$sectionName = [];
foreach ($sectionsForClass as $sec) $sectionName[$sec['id']] = $sec['name'];
$search      = trim((string) input('q'));
$perPage = 50;
$page = currentPage();
$offset = ($page - 1) * $perPage;

// ── Dashboard stats — walk ALL students (chunked) so totals are correct
//    above the 1000-row PostgREST cap. Lightweight columns only.
$allStudents = Supabase::fetchAllPaged(
    fn($_sb) => $_sb->from('students')
        ->select('id,status,gender,student_type')
        ->eq('school_id', $sid)
);

$statTotal    = count($allStudents);
$statActive   = 0;
$statInactive = 0;
$statBoys     = 0;
$statGirls    = 0;
$statBoarders = 0;
$statDay      = 0;

foreach ($allStudents as $s) {
    if (($s['status'] ?? '') === 'active') {
        $statActive++;
        $g = strtolower($s['gender'] ?? '');
        if ($g === 'male')        $statBoys++;
        elseif ($g === 'female')  $statGirls++;
        $t = $s['student_type'] ?? 'day_scholar';
        if ($t === 'boarder')     $statBoarders++;
        else                      $statDay++;
    } else {
        $statInactive++;
    }
}

// ── Display query: single call with count + paginated data
// ?view=exited shows deactivated/removed learners so they can be restored
// (deletion is a soft delete — the record is never erased).
$viewExited = input('view') === 'exited';

// Why a learner left. 'transferred' is the common case and leads the list.
$exitLabels = [
    'transferred' => 'Transferred to another school',
    'relocated'   => 'Family relocated',
    'fees'        => 'Could not keep up with fees',
    'withdrawn'   => 'Withdrawn by the family',
    'expelled'    => 'Expelled',
    'other'       => 'Other',
];
$displayQuery = $sb->from('students')
    ->select('id,first_name,last_name,admission_number,gender,dob,status,current_class_id,section_id,student_type,admission_date,exit_reason,exit_to_school,exit_date')
    ->eq('school_id', $sid)
    ->order('first_name')
    ->range($offset, $perPage);
$displayQuery = $viewExited ? $displayQuery->neq('status', 'active') : $displayQuery->eq('status', 'active');
if ($filterClass)   $displayQuery = $displayQuery->eq('current_class_id', $filterClass);
if ($filterSection) $displayQuery = $displayQuery->eq('section_id', $filterSection);
if ($search !== '') $displayQuery = $displayQuery->searchTokens(['first_name', 'last_name', 'admission_number'], $search);

$displayResult = $displayQuery->executeWithCount();
$students      = $displayResult['data']  ?? [];
$totalStudents = (int)($displayResult['count'] ?? count($students));

$classMap = [];
foreach ($classes as $c) $classMap[$c['id']] = $c['name'];

// Handle actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // Deactivate / restore all go through one governed action:
    // set_student_status (mig. 107) — atomic batch + single audit line.
    $me = currentUser();
    $setStatus = function (array $ids, string $status) use ($sb, $sid, $me) {
        return $sb->rpc('set_student_status', [
            'p_school_id'   => $sid,
            'p_student_ids' => array_values($ids),
            'p_status'      => $status,
            'p_user_id'     => $me['id']    ?? null,
            'p_user_email'  => $me['email'] ?? null,
        ]);
    };
    $statusOk = fn($res) => empty($res['error']) && !empty(($res['data'] ?? [])['success']);

    // Transfer out — one or many. Records why and where, sets them inactive,
    // and reports the balance so nobody has to remember to look it up.
    if ($action === 'transfer') {
        $ids = $_POST['student_ids'] ?? [];
        if (!$ids && input('student_id')) $ids = [input('student_id')];
        $ids = array_values(array_filter((array)$ids));
        if (!$ids) {
            flash('error', 'No learner was selected.');
            redirect('students' . ($filterClass ? '?class_id=' . $filterClass : ''));
        }
        $res = $sb->rpc('transfer_student', [
            'p_school_id'   => $sid,
            'p_student_ids' => $ids,
            'p_reason'      => input('exit_reason') ?: 'transferred',
            'p_to_school'   => mb_substr(trim((string)input('exit_to_school')), 0, 160) ?: null,
            'p_date'        => input('exit_date') ?: null,
            'p_user_id'     => $me['id']    ?? null,
            'p_user_email'  => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
            flash('error', is_array($p) ? ($p['error'] ?? 'Could not transfer the learner.')
                                        : 'Could not transfer the learner.');
        } else {
            $msg = $p['message'] ?? 'Transferred.';
            $owed = (float)($p['balance_left'] ?? 0);
            $cred = (float)($p['credit_left'] ?? 0);
            if ($owed > 0) $msg .= ' ' . money($owed) . ' is still owed — decide whether to pursue or write it off.';
            if ($cred > 0) $msg .= ' ' . money($cred) . ' sits in credit and may be refundable.';
            flash('success', $msg);
        }
        redirect('students' . ($filterClass ? '?class_id=' . $filterClass : ''));
    }

    // Restore a soft-deleted / exited learner back to active.
    if ($action === 'reactivate') {
        $res = $setStatus([input('student_id')], 'active');
        flash($statusOk($res) ? 'success' : 'error', $statusOk($res)
            ? 'Student restored to active.' : 'Could not restore the student. Please try again.');
        redirect('students?view=exited');
    }

    // Legacy bulk deactivate — kept so an old open tab still works.
    if ($action === 'bulk_delete') {
        $ids = $_POST['student_ids'] ?? [];
        if (empty($ids)) {
            flash('error', 'No students selected.');
        } else {
            $res = $setStatus($ids, 'exited');
            if ($statusOk($res)) {
                $count = (int)(($res['data']['count']) ?? count($ids));
                flash('success', $count . ' student' . ($count !== 1 ? 's' : '') . ' deactivated.');
            } else {
                flash('error', 'Could not deactivate the selected students. Please try again.');
            }
        }
        redirect('students' . ($filterClass ? '?class_id=' . $filterClass : ''));
    }
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<!-- ── Mini Dashboard ─────────────────────────────────── -->
<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
                <svg class="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($statTotal) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Total Students</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg class="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($statActive) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Active</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-red-500 flex items-center justify-center flex-shrink-0">
                <svg class="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($statInactive) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Exited</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                <svg class="w-[18px] h-[18px] text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($statBoys) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Boys</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-pink-500 flex items-center justify-center flex-shrink-0">
                <svg class="w-[18px] h-[18px] text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($statGirls) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Girls</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
                <svg class="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($statBoarders) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Boarders</p>
            </div>
        </div>
    </div>
</div>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Students</h1>
        <p class="text-sm text-gray-500 mt-1"><?= number_format($totalStudents) ?> <?= $search !== '' ? 'match' . ($totalStudents !== 1 ? 'es' : '') : 'active student' . ($totalStudents !== 1 ? 's' : '') ?><?= $search !== '' ? ' for &ldquo;' . e($search) . '&rdquo;' : ($filterSection ? ' in ' . e($sectionName[$filterSection] ?? 'this stream') : ($filterClass ? ' in this class' : '')) ?></p>
    </div>
    <div class="flex gap-2">
        <?php if ($viewExited): ?>
            <a href="<?= baseUrl('students') ?>" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">&larr; Active students</a>
        <?php else: ?>
            <a href="<?= baseUrl('students') ?>?view=exited" class="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Show removed</a>
        <?php endif; ?>
        <a href="<?= baseUrl('students/import') ?>" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Import CSV</a>
        <a href="<?= baseUrl('students/add') ?>" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">+ Add Student</a>
    </div>
</div>

<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('students') ?>" class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[220px]">
            <svg class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"/></svg>
            <input type="text" name="q" value="<?= e($search) ?>" placeholder="Search by name or admission no…"
                   class="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
        </div>
        <select name="class_id" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <option value="">All Classes</option>
            <?php foreach ($classes as $c): ?>
                <option value="<?= e($c['id']) ?>"<?= selectedIf($filterClass, $c['id']) ?>><?= e($c['name']) ?></option>
            <?php endforeach; ?>
        </select>
        <?php if ($sectionsForClass): ?>
        <select name="section_id" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <option value="">All streams</option>
            <?php foreach ($sectionsForClass as $sec): ?>
                <option value="<?= e($sec['id']) ?>"<?= selectedIf($filterSection, $sec['id']) ?>><?= e($sec['name']) ?></option>
            <?php endforeach; ?>
        </select>
        <?php endif; ?>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Search</button>
        <?php if ($search !== '' || $filterClass || $filterSection): ?>
            <a href="<?= baseUrl('students') ?>" class="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">Clear</a>
        <?php endif; ?>
    </form>
</div>

<!-- Bulk action bar (hidden until checkboxes selected) -->
<div id="bulkBar" class="hidden mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
    <span class="text-sm text-amber-800 font-medium">
        <span id="selectedCount">0</span> learner(s) selected
    </span>
    <button type="button" onclick="openTransfer(null,null)" class="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 shadow-sm transition">
        Transfer out
    </button>
</div>

<form id="bulkForm" method="POST">
    <?= csrfField() ?>
    <input type="hidden" name="action" value="bulk_delete">

    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="px-4 py-3 w-10">
                        <input type="checkbox" id="selectAll" onclick="toggleAll(this)" class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                    </th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Adm No.</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                    <?php if ($sectionsForClass): ?><th class="text-left px-4 py-3 font-semibold text-gray-600">Stream</th><?php endif; ?>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Gender</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($students)): ?>
                    <tr><td colspan="<?= $sectionsForClass ? 8 : 7 ?>" class="px-4 py-12 text-center text-gray-400">No students found</td></tr>
                <?php else: ?>
                    <?php foreach ($students as $s): ?>
                        <tr class="hover:bg-gray-50/50 transition">
                            <td class="px-4 py-3">
                                <input type="checkbox" name="student_ids[]" value="<?= e($s['id']) ?>" onclick="updateCount()" class="student-cb w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                            </td>
                            <td class="px-4 py-3 font-medium text-gray-900"><a href="<?= baseUrl('students/view?id=' . $s['id']) ?>" class="hover:text-emerald-600 transition"><?= e($s['first_name'] . ' ' . $s['last_name']) ?></a></td>
                            <td class="px-4 py-3 text-gray-600"><?= e($s['admission_number'] ?? '—') ?></td>
                            <td class="px-4 py-3 text-gray-600"><?= e($classMap[$s['current_class_id'] ?? ''] ?? '—') ?></td>
                            <?php if ($sectionsForClass): ?><td class="px-4 py-3 text-gray-600"><?= e($sectionName[$s['section_id'] ?? ''] ?? '—') ?></td><?php endif; ?>
                            <td class="px-4 py-3 text-gray-600"><?= e(ucfirst($s['gender'] ?? '—')) ?></td>
                            <td class="px-4 py-3">
                                <?php $type = $s['student_type'] ?? 'day_scholar'; ?>
                                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium <?= $type === 'boarder' ? 'bg-purple-50 text-purple-700' : 'bg-sky-50 text-sky-700' ?>">
                                    <?= $type === 'boarder' ? 'Boarder' : 'Day' ?>
                                </span>
                            </td>
                            <td class="px-4 py-3 text-right">
                                <?php if ($viewExited): ?>
                                    <span class="text-xs text-gray-400 mr-2">
                                        <?= e(ucfirst($s['status'] ?? 'removed')) ?><?php
                                        if (!empty($s['exit_reason'])) echo ' · ' . e($exitLabels[$s['exit_reason']] ?? $s['exit_reason']);
                                        if (!empty($s['exit_to_school'])) echo ' → ' . e($s['exit_to_school']);
                                        if (!empty($s['exit_date'])) echo ' · ' . e(date('j M Y', strtotime($s['exit_date'])));
                                        ?>
                                    </span>
                                    <form method="POST" class="inline" onsubmit="return confirm('Restore this student to active?')">
                                        <?= csrfField() ?>
                                        <input type="hidden" name="action" value="reactivate">
                                        <input type="hidden" name="student_id" value="<?= e($s['id']) ?>">
                                        <button type="submit" class="text-emerald-600 hover:text-emerald-800 text-xs font-semibold">Restore</button>
                                    </form>
                                <?php else: ?>
                                    <a href="<?= baseUrl('students/edit?id=' . $s['id']) ?>" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Edit</a>
                                    <button type="button" class="ml-2 text-amber-600 hover:text-amber-800 text-xs font-medium"
                                            onclick="openTransfer('<?= e($s['id']) ?>', <?= jsonHtml(trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''))) ?>)">Transfer</button>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</form>

<?php
    $qsParts = [];
    if ($filterClass)   $qsParts[] = 'class_id=' . urlencode($filterClass);
    if ($filterSection) $qsParts[] = 'section_id=' . urlencode($filterSection);
    if ($search !== '') $qsParts[] = 'q=' . urlencode($search);
    $paginationBase = baseUrl('students') . ($qsParts ? '?' . implode('&', $qsParts) : '');
    echo paginationControls($page, $totalStudents, $perPage, $paginationBase);
?>

<!-- Transfer out -->
<div id="trModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4"
     style="background:rgba(17,24,20,.45)" onclick="if(event.target===this) closeTransfer()">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="trTitle">
    <form method="POST" id="trForm">
      <?= csrfField() ?>
      <input type="hidden" name="action" value="transfer">
      <div id="trIds"></div>
      <div class="px-5 py-4 border-b border-gray-100">
        <h3 class="text-base font-bold text-gray-900" id="trTitle">Transfer out</h3>
        <p class="text-sm text-gray-500 mt-0.5" id="trWho"></p>
      </div>
      <div class="px-5 py-4 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Why are they leaving?</label>
          <select name="exit_reason" class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
            <?php foreach ($exitLabels as $k => $lbl): ?>
              <option value="<?= e($k) ?>"><?= e($lbl) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Going to <span class="text-gray-400">(if known)</span></label>
          <input type="text" name="exit_to_school" maxlength="160" placeholder="Name of the receiving school"
                 class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Last day at school</label>
          <input type="date" name="exit_date" value="<?= e(date('Y-m-d')) ?>"
                 class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none">
        </div>
        <p class="text-xs text-gray-500 leading-relaxed">
          They come off the roster and off transport from that date, and stop counting in class lists and fee reports.
          Their invoices, payments and results are kept. Any balance is reported, not written off.
          You can restore them from &ldquo;Show removed&rdquo;.
        </p>
      </div>
      <div class="px-5 py-4 bg-gray-50 flex items-center justify-end gap-2">
        <button type="button" onclick="closeTransfer()" class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition">Cancel</button>
        <button type="submit" class="px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 shadow-sm transition">Transfer out</button>
      </div>
    </form>
  </div>
</div>

<script>
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

/* One dialog serves both the row button and the selection bar: pass an id for
   a single learner, or null to take whoever is ticked. */
function openTransfer(id, name) {
    const ids = id ? [id] : Array.from(document.querySelectorAll('.student-cb:checked')).map(cb => cb.value);
    if (!ids.length) return;
    document.getElementById('trIds').innerHTML =
        ids.map(v => '<input type="hidden" name="student_ids[]" value="' + v.replace(/"/g, '&quot;') + '">').join('');
    document.getElementById('trWho').textContent = id
        ? name
        : ids.length + ' selected learner' + (ids.length > 1 ? 's' : '');
    document.getElementById('trModal').classList.remove('hidden');
    const f = document.querySelector('#trForm select'); if (f) f.focus();
}
function closeTransfer() {
    document.getElementById('trModal').classList.add('hidden');
}
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeTransfer();
});
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
