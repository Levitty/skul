<?php
/**
 * Dashboard — full school overview.
 *
 * The previous version called an RPC `get_dashboard_stats` that was never
 * defined in any migration, so every stat came back 0. This version fetches
 * directly, reusing the proven query patterns from fees/dashboard.php, and
 * powers the charts the dashboard now shows.
 */
// Parents never see the staff dashboard — funnel them to their portal.
// Every path that lands on /dashboard (login, school switch, typing "/")
// passes through here, so this one redirect covers them all.
if (isParent()) {
    redirect('portal');
}

// Pure teachers (role=teacher, not admin/head_teacher) get a teacher-focused
// homepage instead of the admin dashboard. Head teachers + admins fall through
// to the full school dashboard below.
if (userRole() === 'teacher') {
    require __DIR__ . '/teacher-home.php';
    return;
}
// Anyone WITHOUT finance visibility must never load the money dashboard —
// route them to their finance-free workspace instead (capability-driven, so it
// covers Exams Officer today and any custom no-finance role tomorrow).
if (!userCan('dashboard.finance')) {
    if (userCan('results.manage'))    redirect('exams');
    if (userCan('students.manage'))   redirect('students');
    if (userCan('admissions.manage')) redirect('admissions');
    redirect('account');
}

$pageTitle = 'Dashboard';
$sb   = new Supabase();
$sid  = schoolId();
$user = currentUser();

// Money on this page: admins always; everyone else only when the school has
// not switched totals to admins-only (Settings → Permissions).
$showMoney = isAdmin() || schoolSetting('dashboard_money_admins_only', 'false') !== 'true';

$classMap    = cachedClassMap();
$currentTerm = cachedCurrentTerm();
$cur         = schoolSetting('currency_symbol', 'KES');

// ── Students + invoices + recent payments: ONE parallel round-trip ──
// These three fetches are independent; sequentially they cost three full
// Supabase round-trips (~750ms+). fetchParallel runs them concurrently for
// the price of one. Pagination continues sequentially only in the rare
// >1000-row case, preserving fetchAllPaged's correctness guarantee.
$currentTermId = $currentTerm['id'] ?? null;
$sbq  = new Supabase();
$invQ = $sbq->from('invoices')
    ->select('id,student_id,amount,paid_amount,status,due_date,term_id')
    ->eq('school_id', $sid)
    ->neq('status', 'cancelled');
if ($currentTermId) $invQ = $invQ->eq('term_id', $currentTermId);

$par = Supabase::fetchParallel([
    'students' => $sbq->from('students')->select('id,current_class_id,guardian_phone,status')
        ->eq('school_id', $sid)->range(0, 1000),
    'invoices' => $invQ->range(0, 1000),
    'payments' => $sbq->from('payments')->select('id,invoice_id,amount,method,created_at')
        ->eq('school_id', $sid)->eq('status', 'completed')
        ->order('created_at', false)->limit(6),
]);

// Continue paging past 1000 rows where needed (rare; sequential is fine there).
$pageOn = function (array $rows, callable $builder) use ($sbq): array {
    $off = 1000;
    while (count($rows) === $off) {
        $more = $builder($sbq)->range($off, 1000)->execute()['data'] ?? [];
        if (empty($more)) break;
        $rows = array_merge($rows, $more);
        if (count($more) < 1000) break;
        $off += 1000;
    }
    return $rows;
};
$students = $pageOn($par['students'], fn($_sb) => $_sb->from('students')
    ->select('id,current_class_id,guardian_phone,status')->eq('school_id', $sid));

$studentClassMap = [];   // student_id => class_id
$studentsByClass = [];   // class_id => active student count
$totalStudents   = 0;
$missingPhone    = 0;
foreach ($students as $s) {
    $studentClassMap[$s['id']] = $s['current_class_id'] ?? null;
    // Treat anything not explicitly exited/inactive/graduated as active.
    $status = strtolower((string)($s['status'] ?? 'active'));
    if (in_array($status, ['exited', 'inactive', 'graduated'], true)) continue;
    $totalStudents++;
    $cid = $s['current_class_id'] ?? null;
    if ($cid) $studentsByClass[$cid] = ($studentsByClass[$cid] ?? 0) + 1;
    if (trim((string)($s['guardian_phone'] ?? '')) === '') $missingPhone++;
}
arsort($studentsByClass);

