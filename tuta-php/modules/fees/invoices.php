<?php
/**
 * Invoices — list and view invoices.
 * Uses correct table: invoices (not fee_invoices).
 * Columns: reference (not invoice_number), amount (not total_amount), paid_amount, status.
 * Status values: unpaid, partial, paid, overdue, cancelled.
 */
$pageTitle = 'Invoices';
$sb  = new Supabase();
$sid = schoolId();

$classes  = cachedClasses();
$classMap = cachedClassMap();

$filterStatus = input('status');
$filterClass  = input('class_id');
$filterQ      = trim((string)input('q'));

// ── Pagination (50 per page, numbered) ──────────────────────────
// The old code fetched ALL invoices and filtered class-side in PHP.
// At >1000 invoices that silently lost data, and the class filter
// only worked over whatever 1000 rows we got. Now: push the class
// filter to the DB via student_id subquery, paginate the display,
// compute stats over the FULL filtered set with fetchAllPaged.
$page    = currentPage();
$perPage = 50;
$offset  = ($page - 1) * $perPage;

// Class and/or name-search filter → resolve to a single student-ID set.
// A typical school has well under 1000 students, so we fetch candidates and
// case-insensitively substring-match in PHP. Both filters compose by
// intersection: class narrows the candidate pool, the name search filters it.
$classStudentIds = null;
if ($filterClass || $filterQ !== '') {
    $sq = $sb->from('students')
        ->select('id,first_name,last_name')
        ->eq('school_id', $sid);
    if ($filterClass) {
        $sq = $sq->eq('current_class_id', $filterClass);
    }
    $candidates = $sq->execute()['data'] ?? [];

    if ($filterQ !== '') {
        $needle = mb_strtolower($filterQ);
        $candidates = array_filter($candidates, function ($s) use ($needle) {
            $full = mb_strtolower(trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? '')));
            return $full !== '' && mb_strpos($full, $needle) !== false;
        });
    }

    $classStudentIds = array_values(array_column($candidates, 'id'));
    if (empty($classStudentIds)) $classStudentIds = ['__none__']; // forces 0 results
}

// Shared query builder used by both stats + paginated display
$buildInvoiceQuery = function (Supabase $sb) use ($sid, $filterStatus, $classStudentIds) {
    $q = $sb->from('invoices')
        ->select('id,reference,student_id,amount,paid_amount,status,due_date,created_at')
        ->eq('school_id', $sid);
    if ($filterStatus)      $q = $q->eq('status', $filterStatus);
    if ($classStudentIds)   $q = $q->in('student_id', $classStudentIds);
    return $q;
};

// ── Stats query: walks ALL matching invoices (not just current page) so
//    the cards at the top reflect reality, not the visible 50 rows.
$statsBuilder = function (Supabase $sb) use ($sid, $filterStatus, $classStudentIds) {
    $q = $sb->from('invoices')
        ->select('amount,paid_amount,status,due_date')
        ->eq('school_id', $sid)
        ->order('created_at', false);
    if ($filterStatus)    $q = $q->eq('status', $filterStatus);
    if ($classStudentIds) $q = $q->in('student_id', $classStudentIds);
    return $q;
};
$statsRows = Supabase::fetchAllPaged($statsBuilder);

// ── Display query: paginated, with total count
$displayResult = $buildInvoiceQuery($sb)
    ->order('created_at', false)
    ->range($offset, $perPage)
    ->executeWithCount();
$invoices    = $displayResult['data']  ?? [];
$totalCount  = (int)($displayResult['count'] ?? count($invoices));

// Get student names (only for invoices on THIS page — much smaller list)
$studentIds = array_unique(array_filter(array_column($invoices, 'student_id')));
$studentMap = [];
if (!empty($studentIds)) {
    $studentsResult = $sb->from('students')
        ->select('id,first_name,last_name,current_class_id,family_id,credit_balance')
        ->in('id', $studentIds)->execute();
    foreach (($studentsResult['data'] ?? []) as $s) {
        $studentMap[$s['id']] = $s;
    }
}

// Line items for the invoices on THIS page — so the Add/Edit-fee modal can
// list existing lines and let staff remove one (e.g. a parent opts a child out
// of a fee). One chunked query for the page's invoices.
$invoiceItems = [];
$invIdsPage = array_values(array_filter(array_column($invoices, 'id')));
if (!empty($invIdsPage)) {
    $itemRows = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('invoice_items')->select('id,invoice_id,description,amount'),
        'invoice_id', $invIdsPage);
    foreach ($itemRows as $it) {
        $invoiceItems[$it['invoice_id']][] = [
            'id' => $it['id'], 'description' => $it['description'], 'amount' => (float)$it['amount'],
        ];
    }
}

