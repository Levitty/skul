<?php
/**
 * Printable Invoice — standalone print-friendly page.
 * Receives ?id=UUID (invoice ID) as GET parameter.
 * Uses batch RPC for single-call data loading. Falls back to individual queries.
 */
$pageTitle = 'Invoice';

$sb  = new Supabase();
$sid = schoolId();

// ── Get invoice ID ─────────────────────────────────────────
$invoiceId = trim($_GET['id'] ?? '');
if (!$invoiceId) {
    die('Invoice ID is required.');
}

// ── Try batch RPC (1 API call) ─────────────────────────────
$rpcResult = $sb->rpc('get_invoice_print', [
    'p_invoice_id' => $invoiceId,
    'p_school_id'  => $sid,
]);

$rpcData = $rpcResult['data'] ?? null;

if ($rpcData && !empty($rpcData['invoice'])) {
    // RPC succeeded — extract all data
    $invoice      = $rpcData['invoice'];
    $student      = $rpcData['student'];
    $className    = $rpcData['class_name'] ?? '';
    $sectionName  = $rpcData['section_name'] ?? '';
    $groupName    = $rpcData['group_name'] ?? '';
    $termName     = $rpcData['term_name'] ?? '';
    $items        = $rpcData['items'] ?? [];
    $payments     = $rpcData['payments'] ?? [];
} else {
    // Fallback to individual queries (before RPC migration is run)
    $invResult = $sb->from('invoices')
        ->select('id,reference,student_id,amount,paid_amount,credit_applied,carry_forward_amount,status,due_date,fee_group_id,term_id,created_at')
        ->eq('id', $invoiceId)->eq('school_id', $sid)->single()->execute();
    $invoice = $invResult['data'][0] ?? null;
    if (!$invoice) die('Invoice not found.');

    $student = null; $className = ''; $sectionName = '';
    if (!empty($invoice['student_id'])) {
        $stuResult = $sb->from('students')
            ->select('id,first_name,last_name,admission_number,current_class_id,section_id,guardian_name,guardian_phone,roll_number')
            ->eq('id', $invoice['student_id'])->single()->execute();
        $student = $stuResult['data'][0] ?? null;
        if ($student && !empty($student['current_class_id'])) {
            $classMap = cachedClassMap();
            $className = $classMap[$student['current_class_id']] ?? '';
        }
        if ($student && !empty($student['section_id'])) {
            $secResult = $sb->from('sections')->select('id,name')
                ->eq('id', $student['section_id'])->single()->execute();
            $sectionName = $secResult['data'][0]['name'] ?? '';
        }
    }

    $itemsResult = $sb->from('invoice_items')->select('id,description,amount')
        ->eq('invoice_id', $invoiceId)->execute();
    $items = $itemsResult['data'] ?? [];

    $groupName = '';
    if (!empty($invoice['fee_group_id'])) {
        $gResult = $sb->from('fee_groups')->select('name')
            ->eq('id', $invoice['fee_group_id'])->single()->execute();
        $groupName = $gResult['data'][0]['name'] ?? '';
    }

    $termName = '';
    if (!empty($invoice['term_id'])) {
        $tResult = $sb->from('terms')->select('name')
            ->eq('id', $invoice['term_id'])->single()->execute();
        $termName = $tResult['data'][0]['name'] ?? '';
    }

    $payResult = $sb->from('payments')
        ->select('id,amount,method,transaction_ref,payment_date,paid_at,created_at')
        ->eq('invoice_id', $invoiceId)->eq('status', 'completed')->order('created_at')->execute();
    $payments = $payResult['data'] ?? [];
}

// ── School (cached) ────────────────────────────────────────
$school = cachedSchool();

// ── Live credit balance for the student (so the parent sees it). ─
// Tiny separate query; safe whether or not the get_invoice_print RPC
// returned credit_balance.
$studentCredit = 0.0;
if (!empty($student['id'])) {
    $cr = $sb->from('students')->select('credit_balance')
        ->eq('id', $student['id'])->single()->execute();
    $studentCredit = (float)(($cr['data'][0]['credit_balance'] ?? 0));
}

