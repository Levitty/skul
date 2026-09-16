<?php
/**
 * Attendance — office side (migration 108).
 *
 * Overview: every class with today's register status (taken / not, counts) —
 * the head's "9 of 11 classes marked by 8:30" view. Per class: the same
 * register grid as the public link (same record_attendance action underneath,
 * source='office'), plus the class's shareable register link/QR and a rotate
 * button that invalidates a leaked link.
 */
$pageTitle = 'Attendance';
$sb   = new Supabase();
$sid  = schoolId();
$me   = currentUser();
$today = date('Y-m-d');
// The office may view or correct an earlier day (migration 112). Never the
// future, and no further back than 90 days — matching the database guard.
$date = (string)input('date');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = $today;
if ($date > $today) $date = $today;
$minDate = date('Y-m-d', strtotime('-90 days'));
if ($date < $minDate) $date = $minDate;
$isBackdated = ($date !== $today);
// Keep the chosen day in every link/redirect on this page.
$dateQS = $isBackdated ? '&date=' . urlencode($date) : '';

$classes = $sb->from('classes')->select('id,name,capacity')->eq('school_id', $sid)->order('name')->execute()['data'] ?? [];
$classMap = []; foreach ($classes as $c) $classMap[$c['id']] = $c['name'];
$classId = input('class');
if ($classId && !isset($classMap[$classId])) $classId = null;

// Streams (mig. 142): a class with sections takes its register per stream.
$sections = $classes ? Supabase::fetchByChunkedIn(fn($q) => $q->from('sections')->select('id,class_id,name,capacity')->order('name'), 'class_id', array_column($classes, 'id')) : [];
$secByClass = []; $secMap = [];
foreach ($sections as $sec) { $secByClass[$sec['class_id']][] = $sec; $secMap[$sec['id']] = $sec; }
$sectionId = input('section');
if ($sectionId !== '' && (!isset($secMap[$sectionId]) || $secMap[$sectionId]['class_id'] !== $classId)) $sectionId = '';
$secQS = $sectionId !== '' ? '&section=' . urlencode($sectionId) : '';

// Capacity can be set right here by an administrator — the overview is where
// a full class is noticed.
if (isPost() && verifyCsrf() && input('action') === 'set_capacity' && isAdmin()) {
    $cid = input('class_id'); $cap = (int)input('capacity');
    if (isset($classMap[$cid])) {
        $sb->from('classes')->eq('id', $cid)->eq('school_id', $sid)->update(['capacity' => $cap > 0 ? $cap : null]);
        auditLog('update', 'class', $cid, ['capacity' => $cap ?: null]);
        flash('success', $classMap[$cid] . ' capacity ' . ($cap > 0 ? 'set to ' . $cap : 'cleared') . '.');
    }
    redirect('students/attendance' . ($isBackdated ? '?date=' . urlencode($date) : ''));
}

// Enrolled per class and per stream (active learners), for the capacity column.
$enrolled = []; $enrolledSec = []; $unassigned = [];
foreach (Supabase::fetchAllPaged(fn($q) => $q->from('students')->select('current_class_id,section_id')->eq('school_id', $sid)->eq('status', 'active')) ?: [] as $st) {
    $cid = $st['current_class_id'] ?? '';
    $enrolled[$cid] = ($enrolled[$cid] ?? 0) + 1;
    if (!empty($st['section_id']) && isset($secMap[$st['section_id']])) $enrolledSec[$st['section_id']] = ($enrolledSec[$st['section_id']] ?? 0) + 1;
    elseif (!empty($secByClass[$cid])) $unassigned[$cid] = ($unassigned[$cid] ?? 0) + 1;
}
$totalEnrolled = array_sum($enrolled);
$totalCapacity = array_sum(array_map(fn($c) => (int)($c['capacity'] ?? 0), $classes));

// ── Token helpers ────────────────────────────────────────
$getToken = function (string $cid, string $secId = '') use ($sb, $sid): string {
    $q = $sb->from('class_register_tokens')->select('token')->eq('school_id', $sid)->eq('class_id', $cid);
    $q = $secId !== '' ? $q->eq('section_id', $secId) : $q->is('section_id', 'null');
    $t = $q->single()->execute()['data'][0]['token'] ?? null;
    if ($t) return $t;
    $t = bin2hex(random_bytes(16));
    $sb->from('class_register_tokens')->insert(['school_id' => $sid, 'class_id' => $cid, 'section_id' => $secId !== '' ? $secId : null, 'token' => $t]);
    return $t;
};

