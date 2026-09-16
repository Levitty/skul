<?php
/**
 * Public class register — the no-login attendance link (migration 108).
 *
 * Flow: the class teacher opens the class's secret link / QR on any phone,
 * sees today's roster pre-marked PRESENT, taps only the absentees (tap again
 * for LATE, again back to present), types their name once (remembered on the
 * device), and submits. Everything lands through the record_attendance action.
 * Re-opening the same day shows the submitted state; re-submitting corrects it.
 *
 * Auth = the per-class token (class_register_tokens, rotatable from the office
 * register screen). Shows the minimum: first names + admission numbers only.
 */

$token = trim((string)input('t'));
$sb    = new Supabase();

$err = ''; $ctx = null;
if ($token === '' || strlen($token) > 80) {
    $err = 'This link is not valid.';
} else {
    $tk = $sb->from('class_register_tokens')->select('school_id,class_id,section_id')
        ->eq('token', $token)->single()->execute()['data'][0] ?? null;
    if (!$tk) {
        $err = 'This link is not valid or has been replaced. Ask the office for the current register link.';
    } else {
        $cls = $sb->from('classes')->select('id,name')->eq('id', $tk['class_id'])->single()->execute()['data'][0] ?? null;
        $sch = $sb->from('schools')->select('id,name')->eq('id', $tk['school_id'])->single()->execute()['data'][0] ?? null;
        // A link can be for one stream of the class (mig. 142) — the roster
        // and the session are then that stream's only.
        $sec = !empty($tk['section_id']) ? ($sb->from('sections')->select('id,name')->eq('id', $tk['section_id'])->single()->execute()['data'][0] ?? null) : null;
        if (!$cls || !$sch) $err = 'This class is no longer available.';
        else { if ($sec) $cls['name'] .= ' · ' . $sec['name']; $ctx = ['school' => $sch, 'class' => $cls, 'section_id' => $sec['id'] ?? null]; }
    }
}

$today   = date('Y-m-d');
$success = null;

