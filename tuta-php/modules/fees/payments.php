<?php
/**
 * Payments — record and view payments against invoices.
 * Uses correct tables: invoices (not fee_invoices), payments (not fee_payments).
 * Payment columns: method (not payment_method), transaction_ref (not reference), status, paid_at, payment_date.
 */
$pageTitle = 'Payments';
$sb  = new Supabase();
$sid = schoolId();

// Handle payment recording — atomic via record_payment RPC (migration 058).
// All race-condition handling, dup-ref checks, status transitions, audit
// logging, and overpayment-to-credit logic live in the database function.
if (isPost() && verifyCsrf()) {
    $postAction = input('action') ?: 'record';

    if ($postAction === 'void_payment') {
        $paymentId = input('payment_id');
        $reason    = trim((string)input('void_reason'));
        if (!$paymentId || $reason === '') {
            flash('error', 'Payment and void reason are required.');
            redirect('fees/payments');
        }

        $payRow = $sb->from('payments')->select('id,invoice_id,amount,status,payment_date,paid_at,created_at,receipt_number')
            ->eq('id', $paymentId)->eq('school_id', $sid)->single()->execute()['data'][0] ?? null;
        if (!$payRow) {
            flash('error', 'Payment not found.');
            redirect('fees/payments');
        }

        $sameDayOnly = schoolSetting('payment_void_same_day_only', 'false') === 'true';
        if ($sameDayOnly && !paymentIsVoidableSameDay($payRow)) {
            flash('error', 'This school only allows same-day voids. Turn that off in Settings to void older payments.');
            redirect('fees/payments');
        }

        if (approvalRequired('require_approval_void_payment', 'true')) {
            $u = currentUser();
            $sb->from('approval_requests')->insert([
                'school_id'       => $sid,
                'action_type'     => 'void_payment',
                'target_type'     => 'payment',
                'target_id'       => $paymentId,
                'payload'         => json_encode([
                    'reason' => $reason,
                    'amount' => $payRow['amount'] ?? 0,
                    'receipt_number' => $payRow['receipt_number'] ?? null,
                    'same_day_only' => $sameDayOnly,
                ]),
                'status'          => 'pending',
                'requested_by'    => $u['email'] ?? null,
                'requested_by_id' => $u['id'] ?? null,
            ]);
            auditLog('approval_requested', 'payment', $paymentId, ['action' => 'void_payment', 'reason' => $reason]);
            flash('success', 'Void sent for approval — a school administrator must approve it.');
            redirect('fees/payments');
        }

        $result = voidInvoicePayment($paymentId, $reason, $sameDayOnly);
        if (!$result['success']) {
            flash('error', $result['error']);
            redirect('fees/payments');
        }
        $msg = 'Payment voided.';
        if (!empty($result['invoice_id'])) {
            flashLink('success', $msg . ' You can record the correct amount on the invoice.',
                baseUrl('fees/invoices'),
                'Go to invoices');
        } else {
            flash('success', $msg);
        }
        redirect('fees/payments');
    }

    $invoiceId = input('invoice_id');
    $amount    = (float)input('amount');
    $method    = input('method') ?: 'cash';
    $transRef  = trim(input('transaction_ref'));
    $date      = input('payment_date') ?: date('Y-m-d');

    if (!$invoiceId || $amount <= 0) {
        flash('error', 'Please select an invoice and enter a valid amount.');
        redirect('fees/payments');
    }
    if ($transRef === '') {
        flash('error', 'A reference or receipt number is required for every payment.');
        redirect('fees/payments');
    }

    $result = recordInvoicePayment($invoiceId, $amount, $method, $transRef, $date);

    if (!$result['success']) {
        flash('error', $result['error']);
        redirect('fees/payments');
    }

    $msg = 'Payment of ' . money($amount) . ' recorded.';
    if ($result['invoice_status'] === 'paid') {
        $msg .= ' Invoice now fully paid.';
    } elseif (!empty($result['balance'])) {
        $msg .= ' Remaining balance: ' . money((float)$result['balance']) . '.';
    }
    if ($result['overpayment'] > 0) {
        $msg .= ' Overpayment of ' . money($result['overpayment'])
              . ' added to the student\'s credit balance — applies to future invoices.';
    }
    if (!empty($result['payment_id'])) {
        flashLink('success', $msg,
            baseUrl('fees/receipt?id=' . $result['payment_id']),
            'View Receipt');
    } else {
        flash('success', $msg);
    }
    redirect('fees/payments');
}