// ── Invoices for the current term (fetched in the parallel batch above) ──
$invoices = $pageOn($par['invoices'], function ($_sb) use ($sid, $currentTermId) {
    $q = $_sb->from('invoices')
        ->select('id,student_id,amount,paid_amount,status,due_date,term_id')
        ->eq('school_id', $sid)
        ->neq('status', 'cancelled');
    if ($currentTermId) $q = $q->eq('term_id', $currentTermId);
    return $q;
});

$totalBilled      = 0.0;
$totalCollected   = 0.0;
$draftCount       = 0;
$overdueCount     = 0;
$collectedByClass = [];   // class_id => collected amount
$today = date('Y-m-d');
foreach ($invoices as $inv) {
    $st = $inv['status'] ?? 'unpaid';
    if ($st === 'draft') { $draftCount++; continue; }
    $amt  = (float)($inv['amount'] ?? 0);
    $paid = (float)($inv['paid_amount'] ?? 0);
    $totalBilled    += $amt;
    $totalCollected += $paid;
    $bal = $amt - $paid;
    $due = $inv['due_date'] ?? null;
    if (($bal > 0.01 && $due && $due < $today) || $st === 'overdue') $overdueCount++;
    $cid = $studentClassMap[$inv['student_id']] ?? null;
    if ($cid && $paid > 0) {
        $collectedByClass[$cid] = ($collectedByClass[$cid] ?? 0) + $paid;
    }
}
$totalOutstanding = $totalBilled - $totalCollected;
$collectionPct    = $totalBilled > 0 ? ($totalCollected / $totalBilled) * 100 : 0;
arsort($collectedByClass);

// ── Recent payments (last 6 completed — from the parallel batch) ──
$recentPayments = $par['payments'];

$recentInvMap = [];
$recentStuMap = [];
$recentInvIds = array_unique(array_filter(array_column($recentPayments, 'invoice_id')));
if (!empty($recentInvIds)) {
    $invRes = $sb->from('invoices')->select('id,student_id')->in('id', $recentInvIds)->execute();
    foreach (($invRes['data'] ?? []) as $i) $recentInvMap[$i['id']] = $i;
    $recentStuIds = array_unique(array_filter(array_column($invRes['data'] ?? [], 'student_id')));
    if (!empty($recentStuIds)) {
        $stuRes = $sb->from('students')->select('id,first_name,last_name')
            ->in('id', $recentStuIds)->execute();
        foreach (($stuRes['data'] ?? []) as $s) $recentStuMap[$s['id']] = $s;
    }
}

// ── View helpers (closures — no global function pollution) ─
$palette = ['#8b5cf6', '#14b8a6', '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899'];
$greySeg = '#cbd5e1';

// Build a donut from a class_id => value map.
// Returns ['css' => conic-gradient string, 'segments' => [...], 'total' => float].
$buildDonut = function (array $byClass, int $topN, array $classMap, array $palette, string $greySeg): array {
    $byClass = array_filter($byClass, fn($v) => $v > 0);
    $total = array_sum($byClass);
    if ($total <= 0) return ['css' => $greySeg, 'segments' => [], 'total' => 0];
    $segments = [];
    $other = 0.0;
    $i = 0;
    foreach ($byClass as $cid => $value) {
        if ($i < $topN) {
            $segments[] = [
                'label' => $classMap[$cid] ?? 'Unknown',
                'value' => $value,
                'color' => $palette[$i % count($palette)],
            ];
        } else {
            $other += $value;
        }
        $i++;
    }
    if ($other > 0) {
        $segments[] = ['label' => 'Other classes', 'value' => $other, 'color' => $greySeg];
    }
    $stops = [];
    $acc = 0.0;
    foreach ($segments as $seg) {
        $start = $acc / $total * 100;
        $acc  += $seg['value'];
        $end   = $acc / $total * 100;
        $stops[] = sprintf('%s %.2f%% %.2f%%', $seg['color'], $start, $end);
    }
    return ['css' => 'conic-gradient(' . implode(',', $stops) . ')', 'segments' => $segments, 'total' => $total];
};

// Compact money for tight spaces: 742300 -> "742K", 1850000 -> "1.9M".
$shortMoney = function (float $n): string {
    if ($n >= 1000000) return rtrim(rtrim(number_format($n / 1000000, 1), '0'), '.') . 'M';
    if ($n >= 1000)    return (string) round($n / 1000) . 'K';
    return (string) round($n);
};

