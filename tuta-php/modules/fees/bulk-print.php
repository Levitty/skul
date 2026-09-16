<?php
/**
 * Bulk Print Invoices — print-ready page for an entire class in the active term.
 *
 * Expects: ?class_id=UUID (optional — shows class picker if missing)
 * Uses the active term automatically. Generates a continuous print-ready page
 * with page breaks between invoices, reusing the same layout as invoice-print.php.
 */
$pageTitle = 'Bulk Print Invoices';
$sb  = new Supabase();
$sid = schoolId();

$currentTerm = cachedCurrentTerm();
$terms       = cachedTerms();

$classes  = cachedClasses();
$classMap = cachedClassMap();
$school   = cachedSchool();

// Filters
$selectedClass    = input('class_id');
$selectedTermId   = input('term_id') ?: ($currentTerm['id'] ?? '');
$selectedSection  = input('section_id');
$filterStatus     = input('status'); // empty = "issued (unpaid/partial/overdue)"
$onlyNotPrinted   = input('only_not_printed') !== '0'; // default ON

// ── POST: mark a batch of invoices as printed ──
if (isPost() && verifyCsrf() && input('action') === 'mark_printed') {
    $invIds = $_POST['invoice_ids'] ?? [];
    if (!empty($invIds)) {
        $now = date('c');
        // Bulk update — one PATCH call with IN filter + same body
        $sb->from('invoices')
            ->in('id', $invIds)->eq('school_id', $sid)
            ->update(['last_printed_at' => $now]);
        auditLog('bulk_print_marked', 'invoice_batch', null, ['count' => count($invIds)]);
        flash('success', count($invIds) . ' invoice(s) marked as printed.');
    }
    // Redirect back to picker preserving filters
    $back = 'fees/bulk-print?term_id=' . urlencode($selectedTermId)
          . '&class_id=' . urlencode($selectedClass)
          . '&section_id=' . urlencode($selectedSection)
          . '&status=' . urlencode($filterStatus)
          . '&only_not_printed=1';
    redirect($back);
}

$termId   = $selectedTermId;
$termName = '';
foreach ($terms as $t) { if ($t['id'] === $termId) { $termName = $t['name']; break; } }

// Sections for the picker (per-class). The sections table has no school_id
// column, so scope by this school's class IDs (classes are tenant-scoped).
$schoolClassIds = array_values(array_filter(array_column($classes, 'id')));
$allSections = [];
if (!empty($schoolClassIds)) {
    $sectionsResult = $sb->from('sections')->select('id,class_id,name')
        ->in('class_id', $schoolClassIds)->order('name')->execute();
    $allSections = $sectionsResult['data'] ?? [];
}
$sectionsByClass = [];
foreach ($allSections as $sec) $sectionsByClass[$sec['class_id']][] = $sec;

