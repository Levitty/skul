<?php
/**
 * Fees Dashboard — single-screen overview for collections.
 *
 * Designed around the four questions a school admin actually asks each morning:
 *   1) How much have we billed and how much is in?
 *   2) Who hasn't paid?
 *   3) What just came in (so I can verify)?
 *   4) Where am I behind by class?
 *
 * Avoids vanity metrics. Every block links to an action page (record payment,
 * view invoice, view student) so the dashboard is a launchpad, not a dead end.
 */
$pageTitle = 'Fees Dashboard';
$sb  = new Supabase();
$sid = schoolId();

$classes     = cachedClasses();
$classMap    = cachedClassMap();
$currentTerm = cachedCurrentTerm();
$currentYear = cachedCurrentYear();

// ── 1) Load invoices for the active term ──────────────────────────
// We anchor the dashboard on the current term: that's what schools care about
// today. If there's no current term, we fall back to all invoices this year.
//
// fetchAllPaged so the dashboard is correct above 1000 invoices (e.g. a 1000-
// student school with multiple invoices each = 3,000+ per term).
$currentTermId = $currentTerm['id'] ?? null;
$invoices = Supabase::fetchAllPaged(function ($_sb) use ($sid, $currentTermId) {
    $q = $_sb->from('invoices')
        ->select('id,student_id,amount,paid_amount,status,due_date,term_id,created_at')
        ->eq('school_id', $sid)
        ->neq('status', 'cancelled')
        ->order('created_at', false);
    if ($currentTermId) $q = $q->eq('term_id', $currentTermId);
    return $q;
});

// ── 2) Aggregate top-line metrics ─────────────────────────────────
$totalBilled    = 0.0;
$totalCollected = 0.0;
$overdueCount   = 0;
$overdueAmount  = 0.0;
$draftCount     = 0;
$statusCounts   = ['unpaid' => 0, 'partial' => 0, 'paid' => 0, 'overdue' => 0, 'draft' => 0];
$today          = date('Y-m-d');

// Per-student outstanding totals → used for the "top defaulters" list
$studentOutstanding = []; // student_id => outstanding amount

foreach ($invoices as $inv) {
    $amt   = (float)($inv['amount'] ?? 0);
    $paid  = (float)($inv['paid_amount'] ?? 0);
    $st    = $inv['status'] ?? 'unpaid';
    $due   = $inv['due_date'] ?? null;
    $stuId = $inv['student_id'] ?? null;

    // Drafts don't count toward billed/collected — they're not real yet
    if ($st === 'draft') {
        $draftCount++;
        $statusCounts['draft']++;
        continue;
    }

    $totalBilled    += $amt;
    $totalCollected += $paid;
    if (isset($statusCounts[$st])) $statusCounts[$st]++;

    // Treat as overdue if past due_date and not fully paid (regardless of stored status)
    $balance = $amt - $paid;
    $isOverdue = ($balance > 0.01) && $due && $due < $today;
    if ($isOverdue || $st === 'overdue') {
        $overdueCount++;
        $overdueAmount += $balance;
    }

    if ($stuId && $balance > 0.01) {
        $studentOutstanding[$stuId] = ($studentOutstanding[$stuId] ?? 0) + $balance;
    }
}

$totalOutstanding = $totalBilled - $totalCollected;
$collectionPct    = $totalBilled > 0 ? ($totalCollected / $totalBilled) * 100 : 0;

// ── 3) Top defaulters (top 10 by outstanding) ─────────────────────
arsort($studentOutstanding);
$topDefaulterIds = array_slice(array_keys($studentOutstanding), 0, 10);
$topDefaulters   = [];
if (!empty($topDefaulterIds)) {
    $stuRes = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,current_class_id,guardian_phone')
        ->in('id', $topDefaulterIds)->execute();
    $stuMap = [];
    foreach (($stuRes['data'] ?? []) as $s) $stuMap[$s['id']] = $s;
    foreach ($topDefaulterIds as $id) {
        if (isset($stuMap[$id])) {
            $stuMap[$id]['outstanding'] = $studentOutstanding[$id];
            $topDefaulters[] = $stuMap[$id];
        }
    }
}