// Relative time: "5m ago", "2h ago", "Yesterday", "3d ago", "May 4".
$timeAgo = function (?string $dt): string {
    if (!$dt) return '';
    $ts = strtotime($dt);
    if (!$ts) return '';
    $diff = time() - $ts;
    if ($diff < 0)      return 'Just now';
    if ($diff < 3600)   return max(1, (int)($diff / 60)) . 'm ago';
    if ($diff < 86400)  return (int)($diff / 3600) . 'h ago';
    $days = (int)($diff / 86400);
    if ($days === 1) return 'Yesterday';
    if ($days < 7)   return $days . 'd ago';
    return date('M j', $ts);
};

$methodLabels = methodLabelMap();
$avatarTints = [
    ['bg-violet-100', 'text-violet-700'],
    ['bg-blue-100',   'text-blue-700'],
    ['bg-amber-100',  'text-amber-700'],
    ['bg-pink-100',   'text-pink-700'],
    ['bg-teal-100',   'text-teal-700'],
    ['bg-rose-100',   'text-rose-700'],
];

$feeDonut     = $buildDonut($collectedByClass, 6, $classMap, $palette, $greySeg);
$studentDonut = $buildDonut($studentsByClass, 5, $classMap, $palette, $greySeg);

// Greeting
$hour  = (int) date('G');
$greet = $hour < 12 ? 'Good morning' : ($hour < 17 ? 'Good afternoon' : 'Good evening');
$name  = trim((string)($user['name'] ?? ''));
if (str_contains($name, '@')) $name = ucfirst(explode('@', $name)[0]); // email fallback → readable
$firstName = $name !== '' ? explode(' ', $name)[0] : 'there';
$schoolName = $user['school_name'] ?? 'your school';

// Needs-attention items — only real, non-zero ones, each links to an action.
$ICON_DOC   = 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
$ICON_ALERT = 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z';
$ICON_USER  = 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z';

$attention = [];

// Enquiries: the top of the funnel. New and untouched for 2 days, or a
// follow-up that's due — either is a family waiting on the school.
$enqRows = $sb->from('enquiries')->select('status,created_at,follow_up_at')
    ->eq('school_id', $sid)->in('status', ['new', 'contacted', 'visit_booked', 'applied'])->limit(500)->execute()['data'] ?? [];
$enqStale = 0; $enqDue = 0;
foreach ($enqRows as $er) {
    if (($er['status'] ?? '') === 'new' && strtotime((string)$er['created_at']) < time() - 2 * 86400) $enqStale++;
    if (!empty($er['follow_up_at']) && $er['follow_up_at'] <= date('Y-m-d')) $enqDue++;
}
if ($enqStale > 0) {
    $attention[] = [
        'count' => $enqStale,
        'label' => 'enquir' . ($enqStale !== 1 ? 'ies' : 'y') . ' not yet contacted',
        'sub'   => 'Waiting more than 2 days',
        'url'   => baseUrl('enquiries') . '?status=new',
        'icon'  => $ICON_DOC,
        'tbg'   => 'bg-rose-100', 'tfg' => 'text-rose-600',
    ];
}
if ($enqDue > 0) {
    $attention[] = [
        'count' => $enqDue,
        'label' => 'enquiry follow-up' . ($enqDue !== 1 ? 's' : '') . ' due',
        'sub'   => 'Today or overdue',
        'url'   => baseUrl('enquiries') . '?status=due',
        'icon'  => $ICON_DOC,
        'tbg'   => 'bg-violet-100', 'tfg' => 'text-violet-600',
    ];
}
if ($draftCount > 0) {
    $attention[] = [
        'count' => $draftCount,
        'label' => 'draft invoice' . ($draftCount !== 1 ? 's' : ''),
        'sub'   => 'Ready to issue',
        'url'   => baseUrl('fees/invoices') . '?status=draft',
        'icon'  => $ICON_DOC,
        'tbg'   => 'bg-amber-100', 'tfg' => 'text-amber-600',
    ];
}
if ($overdueCount > 0) {
    $attention[] = [
        'count' => $overdueCount,
        'label' => 'overdue invoice' . ($overdueCount !== 1 ? 's' : ''),
        'sub'   => 'Payment past due',
        'url'   => baseUrl('fees/invoices') . '?status=overdue',
        'icon'  => $ICON_ALERT,
        'tbg'   => 'bg-rose-100', 'tfg' => 'text-rose-600',
    ];
}
if ($missingPhone > 0) {
    $attention[] = [
        'count' => $missingPhone,
        'label' => 'missing a phone',
        'sub'   => 'Guardian contact',
        'url'   => baseUrl('students'),
        'icon'  => $ICON_USER,
        'tbg'   => 'bg-violet-100', 'tfg' => 'text-violet-600',
    ];
}

