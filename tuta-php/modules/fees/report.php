<?php
/**
 * Fee Report — per-student summary with payment method breakdown.
 *
 * Filters: class, term, status, payment method.
 * Stat cards: total billed, total collected, balance, plus per-method breakdown.
 * Table: per-student summary (name, class, total billed, total paid, balance).
 */
$pageTitle = 'Fee Report';
$sb  = new Supabase();
$sid = schoolId();

$classes     = cachedClasses();
$classMap    = cachedClassMap();
$currentTerm = cachedCurrentTerm();
$currentYear = cachedCurrentYear();

// ── Filters ──
$filterClass  = input('class_id');
$filterTerm   = input('term_id') ?: ($currentTerm['id'] ?? '');
$filterStatus = input('status');
$isExport     = input('export') === 'csv';

// View mode: 'student' (per-student detail, the original) or 'summary'
// (school-wide term-by-term + annual financial summary). Year filter drives
// the summary; defaults to the current academic year.
$view       = (input('view') === 'summary') ? 'summary' : 'student';
$filterYear = input('year_id') ?: ($currentYear['id'] ?? '');
$years      = cachedYears();
$isPrint    = input('print') === '1';

// Special pseudo-status "has_credit" filters students with credit_balance > 0
// AFTER aggregation (not at the invoice query level — credit lives on students,
// not invoices). Handled below near the table build.
$filterHasCredit = ($filterStatus === 'has_credit');

// Load terms for the filter dropdown
$termsResult = $sb->from('terms')->select('id,name,academic_year_id')
    ->eq('school_id', $sid)->order('start_date', 'desc')->execute();
$terms = $termsResult['data'] ?? [];

// ── Resolve class filter to student IDs (so we can scope the invoice query at DB level) ──
$classStudentIds = null;
if ($filterClass) {
    $classStudents = $sb->from('students')->select('id')
        ->eq('school_id', $sid)->eq('current_class_id', $filterClass)->execute();
    $classStudentIds = array_column($classStudents['data'] ?? [], 'id');
    if (empty($classStudentIds)) $classStudentIds = ['__none__']; // forces 0 results
}

// ── Invoice fetch: walk all pages so the report is correct above 1000 invoices.
//    fetchAllPaged caps at 20,000 rows by default — fine for any single school's
//    term-filtered report. CSV export benefits from this too (uses same $invoices).
$invoiceQueryBuilder = function (Supabase $sb) use ($sid, $filterTerm, $classStudentIds, $filterStatus) {
    $q = $sb->from('invoices')
        ->select('id,student_id,amount,paid_amount,status,fee_group_id,term_id,created_at')
        ->eq('school_id', $sid)
        ->order('created_at', false);
    if ($filterTerm)      $q = $q->eq('term_id', $filterTerm);
    if ($classStudentIds) $q = $q->in('student_id', $classStudentIds);
    // "has_credit" is a post-aggregation filter, not an invoice status.
    if ($filterStatus && $filterStatus !== 'all' && $filterStatus !== 'has_credit') {
        $q = $q->eq('status', $filterStatus);
    }
    return $q;
};
$invoices = Supabase::fetchAllPaged($invoiceQueryBuilder);

// ── Aggregate per student ──
$studentSummary = []; // student_id => [total_billed, total_paid, balance, count]
$invoiceIds = [];

foreach ($invoices as $inv) {
    $sid2 = $inv['student_id'];
    if (!isset($studentSummary[$sid2])) {
        $studentSummary[$sid2] = ['billed' => 0, 'paid' => 0, 'count' => 0];
    }
    $studentSummary[$sid2]['billed'] += (float)($inv['amount'] ?? 0);
    $studentSummary[$sid2]['paid']   += (float)($inv['paid_amount'] ?? 0);
    $studentSummary[$sid2]['count']++;
    $invoiceIds[] = $inv['id'];
}

// ── Get student details (now includes credit_balance) ──
// Students with credit but NO invoices in scope would be missed by the
// invoices-driven aggregation above. To surface them when the user filters
// "Has credit", we pull every student in scope (optionally class-filtered).
$studentDetails = [];