if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'rotate' && $classId) {
        $q = $sb->from('class_register_tokens')->eq('school_id', $sid)->eq('class_id', $classId);
        $q = $sectionId !== '' ? $q->eq('section_id', $sectionId) : $q->is('section_id', 'null');
        $q->update(['token' => bin2hex(random_bytes(16)), 'rotated_at' => date('c')]);
        auditLog('rotate_register_token', 'class', $classId, ['section_id' => $sectionId ?: null]);
        flash('success', 'Register link replaced. Reprint the QR — the old link no longer works.');
        redirect('students/attendance?class=' . $classId . $secQS . $dateQS);
    }

    if ($action === 'save' && $classId) {
        $states = $_POST['st'] ?? [];
        $exceptions = [];
        foreach ($states as $stuId => $st) {
            if (in_array($st, ['absent', 'late'], true)) $exceptions[] = ['student_id' => $stuId, 'status' => $st];
        }
        $res = $sb->rpc('record_attendance', [
            'p_school_id'  => $sid,
            'p_class_id'   => $classId,
            'p_date'       => $date,
            'p_exceptions' => $exceptions,
            'p_source'     => 'office',
            'p_taken_by'   => $me['email'] ?? 'office',
            'p_user_id'    => $me['id']    ?? null,
            'p_user_email' => $me['email'] ?? null,
            'p_section_id' => $sectionId !== '' ? $sectionId : null,
            'p_unassigned_only' => $sectionId === '' && !empty($secByClass[$classId]),
        ]);
        $p = $res['data'] ?? null;
        if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
            $msg = is_array($p) ? ($p['error'] ?? 'Could not save the register.') : 'Could not save the register.';
            if (!is_array($p) && stripos((string)($res['error'] ?? ''), 'p_section_id') !== false) $msg = 'Migration 142 has not been run yet — registers by stream need it.';
            flash('error', $msg);
        } else {
            flash('success', 'Register saved — ' . (int)$p['present'] . ' present, ' . (int)$p['absent'] . ' absent' . ($p['late'] ? ', ' . (int)$p['late'] . ' late' : '') . '.');
        }
        redirect('students/attendance?class=' . $classId . $secQS . $dateQS);
    }
}

// ── Data for the view ────────────────────────────────────
$sessRes = $sb->from('attendance_sessions')->select('id,class_id,section_id,present_count,absent_count,late_count,taken_at,taken_by_name,source')
    ->eq('school_id', $sid)->eq('date', $date)->execute();
$sessions = $sessRes['data'] ?? [];
$mig142Missing = !empty($sessRes['error']) && stripos((string)$sessRes['error'], 'section_id') !== false;
if ($mig142Missing) {   // pre-142: sessions have no stream column
    $sessions = $sb->from('attendance_sessions')->select('id,class_id,present_count,absent_count,late_count,taken_at,taken_by_name,source')
        ->eq('school_id', $sid)->eq('date', $date)->execute()['data'] ?? [];
}
// Keyed "class|section" — a class-wide register is "class|".
$sessionBy = []; $sessionByClass = [];
foreach ($sessions as $s) { $sessionBy[$s['class_id'] . '|' . ($s['section_id'] ?? '')] = $s; $sessionByClass[$s['class_id']] = $s; }
$sessKey = fn(string $cid, string $secId = '') => $cid . '|' . $secId;

$roster = []; $existing = []; $regLink = '';
if ($classId) {
    $rq = $sb->from('students')->select('id,first_name,last_name,admission_number')
        ->eq('school_id', $sid)->eq('current_class_id', $classId)->eq('status', 'active');
    // A class with streams and no stream chosen = the learners not yet sorted.
    $unassignedOnly = $sectionId === '' && !empty($secByClass[$classId]) && !$mig142Missing;
    if ($sectionId !== '') $rq = $rq->eq('section_id', $sectionId);
    elseif ($unassignedOnly) $rq = $rq->is('section_id', 'null');
    $roster = $rq->order('first_name')->execute()['data'] ?? [];
    $sess = $sessionBy[$sessKey($classId, $sectionId)] ?? null;
    if ($sess && !empty($sess['id'])) {
        $rows = $sb->from('attendance_records')->select('student_id,status')->eq('session_id', $sess['id'])->execute()['data'] ?? [];
        foreach ($rows as $r) $existing[$r['student_id']] = $r['status'];
    }
    $scheme  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host    = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $regLink = $scheme . '://' . $host . baseUrl('register') . '?t=' . $getToken($classId, $mig142Missing ? '' : $sectionId);
}