if ($ctx) {
    // Roster (active learners of this class) — minimum fields only.
    $rq = $sb->from('students')->select('id,first_name,last_name,admission_number')
        ->eq('school_id', $ctx['school']['id'])->eq('current_class_id', $ctx['class']['id'])
        ->eq('status', 'active');
    if ($ctx['section_id']) $rq = $rq->eq('section_id', $ctx['section_id']);
    $roster = $rq->order('first_name')->execute()['data'] ?? [];

    // Existing state for today (so re-opening shows what was submitted).
    $sq = $sb->from('attendance_sessions')->select('id,present_count,absent_count,late_count,taken_at,taken_by_name')
        ->eq('school_id', $ctx['school']['id'])->eq('class_id', $ctx['class']['id'])->eq('date', $today);
    $sq = $ctx['section_id'] ? $sq->eq('section_id', $ctx['section_id']) : $sq->is('section_id', 'null');
    $session = $sq->single()->execute()['data'][0] ?? null;
    $existing = [];
    if ($session) {
        $rows = $sb->from('attendance_records')->select('student_id,status')
            ->eq('session_id', $session['id'])->execute()['data'] ?? [];
        foreach ($rows as $r) $existing[$r['student_id']] = $r['status'];
    }

    if (isPost()) {
        $bucket = 'register:' . $ctx['class']['id'];
        if (rateCount($bucket, 3600) >= 30) {
            $err = 'Too many submissions. Please try again later.';
        } else {
            $takenBy = mb_substr(trim((string)input('taken_by')), 0, 80);
            $states  = $_POST['st'] ?? [];
            $exceptions = [];
            foreach ($roster as $s) {                       // roster-bound: unknown ids ignored
                $st = $states[$s['id']] ?? 'present';
                if (in_array($st, ['absent', 'late'], true)) {
                    $exceptions[] = ['student_id' => $s['id'], 'status' => $st];
                }
            }
            $res = $sb->rpc('record_attendance', [
                'p_school_id'  => $ctx['school']['id'],
                'p_class_id'   => $ctx['class']['id'],
                'p_date'       => $today,
                'p_exceptions' => $exceptions,
                'p_source'     => 'class_link',
                'p_taken_by'   => $takenBy !== '' ? $takenBy : null,
                'p_section_id' => $ctx['section_id'],
            ]);
            $payload = $res['data'] ?? null;
            if (!empty($res['error']) || !is_array($payload) || empty($payload['success'])) {
                $err = is_array($payload) ? ($payload['error'] ?? 'Could not save the register. Please try again.') : 'Could not save the register. Please try again.';
            } else {
                rateRecord($bucket);
                $success = $payload;
                // Refresh shown state to what was just saved.
                $existing = [];
                foreach ($exceptions as $ex) $existing[$ex['student_id']] = $ex['status'];
                // TODO (WhatsApp): when the Meta channel is live, send the
                // absent-notice to each absent learner's guardian_phone here —
                // the self-verifying loop from the capture spec.
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register — <?= e($ctx['class']['name'] ?? 'Class') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body{font-family:'Inter',system-ui,sans-serif}
        .stu{transition:background .12s}
        .stu[data-st="present"]{background:#fff}
        .stu[data-st="absent"]{background:#fef2f2}
        .stu[data-st="late"]{background:#fffbeb}
        .badge{font-size:11px;font-weight:600;padding:2px 10px;border-radius:999px}
        .stu[data-st="present"] .badge{background:#ecfdf5;color:#059669}
        .stu[data-st="absent"] .badge{background:#fee2e2;color:#dc2626}
        .stu[data-st="late"] .badge{background:#fef3c7;color:#b45309}
    </style>
</head>
<body class="bg-gray-50 min-h-screen">
<div class="max-w-lg mx-auto px-4 py-6">
<?php if ($err && !$ctx): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-600"><?= e($err) ?></div>
<?php else: ?>
    <div class="mb-4">
        <p class="text-xs font-semibold tracking-wide text-emerald-600 uppercase"><?= e($ctx['school']['name']) ?></p>
        <h1 class="text-xl font-bold text-gray-900"><?= e($ctx['class']['name']) ?> — Morning Register</h1>
        <p class="text-sm text-gray-500"><?= e(date('l, j F Y')) ?> · tap a learner who is <span class="font-semibold text-red-600">absent</span>, tap again for <span class="font-semibold text-amber-600">late</span></p>
    </div>

    <?php if ($success): ?>
        <div class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-medium">
            Register saved — <?= (int)$success['present'] ?> present, <?= (int)$success['absent'] ?> absent<?= $success['late'] ? ', ' . (int)$success['late'] . ' late' : '' ?>. You can correct and resubmit any time today.
        </div>
    <?php elseif ($session): ?>
        <div class="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
            Already taken today at <?= e(date('g:i A', strtotime($session['taken_at']))) ?><?= $session['taken_by_name'] ? ' by ' . e($session['taken_by_name']) : '' ?> — submitting again updates it.
        </div>
    <?php endif; ?>
    <?php if ($err): ?><div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><?= e($err) ?></div><?php endif; ?>

    <form method="POST" id="regForm">
        <div class="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden mb-4">
            <?php if (empty($roster)): ?>
                <div class="px-4 py-10 text-center text-gray-400 text-sm">No active learners in this class.</div>
            <?php endif; ?>
            <?php foreach ($roster as $s):
                $st = $existing[$s['id']] ?? 'present';
                if (!in_array($st, ['present', 'absent', 'late'], true)) $st = 'absent'; ?>
                <div class="stu flex items-center justify-between px-4 py-3 cursor-pointer select-none" data-st="<?= e($st) ?>" onclick="cycle(this)">
                    <div class="min-w-0">
                        <p class="font-medium text-gray-900 truncate"><?= e($s['first_name'] . ' ' . $s['last_name']) ?></p>
                        <p class="text-xs text-gray-400"><?= e($s['admission_number'] ?? '') ?></p>
                    </div>
                    <span class="badge flex-shrink-0"></span>
                    <input type="hidden" name="st[<?= e($s['id']) ?>]" value="<?= e($st) ?>">
                </div>
            <?php endforeach; ?>
        </div>

        <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Your name (class teacher)</label>
            <input type="text" name="taken_by" id="takenBy" required maxlength="80"
                class="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
        </div>

        <button type="submit" class="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition">
            Submit register (<span id="sumLine"></span>)
        </button>
    </form>
<?php endif; ?>
</div>
<script>
var ORDER = {present:'absent', absent:'late', late:'present'};
var LABEL = {present:'Present', absent:'Absent', late:'Late'};
function paint(row){ row.querySelector('.badge').textContent = LABEL[row.dataset.st]; }
function cycle(row){
    row.dataset.st = ORDER[row.dataset.st];
    row.querySelector('input[type=hidden]').value = row.dataset.st;
    paint(row); summarize();
}
function summarize(){
    var rows = document.querySelectorAll('.stu'), a=0, l=0;
    rows.forEach(function(r){ if(r.dataset.st==='absent')a++; else if(r.dataset.st==='late')l++; });
    var el = document.getElementById('sumLine');
    if (el) el.textContent = (rows.length-a-l)+' present, '+a+' absent'+(l?(', '+l+' late'):'');
}
document.querySelectorAll('.stu').forEach(paint); summarize();
// Remember the teacher's name on this device.
var tb = document.getElementById('takenBy');
if (tb){ tb.value = tb.value || localStorage.getItem('reg_name') || '';
    document.getElementById('regForm').addEventListener('submit', function(){ localStorage.setItem('reg_name', tb.value); }); }
</script>
</body>
</html>