if ($filterHasCredit) {
    // Pull every student in the school (or in the selected class) so we can
    // include those with a credit balance even if they have zero invoices.
    $stuQuery = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,current_class_id,credit_balance')
        ->eq('school_id', $sid);
    if ($filterClass) $stuQuery = $stuQuery->eq('current_class_id', $filterClass);
    $stuQuery = $stuQuery->gt('credit_balance', '0');
    foreach (($stuQuery->execute()['data'] ?? []) as $s) {
        $studentDetails[$s['id']] = $s;
        // Seed any missing summary rows with zeros so the table includes them.
        if (!isset($studentSummary[$s['id']])) {
            $studentSummary[$s['id']] = ['billed' => 0, 'paid' => 0, 'count' => 0];
        }
    }
}

$allStudentIds = array_keys($studentSummary);
if (!empty($allStudentIds)) {
    // Use chunked-in: at >1000 students in summary, raw ->in() would silently
    // drop rows past 1000 (and the new ->in() guardrail would throw).
    $stuRows = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('students')
            ->select('id,first_name,last_name,admission_number,current_class_id,credit_balance'),
        'id',
        $allStudentIds
    );
    foreach ($stuRows as $s) {
        $studentDetails[$s['id']] = $s;
    }
}

// After enriching with credit, apply "has_credit" filter to drop students
// who have zero credit (in case the broader query pulled them in).
if ($filterHasCredit) {
    foreach (array_keys($studentSummary) as $stuId) {
        $cb = (float)($studentDetails[$stuId]['credit_balance'] ?? 0);
        if ($cb <= 0) {
            unset($studentSummary[$stuId]);
        }
    }
}

// ── Payment method breakdown — chunked so it doesn't truncate at 1000 invoices ──
$methodTotals = [];
if (!empty($invoiceIds)) {
    $payRows = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('payments')
            ->select('id,invoice_id,amount,method')
            ->eq('status', 'completed'),
        'invoice_id',
        $invoiceIds
    );
    foreach ($payRows as $pay) {
        $method = $pay['method'] ?? 'other';
        $methodTotals[$method] = ($methodTotals[$method] ?? 0) + (float)$pay['amount'];
    }
}

// ── Grand totals ──
$grandBilled  = 0;
$grandPaid    = 0;
$grandCredit  = 0;
foreach ($studentSummary as $stuId => $ss) {
    $grandBilled += $ss['billed'];
    $grandPaid   += $ss['paid'];
    $grandCredit += (float)($studentDetails[$stuId]['credit_balance'] ?? 0);
}
$grandBalance = $grandBilled - $grandPaid;

$methodLabels = methodLabelMap();

$methodIcons = [
    'cash'           => '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>',
    'bank_transfer'  => '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>',
    'mpesa'          => '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>',
    'cheque'         => '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    'mobile_money'   => '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>',
    'card'           => '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>',
    'credit_balance' => '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    'other'          => '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
];

$methodColors = [
    'cash'           => ['bg' => 'bg-green-50',  'icon' => 'bg-green-100 text-green-600',  'text' => 'text-green-700'],
    'bank_transfer'  => ['bg' => 'bg-blue-50',   'icon' => 'bg-blue-100 text-blue-600',    'text' => 'text-blue-700'],
    'mpesa'          => ['bg' => 'bg-emerald-50', 'icon' => 'bg-emerald-100 text-emerald-600', 'text' => 'text-emerald-700'],
    'cheque'         => ['bg' => 'bg-amber-50',   'icon' => 'bg-amber-100 text-amber-600',  'text' => 'text-amber-700'],
    'mobile_money'   => ['bg' => 'bg-teal-50',    'icon' => 'bg-teal-100 text-teal-600',    'text' => 'text-teal-700'],
    'card'           => ['bg' => 'bg-purple-50',  'icon' => 'bg-purple-100 text-purple-600','text' => 'text-purple-700'],
    'credit_balance' => ['bg' => 'bg-cyan-50',    'icon' => 'bg-cyan-100 text-cyan-600',    'text' => 'text-cyan-700'],
    'other'          => ['bg' => 'bg-gray-50',    'icon' => 'bg-gray-100 text-gray-600',    'text' => 'text-gray-700'],
];