// Handle actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // Cancel invoice
    if ($action === 'cancel') {
        $invId  = input('invoice_id');
        $reason = trim((string)input('cancel_reason'));

        // Maker-checker for non-admins only. School admin acts immediately.
        if (approvalRequired('require_approval_cancel', 'false')) {
            $u = currentUser();
            $sb->from('approval_requests')->insert([
                'school_id'       => $sid,
                'action_type'     => 'cancel_invoice',
                'target_type'     => 'invoice',
                'target_id'       => $invId,
                'payload'         => json_encode(['reason' => $reason]),
                'status'          => 'pending',
                'requested_by'    => $u['email'] ?? null,
                'requested_by_id' => $u['id'] ?? null,
            ]);
            auditLog('approval_requested', 'invoice', $invId, ['action' => 'cancel_invoice', 'reason' => $reason]);
            flash('success', 'Cancellation sent for approval — an administrator must approve it.');
            redirect('fees/invoices');
        }

        $sb->from('invoices')->eq('id', $invId)->eq('school_id', $sid)->update(['status' => 'cancelled', 'updated_at' => date('c')]);
        auditLog('cancel', 'invoice', $invId, $reason !== '' ? ['reason' => $reason] : null);
        flash('success', 'Invoice cancelled.');
        redirect('fees/invoices');
    }

    // Issue all visible drafts — flips status from draft → unpaid in bulk
    if ($action === 'issue_drafts') {
        $invIds = $_POST['invoice_ids'] ?? [];
        if (empty($invIds)) {
            flash('error', 'No drafts selected to issue.');
            redirect('fees/invoices?status=draft');
        }
        // BUG FIX: drafts can already have paid_amount > 0 from credit auto-applied
        // during bulk generation (migration 059 RPC). If we naively set status='unpaid',
        // an invoice that's actually fully paid by credit ends up labelled "unpaid"
        // and the parent gets billed for money already settled. Compute the right
        // status per invoice based on its existing paid_amount vs amount.
        $issued = 0;
        $now = date('c');
        foreach ($invIds as $invId) {
            // Read current amount + paid_amount so we can pick the correct status
            $cur = $sb->from('invoices')
                ->select('amount,paid_amount')
                ->eq('id', $invId)->eq('school_id', $sid)->eq('status', 'draft')
                ->single()->execute();
            $row = $cur['data'][0] ?? null;
            if (!$row) continue; // already issued, cancelled, or doesn't exist

            $amount = (float)($row['amount']      ?? 0);
            $paid   = (float)($row['paid_amount'] ?? 0);

            if ($paid >= $amount && $amount > 0) {
                $newStatus = 'paid';
            } elseif ($paid > 0) {
                $newStatus = 'partial';
            } else {
                $newStatus = 'unpaid';
            }

            $r = $sb->from('invoices')
                ->eq('id', $invId)->eq('school_id', $sid)->eq('status', 'draft')
                ->update(['status' => $newStatus, 'issued_at' => $now, 'updated_at' => $now]);
            if (empty($r['error']) && !empty($r['data'])) $issued++;
        }
        auditLog('issue_drafts', 'invoice_batch', null, ['count' => $issued]);
        flash('success', $issued . ' draft(s) issued. Now visible to parents and ready for payment.');
        redirect('fees/invoices?status=unpaid');
    }

    // Issue ONE draft invoice → compute the correct status from its current
    // paid_amount (credit may have been auto-applied during bulk generation).
    if ($action === 'issue_invoice') {
        $invId = input('invoice_id');
        $cur = $sb->from('invoices')->select('amount,paid_amount')
            ->eq('id', $invId)->eq('school_id', $sid)->eq('status', 'draft')
            ->single()->execute();
        $row = $cur['data'][0] ?? null;
        if (!$row) {
            flash('error', 'Invoice not found or already issued.');
        } else {
            $amount = (float)($row['amount']      ?? 0);
            $paid   = (float)($row['paid_amount'] ?? 0);
            $newStatus = ($paid >= $amount && $amount > 0) ? 'paid'
                       : ($paid > 0 ? 'partial' : 'unpaid');
            $now = date('c');
            $sb->from('invoices')->eq('id', $invId)->eq('school_id', $sid)->eq('status', 'draft')
                ->update(['status' => $newStatus, 'issued_at' => $now, 'updated_at' => $now]);
            auditLog('issue', 'invoice', $invId, ['new_status' => $newStatus]);
            flash('success', $newStatus === 'paid'
                ? 'Invoice issued. It was already covered by credit and is now fully paid.'
                : 'Invoice issued. It is now visible to the parent and ready for payment.');
        }
        redirect('fees/invoices' . ($filterStatus ? '?status=' . urlencode($filterStatus) : ''));
    }

    // Add a manual fee line to a DRAFT invoice. Primary use: opening balances
    // carried over from an old/previous system (e.g. "Balance brought forward"),
    // and ad-hoc charges (fines, replacement books, trips). DRAFT-ONLY on
    // purpose — once an invoice is issued the parent has seen the total, so we
    // never let it change underneath them; issue a fresh charge instead.
    if ($action === 'add_item') {
        $invId = input('invoice_id');
        $desc  = trim((string)input('item_description'));
        $amt   = round((float)input('item_amount'), 2);

        if ($desc === '' || $amt <= 0) {
            flash('error', 'Enter a description and a positive amount for the fee line.');
            redirect('fees/invoices');
        }
        // Must belong to THIS school (tenant-scoped) and be in an editable
        // state: draft, or issued-but-unpaid/partial/overdue. Never paid,
        // cancelled, or carried_forward — those are closed or have receipts.
        $cur = $sb->from('invoices')->select('id,status')
            ->eq('id', $invId)->eq('school_id', $sid)->single()->execute();
        $invRow = $cur['data'][0] ?? null;
        if (!$invRow || in_array($invRow['status'] ?? '', ['paid', 'cancelled', 'carried_forward'], true)) {
            flash('error', 'Invoice not found or not editable (paid/cancelled invoices cannot be changed).');
            redirect('fees/invoices');
        }
        $sb->from('invoice_items')->insert([
            'invoice_id'  => $invId,
            'description' => $desc,
            'amount'      => $amt,
        ]);
        // Recompute the invoice total from ALL its items so discount/contra
        // lines stay correct — never trust the cached amount.
        $itemsRes = $sb->from('invoice_items')->select('amount')->eq('invoice_id', $invId)->execute();
        $newTotal = 0.0;
        foreach (($itemsRes['data'] ?? []) as $it) $newTotal += (float)$it['amount'];
        if ($newTotal < 0) $newTotal = 0.0;
        $sb->from('invoices')->eq('id', $invId)->eq('school_id', $sid)
            ->update(['amount' => round($newTotal, 2), 'updated_at' => date('c')]);
        auditLog('add_item', 'invoice', $invId, ['description' => $desc, 'amount' => $amt, 'status' => $invRow['status'] ?? '']);
        flash('success', 'Added "' . $desc . '" (' . money($amt) . '). New invoice total: ' . money($newTotal) . '.');
        redirect('fees/invoices' . ($filterStatus ? '?status=' . urlencode($filterStatus) : ''));
    }

    // Remove a fee line from an editable invoice (e.g. a parent opts a child
    // out of a fee already invoiced). Same editable rule as add: never on
    // paid/cancelled/carried_forward.
    if ($action === 'remove_item') {
        $invId  = input('invoice_id');
        $itemId = input('item_id');
        $cur = $sb->from('invoices')->select('id,status,reference,paid_amount')
            ->eq('id', $invId)->eq('school_id', $sid)->single()->execute();
        $invRow = $cur['data'][0] ?? null;
        if (!$invRow || in_array($invRow['status'] ?? '', ['paid', 'cancelled', 'carried_forward'], true)) {
            flash('error', 'Invoice not found or not editable (paid/cancelled invoices cannot be changed).');
            redirect('fees/invoices');
        }
        // FRAUD CONTROL: once ANY money has been paid on the invoice, its lines
        // are frozen — you cannot shrink an invoice a parent has started paying.
        // (That is the classic "take the cash, then reduce the bill" move.) To
        // reduce what they owe after a payment, record a credit/refund instead.
        if ((float)($invRow['paid_amount'] ?? 0) > 0) {
            flash('error', 'Lines are locked — this invoice has a payment on it. Issue a credit note (Fees → Credit Notes) to reduce the bill, or cancel and re-issue if unpaid.');
            redirect('fees/invoices' . ($filterStatus ? '?status=' . urlencode($filterStatus) : ''));
        }
        // Capture WHAT is being removed BEFORE deleting — so the audit trail
        // records the description + value, not just an opaque id (fraud review).
        $itPre  = $sb->from('invoice_items')->select('description,amount')
            ->eq('id', $itemId)->eq('invoice_id', $invId)->single()->execute();
        $itDesc = $itPre['data'][0]['description'] ?? '(unknown)';
        $itAmt  = (float)($itPre['data'][0]['amount'] ?? 0);
        // Delete the line, scoped to this invoice (fail closed on cross-invoice ids).
        $sb->from('invoice_items')->eq('id', $itemId)->eq('invoice_id', $invId)->delete();
        // Recompute the invoice total from remaining items.
        $itemsRes = $sb->from('invoice_items')->select('amount')->eq('invoice_id', $invId)->execute();
        $newTotal = 0.0;
        foreach (($itemsRes['data'] ?? []) as $it) $newTotal += (float)$it['amount'];
        if ($newTotal < 0) $newTotal = 0.0;
        $sb->from('invoices')->eq('id', $invId)->eq('school_id', $sid)
            ->update(['amount' => round($newTotal, 2), 'updated_at' => date('c')]);
        auditLog('remove_item', 'invoice', $invId, [
            'reference'   => $invRow['reference'] ?? null,
            'removed'     => $itDesc,
            'amount'      => $itAmt,
            'status'      => $invRow['status'] ?? '',
            'was_paid'    => (float)($invRow['paid_amount'] ?? 0),  // flag: removed after money came in
            'new_total'   => $newTotal,
        ]);
        flash('success', 'Line removed. New invoice total: ' . money($newTotal) . '.');
        redirect('fees/invoices' . ($filterStatus ? '?status=' . urlencode($filterStatus) : ''));
    }

    // Collect payment — atomic via record_payment RPC (migration 058).
    if ($action === 'pay') {
        $invoiceId = input('invoice_id');
        $amount    = (float)input('amount');
        $method    = input('method') ?: 'cash';
        $transRef  = trim(input('transaction_ref'));
        $date      = input('payment_date') ?: date('Y-m-d');

        if (!$invoiceId || $amount <= 0) {
            flash('error', 'Please enter a valid amount.');
            redirect('fees/invoices');
        }
        if ($transRef === '') {
            flash('error', 'A reference or receipt number is required for every payment.');
            redirect('fees/invoices');
        }

        $result = recordInvoicePayment($invoiceId, $amount, $method, $transRef, $date);

        if (!$result['success']) {
            flash('error', $result['error']);
            redirect('fees/invoices');
        }

        // Build a rich success message. Stay on /fees/invoices instead of
        // hijacking the user into the print receipt — they may want to record
        // another payment, look something up, or just review. The receipt is
        // one click away via the flash link button.
        $msg = 'Payment of ' . money($amount) . ' recorded.';
        if ($result['invoice_status'] === 'paid') {
            $msg .= ' Invoice now fully paid.';
        } elseif (!empty($result['balance'])) {
            $msg .= ' Remaining balance: ' . money((float)$result['balance']) . '.';
        }
        if ($result['overpayment'] > 0) {
            $msg .= ' Overpayment of ' . money($result['overpayment'])
                  . ' added to the student\'s credit balance — it will apply to future invoices.';
        }

        if ($result['payment_id']) {
            flashLink('success', $msg,
                baseUrl('fees/receipt?id=' . $result['payment_id']),
                'View Receipt');
        } else {
            flash('success', $msg);
        }
        redirect('fees/invoices');
    }
}