// ── Filters (apply to the on-screen list AND to the CSV export) ──
// Defaults: current month. Empty values = "no filter" except dates.
$today        = date('Y-m-d');
$firstOfMonth = date('Y-m-01');
$startDate    = input('start_date') ?: $firstOfMonth;
$endDate      = input('end_date')   ?: $today;
$methodFilter = input('method');   // '' = all methods
$isExport     = input('export') === 'csv';
// Free-text search: receipt no., M-Pesa/bank reference, student name,
// admission number or invoice reference. When searching we deliberately
// IGNORE the date range — you're hunting one payment and rarely know which
// month it landed in.
$q            = trim((string)input('q'));
$isSearch     = $q !== '';

// Validate date format — bad input would 500 PostgREST.
$dateRe = '/^\d{4}-\d{2}-\d{2}$/';
if (!preg_match($dateRe, $startDate)) $startDate = $firstOfMonth;
if (!preg_match($dateRe, $endDate))   $endDate   = $today;

// Filtered query. On-screen view caps at 200 rows so the page stays light on 3G;
// the CSV export pulls everything that matches (no LIMIT) so reports are complete.
$payCols = 'id,invoice_id,amount,method,transaction_ref,receipt_number,payment_date,paid_at,created_at,status';

if (!$isSearch) {
    // Normal browse: a date window, newest first.
    $payQuery = $sb->from('payments')
        ->select($payCols)
        ->eq('school_id', $sid)
        ->eq('status', 'completed')
        ->gte('payment_date', $startDate)
        ->lte('payment_date', $endDate)
        ->order('payment_date', false);

    if ($methodFilter) $payQuery = $payQuery->eq('method', $methodFilter);
    if (!$isExport)    $payQuery = $payQuery->limit(200);

    $payments = $payQuery->execute()['data'] ?? [];
} else {
    // Search across ALL dates. PostgREST can't join, so we gather in two passes
    // and merge: (a) fields on the payment itself, (b) payments whose invoice
    // belongs to a matching student or carries a matching invoice reference.
    $found = [];   // payment id => row

    // (a) receipt number / transaction reference
    $direct = $sb->from('payments')->select($payCols)
        ->eq('school_id', $sid)->eq('status', 'completed')
        ->searchTokens(['receipt_number', 'transaction_ref'], $q)
        ->order('payment_date', false)->limit(200)->execute()['data'] ?? [];
    foreach ($direct as $p) $found[$p['id']] = $p;

    // (b) student name / admission number → their invoices; plus invoice reference
    $matchStudents = $sb->from('students')->select('id')
        ->eq('school_id', $sid)
        ->searchTokens(['first_name', 'last_name', 'admission_number'], $q)
        ->limit(400)->execute()['data'] ?? [];
    $matchStudentIds = array_column($matchStudents, 'id');

    $invIds = [];
    if (!empty($matchStudentIds)) {
        $rows = Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('invoices')->select('id')->eq('school_id', $sid),
            'student_id', $matchStudentIds
        );
        $invIds = array_column($rows, 'id');
    }
    $byRef = $sb->from('invoices')->select('id')->eq('school_id', $sid)
        ->ilike('reference', '%' . $q . '%')->limit(200)->execute()['data'] ?? [];
    $invIds = array_values(array_unique(array_merge($invIds, array_column($byRef, 'id'))));

    if (!empty($invIds)) {
        $rows = Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('payments')->select($payCols)
                ->eq('school_id', $sid)->eq('status', 'completed'),
            'invoice_id', $invIds
        );
        foreach ($rows as $p) $found[$p['id']] = $p;
    }

    $payments = array_values($found);
    if ($methodFilter) {
        $payments = array_values(array_filter($payments, fn($p) => ($p['method'] ?? '') === $methodFilter));
    }
    // Newest first, then cap the on-screen list (export keeps everything).
    usort($payments, fn($a, $b) => strcmp((string)($b['payment_date'] ?? ''), (string)($a['payment_date'] ?? '')));
    if (!$isExport) $payments = array_slice($payments, 0, 200);
}