// Find term name for display
$filterTermName = '';
foreach ($terms as $t) {
    if ($t['id'] === $filterTerm) { $filterTermName = $t['name']; break; }
}

// ── School summary (term-by-term + annual) ───────────────────────
// Built only for the summary view. Scopes invoices to the selected academic
// year, groups by term and by class. Draft/cancelled invoices are excluded so
// figures match the rest of Finance.
$summaryTerms = array_values(array_filter($terms,
    fn($t) => !$filterYear || ($t['academic_year_id'] ?? null) === $filterYear));
usort($summaryTerms, fn($a, $b) => strcmp($a['start_date'] ?? '', $b['start_date'] ?? ''));

$perTerm  = []; // term_id  => ['billed'=>, 'collected'=>]
$perClass = []; // class_id => ['billed'=>, 'collected'=>]

if ($view === 'summary') {
    $sumInvoices = Supabase::fetchAllPaged(function (Supabase $sb) use ($sid, $filterYear) {
        $q = $sb->from('invoices')
            ->select('student_id,amount,paid_amount,status,term_id,academic_year_id')
            ->eq('school_id', $sid);
        if ($filterYear) $q = $q->eq('academic_year_id', $filterYear);
        return $q;
    });

    $sumStudentIds = [];
    foreach ($sumInvoices as $inv) {
        $st = $inv['status'] ?? '';
        if ($st === 'draft' || $st === 'cancelled') continue;
        $tid = $inv['term_id'] ?? '_none';
        if (!isset($perTerm[$tid])) $perTerm[$tid] = ['billed' => 0, 'collected' => 0];
        $perTerm[$tid]['billed']    += (float)($inv['amount'] ?? 0);
        $perTerm[$tid]['collected'] += (float)($inv['paid_amount'] ?? 0);
        if (!empty($inv['student_id'])) $sumStudentIds[$inv['student_id']] = true;
    }

    // Class breakdown — resolve each student's current class.
    if (!empty($sumStudentIds)) {
        $stuRows = Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('students')->select('id,current_class_id'),
            'id', array_keys($sumStudentIds)
        );
        $stuClass = [];
        foreach ($stuRows as $s) $stuClass[$s['id']] = $s['current_class_id'] ?? '_none';
        foreach ($sumInvoices as $inv) {
            $st = $inv['status'] ?? '';
            if ($st === 'draft' || $st === 'cancelled') continue;
            $cid = $stuClass[$inv['student_id'] ?? ''] ?? '_none';
            if (!isset($perClass[$cid])) $perClass[$cid] = ['billed' => 0, 'collected' => 0];
            $perClass[$cid]['billed']    += (float)($inv['amount'] ?? 0);
            $perClass[$cid]['collected'] += (float)($inv['paid_amount'] ?? 0);
        }
    }
}

$sumAnnualBilled      = array_sum(array_column($perTerm, 'billed'));
$sumAnnualCollected   = array_sum(array_column($perTerm, 'collected'));
$sumAnnualOutstanding = $sumAnnualBilled - $sumAnnualCollected;

$yearName = '';
foreach ($years as $y) { if (($y['id'] ?? '') === $filterYear) { $yearName = $y['name']; break; } }