// ── Derived values ─────────────────────────────────────────
$invoiceTotal   = (float)($invoice['amount'] ?? 0);
$invoicePaid    = (float)($invoice['paid_amount'] ?? 0);
$invoiceBalance = $invoiceTotal - $invoicePaid;
$status         = $invoice['status'] ?? 'unpaid';
$creditApplied  = (float)($invoice['credit_applied'] ?? 0);
$carryForward   = (float)($invoice['carry_forward_amount'] ?? 0);
$invoiceDate    = $invoice['created_at'] ? substr($invoice['created_at'], 0, 10) : date('Y-m-d');
$dueDate        = $invoice['due_date'] ?? null;

// Field visibility (Settings → Currency & Invoices → Fields Shown on Invoices)
$showRoll     = schoolSetting('inv_show_roll', '1') === '1';
$showSection  = schoolSetting('inv_show_section', '1') === '1';
$showGuardian = schoolSetting('inv_show_guardian', '1') === '1';
$showPhone    = schoolSetting('inv_show_phone', '1') === '1';
$showPayments = schoolSetting('inv_show_payments', '1') === '1';
$showDueDate  = schoolSetting('inv_show_due_date', '1') === '1';

$methodLabels = methodLabelMap();

$statusColors = [
    'paid' => 'bg-emerald-100 text-emerald-700',
    'partial' => 'bg-amber-100 text-amber-700',
    'unpaid' => 'bg-gray-100 text-gray-600',
    'overdue' => 'bg-red-100 text-red-700',
    'cancelled' => 'bg-gray-200 text-gray-400',
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice <?= e($invoice['reference'] ?? '') ?> — <?= e($school['name'] ?? 'School') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        @media print {
            .no-print { display: none !important; }
            body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0 !important; }
            .print-card { box-shadow: none !important; border: none !important; max-width: 100% !important; border-radius: 0 !important; }
            /* Compact for paper so the whole invoice stays on ONE A4 page. */
            .print-card .px-8 { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
            .print-card .py-6 { padding-top: 0.45rem !important; padding-bottom: 0.45rem !important; }  /* header band */
            .print-card .py-4 { padding-top: 0.4rem !important; padding-bottom: 0.4rem !important; }   /* body */
            .print-card .py-3 { padding-top: 0.3rem !important; padding-bottom: 0.3rem !important; }   /* title bar */
            .print-card .space-y-3 > * + * { margin-top: 0.5rem !important; }
            .print-card .w-20 { width: 3.25rem !important; height: 3.25rem !important; }               /* logo */
            .print-card td, .print-card th { padding-top: 0.28rem !important; padding-bottom: 0.28rem !important; }
            .avoid-break { page-break-inside: avoid; }
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
<body class="bg-gray-100 min-h-screen flex items-start justify-center py-8 px-4">

    <div class="no-print fixed top-4 right-4 flex gap-3 z-50">
        <button onclick="window.print()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg shadow-lg font-medium transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print
        </button>
        <button onclick="if(window.history.length>1){history.back()}else{window.close()};setTimeout(function(){window.location.href='<?= baseUrl('fees/invoices') ?>'},150)" class="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg shadow-lg font-medium border border-gray-200 transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Back to Invoices
        </button>
    </div>

    <div class="print-card bg-white w-full max-w-3xl rounded-xl shadow-lg border border-gray-200 overflow-hidden relative">

        <?php if ($status === 'paid'): ?>
            <div class="watermark" style="color: rgba(107, 114, 128, 0.08);">PAID</div>
        <?php elseif ($status === 'cancelled'): ?>
            <div class="watermark" style="color: rgba(107, 114, 128, 0.08);">CANCELLED</div>
        <?php endif; ?>

        <?php
        $documentTitle = 'FEE INVOICE';
        $documentNumber = $invoice['reference'] ?? 'N/A';
        require __DIR__ . '/../../includes/print-header.php';
        ?>

        <div class="px-8 py-4 space-y-3 relative z-10">

            <!-- Tight info strip: who (left) + invoice meta (right), no wasted gap -->
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
            $compact = count($items) > 10;
            $cellPad = $compact ? 'px-4 py-1' : 'px-4 py-2';
            $cur     = schoolSetting('currency_symbol', 'KES');
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
            // Editable school notes (Settings → Currency & Invoices → invoice_notes).
            // Payment accounts / paybill live here; **bold** supported (escape-first).
            $invoiceNotes = trim(schoolSetting('invoice_notes', ''));
            if ($invoiceNotes !== ''):
                $notesHtml = preg_replace('/\*\*(.+?)\*\*/s', '<strong>$1</strong>', e($invoiceNotes));
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
</body>
</html>