// Get invoice references + student IDs for these payments
$invoiceIds = array_unique(array_filter(array_column($payments, 'invoice_id')));
$invoiceRefMap = [];
$invoiceStudentMap = [];
if (!empty($invoiceIds)) {
    $invLookup = $sb->from('invoices')->select('id,reference,student_id')->in('id', $invoiceIds)->execute();
    foreach (($invLookup['data'] ?? []) as $inv) {
        $invoiceRefMap[$inv['id']]    = $inv['reference'] ?? $inv['id'];
        $invoiceStudentMap[$inv['id']] = $inv['student_id'];
    }
}

// Get pending invoices for the Pay-modal dropdown (only for on-screen view).
// EVERY open (unpaid/partial) invoice — the Record Payment picker is searchable,
// so there's no reason to truncate. Chunked so it can't be cut off at the
// 1000-row PostgREST cap (a large school can have well over 1000 open invoices).
// Fully-paid/draft/cancelled invoices are intentionally excluded — nothing to pay.
$pendingInvoices = [];
if (!$isExport) {
    $pendingInvoices = Supabase::fetchAllPaged(
        fn($_sb) => $_sb->from('invoices')
            ->select('id,reference,student_id,amount,paid_amount')
            ->eq('school_id', $sid)
            ->in('status', ['unpaid', 'partial'])
            ->order('created_at', false)
    );
}

// Build student map (include class_id so CSV can show class). Chunked-in so
// the export use case (with potentially many students from the date range)
// can't blow past the 1000-IN guardrail.
$allStudentIds = array_unique(array_filter(array_merge(
    array_values($invoiceStudentMap),
    array_column($pendingInvoices, 'student_id')
)));

$studentMap      = [];   // id => "First Last"
$studentClassMap = [];   // id => class_id
$studentAdmMap   = [];   // id => admission_number (for payment search)
if (!empty($allStudentIds)) {
    $stuRows = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('students')
            ->select('id,first_name,last_name,current_class_id,admission_number')
            ->eq('school_id', $sid),
        'id',
        $allStudentIds
    );
    foreach ($stuRows as $s) {
        $studentMap[$s['id']]      = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''));
        $studentClassMap[$s['id']] = $s['current_class_id'] ?? '';
        $studentAdmMap[$s['id']]   = $s['admission_number'] ?? '';
    }
}
$classMap = cachedClassMap();

// Friendly method labels for both screen and CSV
// The school's configured methods (Settings → Payment Methods) drive the
// filter dropdown, so it matches what's actually in use.
$configuredMethods = cachedPaymentMethods();
// Display labels: configured names win; legacy/system codes fall back to a
// friendly name so historical payments (e.g. old 'mobile_money') still read well.
$methodLabels = [];
foreach ($configuredMethods as $m) $methodLabels[$m['code']] = $m['name'];
$methodLabels += [
    'cash'          => 'Cash',
    'mpesa'         => 'M-Pesa',
    'bank_transfer' => 'Bank Transfer',
    'cheque'        => 'Cheque',
    'mobile_money'  => 'Mobile Money',
    'card'          => 'Card',
    'credit_balance'=> 'Credit Balance',
    'other'         => 'Other',
];