// ── CSV export: school summary ───────────────────────────────────
if ($isExport && $view === 'summary') {
    $safe = fn($s) => preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string)$s, ' -'));
    $filename = 'fee_summary_' . $safe($yearName ?: 'year') . '_' . date('Y-m-d') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");

    fputcsv($out, ['Fee Summary']);
    fputcsv($out, ['Generated', date('Y-m-d H:i')]);
    fputcsv($out, ['Academic year', $yearName ?: 'All']);
    fputcsv($out, []);
    fputcsv($out, ['Term-by-Term']);
    fputcsv($out, ['Term', 'Billed', 'Collected', 'Outstanding', 'Collection %']);
    foreach ($summaryTerms as $t) {
        $pt  = $perTerm[$t['id']] ?? ['billed' => 0, 'collected' => 0];
        $out2 = $pt['billed'] - $pt['collected'];
        $pct  = $pt['billed'] > 0 ? round($pt['collected'] / $pt['billed'] * 100, 1) : 0;
        fputcsv($out, [$t['name'],
            number_format($pt['billed'], 2, '.', ''),
            number_format($pt['collected'], 2, '.', ''),
            number_format($out2, 2, '.', ''),
            $pct . '%']);
    }
    fputcsv($out, ['ANNUAL TOTAL',
        number_format($sumAnnualBilled, 2, '.', ''),
        number_format($sumAnnualCollected, 2, '.', ''),
        number_format($sumAnnualOutstanding, 2, '.', ''),
        ($sumAnnualBilled > 0 ? round($sumAnnualCollected / $sumAnnualBilled * 100, 1) : 0) . '%']);
    fputcsv($out, []);
    fputcsv($out, ['By Class (annual)']);
    fputcsv($out, ['Class', 'Billed', 'Collected', 'Outstanding']);
    foreach ($perClass as $cid => $pc) {
        $name = $cid === '_none' ? 'Unassigned' : ($classMap[$cid] ?? 'Unknown');
        fputcsv($out, [$name,
            number_format($pc['billed'], 2, '.', ''),
            number_format($pc['collected'], 2, '.', ''),
            number_format($pc['billed'] - $pc['collected'], 2, '.', '')]);
    }
    fclose($out);
    exit;
}

// ── CSV Export ───────────────────────────────────────────────────
// Must emit BEFORE require layout-top.php so no HTML leaks into the CSV.
// Mirrors what's on screen + adds the Credit column. No row limit on export
// (the on-screen table shows all matching students; CSV does the same).
if ($isExport && $view === 'student') {
    $classLabel = $filterClass ? ($classMap[$filterClass] ?? 'class') : 'all-classes';
    $termLabel  = $filterTermName ?: 'all-terms';
    $safe       = fn($s) => preg_replace('/[^A-Za-z0-9_-]+/', '-', trim($s, ' -'));
    $filename   = 'fee_report_' . $safe($termLabel) . '_' . $safe($classLabel)
                . '_' . date('Y-m-d') . '.csv';

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');

    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // BOM so Excel reads KES correctly

    // Header rows with filter context — useful when emailing to the bursar
    fputcsv($out, ['Fee Report']);
    fputcsv($out, ['Generated', date('Y-m-d H:i')]);
    fputcsv($out, ['Term',     $termLabel]);
    fputcsv($out, ['Class',    $classLabel]);
    fputcsv($out, ['Status',   $filterStatus ?: 'all']);
    fputcsv($out, []);
    fputcsv($out, ['#', 'Student', 'Adm No.', 'Class', 'Invoices',
                   'Total Billed', 'Total Paid', 'Balance', 'Credit on file']);

    $n = 0;
    foreach ($studentSummary as $stuId => $ss) {
        $n++;
        $stu     = $studentDetails[$stuId] ?? null;
        $balance = $ss['billed'] - $ss['paid'];
        $credit  = (float)($stu['credit_balance'] ?? 0);
        fputcsv($out, [
            $n,
            $stu ? trim(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? '')) : 'Unknown',
            $stu['admission_number'] ?? '',
            $classMap[$stu['current_class_id'] ?? ''] ?? '',
            $ss['count'],
            number_format($ss['billed'], 2, '.', ''),
            number_format($ss['paid'],   2, '.', ''),
            number_format($balance,      2, '.', ''),
            number_format($credit,       2, '.', ''),
        ]);
    }

    // Totals footer
    fputcsv($out, []);
    fputcsv($out, ['', '', '', '', 'TOTALS',
        number_format($grandBilled,  2, '.', ''),
        number_format($grandPaid,    2, '.', ''),
        number_format($grandBalance, 2, '.', ''),
        number_format($grandCredit,  2, '.', ''),
    ]);

    // Payment method breakdown — useful for monthly reconciliation
    if (!empty($methodTotals)) {
        fputcsv($out, []);
        fputcsv($out, ['Collection by Payment Method']);
        fputcsv($out, ['Method', 'Amount', 'Share of Collected']);
        foreach ($methodTotals as $method => $total) {
            $label = $methodLabels[$method] ?? ucfirst($method);
            $pct   = $grandPaid > 0 ? round(($total / $grandPaid) * 100, 1) : 0;
            fputcsv($out, [$label, number_format($total, 2, '.', ''), $pct . '%']);
        }
    }

    fclose($out);
    exit;
}

