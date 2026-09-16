<?php
/**
 * Collection Trend — billed vs collected by month, last 12 months.
 *
 *   Billed    = sum of invoice amounts created that month (non-draft/cancelled)
 *   Collected = sum of completed payments dated that month
 *
 * Read-only. CSV export. A quick way to spot slow collection months.
 */
$pageTitle = 'Collection Trend';
$sb  = new Supabase();
$sid = schoolId();
$isExport = input('export') === 'csv';

// ── Build the last 12 month buckets (YYYY-MM => label) ──
$months = []; // 'YYYY-MM' => ['label' => 'Jun 2026', 'billed' => 0, 'collected' => 0]
$cursor = new DateTimeImmutable('first day of this month');
for ($i = 11; $i >= 0; $i--) {
    $m = $cursor->sub(new DateInterval('P' . $i . 'M'));
    $months[$m->format('Y-m')] = ['label' => $m->format('M Y'), 'billed' => 0.0, 'collected' => 0.0];
}

// ── Billed by month (from invoices.created_at) ──
$invoices = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('invoices')->select('amount,status,created_at')->eq('school_id', $sid)
);
foreach ($invoices as $inv) {
    $st = $inv['status'] ?? '';
    if ($st === 'draft' || $st === 'cancelled') continue;
    $ym = substr((string)($inv['created_at'] ?? ''), 0, 7);
    if (isset($months[$ym])) $months[$ym]['billed'] += (float)($inv['amount'] ?? 0);
}

// ── Collected by month (from completed payments) ──
$payments = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('payments')->select('amount,status,payment_date,paid_at,created_at')
        ->eq('school_id', $sid)->eq('status', 'completed')
);
foreach ($payments as $p) {
    $dt = $p['payment_date'] ?: ($p['paid_at'] ?: ($p['created_at'] ?? ''));
    $ym = substr((string)$dt, 0, 7);
    if (isset($months[$ym])) $months[$ym]['collected'] += (float)($p['amount'] ?? 0);
}

$totalBilled    = array_sum(array_column($months, 'billed'));
$totalCollected = array_sum(array_column($months, 'collected'));
$peak = 0.0;
foreach ($months as $m) $peak = max($peak, $m['billed'], $m['collected']);

// ── CSV export ──
if ($isExport) {
    $filename = 'collection_trend_' . date('Y-m-d') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['Collection Trend — last 12 months']);
    fputcsv($out, ['Generated', date('Y-m-d H:i')]);
    fputcsv($out, []);
    fputcsv($out, ['Month', 'Billed', 'Collected', 'Collection %']);
    foreach ($months as $m) {
        $pct = $m['billed'] > 0 ? round($m['collected'] / $m['billed'] * 100, 1) : 0;
        fputcsv($out, [
            $m['label'],
            number_format($m['billed'], 2, '.', ''),
            number_format($m['collected'], 2, '.', ''),
            $pct . '%',
        ]);
    }
    fputcsv($out, ['TOTAL',
        number_format($totalBilled, 2, '.', ''),
        number_format($totalCollected, 2, '.', ''),
        $totalBilled > 0 ? round($totalCollected / $totalBilled * 100, 1) . '%' : '0%',
    ]);
    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Collection Trend</h1>
        <p class="text-sm text-gray-500 mt-1">Billed vs collected, last 12 months.</p>
    </div>
    <a href="<?= baseUrl('fees/trend') ?>?export=csv" download
       class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        Export CSV
    </a>
</div>

<!-- Totals -->
<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Billed (12 mo)</p>
        <p class="text-xl font-bold text-gray-900"><?= money($totalBilled) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Collected (12 mo)</p>
        <p class="text-xl font-bold text-emerald-700"><?= money($totalCollected) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Collection rate</p>
        <p class="text-xl font-bold text-gray-900"><?= $totalBilled > 0 ? number_format($totalCollected / $totalBilled * 100, 1) : '0' ?>%</p>
    </div>
</div>

<!-- Bars -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
    <div class="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-gray-300"></span> Billed</span>
        <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-emerald-500"></span> Collected</span>
    </div>
    <div class="space-y-3">
        <?php foreach ($months as $m):
            $billedW    = $peak > 0 ? ($m['billed'] / $peak) * 100 : 0;
            $collectedW = $peak > 0 ? ($m['collected'] / $peak) * 100 : 0;
            $pct = $m['billed'] > 0 ? ($m['collected'] / $m['billed']) * 100 : 0;
        ?>
            <div class="flex items-center gap-3">
                <div class="w-16 text-xs text-gray-500 flex-shrink-0"><?= e($m['label']) ?></div>
                <div class="flex-1 min-w-0 space-y-1">
                    <div class="h-3 rounded-full bg-gray-100 overflow-hidden">
                        <div class="h-full bg-gray-300" style="width: <?= $billedW ?>%"></div>
                    </div>
                    <div class="h-3 rounded-full bg-gray-100 overflow-hidden">
                        <div class="h-full bg-emerald-500" style="width: <?= $collectedW ?>%"></div>
                    </div>
                </div>
                <div class="w-44 text-right flex-shrink-0">
                    <span class="text-xs text-gray-500"><?= money($m['billed']) ?></span>
                    <span class="text-gray-300 mx-1">·</span>
                    <span class="text-xs font-semibold text-emerald-700"><?= money($m['collected']) ?></span>
                    <span class="text-[11px] text-gray-400 ml-1">(<?= number_format($pct, 0) ?>%)</span>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