// ── Dashboard stats — computed over the FULL filtered set ($statsRows),
//    not the visible page. This is the whole point of the refactor: the
//    cards above the table now match reality even when there are 5,000+
//    matching invoices.
$feeStatTotal   = $totalCount;
$feeStatPaid    = 0;
$feeStatUnpaid  = 0;
$feeStatPartial = 0;
$feeStatOverdue = 0;
$feeStatDraft   = 0;
$feeTotalAmount = 0;   // money actually billed (excludes drafts and cancelled)
$feeCollected   = 0;
$feeDraftAmount = 0;   // money still sitting in unissued drafts
$feePending     = 0;

foreach ($statsRows as $inv) {
    $amt  = (float)($inv['amount'] ?? 0);
    $paid = (float)($inv['paid_amount'] ?? 0);
    $st   = $inv['status'] ?? '';

    // Drafts are not yet billed — keep them separate, do not roll them into Billed/Pending.
    if ($st === 'draft') {
        $feeStatDraft++;
        $feeDraftAmount += $amt;
        continue;
    }
    if ($st === 'cancelled') continue;

    $feeTotalAmount += $amt;
    $feeCollected   += $paid;

    if ($st === 'paid')         $feeStatPaid++;
    elseif ($st === 'partial')  $feeStatPartial++;
    elseif ($st === 'overdue')  $feeStatOverdue++;
    elseif ($st === 'unpaid')   $feeStatUnpaid++;
}
$feePending = $feeTotalAmount - $feeCollected;