// ── Paginate the per-student summary for the on-screen table ──
// CSV export above pulls the FULL set; this only affects display.
$pageStudent    = currentPage();
$perPageStudent = 50;
$totalStudents  = count($studentSummary);
$pagedSummary   = array_slice($studentSummary, ($pageStudent - 1) * $perPageStudent, $perPageStudent, true);

require __DIR__ . '/../../includes/layout-top.php';
?>

<?php
// Export URL — same filters, with export=csv added
$exportUrl = baseUrl('fees/report') . '?export=csv&view=student'
           . '&class_id=' . urlencode($filterClass)
           . '&term_id='  . urlencode($filterTerm)
           . '&status='   . urlencode($filterStatus);
$summaryExportUrl = baseUrl('fees/report') . '?export=csv&view=summary&year_id=' . urlencode($filterYear);
?>
<style>
@media print {
    aside, #pjax-bar, .no-print { display: none !important; }
    main { margin-left: 0 !important; padding: 0 !important; }
    body { background: #fff !important; }
    .print-card { break-inside: avoid; }
}
</style>
<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Fee Report</h1>
        <p class="text-sm text-gray-500 mt-1"><?= $view === 'summary'
            ? 'School-wide collection — term by term and for the full year'
            : 'Per-student collection summary with payment method breakdown' ?></p>
    </div>
    <div class="flex items-center gap-2 no-print flex-wrap">
        <div class="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <a href="<?= baseUrl('fees/report') ?>?view=summary" class="px-3 py-2 <?= $view === 'summary' ? 'bg-emerald-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50' ?>">School Summary</a>
            <a href="<?= baseUrl('fees/report') ?>?view=student" class="px-3 py-2 <?= $view === 'student' ? 'bg-emerald-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50' ?>">Per-Student</a>
        </div>
        <?php if ($view === 'summary'): ?>
            <button type="button" onclick="window.print()" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition inline-flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                Print / Save as PDF
            </button>
            <a href="<?= e($summaryExportUrl) ?>" download class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Export Excel
            </a>
        <?php else: ?>
            <a href="<?= e($exportUrl) ?>" download class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-1.5" title="Download the visible report as a CSV (opens in Excel). Filters apply.">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Export Excel
            </a>
        <?php endif; ?>
    </div>
</div>

<?php if ($view === 'summary'): ?>
<!-- ══ SCHOOL SUMMARY VIEW ══════════════════════════════════════ -->
<!-- Print header (only visible on paper) -->
<div class="hidden print:block mb-4">
    <h2 class="text-xl font-bold"><?= e(cachedSchool()['name'] ?? 'School') ?> — Fee Summary</h2>
    <p class="text-sm text-gray-600"><?= e($yearName ?: 'All years') ?> · generated <?= date('j M Y') ?></p>
</div>

<!-- Year filter -->
<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6 no-print">
    <form method="GET" action="<?= baseUrl('fees/report') ?>" class="flex flex-wrap items-end gap-4">
        <input type="hidden" name="view" value="summary">
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
            <select name="year_id" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm min-w-[160px]">
                <?php foreach ($years as $y): ?>
                    <option value="<?= e($y['id']) ?>"<?= selectedIf($filterYear, $y['id']) ?>><?= e($y['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Apply</button>
    </form>
</div>

<!-- Annual headline cards -->
<?php $annPct = $sumAnnualBilled > 0 ? round($sumAnnualCollected / $sumAnnualBilled * 100, 1) : 0; ?>
<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] print-card">
        <p class="text-xs text-gray-500">Billed (year)</p>
        <p class="text-lg font-bold text-gray-900 mt-1"><?= money($sumAnnualBilled) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] print-card">
        <p class="text-xs text-gray-500">Collected (year)</p>
        <p class="text-lg font-bold text-emerald-700 mt-1"><?= money($sumAnnualCollected) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] print-card">
        <p class="text-xs text-gray-500">Outstanding (year)</p>
        <p class="text-lg font-bold text-red-600 mt-1"><?= money($sumAnnualOutstanding) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] print-card">
        <p class="text-xs text-gray-500">Collection rate</p>
        <p class="text-lg font-bold text-gray-900 mt-1"><?= $annPct ?>%</p>
    </div>