// ── 4) Recent payments (last 10 completed) ────────────────────────
// We only show 'completed' to avoid pending/failed noise on the verify view.
$recentPaysRes = $sb->from('payments')
    ->select('id,invoice_id,amount,method,reference,created_at')
    ->eq('school_id', $sid)
    ->eq('status', 'completed')
    ->order('created_at', false)
    ->limit(10)
    ->execute();
$recentPayments = $recentPaysRes['data'] ?? [];

// Join recent payments → invoice → student (lightweight)
$recentInvIds = array_unique(array_filter(array_column($recentPayments, 'invoice_id')));
$recentInvMap = [];
$recentStuMap = [];
if (!empty($recentInvIds)) {
    $invRes = $sb->from('invoices')->select('id,student_id,reference')->in('id', $recentInvIds)->execute();
    foreach (($invRes['data'] ?? []) as $i) $recentInvMap[$i['id']] = $i;
    $recentStuIds = array_unique(array_filter(array_column($invRes['data'] ?? [], 'student_id')));
    if (!empty($recentStuIds)) {
        $stuRes2 = $sb->from('students')
            ->select('id,first_name,last_name,admission_number')
            ->in('id', $recentStuIds)->execute();
        foreach (($stuRes2['data'] ?? []) as $s) $recentStuMap[$s['id']] = $s;
    }
}

// ── 5) Collection by class ────────────────────────────────────────
// Walk invoices, attribute each to a class via student lookup. Chunked-in
// because at >1000 distinct students the raw ->in() would throw.
$studentClassMap = [];
if (!empty($invoices)) {
    $allStuIds = array_unique(array_filter(array_column($invoices, 'student_id')));
    $stuRows = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('students')->select('id,current_class_id'),
        'id',
        $allStuIds
    );
    foreach ($stuRows as $s) {
        $studentClassMap[$s['id']] = $s['current_class_id'] ?? null;
    }
}

$byClass = []; // class_id => [billed, collected, students]
foreach ($invoices as $inv) {
    if (($inv['status'] ?? '') === 'draft') continue;
    $stuId = $inv['student_id'] ?? null;
    $clsId = $studentClassMap[$stuId] ?? null;
    if (!$clsId) continue;
    if (!isset($byClass[$clsId])) $byClass[$clsId] = ['billed' => 0, 'collected' => 0, 'students' => []];
    $byClass[$clsId]['billed']    += (float)($inv['amount'] ?? 0);
    $byClass[$clsId]['collected'] += (float)($inv['paid_amount'] ?? 0);
    $byClass[$clsId]['students'][$stuId] = true;
}
// Sort classes by billed desc
uasort($byClass, fn($a, $b) => $b['billed'] <=> $a['billed']);

// ── 6) Payment methods (all completed payments, summed by method) ─
$payMethodTotals = [];
$allPays = Supabase::fetchAllPaged(function ($_sb) use ($sid) {
    return $_sb->from('payments')
        ->select('amount,method')
        ->eq('school_id', $sid)
        ->eq('status', 'completed');
});
foreach ($allPays as $p) {
    $m = $p['method'] ?: 'other';
    $payMethodTotals[$m] = ($payMethodTotals[$m] ?? 0) + (float)($p['amount'] ?? 0);
}
arsort($payMethodTotals);
$totalReceived = array_sum($payMethodTotals);