require __DIR__ . '/../includes/layout-top.php';
?>

<!-- Greeting -->
<div class="flex items-start justify-between gap-4 mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900"><?= e($greet) ?>, <?= e($firstName) ?></h1>
        <p class="text-sm text-gray-500 mt-1">Here's what's happening at <?= e($schoolName) ?> today.</p>
    </div>
    <a href="<?= baseUrl('students/add') ?>" class="shrink-0 inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M12 5v14M5 12h14"/></svg>
        Add Student
    </a>
</div>

<!-- Stat cards -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-violet-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/></svg>
        </div>
        <div class="min-w-0">
            <p class="text-xl font-bold text-gray-900 leading-tight truncate"><?= number_format($totalStudents) ?></p>
            <p class="text-xs text-gray-500 mt-0.5">Total Students</p>
        </div>
    </div>
    <?php if ($showMoney): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div class="min-w-0">
            <p class="text-xl font-bold text-gray-900 leading-tight truncate"><?= money($totalCollected) ?></p>
            <p class="text-xs text-gray-500 mt-0.5">Collected<?= $currentTerm ? ' · ' . e($currentTerm['name']) : '' ?></p>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        </div>
        <div class="min-w-0">
            <p class="text-xl font-bold text-gray-900 leading-tight truncate"><?= money($totalOutstanding) ?></p>
            <p class="text-xs text-gray-500 mt-0.5">Outstanding</p>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
        </div>
        <div class="min-w-0">
            <p class="text-xl font-bold text-gray-900 leading-tight truncate"><?= number_format($collectionPct, 0) ?>%</p>
            <p class="text-xs text-gray-500 mt-0.5">Collection Rate</p>
        </div>
    </div>
    <?php endif; ?>
</div>

<!-- Donut charts -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">

    <!-- Fee Collection by Class -->
    <?php if ($showMoney): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-start justify-between mb-5">
            <div>
                <h3 class="text-base font-semibold text-gray-900">Fee Collection by Class</h3>
                <p class="text-xs text-gray-500 mt-0.5"><?= $currentTerm ? e($currentTerm['name']) . ' collected' : 'Total collected' ?></p>
            </div>
            <a href="<?= baseUrl('fees/report') ?>" class="text-xs font-medium text-emerald-600 hover:text-emerald-800 shrink-0">View More →</a>
        </div>
        <?php if ($feeDonut['total'] <= 0): ?>
            <div class="py-10 text-center text-gray-400 text-sm">No collection recorded yet.</div>
        <?php else: ?>
        <div class="flex items-center gap-6">
            <div class="relative w-[140px] h-[140px] rounded-full shrink-0" style="background:<?= $feeDonut['css'] ?>">
                <div class="absolute inset-0 m-[24px] rounded-full bg-white flex flex-col items-center justify-center">
                    <div class="text-lg font-bold text-gray-900 leading-none"><?= e($shortMoney($totalCollected)) ?></div>
                    <div class="text-[10px] text-gray-400 mt-0.5">collected</div>
                </div>
            </div>
            <div class="flex-1 min-w-0 space-y-2">
                <?php foreach ($feeDonut['segments'] as $seg): ?>
                <div class="flex items-center gap-2.5 text-xs">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:<?= $seg['color'] ?>"></span>
                    <span class="text-gray-500 flex-1 min-w-0 truncate"><?= e($seg['label']) ?></span>
                    <span class="font-semibold text-gray-900 shrink-0"><?= e($cur) ?> <?= e($shortMoney($seg['value'])) ?></span>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
    </div>
    <?php endif; ?>


    <!-- Students by Class -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-start justify-between mb-5">
            <div>
                <h3 class="text-base font-semibold text-gray-900">Students by Class</h3>
                <p class="text-xs text-gray-500 mt-0.5">Headcount across <?= count($studentsByClass) ?> class<?= count($studentsByClass) !== 1 ? 'es' : '' ?></p>
            </div>
            <a href="<?= baseUrl('students') ?>" class="text-xs font-medium text-emerald-600 hover:text-emerald-800 shrink-0">View More →</a>
        </div>
        <?php if ($studentDonut['total'] <= 0): ?>
            <div class="py-10 text-center text-gray-400 text-sm">No students enrolled yet.</div>
        <?php else: ?>
        <div class="flex items-center gap-6">
            <div class="relative w-[140px] h-[140px] rounded-full shrink-0" style="background:<?= $studentDonut['css'] ?>">
                <div class="absolute inset-0 m-[24px] rounded-full bg-white flex flex-col items-center justify-center">
                    <div class="text-xl font-bold text-gray-900 leading-none"><?= number_format($totalStudents) ?></div>
                    <div class="text-[10px] text-gray-400 mt-0.5">students</div>
                </div>
            </div>
            <div class="flex-1 min-w-0 space-y-2">
                <?php foreach ($studentDonut['segments'] as $seg): ?>
                <div class="flex items-center gap-2.5 text-xs">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:<?= $seg['color'] ?>"></span>
                    <span class="text-gray-500 flex-1 min-w-0 truncate"><?= e($seg['label']) ?></span>
                    <span class="font-semibold text-gray-900 shrink-0"><?= number_format($seg['value']) ?></span>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
    </div>