</div>

<!-- Term-by-term table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6 print-card">
    <div class="px-4 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Term by Term</h2></div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Term</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Billed</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Collected</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Outstanding</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Collection %</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($summaryTerms)): ?>
                    <tr><td colspan="5" class="px-4 py-10 text-center text-gray-400">No terms found for this year.</td></tr>
                <?php else: foreach ($summaryTerms as $t):
                    $pt   = $perTerm[$t['id']] ?? ['billed' => 0, 'collected' => 0];
                    $tOut = $pt['billed'] - $pt['collected'];
                    $tPct = $pt['billed'] > 0 ? round($pt['collected'] / $pt['billed'] * 100, 1) : 0;
                ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($t['name']) ?></td>
                        <td class="px-4 py-3 text-right text-gray-900"><?= money($pt['billed']) ?></td>
                        <td class="px-4 py-3 text-right text-emerald-700"><?= money($pt['collected']) ?></td>
                        <td class="px-4 py-3 text-right <?= $tOut > 0 ? 'text-red-600' : 'text-gray-500' ?>"><?= money($tOut) ?></td>
                        <td class="px-4 py-3 text-right text-gray-700"><?= $tPct ?>%</td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
            <?php if (!empty($summaryTerms)): ?>
            <tfoot>
                <tr class="bg-gray-50 border-t border-gray-200 font-bold">
                    <td class="px-4 py-3 text-gray-700">Annual Total</td>
                    <td class="px-4 py-3 text-right text-gray-900"><?= money($sumAnnualBilled) ?></td>
                    <td class="px-4 py-3 text-right text-emerald-700"><?= money($sumAnnualCollected) ?></td>
                    <td class="px-4 py-3 text-right <?= $sumAnnualOutstanding > 0 ? 'text-red-600' : 'text-gray-500' ?>"><?= money($sumAnnualOutstanding) ?></td>
                    <td class="px-4 py-3 text-right text-gray-700"><?= $annPct ?>%</td>
                </tr>
            </tfoot>
            <?php endif; ?>
        </table>
    </div>
</div>

<!-- By class table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden print-card">
    <div class="px-4 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">By Class (full year)</h2></div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Billed</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Collected</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Outstanding</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php
                if (empty($perClass)):
                    echo '<tr><td colspan="4" class="px-4 py-10 text-center text-gray-400">No billing found for this year.</td></tr>';
                else:
                    // Sort classes by name for a stable, readable order.
                    uksort($perClass, fn($a, $b) => strcmp(
                        $a === '_none' ? 'zzz' : ($classMap[$a] ?? 'zzz'),
                        $b === '_none' ? 'zzz' : ($classMap[$b] ?? 'zzz')
                    ));
                    foreach ($perClass as $cid => $pc):
                        $cName = $cid === '_none' ? 'Unassigned' : ($classMap[$cid] ?? 'Unknown');
                        $cOut  = $pc['billed'] - $pc['collected'];
                ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($cName) ?></td>
                        <td class="px-4 py-3 text-right text-gray-900"><?= money($pc['billed']) ?></td>
                        <td class="px-4 py-3 text-right text-emerald-700"><?= money($pc['collected']) ?></td>
                        <td class="px-4 py-3 text-right <?= $cOut > 0 ? 'text-red-600' : 'text-gray-500' ?>"><?= money($cOut) ?></td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
        </table>
    </div>
</div>

<?php else: ?>
<!-- ══ PER-STUDENT VIEW (original) ══════════════════════════════ -->