// ── Donut helpers + chart segments ───────────────────────────────
$donutCss = function (array $segs): string {
    $total = 0.0;
    foreach ($segs as $s) $total += $s['value'];
    if ($total <= 0) return '#e5e7eb';
    $stops = []; $acc = 0.0;
    foreach ($segs as $s) {
        if ($s['value'] <= 0) continue;
        $start = $acc / $total * 100; $acc += $s['value']; $end = $acc / $total * 100;
        $stops[] = sprintf('%s %.2f%% %.2f%%', $s['color'], $start, $end);
    }
    return 'conic-gradient(' . implode(',', $stops) . ')';
};
$shortMoney = function (float $n): string {
    if ($n >= 1000000) return rtrim(rtrim(number_format($n / 1000000, 1), '0'), '.') . 'M';
    if ($n >= 1000)    return (string) round($n / 1000) . 'K';
    return (string) round($n);
};
$cur = schoolSetting('currency_symbol', 'KES');

// Invoice-status donut
$statusDonutMeta = [
    'paid'    => ['label' => 'Fully paid',  'color' => '#10b981'],
    'partial' => ['label' => 'Partly paid', 'color' => '#f59e0b'],
    'unpaid'  => ['label' => 'Unpaid',      'color' => '#94a3b8'],
    'overdue' => ['label' => 'Overdue',     'color' => '#ef4444'],
    'draft'   => ['label' => 'Draft',       'color' => '#3b82f6'],
];
$statusSegs = [];
foreach ($statusDonutMeta as $sk => $sm) {
    $statusSegs[] = ['key' => $sk, 'label' => $sm['label'], 'value' => $statusCounts[$sk] ?? 0, 'color' => $sm['color']];
}
$totalInvoices = array_sum($statusCounts);