// ── CSV Export ───────────────────────────────────────────────────
// Must emit BEFORE require layout-top.php so no HTML leaks into the file.
if ($isExport) {
    $filename = 'payments_' . $startDate . '_to_' . $endDate . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');

    $out = fopen('php://output', 'w');
    // UTF-8 BOM so Excel opens KES/£/€ correctly
    fwrite($out, "\xEF\xBB\xBF");

    fputcsv($out, [
        'Payment Date', 'Receipt No.', 'Invoice Reference', 'Student', 'Class',
        'Amount', 'Method', 'Payment Reference', 'Recorded At'
    ]);

    $totalAmount = 0.0;
    foreach ($payments as $p) {
        $studentId = $invoiceStudentMap[$p['invoice_id'] ?? ''] ?? '';
        $classId   = $studentClassMap[$studentId] ?? '';
        $methodKey = $p['method'] ?? '';
        $amount    = (float)($p['amount'] ?? 0);
        $totalAmount += $amount;

        fputcsv($out, [
            $p['payment_date'] ?? $p['paid_at'] ?? $p['created_at'] ?? '',
            $p['receipt_number'] ?? '',
            $invoiceRefMap[$p['invoice_id'] ?? ''] ?? '',
            $studentMap[$studentId] ?? '',
            $classMap[$classId] ?? '',
            number_format($amount, 2, '.', ''),
            $methodLabels[$methodKey] ?? ucfirst($methodKey),
            $p['transaction_ref'] ?? '',
            $p['created_at'] ?? '',
        ]);
    }

    // Footer row with total — useful when emailing to the bursar
    fputcsv($out, []);
    fputcsv($out, ['', '', '', '', 'TOTAL', number_format($totalAmount, 2, '.', ''), count($payments) . ' payments', '', '']);

    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<?php
// Build the export URL with the current filters baked in
$exportUrl = baseUrl('fees/payments') . '?export=csv'
           . '&start_date=' . urlencode($startDate)
           . '&end_date='   . urlencode($endDate)
           . '&method='     . urlencode($methodFilter)
           . '&q='          . urlencode($q);

// Running total for the visible rows — handy quick summary above the table
$visibleTotal = 0.0;
foreach ($payments as $_p) $visibleTotal += (float)($_p['amount'] ?? 0);
?>
<div class="flex items-center justify-between mb-4">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Payments</h1>
        <p class="text-sm text-gray-500 mt-1">
            <?php if ($isSearch): ?>
                <?= count($payments) ?> result<?= count($payments) === 1 ? '' : 's' ?> for
                “<span class="font-medium text-gray-700"><?= e($q) ?></span>”
                · <span class="font-semibold text-emerald-700"><?= money($visibleTotal) ?></span>
                <span class="text-gray-400">· all dates</span>
            <?php else: ?>
                <?= count($payments) ?> payment<?= count($payments) === 1 ? '' : 's' ?>
                · <span class="font-semibold text-emerald-700"><?= money($visibleTotal) ?></span> collected
            <?php endif; ?>
            <?php if (count($payments) >= 200): ?>
                <span class="ml-2 text-amber-600">(showing first 200 — export CSV for full list)</span>
            <?php endif; ?>
        </p>
    </div>
    <div class="flex gap-2">
        <a href="<?= e($exportUrl) ?>"
           download
           class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-1.5"
           title="Download all payments matching the current filters as a CSV (opens in Excel)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Export CSV
        </a>
        <button onclick="document.getElementById('payModal').classList.remove('hidden')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
            + Record Payment
        </button>
    </div>
</div>

<!-- Filters: dates + method. GET form so the URL is shareable / bookmarkable. -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('fees/payments') ?>" class="flex flex-wrap items-end gap-3">
        <div class="flex-1 min-w-[16rem]">
            <label class="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input type="text" name="q" value="<?= e($q) ?>" autocomplete="off"
                   placeholder="Receipt no., M-Pesa code, student name, admission no. or invoice ref…"
                   class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" name="start_date" value="<?= e($startDate) ?>"
                   class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" name="end_date" value="<?= e($endDate) ?>"
                   class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Method</label>
            <select name="method" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">All methods</option>
                <?php
                // Show the school's configured methods; fall back to the full
                // label list only if none are configured yet.
                $filterMethods = !empty($configuredMethods)
                    ? array_column($configuredMethods, 'name', 'code')
                    : $methodLabels;
                foreach ($filterMethods as $code => $label): ?>
                    <option value="<?= e($code) ?>"<?= selectedIf($methodFilter, $code) ?>><?= e($label) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="flex gap-2">
            <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Apply</button>
            <a href="<?= baseUrl('fees/payments') ?>" class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Reset</a>
        </div>
    </form>
    <?php if ($isSearch): ?>
        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
            Searching across <strong>all dates</strong> — the From/To range is ignored while a search term is present.
            <a href="<?= baseUrl('fees/payments') ?>" class="underline font-medium">Clear search</a>
        </p>
    <?php endif; ?>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Receipt No.</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Invoice</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Method</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Payment Reference</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($payments)): ?>
                <tr><td colspan="8" class="px-4 py-12 text-center text-gray-400">No payments recorded yet</td></tr>
            <?php else: ?>
                <?php foreach ($payments as $p): ?>
                    <?php $studentId = $invoiceStudentMap[$p['invoice_id'] ?? ''] ?? ''; ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 text-gray-600"><?= formatDate($p['payment_date'] ?? $p['paid_at'] ?? $p['created_at'] ?? null) ?></td>
                        <td class="px-4 py-3 text-gray-900 font-mono text-xs"><?= e($p['receipt_number'] ?? '—') ?></td>
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($invoiceRefMap[$p['invoice_id'] ?? ''] ?? '—') ?></td>
                        <td class="px-4 py-3 text-gray-700"><?= e($studentMap[$studentId] ?? '—') ?></td>
                        <td class="px-4 py-3 text-right font-medium text-emerald-600"><?= money((float)($p['amount'] ?? 0)) ?></td>
                        <td class="px-4 py-3 text-gray-600"><?= e(ucfirst(str_replace('_', ' ', $p['method'] ?? 'cash'))) ?></td>
                        <td class="px-4 py-3 text-gray-500 font-mono text-xs"><?= e($p['transaction_ref'] ?? '—') ?></td>
                        <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                            <a href="<?= baseUrl('fees/receipt?id=' . e($p['id'])) ?>" target="_blank" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Receipt</a>
                            <?php if (($p['status'] ?? 'completed') === 'completed' && (schoolSetting('payment_void_same_day_only', 'false') !== 'true' || paymentIsVoidableSameDay($p))): ?>
                                <button type="button"
                                    onclick="openVoidModal('<?= e(addslashes($p['id'])) ?>','<?= e(addslashes($p['receipt_number'] ?? '')) ?>','<?= e(money((float)($p['amount'] ?? 0))) ?>')"
                                    class="text-red-500 hover:text-red-700 text-xs font-medium">Void</button>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<!-- Pay Modal -->