require __DIR__ . '/../../includes/layout-top.php';
?>

<!-- ── Mini Dashboard ─────────────────────────────────── -->
<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($feeStatTotal) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Total Invoices</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($feeStatPaid) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Paid</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($feeStatUnpaid + $feeStatPartial) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Unpaid / Partial</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($feeStatOverdue) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Overdue</p>
            </div>
        </div>
    </div>
</div>

<!-- ── Financial Summary ──────────────────────────────── -->
<div class="grid grid-cols-2 sm:grid-cols-<?= $feeStatDraft > 0 ? '4' : '3' ?> gap-3 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-1">
            <div class="w-2 h-2 rounded-full bg-gray-400"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Billed</span>
        </div>
        <p class="text-[22px] font-bold text-gray-900 tracking-tight"><?= money($feeTotalAmount) ?></p>
        <p class="text-[10px] text-gray-400 mt-0.5">Issued invoices only</p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-1">
            <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Collected</span>
        </div>
        <p class="text-[22px] font-bold text-emerald-600 tracking-tight"><?= money($feeCollected) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-1">
            <div class="w-2 h-2 rounded-full bg-red-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</span>
        </div>
        <p class="text-[22px] font-bold text-red-600 tracking-tight"><?= money($feePending) ?></p>
    </div>
    <?php if ($feeStatDraft > 0): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-3 mb-1">
            <div class="w-2 h-2 rounded-full bg-blue-500"></div>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">In Draft</span>
        </div>
        <p class="text-[22px] font-bold text-blue-600 tracking-tight"><?= money($feeDraftAmount) ?></p>
        <p class="text-[10px] text-gray-400 mt-0.5"><?= $feeStatDraft ?> not yet issued</p>
    </div>
    <?php endif; ?>