// Payment-methods donut
$methodLabelMap = [
    'cash' => 'Cash', 'bank_transfer' => 'Bank transfer', 'mpesa' => 'M-Pesa',
    'cheque' => 'Cheque', 'mobile_money' => 'Mobile money', 'card' => 'Card',
    'credit_balance' => 'Student credit', 'other' => 'Other',
];
$methodColorMap = [
    'mpesa' => '#10b981', 'cash' => '#f59e0b', 'bank_transfer' => '#3b82f6',
    'cheque' => '#8b5cf6', 'card' => '#6366f1', 'mobile_money' => '#14b8a6',
    'credit_balance' => '#ec4899', 'other' => '#94a3b8',
];
$methodSegs = [];
foreach ($payMethodTotals as $mk => $mAmt) {
    $methodSegs[] = [
        'label' => $methodLabelMap[$mk] ?? ucfirst((string)$mk),
        'value' => $mAmt,
        'color' => $methodColorMap[$mk] ?? '#94a3b8',
    ];
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<!-- Header -->
<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Fees Dashboard</h1>
        <p class="text-sm text-gray-500 mt-1">
            <?php if ($currentTerm): ?>
                <?= e($currentTerm['name']) ?>
                <?php if ($currentYear): ?>
                    <span class="text-gray-300 mx-1.5">·</span><?= e($currentYear['name']) ?>
                <?php endif; ?>
            <?php else: ?>
                No active term — showing all invoices.
            <?php endif; ?>
        </p>
    </div>
    <div class="flex flex-wrap gap-2">
        <a href="<?= baseUrl('fees/invoices/generate') ?>" class="px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">+ Generate Invoices</a>
        <a href="<?= baseUrl('fees/payments') ?>" class="px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">+ Record Payment</a>
        <a href="<?= baseUrl('fees/invoices') ?>?status=overdue" class="px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition">View Overdue</a>
        <a href="<?= baseUrl('fees/report') ?>" class="px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Full Report</a>
    </div>
</div>

<!-- Hero metric cards -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
    <!-- Billed -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3.5">
            <div class="w-11 h-11 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xs text-gray-500 leading-tight">Total Billed</p>
                <p class="text-xl font-bold text-gray-900 leading-tight truncate"><?= money($totalBilled) ?></p>
                <p class="text-[11px] text-gray-400 mt-0.5"><?= count($invoices) - $draftCount ?> issued invoice<?= (count($invoices) - $draftCount) !== 1 ? 's' : '' ?></p>
            </div>
        </div>
    </div>

    <!-- Collected -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3.5">
            <div class="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xs text-gray-500 leading-tight">Total Collected</p>
                <p class="text-xl font-bold text-gray-900 leading-tight truncate"><?= money($totalCollected) ?></p>
                <p class="text-[11px] text-gray-400 mt-0.5"><?= number_format($collectionPct, 1) ?>% collection rate</p>
            </div>
        </div>
    </div>

    <!-- Outstanding -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3.5">
            <div class="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xs text-gray-500 leading-tight">Outstanding</p>
                <p class="text-xl font-bold text-gray-900 leading-tight truncate"><?= money($totalOutstanding) ?></p>
                <p class="text-[11px] text-gray-400 mt-0.5"><?= count($studentOutstanding) ?> student<?= count($studentOutstanding) !== 1 ? 's' : '' ?> owe</p>
            </div>
        </div>
    </div>

    <!-- Overdue — only red if there are any -->
    <div class="bg-white rounded-xl border <?= $overdueCount > 0 ? 'border-red-200' : 'border-gray-100' ?> p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3.5">
            <div class="w-11 h-11 rounded-xl <?= $overdueCount > 0 ? 'bg-red-500' : 'bg-gray-400' ?> flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M12 19a7 7 0 100-14 7 7 0 000 14z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xs text-gray-500 leading-tight">Overdue</p>
                <p class="text-xl font-bold text-gray-900 leading-tight truncate"><?= $overdueCount ?></p>
                <p class="text-[11px] text-gray-400 mt-0.5"><?= money($overdueAmount) ?> past due</p>
            </div>
        </div>
    </div>
</div>

<!-- Two-column: Top defaulters + Recent payments -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
    <!-- Top defaulters -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
                <h2 class="text-base font-semibold text-gray-900">Top Outstanding</h2>
                <p class="text-xs text-gray-500 mt-0.5">Students with the highest unpaid balance.</p>
            </div>
            <a href="<?= baseUrl('fees/invoices') ?>?status=unpaid" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium">See all →</a>
        </div>
        <?php if (empty($topDefaulters)): ?>
            <div class="px-5 py-10 text-center text-gray-400 text-sm">Nobody owes anything right now. Nice.</div>
        <?php else: ?>
            <div class="divide-y divide-gray-50">
                <?php foreach ($topDefaulters as $d): ?>
                    <a href="<?= baseUrl('students/view') ?>?id=<?= e($d['id']) ?>" class="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition">
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-gray-900 truncate"><?= e(($d['first_name'] ?? '') . ' ' . ($d['last_name'] ?? '')) ?></p>
                            <p class="text-[11px] text-gray-500 mt-0.5">
                                <?= e($classMap[$d['current_class_id']] ?? '—') ?>
                                <?php if (!empty($d['admission_number'])): ?>
                                    <span class="text-gray-300 mx-1">·</span><?= e($d['admission_number']) ?>
                                <?php endif; ?>
                                <?php if (!empty($d['guardian_phone'])): ?>
                                    <span class="text-gray-300 mx-1">·</span><span class="text-gray-400"><?= e($d['guardian_phone']) ?></span>
                                <?php endif; ?>
                            </p>
                        </div>
                        <div class="text-right ml-3 flex-shrink-0">
                            <p class="text-sm font-semibold text-amber-700"><?= money($d['outstanding']) ?></p>
                            <p class="text-[10px] text-gray-400">outstanding</p>
                        </div>
                    </a>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>

    <!-- Recent payments -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
                <h2 class="text-base font-semibold text-gray-900">Recent Payments</h2>
                <p class="text-xs text-gray-500 mt-0.5">Last 10 completed payments — quick way to verify the bank/M-Pesa.</p>
            </div>
            <a href="<?= baseUrl('fees/payments') ?>" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium">See all →</a>
        </div>
        <?php if (empty($recentPayments)): ?>
            <div class="px-5 py-10 text-center text-gray-400 text-sm">No payments yet.</div>
        <?php else: ?>
            <div class="divide-y divide-gray-50">
                <?php
                $methodLabels = methodLabelMap();
                $methodColors = [
                    'cash'           => 'bg-emerald-50 text-emerald-700',
                    'bank_transfer'  => 'bg-blue-50 text-blue-700',
                    'mpesa'          => 'bg-green-50 text-green-700',
                    'mobile_money'   => 'bg-teal-50 text-teal-700',
                    'cheque'         => 'bg-purple-50 text-purple-700',
                    'card'           => 'bg-indigo-50 text-indigo-700',
                    'credit_balance' => 'bg-amber-50 text-amber-700',
                    'other'          => 'bg-gray-100 text-gray-600',
                ];
                ?>
                <?php foreach ($recentPayments as $p):
                    $inv  = $recentInvMap[$p['invoice_id']] ?? null;
                    $stu  = $inv ? ($recentStuMap[$inv['student_id']] ?? null) : null;
                    $mth  = $p['method'] ?? 'other';
                ?>
                    <a href="<?= baseUrl('fees/receipt') ?>?id=<?= e($p['id']) ?>" target="_blank" rel="noopener" class="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition">
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-gray-900 truncate">
                                <?= $stu ? e(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? '')) : '<span class="text-gray-400">Unknown student</span>' ?>
                            </p>
                            <p class="text-[11px] text-gray-500 mt-0.5">
                                <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium <?= $methodColors[$mth] ?? 'bg-gray-100 text-gray-600' ?>">
                                    <?= $methodLabels[$mth] ?? ucfirst($mth) ?>
                                </span>
                                <?php if (!empty($p['reference'])): ?>
                                    <span class="text-gray-300 mx-1">·</span><span class="text-gray-400 font-mono text-[10px]"><?= e($p['reference']) ?></span>
                                <?php endif; ?>
                                <span class="text-gray-300 mx-1">·</span><?= formatDate($p['created_at']) ?>
                            </p>
                        </div>
                        <div class="text-right ml-3 flex-shrink-0">
                            <p class="text-sm font-semibold text-emerald-700"><?= money((float)$p['amount']) ?></p>
                        </div>
                    </a>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>