<div id="payModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Record Payment</h3>
        <form method="POST">
            <?= csrfField() ?>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Invoice *</label>
                <select id="invClassFilter" class="w-full px-3 py-2 mb-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white">
                    <option value="">All classes</option>
                    <?php foreach (cachedClasses() as $c): ?>
                        <option value="<?= e($c['id']) ?>"><?= e($c['name']) ?></option>
                    <?php endforeach; ?>
                </select>
                <div class="invpick relative">
                    <input type="text" id="invSearch" autocomplete="off"
                        placeholder="Search student name, admission no. or invoice ref…"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <input type="hidden" name="invoice_id" id="invoiceId">
                    <div id="invList" class="hidden absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                        <?php foreach ($pendingInvoices as $inv): ?>
                            <?php
                            $sName  = $studentMap[$inv['student_id'] ?? ''] ?? 'Unknown';
                            $adm    = $studentAdmMap[$inv['student_id'] ?? ''] ?? '';
                            $ref    = $inv['reference'] ?? $inv['id'];
                            $bal    = (float)($inv['amount'] ?? 0) - (float)($inv['paid_amount'] ?? 0);
                            $label  = $ref . ' — ' . $sName . ' (bal: ' . money($bal) . ')';
                            $needle = strtolower(trim($sName . ' ' . $adm . ' ' . $ref));
                            ?>
                            <div class="invopt px-3 py-2 cursor-pointer hover:bg-emerald-50 border-b border-gray-50 last:border-0"
                                 data-id="<?= e($inv['id']) ?>" data-search="<?= e($needle) ?>"
                                 data-class="<?= e($studentClassMap[$inv['student_id'] ?? ''] ?? '') ?>"
                                 data-label="<?= e($label) ?>" data-bal="<?= e(number_format($bal, 2, '.', '')) ?>">
                                <div class="flex items-center justify-between gap-3">
                                    <span class="text-sm text-gray-900 truncate"><?= e($sName) ?><?= $adm !== '' ? ' <span class="text-gray-400">· ' . e($adm) . '</span>' : '' ?></span>
                                    <span class="text-sm font-medium text-gray-600 whitespace-nowrap"><?= money($bal) ?></span>
                                </div>
                                <div class="text-[11px] text-gray-400"><?= e($ref) ?></div>
                            </div>
                        <?php endforeach; ?>
                        <div id="invNone" class="hidden px-3 py-3 text-sm text-gray-400">No matching invoice</div>
                    </div>
                </div>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input type="number" name="amount" step="0.01" min="0.01" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Method</label>
                    <select name="method" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <?= paymentMethodOptions() ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input type="date" name="payment_date" value="<?= date('Y-m-d') ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Payment Reference <span class="text-red-500">*</span></label>
                <input type="text" name="transaction_ref" required placeholder="M-Pesa code, bank slip number, or paper receipt number" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <p class="text-xs text-gray-400 mt-1">The payer's proof of payment. The school's receipt number is generated automatically.</p>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Record Payment</button>
                <button type="button" onclick="document.getElementById('payModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Void Payment Modal -->