</div>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Invoices</h1>
        <p class="text-sm text-gray-500 mt-1">
            <?= number_format($totalCount) ?> invoice<?= $totalCount === 1 ? '' : 's' ?>
            <?php if ($totalCount > $perPage): ?>
                · <span class="text-gray-400">showing <?= $offset + 1 ?>&ndash;<?= min($offset + $perPage, $totalCount) ?></span>
            <?php endif; ?>
        </p>
    </div>
    <div class="flex gap-2">
        <a href="<?= baseUrl('fees/bulk-print') ?>" target="_blank" rel="noopener" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Bulk Print
        </a>
        <a href="<?= baseUrl('fees/invoices/generate') ?>" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
            Generate Invoices
        </a>
    </div>
</div>

<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('fees/invoices') ?>" class="flex flex-wrap items-center gap-3">
        <label class="text-sm font-medium text-gray-600">Status:</label>
        <select name="status" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <option value="">All</option>
            <option value="draft"<?= selectedIf($filterStatus, 'draft') ?>>Draft</option>
            <option value="unpaid"<?= selectedIf($filterStatus, 'unpaid') ?>>Unpaid</option>
            <option value="partial"<?= selectedIf($filterStatus, 'partial') ?>>Partial</option>
            <option value="paid"<?= selectedIf($filterStatus, 'paid') ?>>Paid</option>
            <option value="overdue"<?= selectedIf($filterStatus, 'overdue') ?>>Overdue</option>
            <option value="carried_forward"<?= selectedIf($filterStatus, 'carried_forward') ?>>Carried forward</option>
            <option value="cancelled"<?= selectedIf($filterStatus, 'cancelled') ?>>Cancelled</option>
        </select>
        <label class="text-sm font-medium text-gray-600 ml-2">Class:</label>
        <select name="class_id" onchange="this.form.submit()" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <option value="">All</option>
            <?php foreach ($classes as $c): ?>
                <option value="<?= e($c['id']) ?>"<?= selectedIf($filterClass, $c['id']) ?>><?= e($c['name']) ?></option>
            <?php endforeach; ?>
        </select>
        <label class="text-sm font-medium text-gray-600 ml-2">Search:</label>
        <input type="text" name="q" value="<?= e($filterQ) ?>" placeholder="Student name"
            class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none w-44">
        <button type="submit"
            class="px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
            Search
        </button>
        <?php if ($filterQ !== ''): ?>
            <a href="<?= baseUrl('fees/invoices') . '?' . http_build_query(array_filter(['status' => $filterStatus, 'class_id' => $filterClass])) ?>"
               class="text-xs text-gray-500 hover:text-emerald-600">Clear search</a>
        <?php endif; ?>
    </form>
</div>

<?php
// Drafts on THIS PAGE — surface a banner so the Issue action is always
// findable, regardless of which status filter is selected.
$draftsOnPage = array_values(array_filter($invoices, fn($i) => ($i['status'] ?? '') === 'draft'));
$draftPageCount = count($draftsOnPage);
?>
<?php if ($draftPageCount > 0): ?>
<div class="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-blue-800">
        <strong><?= $draftPageCount ?></strong> draft invoice<?= $draftPageCount === 1 ? '' : 's' ?> on this page — drafts aren't visible to parents and can't be paid until they're issued.
    </p>
    <form method="POST" onsubmit="return confirm('Issue <?= $draftPageCount ?> draft(s) on this page? Once issued, they appear to parents and only credit notes can adjust them.')">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="issue_drafts">
        <?php foreach ($draftsOnPage as $d): ?>
            <input type="hidden" name="invoice_ids[]" value="<?= e($d['id']) ?>">
        <?php endforeach; ?>
        <button type="submit" class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition whitespace-nowrap">
            Issue all <?= $draftPageCount ?>
        </button>
    </form>