<!-- Filters -->
<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
    <form method="GET" action="<?= baseUrl('fees/report') ?>" class="flex flex-wrap items-end gap-4">
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select name="class_id" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm min-w-[160px]">
                <option value="">All Classes</option>
                <?php foreach ($classes as $c): ?>
                    <option value="<?= e($c['id']) ?>"<?= selectedIf($filterClass, $c['id']) ?>><?= e($c['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Term</label>
            <select name="term_id" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm min-w-[180px]">
                <option value="">All Terms</option>
                <?php foreach ($terms as $t): ?>
                    <option value="<?= e($t['id']) ?>"<?= selectedIf($filterTerm, $t['id']) ?>><?= e($t['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select name="status" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm min-w-[150px]">
                <option value="all"<?= selectedIf($filterStatus, 'all') ?>>All</option>
                <option value="paid"<?= selectedIf($filterStatus, 'paid') ?>>Paid</option>
                <option value="partial"<?= selectedIf($filterStatus, 'partial') ?>>Partial</option>
                <option value="unpaid"<?= selectedIf($filterStatus, 'unpaid') ?>>Unpaid</option>
                <option value="overdue"<?= selectedIf($filterStatus, 'overdue') ?>>Overdue</option>
                <option disabled>──────────</option>
                <option value="has_credit"<?= selectedIf($filterStatus, 'has_credit') ?>>Has credit on file</option>
            </select>
        </div>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
            Apply Filters
        </button>
        <a href="<?= baseUrl('fees/report') ?>" class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Reset</a>
    </form>
</div>

<!-- Summary Stat Cards -->
<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <!-- Total Billed -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-lg font-bold text-gray-900 truncate"><?= money($grandBilled) ?></p>
                <p class="text-xs text-gray-500">Total Billed</p>
            </div>
        </div>
    </div>
    <!-- Total Collected -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-lg font-bold text-emerald-700 truncate"><?= money($grandPaid) ?></p>
                <p class="text-xs text-gray-500">Total Collected</p>
            </div>
        </div>
    </div>
    <!-- Balance -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-lg font-bold text-red-600 truncate"><?= money($grandBalance) ?></p>
                <p class="text-xs text-gray-500">Outstanding Balance</p>
            </div>
        </div>
    </div>
    <!-- Credits on File (from overpayments — money the school owes back / can apply to future invoices) -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
         title="Total credit held for these students. Comes from overpayments — applies automatically to future invoices.">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center text-cyan-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-lg font-bold text-cyan-700 truncate"><?= money($grandCredit) ?></p>
                <p class="text-xs text-gray-500">Credits on File</p>
            </div>
        </div>
    </div>
</div>

<!-- Payment Method Breakdown Cards -->
<?php if (!empty($methodTotals)): ?>
<div class="mb-6">
    <h2 class="text-sm font-semibold text-gray-700 mb-3">Collection by Payment Method</h2>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <?php foreach ($methodTotals as $method => $total):
            $label  = $methodLabels[$method] ?? ucfirst($method);
            $colors = $methodColors[$method] ?? $methodColors['other'];
            $icon   = $methodIcons[$method] ?? $methodIcons['other'];
            $pct    = $grandPaid > 0 ? round(($total / $grandPaid) * 100, 1) : 0;
        ?>
        <div class="<?= $colors['bg'] ?> rounded-xl border border-gray-100 p-3">
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-lg <?= $colors['icon'] ?> flex items-center justify-center flex-shrink-0">
                    <?= $icon ?>
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-bold <?= $colors['text'] ?>"><?= money($total) ?></p>
                    <p class="text-xs text-gray-500 truncate"><?= e($label) ?> (<?= $pct ?>%)</p>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<!-- Per-Student Summary Table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-700">
            Student Summary
            <span class="text-gray-400 font-normal">
                (<?= number_format($totalStudents) ?> student<?= $totalStudents === 1 ? '' : 's' ?><?php
                if ($totalStudents > $perPageStudent):
                    $startN = ($pageStudent - 1) * $perPageStudent + 1;
                    $endN   = min($pageStudent * $perPageStudent, $totalStudents);
                    echo ' — showing ' . $startN . '–' . $endN;
                endif;
                ?>)
            </span>
        </h2>
        <?php if ($filterTermName): ?>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><?= e($filterTermName) ?></span>
        <?php endif; ?>
    </div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Adm No.</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                    <th class="text-center px-4 py-3 font-semibold text-gray-600">Invoices</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Total Billed</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Total Paid</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Balance</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600" title="Credit on file from overpayments — applies automatically to the next invoice.">Credit</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($studentSummary)): ?>
                    <tr><td colspan="9" class="px-4 py-12 text-center text-gray-400">
                        <?php if ($filterHasCredit): ?>
                            No students currently have credit on file.
                        <?php else: ?>
                            No invoices found matching the selected filters.
                        <?php endif; ?>
                    </td></tr>
                <?php else: ?>
                    <?php
                    // Continue numbering across pages (page 2 starts at 51, not 1)
                    $n = ($pageStudent - 1) * $perPageStudent;
                    foreach ($pagedSummary as $stuId => $ss):
                        $n++;
                        $stu     = $studentDetails[$stuId] ?? null;
                        $balance = $ss['billed'] - $ss['paid'];
                        $credit  = (float)($stu['credit_balance'] ?? 0);
                    ?>
                        <tr class="hover:bg-gray-50/50">
                            <td class="px-4 py-3 text-gray-400 text-xs"><?= $n ?></td>
                            <td class="px-4 py-3 font-medium text-gray-900">
                                <?php if ($stu): ?>
                                    <a href="<?= baseUrl('students/view?id=' . e($stuId)) ?>" class="hover:text-emerald-600 transition"><?= e($stu['first_name'] . ' ' . $stu['last_name']) ?></a>
                                <?php else: ?>
                                    <span class="text-gray-400">Unknown</span>
                                <?php endif; ?>
                            </td>
                            <td class="px-4 py-3 text-gray-500 text-xs"><?= e($stu['admission_number'] ?? '—') ?></td>
                            <td class="px-4 py-3 text-gray-600 text-xs"><?= e($classMap[$stu['current_class_id'] ?? ''] ?? '—') ?></td>
                            <td class="px-4 py-3 text-center">
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><?= $ss['count'] ?></span>
                            </td>
                            <td class="px-4 py-3 text-right font-medium text-gray-900"><?= money($ss['billed']) ?></td>
                            <td class="px-4 py-3 text-right font-medium text-emerald-700"><?= money($ss['paid']) ?></td>
                            <td class="px-4 py-3 text-right font-bold <?= $balance > 0 ? 'text-red-600' : 'text-emerald-600' ?>"><?= money($balance) ?></td>
                            <td class="px-4 py-3 text-right font-medium <?= $credit > 0 ? 'text-cyan-700' : 'text-gray-300' ?>">
                                <?= $credit > 0 ? money($credit) : '—' ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
            <?php if (!empty($studentSummary)): ?>
            <tfoot>
                <tr class="bg-gray-50 border-t border-gray-200">
                    <td colspan="5" class="px-4 py-3 font-bold text-gray-700">Totals</td>
                    <td class="px-4 py-3 text-right font-bold text-gray-900"><?= money($grandBilled) ?></td>
                    <td class="px-4 py-3 text-right font-bold text-emerald-700"><?= money($grandPaid) ?></td>
                    <td class="px-4 py-3 text-right font-bold <?= $grandBalance > 0 ? 'text-red-600' : 'text-emerald-600' ?>"><?= money($grandBalance) ?></td>
                    <td class="px-4 py-3 text-right font-bold <?= $grandCredit > 0 ? 'text-cyan-700' : 'text-gray-400' ?>"><?= $grandCredit > 0 ? money($grandCredit) : '—' ?></td>
                </tr>
            </tfoot>
            <?php endif; ?>
        </table>
    </div>
    <?php
    // Pagination — preserve filters in URL so prev/next stay scoped
    $pagBase = baseUrl('fees/report');
    $pagQs = [];
    if ($filterClass)  $pagQs[] = 'class_id=' . urlencode($filterClass);
    if ($filterTerm)   $pagQs[] = 'term_id='  . urlencode($filterTerm);
    if ($filterStatus) $pagQs[] = 'status='   . urlencode($filterStatus);
    if (!empty($pagQs)) $pagBase .= '?' . implode('&', $pagQs);
    echo paginationControls($pageStudent, $totalStudents, $perPageStudent, $pagBase);
    ?>
</div>

<?php endif; // end view branch ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