</div>

<!-- Collection by class -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
    <div class="px-5 py-4 border-b border-gray-100">
        <h2 class="text-base font-semibold text-gray-900">Collection by Class</h2>
        <p class="text-xs text-gray-500 mt-0.5">Shows where collection is lagging. Click a row to see the class's full fee report.</p>
    </div>
    <?php if (empty($byClass)): ?>
        <div class="px-5 py-10 text-center text-gray-400 text-sm">No invoices to break down yet.</div>
    <?php else: ?>
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-5 py-3 font-semibold text-gray-600">Class</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Students</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Billed</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Collected</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Outstanding</th>
                    <th class="text-left px-5 py-3 font-semibold text-gray-600 w-1/3">Collection</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($byClass as $cid => $row):
                    $pct  = $row['billed'] > 0 ? ($row['collected'] / $row['billed']) * 100 : 0;
                    $out  = $row['billed'] - $row['collected'];
                    $cnt  = count($row['students']);
                    $color = $pct >= 90 ? 'bg-emerald-500' : ($pct >= 60 ? 'bg-amber-500' : 'bg-red-500');
                ?>
                    <tr class="hover:bg-gray-50/50 cursor-pointer" onclick="location.href='<?= baseUrl('fees/report') ?>?class_id=<?= e($cid) ?>'">
                        <td class="px-5 py-3 font-medium text-gray-900"><?= e($classMap[$cid] ?? 'Unknown') ?></td>
                        <td class="px-4 py-3 text-right text-gray-600"><?= number_format($cnt) ?></td>
                        <td class="px-4 py-3 text-right text-gray-700"><?= money($row['billed']) ?></td>
                        <td class="px-4 py-3 text-right font-medium text-emerald-700"><?= money($row['collected']) ?></td>
                        <td class="px-4 py-3 text-right font-medium <?= $out > 0 ? 'text-amber-700' : 'text-gray-400' ?>"><?= money($out) ?></td>
                        <td class="px-5 py-3">
                            <div class="flex items-center gap-2">
                                <div class="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                    <div class="h-full <?= $color ?>" style="width: <?= min(100, $pct) ?>%"></div>
                                </div>
                                <span class="text-xs text-gray-600 w-12 text-right"><?= number_format($pct, 0) ?>%</span>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<!-- Invoice status + payment methods -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

    <!-- Invoice status -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="mb-4">
            <h2 class="text-base font-semibold text-gray-900">Invoice Status</h2>
            <p class="text-xs text-gray-500 mt-0.5"><?= number_format($totalInvoices) ?> invoice<?= $totalInvoices !== 1 ? 's' : '' ?> this term</p>
        </div>
        <?php if ($totalInvoices <= 0): ?>
            <div class="py-10 text-center text-gray-400 text-sm">No invoices generated yet.</div>
        <?php else: ?>
        <div class="flex items-center gap-6">
            <div class="relative w-[136px] h-[136px] rounded-full shrink-0" style="background:<?= $donutCss($statusSegs) ?>">
                <div class="absolute inset-0 m-[23px] rounded-full bg-white flex flex-col items-center justify-center">
                    <div class="text-xl font-bold text-gray-900 leading-none"><?= number_format($totalInvoices) ?></div>
                    <div class="text-[10px] text-gray-400 mt-0.5">invoices</div>
                </div>
            </div>
            <div class="flex-1 min-w-0 space-y-1.5">
                <?php foreach ($statusSegs as $seg): ?>
                <a href="<?= baseUrl('fees/invoices') ?>?status=<?= e($seg['key']) ?>" class="flex items-center gap-2.5 text-xs px-2 -mx-2 py-1 rounded-md hover:bg-gray-50 transition">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:<?= $seg['color'] ?>"></span>
                    <span class="text-gray-500 flex-1 min-w-0 truncate"><?= e($seg['label']) ?></span>
                    <span class="font-semibold text-gray-900"><?= number_format($seg['value']) ?></span>
                </a>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
    </div>

    <!-- Payment methods -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="mb-4">
            <h2 class="text-base font-semibold text-gray-900">Payment Methods</h2>
            <p class="text-xs text-gray-500 mt-0.5">How parents are paying</p>
        </div>
        <?php if ($totalReceived <= 0): ?>
            <div class="py-10 text-center text-gray-400 text-sm">No payments recorded yet.</div>
        <?php else: ?>
        <div class="flex items-center gap-6">
            <div class="relative w-[136px] h-[136px] rounded-full shrink-0" style="background:<?= $donutCss($methodSegs) ?>">
                <div class="absolute inset-0 m-[23px] rounded-full bg-white flex flex-col items-center justify-center">
                    <div class="text-lg font-bold text-gray-900 leading-none"><?= e($shortMoney($totalReceived)) ?></div>
                    <div class="text-[10px] text-gray-400 mt-0.5">received</div>
                </div>
            </div>
            <div class="flex-1 min-w-0 space-y-1.5">
                <?php foreach ($methodSegs as $seg): ?>
                <div class="flex items-center gap-2.5 text-xs py-1">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:<?= $seg['color'] ?>"></span>
                    <span class="text-gray-500 flex-1 min-w-0 truncate"><?= e($seg['label']) ?></span>
                    <span class="font-semibold text-gray-900"><?= e($cur) ?> <?= e($shortMoney($seg['value'])) ?></span>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