<div id="voidModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Void payment</h3>
        <p class="text-sm text-gray-500 mb-4">Receipt <span id="voidReceiptLabel" class="font-mono text-gray-800"></span> · <span id="voidAmountLabel" class="font-medium text-gray-800"></span></p>
        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">This undoes the collection — the invoice total stays the same; amount paid goes down. No cash is sent out. If you then need the correct amount recorded, record a new payment.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="void_payment">
            <input type="hidden" name="payment_id" id="voidPaymentId">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <textarea name="void_reason" required rows="3" placeholder="e.g. Typed 50000 instead of 5000"
                          class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></textarea>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
                        onclick="return confirm('Void this payment? This cannot be undone — you will re-record the correct amount.')">Void payment</button>
                <button type="button" onclick="document.getElementById('voidModal').classList.add('hidden')"
                        class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
function openVoidModal(id, receipt, amount) {
    document.getElementById('voidPaymentId').value = id;
    document.getElementById('voidReceiptLabel').textContent = receipt || id.slice(0, 8);
    document.getElementById('voidAmountLabel').textContent = amount || '';
    document.getElementById('voidModal').classList.remove('hidden');
}
(function(){
  var search=document.getElementById('invSearch'),
      list=document.getElementById('invList'),
      hid=document.getElementById('invoiceId'),
      none=document.getElementById('invNone'),
      amt=document.querySelector('#payModal input[name="amount"]');
  if(!search) return;
  var opts=Array.prototype.slice.call(list.querySelectorAll('.invopt'));
  var cls=document.getElementById('invClassFilter');
  function openList(){ list.classList.remove('hidden'); filter(); }
  function closeList(){ list.classList.add('hidden'); }
  function filter(){
    var q=search.value.trim().toLowerCase(), cf=cls?cls.value:'', shown=0;
    opts.forEach(function(o){
      var okText=!q || o.getAttribute('data-search').indexOf(q)>-1;
      var okClass=!cf || o.getAttribute('data-class')===cf;
      var ok=okText && okClass;
      o.classList.toggle('hidden',!ok); if(ok) shown++;
    });
    none.classList.toggle('hidden', shown>0);
  }
  if(cls) cls.addEventListener('change', function(){ hid.value=''; openList(); search.focus(); });
  search.addEventListener('focus', openList);
  search.addEventListener('input', function(){ hid.value=''; search.classList.remove('border-red-400'); openList(); });
  opts.forEach(function(o){
    o.addEventListener('click', function(){
      hid.value=o.getAttribute('data-id');
      search.value=o.getAttribute('data-label');
      if(amt && !amt.value){ amt.value=o.getAttribute('data-bal'); } // prefill the outstanding balance
      closeList();
    });
  });
  document.addEventListener('click', function(e){ if(!e.target.closest('.invpick')) closeList(); });
  var form=search.closest('form');
  if(form) form.addEventListener('submit', function(e){
    if(!hid.value){ e.preventDefault(); search.classList.add('border-red-400'); search.focus(); openList(); }
  });
})();
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