</div>

<!-- Recent payments + Needs attention -->
<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

    <!-- Recent Payments -->
    <div class="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center justify-between mb-2">
            <h3 class="text-base font-semibold text-gray-900">Recent Payments</h3>
            <a href="<?= baseUrl('fees/payments') ?>" class="text-xs font-medium text-emerald-600 hover:text-emerald-800">View More →</a>
        </div>
        <?php if (empty($recentPayments)): ?>
            <div class="py-10 text-center text-gray-400 text-sm">No payments recorded yet.</div>
        <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($recentPayments as $idx => $p):
                $inv = $recentInvMap[$p['invoice_id']] ?? null;
                $stu = $inv ? ($recentStuMap[$inv['student_id']] ?? null) : null;
                $fn  = $stu['first_name'] ?? '';
                $ln  = $stu['last_name'] ?? '';
                $name = trim($fn . ' ' . $ln);
                if ($name === '') $name = 'Unknown student';
                $initials = strtoupper(substr($fn, 0, 1) . substr($ln, 0, 1));
                if ($initials === '') $initials = '?';
                $cls = ($inv && isset($studentClassMap[$inv['student_id']]))
                    ? ($classMap[$studentClassMap[$inv['student_id']]] ?? '') : '';
                $mth = $methodLabels[$p['method'] ?? 'other'] ?? ucfirst((string)($p['method'] ?? 'Other'));
                $meta = implode(' · ', array_filter([$cls, $mth, $timeAgo($p['created_at'] ?? null)]));
                $tint = $avatarTints[$idx % count($avatarTints)];
            ?>
            <div class="flex items-center gap-3.5 py-3">
                <div class="w-9 h-9 rounded-full <?= $tint[0] ?> <?= $tint[1] ?> flex items-center justify-center text-xs font-semibold shrink-0"><?= e($initials) ?></div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-gray-900 truncate"><?= e($name) ?></div>
                    <div class="text-xs text-gray-400 truncate"><?= e($meta) ?></div>
                </div>
                <?php if ($showMoney): ?><div class="text-sm font-bold text-gray-900 shrink-0"><?= money((float)($p['amount'] ?? 0)) ?></div><?php endif; ?>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>

    <!-- Needs Attention -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 class="text-base font-semibold text-gray-900 mb-3">Needs Attention</h3>
        <?php if (empty($attention)): ?>
            <div class="flex items-center gap-3 p-3 rounded-lg bg-emerald-50">
                <div class="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 13l4 4L19 7"/></svg>
                </div>
                <div class="text-sm font-medium text-emerald-800">All caught up — nothing needs attention.</div>
            </div>
        <?php else: ?>
        <div class="space-y-2.5">
            <?php foreach ($attention as $a): ?>
            <a href="<?= e($a['url']) ?>" class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition">
                <div class="w-9 h-9 rounded-lg <?= $a['tbg'] ?> flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 <?= $a['tfg'] ?>" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="<?= $a['icon'] ?>"/></svg>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-gray-900"><?= number_format($a['count']) ?> <?= e($a['label']) ?></div>
                    <div class="text-xs text-gray-400"><?= e($a['sub']) ?></div>
                </div>
                <svg class="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 5l7 7-7 7"/></svg>
            </a>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>
</div>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