</div>
<?php endif; ?>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Reference</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Paid</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Balance</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($invoices)): ?>
                <tr><td colspan="8" class="px-4 py-12 text-center text-gray-400">No invoices found</td></tr>
            <?php else: ?>
                <?php foreach ($invoices as $inv): ?>
                    <?php
                    $s = $studentMap[$inv['student_id'] ?? ''] ?? null;
                    $total   = (float)($inv['amount'] ?? 0);
                    $paid    = (float)($inv['paid_amount'] ?? 0);
                    $balance = $total - $paid;
                    $status  = $inv['status'] ?? 'unpaid';
                    $statusColors = [
                        'draft'           => 'bg-blue-50 text-blue-700',
                        'paid'            => 'bg-emerald-50 text-emerald-700',
                        'partial'         => 'bg-amber-50 text-amber-700',
                        'unpaid'          => 'bg-gray-100 text-gray-600',
                        'overdue'         => 'bg-red-50 text-red-700',
                        'carried_forward' => 'bg-purple-50 text-purple-700',
                        'cancelled'       => 'bg-gray-100 text-gray-400',
                    ];
                    ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($inv['reference'] ?? '—') ?></td>
                        <td class="px-4 py-3 text-gray-700"><?= $s ? e($s['first_name'] . ' ' . $s['last_name']) : '—' ?></td>
                        <td class="px-4 py-3 text-gray-600"><?= e($classMap[$s['current_class_id'] ?? ''] ?? '—') ?></td>
                        <td class="px-4 py-3 text-right font-medium"><?= money($total) ?></td>
                        <td class="px-4 py-3 text-right text-emerald-600"><?= money($paid) ?></td>
                        <td class="px-4 py-3 text-right <?= $balance > 0 ? 'text-red-600' : 'text-gray-600' ?> font-medium"><?= money($balance) ?></td>
                        <td class="px-4 py-3 text-center">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium <?= $statusColors[$status] ?? $statusColors['unpaid'] ?>">
                                <?= ucfirst($status) ?>
                            </span>
                        </td>
                        <td class="px-4 py-3 text-right flex items-center justify-end gap-2">
                            <?php
                            // Pay button only for invoices that are issued and not yet fully paid.
                            $canPay = in_array($status, ['unpaid', 'partial', 'overdue']);
                            $isDraft = $status === 'draft';
                            // Add fee: allowed on drafts AND issued-but-unpaid invoices
                            // (arrears / brought-forward balances / late charges).
                            // Never on paid/cancelled/carried_forward — money has
                            // moved or the invoice is closed.
                            $canAddFee = !in_array($status, ['paid', 'cancelled', 'carried_forward']);
                            ?>
                            <?php if ($isDraft): ?>
                                <form method="POST" class="inline" onsubmit="return confirm('Issue this invoice? It will become visible to the parent and ready for payment.')">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="issue_invoice">
                                    <input type="hidden" name="invoice_id" value="<?= e($inv['id']) ?>">
                                    <button type="submit" class="text-blue-600 hover:text-blue-800 text-xs font-medium">Issue</button>
                                </form>
                            <?php endif; ?>
                            <?php if ($canAddFee): ?>
                                <button type="button" onclick="openAddFee('<?= e(addslashes($inv['id'])) ?>','<?= e(addslashes($inv['reference'] ?? '')) ?>','<?= $s ? e(addslashes($s['first_name'] . ' ' . $s['last_name'])) : '' ?>',<?= $isDraft ? 'true' : 'false' ?>,<?= ((float)($inv['paid_amount'] ?? 0) > 0) ? 'true' : 'false' ?>)" class="text-amber-600 hover:text-amber-800 text-xs font-medium">Add fee</button>
                            <?php endif; ?>
                            <?php if ((float)($inv['paid_amount'] ?? 0) > 0 && !in_array($status, ['cancelled', 'carried_forward'], true)): ?>
                                <a href="<?= baseUrl('fees/credits?invoice_id=' . urlencode($inv['id'])) ?>" class="text-amber-700 hover:text-amber-900 text-xs font-medium">Issue credit</a>
                            <?php endif; ?>
                            <?php if ($canPay): ?>
                                <button onclick="openPayModal('<?= e(addslashes($inv['id'])) ?>','<?= e(addslashes($inv['reference'] ?? '')) ?>','<?= $s ? e(addslashes($s['first_name'] . ' ' . $s['last_name'])) : '' ?>',<?= $balance ?>,<?= (float)($s['credit_balance'] ?? 0) ?>,'<?= e(addslashes($s['family_id'] ?? '')) ?>')" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Pay</button>
                            <?php endif; ?>
                            <a href="<?= baseUrl('fees/invoice-print?id=' . e($inv['id'])) ?>" target="_blank" rel="noopener" class="text-blue-600 hover:text-blue-800 text-xs font-medium">Print</a>
                            <?php if (!in_array($status, ['paid', 'cancelled', 'carried_forward'])): ?>
                                <form method="POST" class="inline" onsubmit="return confirm('Cancel this invoice?')">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="cancel">
                                    <input type="hidden" name="invoice_id" value="<?= e($inv['id']) ?>">
                                    <button type="submit" class="text-red-500 hover:text-red-700 text-xs font-medium">Cancel</button>
                                </form>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
    <?php
    // Numbered pagination — preserve filters in the URL so prev/next stay scoped
    $pagBase = baseUrl('fees/invoices');
    $pagQs = [];
    if ($filterStatus) $pagQs[] = 'status='   . urlencode($filterStatus);
    if ($filterClass)  $pagQs[] = 'class_id=' . urlencode($filterClass);
    if ($filterQ)      $pagQs[] = 'q='        . urlencode($filterQ);
    if (!empty($pagQs)) $pagBase .= '?' . implode('&', $pagQs);
    echo paginationControls($page, $totalCount, $perPage, $pagBase);
    ?>