// "N of M registers" counts streams as registers where a class has them.
$registerSlots = 0; $takenCount = 0;
foreach ($classes as $c) {
    $secs = $secByClass[$c['id']] ?? [];
    if (!$secs) { $registerSlots++; if (isset($sessionBy[$sessKey($c['id'])])) $takenCount++; continue; }
    foreach ($secs as $sec) { $registerSlots++; if (isset($sessionBy[$sessKey($c['id'], $sec['id'])])) $takenCount++; }
    if (!empty($unassigned[$c['id']])) { $registerSlots++; if (isset($sessionBy[$sessKey($c['id'])])) $takenCount++; }
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Attendance</h1>
        <p class="text-sm text-gray-500 mt-1">
            <?= e(date('l, j F Y', strtotime($date))) ?> — <span class="font-semibold text-gray-700"><?= $takenCount ?> of <?= $registerSlots ?></span>
            registers taken<?= $isBackdated ? '' : ' today' ?>.
        </p>
    </div>
    <!-- Pick the day: the office can view or correct up to 90 days back. -->
    <form method="GET" action="<?= baseUrl('students/attendance') ?>" class="flex items-end gap-2">
        <?php if ($classId): ?><input type="hidden" name="class" value="<?= e($classId) ?>"><?php endif; ?>
        <?php if ($sectionId !== ''): ?><input type="hidden" name="section" value="<?= e($sectionId) ?>"><?php endif; ?>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Register date</label>
            <input type="date" name="date" value="<?= e($date) ?>" max="<?= e($today) ?>" min="<?= e($minDate) ?>"
                   onchange="this.form.submit()"
                   class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
        </div>
        <?php if ($isBackdated): ?>
            <a href="<?= baseUrl('students/attendance') ?><?= $classId ? '?class=' . e($classId) : '' ?>"
               class="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Today</a>
        <?php endif; ?>
    </form>
</div>

<?php if ($isBackdated): ?>
<div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
    You are viewing <strong><?= e(date('l, j F Y', strtotime($date))) ?></strong>, not today. Anything you save here is recorded against that date.
</div>
<?php endif; ?>

<?php if (!$classId): ?>
<!-- ── Overview: every class, today — with how full each one is ── -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-400">
        <span>Class</span>
        <span class="flex items-center gap-6">
            <span class="w-44 text-right hidden sm:inline">Enrolled / capacity</span>
            <span class="w-56 text-right">Register</span>
        </span>
    </div>
    <div class="divide-y divide-gray-50">
        <?php
        // One row per register: the class itself, or each stream (plus an
        // "unassigned" row while learners are still being sorted).
        $regRow = function (string $href, string $label, ?array $s, bool $sub, int $n, int $cap, ?string $capForm) use ($isBackdated, $date) {
            $pct = $cap > 0 ? $n / $cap * 100 : null;
            $barCls = $pct === null ? 'bg-gray-300' : ($pct > 100 ? 'bg-rose-500' : ($pct >= 90 ? 'bg-amber-400' : 'bg-emerald-500')); ?>
        <div class="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition gap-4 <?= $sub ? 'pl-10 bg-gray-50/40' : '' ?>">
            <a href="<?= $href ?>" class="<?= $sub ? 'text-gray-800' : 'font-medium text-gray-900' ?> min-w-0 truncate"><?= $sub ? '<span class="text-gray-300 mr-2">└</span>' : '' ?><?= $label ?></a>
            <span class="flex items-center gap-6 flex-none">
                <span class="w-44 hidden sm:flex items-center gap-2 justify-end" title="<?= $cap > 0 ? e($n . ' of ' . $cap . ' places filled') : 'No capacity set' ?>">
                    <span class="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden"><span class="block h-full rounded-full <?= $barCls ?>" style="width:<?= $pct === null ? 0 : (int)min(100, $pct) ?>%"></span></span>
                    <span class="text-sm tabular-nums <?= $pct !== null && $pct > 100 ? 'text-rose-600 font-semibold' : 'text-gray-700' ?>"><?= $n ?><span class="text-gray-400"> / </span><?= $capForm ?? ($cap ?: '—') ?></span>
                </span>
                <a href="<?= $href ?>" class="w-56 text-right">
                <?php if ($s): ?>
                    <span class="text-sm text-gray-600"><?= (int)$s['present_count'] ?> present · <span class="<?= $s['absent_count'] ? 'text-red-600 font-medium' : '' ?>"><?= (int)$s['absent_count'] ?> absent</span><?= $s['late_count'] ? ' · ' . (int)$s['late_count'] . ' late' : '' ?>
                        <span class="text-xs text-gray-400 ml-2"><?= e(date('g:i A', strtotime($s['taken_at']))) ?></span></span>
                <?php else: ?>
                    <span class="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Not taken</span>
                <?php endif; ?>
                </a>
            </span>
        </div>
        <?php };
        $capForm = function (array $c) {
            if (!isAdmin()) return null;
            ob_start(); ?><form method="POST" class="inline"><?= csrfField() ?><input type="hidden" name="action" value="set_capacity"><input type="hidden" name="class_id" value="<?= e($c['id']) ?>"><input type="text" name="capacity" value="<?= (int)($c['capacity'] ?? 0) ?: '' ?>" placeholder="—" inputmode="numeric" title="Capacity — type and press Enter" class="w-10 text-center px-1 py-0.5 rounded border border-transparent hover:border-gray-200 focus:border-emerald-400 outline-none bg-transparent tabular-nums text-sm"></form><?php
            return ob_get_clean();
        };
        foreach ($classes as $c):
            $dq = $isBackdated ? '&date=' . e($date) : '';
            $base = baseUrl('students/attendance') . '?class=' . e($c['id']);
            $secs = $secByClass[$c['id']] ?? [];
            if (!$secs) { $regRow($base . $dq, e($c['name']), $sessionBy[$sessKey($c['id'])] ?? null, false, (int)($enrolled[$c['id']] ?? 0), (int)($c['capacity'] ?? 0), $capForm($c)); continue; }
            // Class header (no register of its own once streams exist), then its streams.
            $regRow(baseUrl('students/streams') . '?class=' . e($c['id']), e($c['name']) . ' <span class="text-[11px] font-normal text-gray-400 ml-1">' . count($secs) . ' streams · <span class="text-emerald-700">sort learners →</span></span>', null, false, (int)($enrolled[$c['id']] ?? 0), (int)($c['capacity'] ?? 0), $capForm($c));
            foreach ($secs as $sec) {
                $regRow($base . '&section=' . e($sec['id']) . $dq, e($sec['name']), $sessionBy[$sessKey($c['id'], $sec['id'])] ?? null, true, (int)($enrolledSec[$sec['id']] ?? 0), (int)($sec['capacity'] ?? 0), null);
            }
            if (!empty($unassigned[$c['id']])) {
                $regRow($base . $dq, '<span class="text-amber-700">Not yet in a stream</span>', $sessionBy[$sessKey($c['id'])] ?? null, true, (int)$unassigned[$c['id']], 0, '<span class="text-gray-300">—</span>');
            }
        endforeach; ?>
        <?php if (empty($classes)): ?><div class="px-5 py-10 text-center text-gray-400 text-sm">No classes yet.</div><?php endif; ?>
    </div>
    <div class="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span><?= number_format($totalEnrolled) ?> learners enrolled<?= $totalCapacity > 0 ? ' · ' . number_format($totalCapacity) . ' places · ' . number_format(max(0, $totalCapacity - $totalEnrolled)) . ' free' : '' ?></span>
        <span class="text-gray-400"><?= isAdmin() ? 'Click a capacity to change it.' : 'Capacity is set by an administrator.' ?></span>
    </div>
</div>

<?php else: ?>
<!-- ── One class: register + link management ── -->
<div class="mb-4"><a href="<?= baseUrl('students/attendance') ?><?= $isBackdated ? '?date=' . e($date) : '' ?>" class="text-sm text-emerald-700 hover:underline">&larr; All classes</a></div>
<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2">
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="save">
            <input type="hidden" name="date" value="<?= e($date) ?>">
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 class="text-sm font-semibold text-gray-700"><?= e($classMap[$classId]) ?><?= $sectionId !== '' ? ' · ' . e($secMap[$sectionId]['name']) : (!empty($secByClass[$classId]) ? ' · <span class="text-amber-700 font-normal">learners not yet in a stream</span>' : '') ?> — register for <?= e(date('D, j M Y', strtotime($date))) ?></h2>
                    <span class="text-xs text-gray-400">tap to mark absent / late</span>
                </div>
                <div class="divide-y divide-gray-50">
                    <?php foreach ($roster as $s): $st = $existing[$s['id']] ?? 'present';
                        if (!in_array($st, ['present', 'absent', 'late'], true)) $st = 'absent'; ?>
                    <div class="stu flex items-center justify-between px-5 py-2.5 cursor-pointer select-none" data-st="<?= e($st) ?>" onclick="cycle(this)">
                        <div class="min-w-0"><p class="text-sm font-medium text-gray-900 truncate"><?= e($s['first_name'] . ' ' . $s['last_name']) ?></p></div>
                        <div class="flex items-center gap-3 flex-shrink-0">
                            <span class="text-xs text-gray-400"><?= e($s['admission_number'] ?? '') ?></span>
                            <span class="badge"></span>
                        </div>
                        <input type="hidden" name="st[<?= e($s['id']) ?>]" value="<?= e($st) ?>">
                    </div>
                    <?php endforeach; ?>
                    <?php if (empty($roster)): ?><div class="px-5 py-10 text-center text-gray-400 text-sm">No active learners in this class.</div><?php endif; ?>
                </div>
            </div>
            <button type="submit" class="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition">Save register (<span id="sumLine"></span>)</button>
        </form>
    </div>

    <div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-1">Class register link</h3>
            <p class="text-xs text-gray-500 mb-3">Print the QR and tape it inside the class register. The teacher opens it on any phone — no login needed.</p>
            <div id="regQr" class="inline-block p-2 bg-white rounded-lg border border-gray-100 mb-3"></div>
            <input type="text" readonly value="<?= e($regLink) ?>" id="regLink" class="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-mono text-gray-600 mb-2">
            <div class="flex gap-2">
                <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('regLink').value).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy link',1500);})" class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Copy link</button>
                <a href="<?= e($regLink) ?>" target="_blank" rel="noopener" class="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Open</a>
            </div>
            <form method="POST" class="mt-4 pt-3 border-t border-gray-100">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="rotate">
                <input type="hidden" name="date" value="<?= e($date) ?>">
                <button type="submit" onclick="return confirm('Replace the link? The current QR stops working and must be reprinted.')" class="text-xs text-red-600 hover:underline">Replace (rotate) this link</button>
            </form>
        </div>
    </div>