// ── If no class selected, show picker (inside layout) ──
if (!$selectedClass || !$termId) {
    require __DIR__ . '/../../includes/layout-top.php';
?>
<div class="mb-6">
    <a href="<?= baseUrl('fees/invoices') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to Invoices</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">Bulk Print Invoices</h1>
    <p class="text-sm text-gray-500 mt-1">Filter, then print all matching invoices in one go. Each invoice gets its own page.</p>
</div>

<div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-3xl">
    <form method="GET" action="<?= baseUrl('fees/bulk-print') ?>" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Term *</label>
            <select name="term_id" required
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <option value="">Choose term…</option>
                <?php foreach ($terms as $t): ?>
                    <option value="<?= e($t['id']) ?>"<?= selectedIf($selectedTermId, $t['id']) ?>>
                        <?= e($t['name']) ?><?= !empty($t['is_current']) ? ' (active)' : '' ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Class *</label>
            <select name="class_id" id="bpClassSel" required
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <option value="">Choose a class…</option>
                <?php foreach ($classes as $c): ?>
                    <option value="<?= e($c['id']) ?>"><?= e($c['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Stream</label>
            <select name="section_id" id="bpSectionSel"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <option value="">All sections</option>
                <?php foreach ($allSections as $sec): ?>
                    <option value="<?= e($sec['id']) ?>"
                            data-class="<?= e($sec['class_id']) ?>"><?= e($sec['name']) ?></option>
                <?php endforeach; ?>
            </select>
            <p class="text-xs text-gray-400 mt-1">Optional. Only this class's sections are shown.</p>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select name="status"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <option value="">Issued only (unpaid + partial + overdue)</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
                <option value="draft">Draft (preview)</option>
                <option value="all">All statuses</option>
            </select>
        </div>

        <div class="md:col-span-2 flex items-center gap-2">
            <input type="checkbox" name="only_not_printed" value="1" id="onlyNotPrinted" checked
                   class="w-4 h-4 rounded border-gray-300 text-emerald-600">
            <label for="onlyNotPrinted" class="text-sm text-gray-700 cursor-pointer">
                Only show invoices not yet printed
                <span class="text-xs text-gray-400">(uncheck to reprint everything)</span>
            </label>
        </div>

        <div class="md:col-span-2 flex justify-end">
            <button type="submit"
                    class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                Load Invoices for Printing
            </button>
        </div>
    </form>
</div>
<script>
// Show only the SELECTED class's sections in the Section dropdown — otherwise
// every class's "Cheetah/Jaguar/…" section is listed and names look duplicated.
(function () {
    var cls = document.getElementById('bpClassSel');
    var sec = document.getElementById('bpSectionSel');
    if (!cls || !sec) return;
    function filterSections() {
        var cid = cls.value;
        Array.prototype.forEach.call(sec.querySelectorAll('option[data-class]'), function (o) {
            var show = !cid || o.getAttribute('data-class') === cid;
            o.hidden = !show;
            o.disabled = !show;
        });
        var cur = sec.options[sec.selectedIndex];
        if (cur && cur.hidden) sec.value = ''; // reset to "All sections" if now hidden
    }
    cls.addEventListener('change', filterSections);
    filterSections();
})();
</script>
<?php
    require __DIR__ . '/../../includes/layout-bottom.php';
    return;
}

// ════════════════════════════════════════════════════════════════
// Class selected + active term available — load invoices
// ════════════════════════════════════════════════════════════════

// Get students in this class (with optional section filter)
$studentsQuery = $sb->from('students')
    ->select('id,first_name,last_name,admission_number,current_class_id,section_id,guardian_name,guardian_phone,roll_number,credit_balance')
    ->eq('school_id', $sid)
    ->eq('current_class_id', $selectedClass)
    ->eq('status', 'active')
    ->order('first_name');
if ($selectedSection) $studentsQuery = $studentsQuery->eq('section_id', $selectedSection);
$studentsResult = $studentsQuery->execute();
$students = $studentsResult['data'] ?? [];
$studentIds = array_column($students, 'id');
$studentMap = [];
foreach ($students as $s) $studentMap[$s['id']] = $s;

if (empty($studentIds)) {
    require __DIR__ . '/../../includes/layout-top.php';
    echo '<div class="p-6"><a href="' . baseUrl('fees/bulk-print') . '" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back</a>';
    echo '<p class="mt-4 text-gray-500">No active students found in ' . e($classMap[$selectedClass] ?? 'this class') . '.</p></div>';
    require __DIR__ . '/../../includes/layout-bottom.php';
    return;
}

// Get invoices for these students in the selected term, applying status + printed filters
$invQuery = $sb->from('invoices')
    ->select('id,reference,student_id,amount,paid_amount,credit_applied,status,due_date,fee_group_id,term_id,created_at,last_printed_at')
    ->eq('school_id', $sid)
    ->eq('term_id', $termId)
    ->in('student_id', $studentIds)
    ->order('created_at');

// Status filter
if ($filterStatus === '' || $filterStatus === null) {
    // Default: "Issued only" — exclude drafts, cancelled, carried_forward
    $invQuery = $invQuery->in('status', ['unpaid', 'partial', 'overdue', 'paid']);
} elseif ($filterStatus !== 'all') {
    $invQuery = $invQuery->eq('status', $filterStatus);
}

// Already-printed filter
if ($onlyNotPrinted) {
    $invQuery = $invQuery->is('last_printed_at', 'null');
}

$invoicesResult = $invQuery->execute();
$invoices = $invoicesResult['data'] ?? [];

if (empty($invoices)) {
    require __DIR__ . '/../../includes/layout-top.php';
    echo '<div class="p-6"><a href="' . baseUrl('fees/bulk-print') . '" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back</a>';
    echo '<p class="mt-4 text-gray-500">No invoices found for ' . e($classMap[$selectedClass] ?? 'this class') . ' in ' . e($termName) . '.</p></div>';
    require __DIR__ . '/../../includes/layout-bottom.php';
    return;
}

// Get all invoice IDs to fetch items + payments in batch
$invoiceIds = array_column($invoices, 'id');

// Fetch all invoice items
$allItemsResult = $sb->from('invoice_items')->select('id,invoice_id,description,amount')
    ->in('invoice_id', $invoiceIds)->execute();
$allItems = $allItemsResult['data'] ?? [];
$itemsByInvoice = [];
foreach ($allItems as $item) {
    $itemsByInvoice[$item['invoice_id']][] = $item;
}

// Fetch all payments
$allPayResult = $sb->from('payments')
    ->select('id,invoice_id,amount,method,transaction_ref,payment_date,paid_at,created_at')
    ->in('invoice_id', $invoiceIds)
    ->eq('status', 'completed')
    ->order('created_at')
    ->execute();
$allPayments = $allPayResult['data'] ?? [];
$paymentsByInvoice = [];
foreach ($allPayments as $pay) {
    $paymentsByInvoice[$pay['invoice_id']][] = $pay;
}

// Fetch fee group names
$groupIds = array_unique(array_filter(array_column($invoices, 'fee_group_id')));
$groupNameMap = [];
if (!empty($groupIds)) {
    $groupsResult = $sb->from('fee_groups')->select('id,name')->in('id', $groupIds)->execute();
    foreach (($groupsResult['data'] ?? []) as $g) $groupNameMap[$g['id']] = $g['name'];
}

// Section names
$sectionIds = array_unique(array_filter(array_column($students, 'section_id')));
$sectionNameMap = [];
if (!empty($sectionIds)) {
    $secResult = $sb->from('sections')->select('id,name')->in('id', $sectionIds)->execute();
    foreach (($secResult['data'] ?? []) as $sec) $sectionNameMap[$sec['id']] = $sec['name'];
}

$className = $classMap[$selectedClass] ?? 'Class';

$methodLabels = methodLabelMap();

$statusColors = [
    'paid' => 'bg-emerald-100 text-emerald-700',
    'partial' => 'bg-amber-100 text-amber-700',
    'unpaid' => 'bg-gray-100 text-gray-600',
    'overdue' => 'bg-red-100 text-red-700',
    'cancelled' => 'bg-gray-200 text-gray-400',
];

// ════════════════════════════════════════════════════════════════
// Standalone print page (no sidebar layout — like invoice-print)
// ════════════════════════════════════════════════════════════════
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bulk Print — <?= e($className) ?> — <?= e($termName) ?> — <?= e($school['name'] ?? 'School') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        @media print {
            .no-print { display: none !important; }
            body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0 !important; }
            .invoice-page { box-shadow: none !important; border: none !important; margin: 0 !important; max-width: 100% !important; border-radius: 0 !important; }
            /* Compact for paper so each invoice stays on ONE A4 page (matches single invoice-print). */
            .invoice-page .px-8 { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
            .invoice-page .py-6 { padding-top: 0.45rem !important; padding-bottom: 0.45rem !important; }
            .invoice-page .py-4 { padding-top: 0.4rem !important; padding-bottom: 0.4rem !important; }
            .invoice-page .py-3 { padding-top: 0.3rem !important; padding-bottom: 0.3rem !important; }
            .invoice-page .space-y-3 > * + * { margin-top: 0.5rem !important; }
            .invoice-page .w-20 { width: 3.25rem !important; height: 3.25rem !important; }
            .invoice-page td, .invoice-page th { padding-top: 0.28rem !important; padding-bottom: 0.28rem !important; }
            .avoid-break { page-break-inside: avoid; }
            .page-break { page-break-after: always; break-after: page; }
        }
        @page { size: <?= (schoolSetting('print_paper_size', 'A4') === 'A5') ? 'A5' : 'A4' ?>; margin: 9mm 12mm; }
        .watermark {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 5rem; font-weight: 900; pointer-events: none;
            z-index: 0; letter-spacing: 0.2em; white-space: nowrap;
        }
    </style>
</head>
<body class="bg-gray-100 min-h-screen py-8 px-4">

    <!-- Print toolbar -->
    <div class="no-print max-w-3xl mx-auto mb-6 flex items-center justify-between">
        <div>
            <h1 class="text-lg font-bold text-gray-900"><?= e($className) ?> — <?= e($termName) ?></h1>
            <p class="text-sm text-gray-500">
                <?= count($invoices) ?> invoice(s) ready to print
                <?php
                $alreadyPrinted = 0;
                foreach ($invoices as $iv) if (!empty($iv['last_printed_at'])) $alreadyPrinted++;
                if ($alreadyPrinted > 0): ?>
                    <span class="text-amber-600 ml-2"><?= $alreadyPrinted ?> previously printed</span>
                <?php endif; ?>
            </p>
        </div>
        <div class="flex gap-3 items-center">
            <button onclick="window.print()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg shadow-lg font-medium transition text-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                Print All (<?= count($invoices) ?>)
            </button>

            <form method="POST" action="<?= baseUrl('fees/bulk-print?term_id=' . urlencode($selectedTermId) . '&class_id=' . urlencode($selectedClass)) ?>"
                  class="inline" onsubmit="return confirm('Mark all <?= count($invoices) ?> invoice(s) as printed?')">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="mark_printed">
                <input type="hidden" name="section_id" value="<?= e($selectedSection) ?>">
                <input type="hidden" name="status" value="<?= e($filterStatus) ?>">
                <?php foreach ($invoices as $iv): ?>
                    <input type="hidden" name="invoice_ids[]" value="<?= e($iv['id']) ?>">
                <?php endforeach; ?>
                <button type="submit" class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg shadow-lg font-medium transition text-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    Mark as printed
                </button>
            </form>

            <a href="<?= baseUrl('fees/bulk-print') ?>" class="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg shadow-lg font-medium border border-gray-200 transition text-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                Back
            </a>
        </div>
    </div>

    <?php
    // Field visibility (Settings → Currency & Invoices) — same as single invoice-print.
    $showRoll     = schoolSetting('inv_show_roll', '1') === '1';
    $showDueDate  = schoolSetting('inv_show_due_date', '1') === '1';
    $showSection  = schoolSetting('inv_show_section', '1') === '1';
    $showGuardian = schoolSetting('inv_show_guardian', '1') === '1';
    $showPhone    = schoolSetting('inv_show_phone', '1') === '1';
    $cur          = schoolSetting('currency_symbol', 'KES');
    ?>
    <?php $invIndex = 0; foreach ($invoices as $inv):
        $invIndex++;
        $student      = $studentMap[$inv['student_id']] ?? null;
        $items        = $itemsByInvoice[$inv['id']] ?? [];
        $payments     = $paymentsByInvoice[$inv['id']] ?? [];
        $groupName    = $groupNameMap[$inv['fee_group_id'] ?? ''] ?? '';
        $sectionName  = ($student && !empty($student['section_id'])) ? ($sectionNameMap[$student['section_id']] ?? '') : '';

        $invoiceTotal   = (float)($inv['amount'] ?? 0);
        $invoicePaid    = (float)($inv['paid_amount'] ?? 0);
        $invoiceBalance = $invoiceTotal - $invoicePaid;
        $status         = $inv['status'] ?? 'unpaid';
        $invoiceDate    = $inv['created_at'] ? substr($inv['created_at'], 0, 10) : date('Y-m-d');
        $dueDate        = $inv['due_date'] ?? null;

        $isLast = ($invIndex === count($invoices));
    ?>

    <div class="invoice-page bg-white w-full max-w-3xl mx-auto rounded-xl shadow-lg border border-gray-200 overflow-hidden relative <?= !$isLast ? 'mb-8 page-break' : '' ?>">

        <?php if ($status === 'paid'): ?>
            <div class="watermark" style="color: rgba(16, 185, 129, 0.07);">PAID</div>
        <?php elseif ($status === 'cancelled'): ?>
            <div class="watermark" style="color: rgba(239, 68, 68, 0.07);">CANCELLED</div>
        <?php endif; ?>

        <?php
        $documentTitle  = 'FEE INVOICE';
        $documentNumber = $inv['reference'] ?? 'N/A';
        require __DIR__ . '/../../includes/print-header.php';
        ?>

        <div class="px-8 py-4 space-y-3 relative z-10">

            <!-- Tight info strip: who (left) + invoice meta (right) — matches single invoice-print -->
            <div class="flex items-start justify-between gap-6 text-sm">
                <div class="min-w-0">
                    <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Bill to</p>
                    <p class="text-gray-900 font-semibold leading-tight"><?= $student ? e($student['first_name'] . ' ' . $student['last_name']) : '—' ?></p>
                    <p class="text-gray-500 text-xs leading-snug">
                        Adm <?= e($student['admission_number'] ?? 'N/A') ?><?php if ($className): ?> · <?= e($className) ?><?= ($showSection && $sectionName) ? ' — ' . e($sectionName) : '' ?><?php endif; ?><?php if ($showRoll && !empty($student['roll_number'])): ?> · Roll <?= e($student['roll_number']) ?><?php endif; ?>
                        <?php if ($showGuardian && !empty($student['guardian_name'])): ?><br><?= e($student['guardian_name']) ?><?php if ($showPhone && !empty($student['guardian_phone'])): ?> · <?= e($student['guardian_phone']) ?><?php endif; ?><?php endif; ?>
                    </p>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200"><?= strtoupper($status) ?></span>
                    <p class="text-gray-500 text-xs mt-1">Date: <span class="text-gray-800 font-medium"><?= e(date('j M Y', strtotime($invoiceDate))) ?></span></p>
                    <?php if ($dueDate && $showDueDate): ?><p class="text-gray-500 text-xs">Due: <span class="text-gray-800 font-medium"><?= e(date('j M Y', strtotime($dueDate))) ?></span></p><?php endif; ?>
                    <?php if ($groupName || $termName): ?><p class="text-gray-500 text-xs"><?= $groupName ? e($groupName) : '' ?><?= $groupName && $termName ? ' · ' : '' ?><?= $termName ? e($termName) : '' ?></p><?php endif; ?>
                </div>
            </div>

            <!-- ONE table: fee lines + totals together -->
            <?php
            $compact       = count($items) > 10;
            $cellPad       = $compact ? 'px-4 py-1' : 'px-4 py-2';
            $creditApplied = (float)($inv['credit_applied'] ?? 0);
            $studentCredit = (float)($student['credit_balance'] ?? 0);
            ?>
            <div class="rounded-lg border border-gray-200 overflow-hidden avoid-break">
                <table class="w-full <?= $compact ? 'text-xs' : 'text-sm' ?>">
                    <thead><tr class="bg-gray-50 border-b border-gray-200">
                        <th class="text-left px-4 py-2 font-semibold text-gray-600 w-10">#</th>
                        <th class="text-left px-4 py-2 font-semibold text-gray-600">Fee Type</th>
                        <th class="text-right px-4 py-2 font-semibold text-gray-600 w-32">Amount (<?= e($cur) ?>)</th>
                    </tr></thead>
                    <tbody>
                        <?php if (!empty($items)): $n = 0; foreach ($items as $item): $n++; ?>
                            <tr class="border-b border-gray-100" style="page-break-inside: avoid;">
                                <td class="<?= $cellPad ?> text-gray-400"><?= $n ?></td>
                                <td class="<?= $cellPad ?> text-gray-800"><?= e($item['description'] ?? 'Fee') ?></td>
                                <td class="<?= $cellPad ?> text-right text-gray-800 font-medium whitespace-nowrap"><?= number_format((float)($item['amount'] ?? 0), 2) ?></td>
                            </tr>
                        <?php endforeach; else: ?>
                            <tr class="border-b border-gray-100">
                                <td class="<?= $cellPad ?> text-gray-400">1</td>
                                <td class="<?= $cellPad ?> text-gray-800"><?= $groupName ? e($groupName) : 'Fees' ?></td>
                                <td class="<?= $cellPad ?> text-right text-gray-800 font-medium"><?= number_format((float)$invoiceTotal, 2) ?></td>
                            </tr>
                        <?php endif; ?>
                    </tbody>
                    <tfoot>
                        <tr class="bg-gray-50 border-t border-gray-200">
                            <td></td>
                            <td class="<?= $cellPad ?> text-gray-600 font-semibold">Total</td>
                            <td class="<?= $cellPad ?> text-right text-gray-900 font-bold whitespace-nowrap"><?= number_format((float)$invoiceTotal, 2) ?></td>
                        </tr>
                        <?php if ($creditApplied > 0): ?>
                        <tr class="bg-gray-50">
                            <td></td>
                            <td class="<?= $cellPad ?> text-gray-600">Credit applied</td>
                            <td class="<?= $cellPad ?> text-right text-gray-700 whitespace-nowrap">-<?= number_format((float)$creditApplied, 2) ?></td>
                        </tr>
                        <?php endif; ?>
                        <tr class="bg-gray-50">
                            <td></td>
                            <td class="<?= $cellPad ?> text-gray-600">Amount Paid</td>
                            <td class="<?= $cellPad ?> text-right text-gray-800 font-medium whitespace-nowrap"><?= number_format((float)$invoicePaid, 2) ?></td>
                        </tr>
                        <tr class="bg-gray-50 border-t-2 border-gray-300">
                            <td></td>
                            <td class="<?= $cellPad ?> text-gray-900 font-bold">Balance Due</td>
                            <td class="<?= $cellPad ?> text-right font-bold text-gray-900 whitespace-nowrap"><?= number_format((float)max(0, $invoiceBalance), 2) ?></td>
                        </tr>
                        <?php if ($studentCredit > 0): ?>
                        <tr class="bg-gray-50 border-t border-gray-200">
                            <td></td>
                            <td class="<?= $cellPad ?> text-gray-600 text-xs">Credit on account <span class="text-gray-400">(applies to next invoice)</span></td>
                            <td class="<?= $cellPad ?> text-right text-gray-700 font-medium whitespace-nowrap"><?= number_format((float)$studentCredit, 2) ?></td>
                        </tr>
                        <?php endif; ?>
                    </tfoot>
                </table>
            </div>

            <?php
            // Editable school notes — same source as single-invoice print (**bold** supported).
            if (!isset($_invoiceNotesCache)) {
                $_invoiceNotesCache = trim(schoolSetting('invoice_notes', ''));
            }
            if ($_invoiceNotesCache !== ''):
                $notesHtml = preg_replace('/\*\*(.+?)\*\*/s', '<strong>$1</strong>', e($_invoiceNotesCache));
            ?>
            <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 avoid-break">
                <p class="text-[11px] font-semibold uppercase tracking-wider mb-1 text-gray-500">Notes</p>
                <p class="text-xs text-gray-700 whitespace-pre-line leading-snug"><?= $notesHtml ?></p>
            </div>
            <?php endif; ?>

            <div class="text-center text-[11px] text-gray-400 space-y-0.5 pt-1 avoid-break">
                <?php if (schoolSetting('inv_show_disclaimer', '1') === '1'): ?><p>This is a computer-generated invoice and does not require a signature.</p><?php endif; ?>
                <?php if ($dueDate && $showDueDate && $status !== 'paid' && $status !== 'cancelled'): ?>
                    <p class="text-gray-500">Payment due by <?= e(date('j M Y', strtotime($dueDate))) ?>. Late fees may apply.</p>
                <?php endif; ?>
                <p>Enquiries: <?= $school['phone'] ? e($school['phone']) : 'the school office' ?><?= !empty($school['email']) ? ' · ' . e($school['email']) : '' ?></p>
                <?php $invKraPin = trim((string)schoolSetting('kra_pin', '')); if ($invKraPin !== ''): ?>
                    <p>KRA PIN: <?= e($invKraPin) ?></p>
                <?php endif; ?>
            </div>

        </div>
    </div>

    <?php endforeach; ?>

</body>
</html>