</div>

<!-- Collect Payment Modal -->
<div id="payModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Collect Payment</h3>
        <p class="text-sm text-gray-500 mb-2" id="payModalInfo"></p>
        <div id="payModalCredit" class="hidden mb-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs">
            <span class="text-emerald-700 font-medium">Student has credit balance: <span id="payCreditAmt"></span></span>
        </div>
        <div id="payModalFamily" class="hidden mb-3 p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-xs">
            <span class="text-blue-700">This student has siblings. </span>
            <a id="payFamilyLink" href="#" class="text-blue-600 font-medium hover:underline">Pay all family invoices together &rarr;</a>
        </div>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="pay">
            <input type="hidden" name="invoice_id" id="payInvId">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input type="number" name="amount" id="payAmount" step="0.01" min="0.01" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <p class="text-xs text-gray-400 mt-1">Balance: <span id="payBalance" class="font-medium text-gray-600"></span> <span class="text-gray-300">&middot;</span> Overpayment goes to student credit</p>
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
                <input type="text" name="transaction_ref" id="payTransRef" required placeholder="M-Pesa code, bank slip number, or paper receipt number" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <p class="text-xs text-gray-400 mt-1">The payer's proof of payment. The school's receipt number is generated automatically.</p>
            </div>

            <!-- M-Pesa STK Push (shows when method = mpesa and M-Pesa is configured) -->
            <div id="mpesaStkSection" class="hidden mb-4 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div class="flex items-center gap-2 mb-2">
                    <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                    <span class="text-sm font-semibold text-emerald-800">Send M-Pesa Prompt</span>
                </div>
                <div class="mb-2">
                    <label class="block text-xs font-medium text-emerald-700 mb-1">Parent's Phone Number</label>
                    <input type="text" id="mpesaPhone" placeholder="0712 345 678" class="w-full px-3 py-2 rounded-lg border border-emerald-300 focus:border-emerald-500 outline-none text-sm bg-white">
                </div>
                <button type="button" onclick="sendMpesaPrompt()" id="mpesaSendBtn" class="w-full px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">
                    Send PIN Prompt to Phone
                </button>
                <div id="mpesaResult" class="hidden mt-2 p-2 rounded text-xs"></div>
                <p class="text-xs text-emerald-600 mt-1">The parent will receive an "Enter M-Pesa PIN" prompt. Payment records automatically once confirmed.</p>
            </div>

            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Record Payment</button>
                <button type="button" onclick="document.getElementById('payModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Add-fee-to-draft modal -->
<div id="addFeeModal" class="hidden fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-1">Edit invoice lines</h3>
        <p id="addFeeInfo" class="text-sm text-gray-500 mb-3"></p>

        <!-- Current lines (removable). Populated by openAddFee from INVOICE_ITEMS. -->
        <div id="addFeeLines" class="mb-4 rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-48 overflow-y-auto"></div>

        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Add a line</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_item">
            <input type="hidden" name="invoice_id" id="addFeeInvId">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input type="text" name="item_description" id="addFeeDesc" required maxlength="120" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <p class="text-xs text-gray-400 mt-1">e.g. "Balance brought forward", "Trip", "Replacement book".</p>
            </div>
            <div class="mb-5">
                <label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input type="number" name="item_amount" id="addFeeAmount" step="0.01" min="0.01" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <p class="text-xs text-gray-400 mt-1">Added to this draft's total. You can add several lines before issuing.</p>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Add line</button>
                <button type="button" onclick="document.getElementById('addFeeModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