</div>

<style>
.stu[data-st="absent"]{background:#fef2f2}.stu[data-st="late"]{background:#fffbeb}
.badge{font-size:11px;font-weight:600;padding:2px 10px;border-radius:999px}
.stu[data-st="present"] .badge{background:#ecfdf5;color:#059669}
.stu[data-st="absent"] .badge{background:#fee2e2;color:#dc2626}
.stu[data-st="late"] .badge{background:#fef3c7;color:#b45309}
</style>
<script src="/assets/qrcode.min.js?v=1"></script>
<script>
var ORDER={present:'absent',absent:'late',late:'present'},LABEL={present:'Present',absent:'Absent',late:'Late'};
function paint(r){r.querySelector('.badge').textContent=LABEL[r.dataset.st];}
function cycle(r){r.dataset.st=ORDER[r.dataset.st];r.querySelector('input[type=hidden]').value=r.dataset.st;paint(r);summarize();}
function summarize(){var rows=document.querySelectorAll('.stu'),a=0,l=0;rows.forEach(function(r){if(r.dataset.st==='absent')a++;else if(r.dataset.st==='late')l++;});
    var el=document.getElementById('sumLine');if(el)el.textContent=(rows.length-a-l)+' present, '+a+' absent'+(l?(', '+l+' late'):'');}
document.querySelectorAll('.stu').forEach(paint);summarize();
(function(){var el=document.getElementById('regQr');var url=document.getElementById('regLink');
    if(el&&url){
        if(window.QRCode){new QRCode(el,{text:url.value,width:150,height:150,correctLevel:QRCode.CorrectLevel.M});}
        else{el.innerHTML='<p class="text-xs text-gray-400 p-2">QR unavailable — use Copy link and share it directly.</p>';}
    }})();
</script>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