// Line items for this page's invoices — the Edit-lines modal reads these.
window.INVOICE_ITEMS = <?= jsonHtml($invoiceItems, JSON_UNESCAPED_SLASHES) ?>;
window.CSRF_TOKEN    = <?= jsonHtml(csrf()) ?>;
window.INVOICES_BASE = <?= jsonHtml(baseUrl('fees/invoices')) ?>;

// openAddFee() is defined in the always-loaded head script (layout-top.php)
// so it survives PJAX navigation — see note there.
function openPayModal(invoiceId, ref, student, balance, credit, familyId) {
    document.getElementById('payInvId').value = invoiceId;
    document.getElementById('payModalInfo').textContent = (ref || 'Invoice') + ' — ' + (student || 'Student');
    document.getElementById('payAmount').value = balance.toFixed(2);
    document.getElementById('payBalance').textContent = balance.toFixed(2);

    // Show credit balance if student has one
    const creditEl = document.getElementById('payModalCredit');
    if (credit > 0) {
        document.getElementById('payCreditAmt').textContent = credit.toFixed(2);
        creditEl.classList.remove('hidden');
    } else {
        creditEl.classList.add('hidden');
    }

    // Show family link if student has siblings
    const familyEl = document.getElementById('payModalFamily');
    if (familyId) {
        document.getElementById('payFamilyLink').href = '<?= baseUrl('fees/family') ?>?q=' + encodeURIComponent(familyId);
        familyEl.classList.remove('hidden');
    } else {
        familyEl.classList.add('hidden');
    }

    // Reset M-Pesa section
    document.getElementById('mpesaResult').classList.add('hidden');
    document.getElementById('mpesaPhone').value = '';
    toggleMpesaSection();

    document.getElementById('payModal').classList.remove('hidden');
}

// Show/hide M-Pesa STK section based on payment method.
// NOTE: `var` (not `const`) on purpose — this script is re-appended to the
// page on every PJAX navigation, and a top-level `const` throws
// "already declared" on the 2nd visit, killing the whole block (that's what
// broke the Add-fee button). `var` re-declares harmlessly.
var mpesaConfigured = <?= jsonHtml(!empty($settings ?? []) || true) ?>;
var methodSelect = document.querySelector('#payModal select[name=method]');
if (methodSelect) {
    methodSelect.addEventListener('change', toggleMpesaSection);
}

function toggleMpesaSection() {
    const sel = document.querySelector('#payModal select[name=method]');
    const section = document.getElementById('mpesaStkSection');
    if (sel && sel.value === 'mpesa') {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
    }
}

// Send M-Pesa STK Push
function sendMpesaPrompt() {
    const invoiceId = document.getElementById('payInvId').value;
    const phone     = document.getElementById('mpesaPhone').value.trim();
    const amount    = parseFloat(document.getElementById('payAmount').value) || 0;
    const resultEl  = document.getElementById('mpesaResult');
    const btn       = document.getElementById('mpesaSendBtn');

    if (!phone) {
        resultEl.className = 'mt-2 p-2 rounded text-xs bg-red-50 text-red-700 border border-red-200';
        resultEl.textContent = 'Please enter the parent\'s phone number.';
        resultEl.classList.remove('hidden');
        return;
    }
    if (amount <= 0) {
        resultEl.className = 'mt-2 p-2 rounded text-xs bg-red-50 text-red-700 border border-red-200';
        resultEl.textContent = 'Please enter a valid amount.';
        resultEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending prompt...';

    const formData = new FormData();
    formData.append('invoice_id', invoiceId);
    formData.append('phone', phone);
    formData.append('amount', amount);
    formData.append('_token', document.querySelector('input[name=_token]').value);

    fetch('<?= baseUrl('api/mpesa/stk-push') ?>', { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                resultEl.className = 'mt-2 p-2 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200';
                resultEl.textContent = data.message || 'M-Pesa prompt sent! Ask parent to enter their PIN.';
            } else {
                resultEl.className = 'mt-2 p-2 rounded text-xs bg-red-50 text-red-700 border border-red-200';
                resultEl.textContent = data.error || 'Failed to send M-Pesa prompt.';
            }
            resultEl.classList.remove('hidden');
        })
        .catch(() => {
            resultEl.className = 'mt-2 p-2 rounded text-xs bg-red-50 text-red-700 border border-red-200';
            resultEl.textContent = 'Network error. Please try again.';
            resultEl.classList.remove('hidden');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = 'Send PIN Prompt to Phone';
        });
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
