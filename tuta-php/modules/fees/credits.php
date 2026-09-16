<?php
/**
 * Credit notes — invoice adjustments that reduce what is owed or add
 * student credit_balance. No cash / M-Pesa refunds.
 */
$pageTitle = 'Credit Notes';
$sb  = new Supabase();
$sid = schoolId();
$user = currentUser();

$reasonCodes = [
    'transport_withdrawn' => 'Transport withdrawn',
    'billing_error'       => 'Billing error',
    'concession'          => 'Concession / goodwill',
    'payment_correction'  => 'Payment correction',
    'other'               => 'Other',
];

// Prefill from deep-link (e.g. transport helper or invoices Issue credit)
$prefillInvoiceId = trim((string)input('invoice_id'));
$prefillAmount    = input('amount');
$prefillReason    = trim((string)input('reason_code')) ?: 'billing_error';
$prefillDesc      = trim((string)input('description'));
$prefillItemId    = trim((string)input('item_id'));

if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'create' || $action === 'create_and_apply') {
        $invoiceId = input('invoice_id');
        $amount    = round((float)input('amount'), 2);
        $reason    = trim((string)input('reason'));
        $reasonCode = trim((string)input('reason_code')) ?: 'billing_error';
        $description = trim((string)input('description'));
        $itemId    = trim((string)input('invoice_item_id')) ?: null;

        if (!$invoiceId || $amount <= 0 || $reason === '') {
            flash('error', 'Invoice, positive amount, and reason are required.');
            redirect('fees/credits');
        }

        $inv = $sb->from('invoices')->select('id,student_id,reference,status,amount,paid_amount')
            ->eq('id', $invoiceId)->eq('school_id', $sid)->single()->execute();
        $invRow = $inv['data'][0] ?? null;
        if (!$invRow || empty($invRow['student_id'])) {
            flash('error', 'Invoice not found.');
            redirect('fees/credits');
        }

        if ($description === '') {
            $label = $reasonCodes[$reasonCode] ?? 'Credit';
            $description = 'Credit — ' . $label;
        }

        $created = createCreditNote(
            $invRow['student_id'],
            $invoiceId,
            $amount,
            $reason,
            $reasonCode,
            $description,
            $itemId
        );

        if (!$created['success']) {
            flash('error', $created['error']);
            redirect('fees/credits');
        }

        $cnId = $created['credit_note_id'];
        $needApproval = approvalRequired('require_approval_credit_note', 'false');
        $applyNow = ($action === 'create_and_apply') && !$needApproval;

        if ($needApproval && $action === 'create_and_apply') {
            $sb->from('approval_requests')->insert([
                'school_id'       => $sid,
                'action_type'     => 'apply_credit_note',
                'target_type'     => 'credit_note',
                'target_id'       => $cnId,
                'payload'         => json_encode([
                    'reason' => $reason,
                    'amount' => $amount,
                    'credit_number' => $created['credit_number'] ?? null,
                    'invoice_id' => $invoiceId,
                ]),
                'status'          => 'pending',
                'requested_by'    => $user['email'] ?? null,
                'requested_by_id' => $user['id'] ?? null,
            ]);
            auditLog('approval_requested', 'credit_note', $cnId, ['action' => 'apply_credit_note']);
            flash('success', 'Credit note ' . ($created['credit_number'] ?? '') . ' created and sent for approval.');
            redirect('fees/credits');
        }

        if ($applyNow) {
            $applied = applyCreditNote($cnId);
            if (!$applied['success']) {
                flash('error', 'Credit note created but apply failed: ' . $applied['error']);
                redirect('fees/credits');
            }
            $msg = 'Credit of ' . money($amount) . ' applied to invoice '
                 . ($invRow['reference'] ?? '') . '.';
            if (!empty($applied['amount_to_credit']) && (float)$applied['amount_to_credit'] > 0) {
                $msg .= ' ' . money((float)$applied['amount_to_credit'])
                      . ' added to student credit balance.';
            }
            flashLink('success', $msg,
                baseUrl('fees/invoice-print?id=' . urlencode($invoiceId)),
                'View invoice');
            redirect('fees/credits');
        }

        flash('success', 'Draft credit note ' . ($created['credit_number'] ?? '') . ' created.');
        redirect('fees/credits');
    }

    if ($action === 'apply') {
        $cnId = input('credit_note_id');
        if (!$cnId) {
            flash('error', 'Missing credit note.');
            redirect('fees/credits');
        }

        if (approvalRequired('require_approval_credit_note', 'false')) {
            $cn = $sb->from('credit_notes')->select('id,amount,reason,credit_number,invoice_id,status')
                ->eq('id', $cnId)->eq('school_id', $sid)->single()->execute();
            $cnRow = $cn['data'][0] ?? null;
            if (!$cnRow || !in_array($cnRow['status'] ?? '', ['draft', 'approved'], true)) {
                flash('error', 'Credit note not found or not applicable.');
                redirect('fees/credits');
            }
            $sb->from('approval_requests')->insert([
                'school_id'       => $sid,
                'action_type'     => 'apply_credit_note',
                'target_type'     => 'credit_note',
                'target_id'       => $cnId,
                'payload'         => json_encode([
                    'reason' => $cnRow['reason'] ?? '',
                    'amount' => $cnRow['amount'] ?? 0,
                    'credit_number' => $cnRow['credit_number'] ?? null,
                    'invoice_id' => $cnRow['invoice_id'] ?? null,
                ]),
                'status'          => 'pending',
                'requested_by'    => $user['email'] ?? null,
                'requested_by_id' => $user['id'] ?? null,
            ]);
            flash('success', 'Sent for approval — an administrator must apply this credit note.');
            redirect('fees/credits');
        }

        $applied = applyCreditNote($cnId);
        if (!$applied['success']) {
            flash('error', $applied['error']);
            redirect('fees/credits');
        }
        flash('success', 'Credit note applied.');
        redirect('fees/credits');
    }

    if ($action === 'void_draft') {
        $cnId = input('credit_note_id');
        $res = voidCreditNoteDraft((string)$cnId);
        if (!$res['success']) {
            flash('error', $res['error']);
        } else {
            flash('success', 'Draft credit note voided.');
        }
        redirect('fees/credits');
    }

    if ($action === 'reverse') {
        $cnId   = input('credit_note_id');
        $reason = trim((string)input('reverse_reason'));
        if (!$cnId || $reason === '') {
            flash('error', 'Credit note and reason are required.');
            redirect('fees/credits');
        }

        $cn = $sb->from('credit_notes')->select('id,amount,reason,credit_number,invoice_id,status')
            ->eq('id', $cnId)->eq('school_id', $sid)->single()->execute();
        $cnRow = $cn['data'][0] ?? null;
        if (!$cnRow || ($cnRow['status'] ?? '') !== 'applied') {
            flash('error', 'Only applied credit notes can be reversed.');
            redirect('fees/credits');
        }

        if (approvalRequired('require_approval_credit_note', 'false')) {
            $sb->from('approval_requests')->insert([
                'school_id'       => $sid,
                'action_type'     => 'reverse_credit_note',
                'target_type'     => 'credit_note',
                'target_id'       => $cnId,
                'payload'         => json_encode([
                    'reason'        => $reason,
                    'amount'        => $cnRow['amount'] ?? 0,
                    'credit_number' => $cnRow['credit_number'] ?? null,
                    'invoice_id'    => $cnRow['invoice_id'] ?? null,
                ]),
                'status'          => 'pending',
                'requested_by'    => $user['email'] ?? null,
                'requested_by_id' => $user['id'] ?? null,
            ]);
            auditLog('approval_requested', 'credit_note', $cnId, ['action' => 'reverse_credit_note']);
            flash('success', 'Reversal sent for approval — an administrator must confirm.');
            redirect('fees/credits');
        }

        $reversed = reverseAppliedCreditNote((string)$cnId, $reason);
        if (!$reversed['success']) {
            flash('error', $reversed['error']);
            redirect('fees/credits');
        }

        $invId = $reversed['invoice_id'] ?? ($cnRow['invoice_id'] ?? null);
        $msg = 'Credit note ' . ($reversed['credit_number'] ?? '')
             . ' reversed. Invoice balance is now ' . money((float)($reversed['balance'] ?? 0)) . '.';
        if ($invId) {
            flashLink('success', $msg, baseUrl('fees/invoice-print?id=' . urlencode($invId)), 'View invoice');
        } else {
            flash('success', $msg);
        }
        redirect('fees/credits');
    }
}

$notes = $sb->from('credit_notes')
    ->select('id,credit_number,invoice_id,student_id,amount,reason,reason_code,description,status,created_at,applied_at,amount_to_credit')
    ->eq('school_id', $sid)
    ->order('created_at', false)
    ->limit(200)
    ->execute()['data'] ?? [];

$invIds = array_values(array_unique(array_filter(array_column($notes, 'invoice_id'))));
$stuIds = array_values(array_unique(array_filter(array_column($notes, 'student_id'))));
$invMap = [];
$stuMap = [];
if (!empty($invIds)) {
    foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('invoices')->select('id,reference'), 'id', $invIds) as $i) {
        $invMap[$i['id']] = $i['reference'] ?? $i['id'];
    }
}
if (!empty($stuIds)) {
    foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('students')->select('id,first_name,last_name,admission_number'), 'id', $stuIds) as $s) {
        $stuMap[$s['id']] = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''))
            . (!empty($s['admission_number']) ? ' (' . $s['admission_number'] . ')' : '');
    }
}

// Open invoices for the create form (searchable select)
$openInvoices = Supabase::fetchAllPaged(
    fn($_sb) => $_sb->from('invoices')
        ->select('id,reference,student_id,amount,paid_amount,status')
        ->eq('school_id', $sid)
        ->in('status', ['draft', 'unpaid', 'partial', 'overdue', 'paid'])
        ->order('created_at', false)
);
$openStuIds = array_values(array_unique(array_filter(array_column($openInvoices, 'student_id'))));
foreach ($openStuIds as $oid) {
    if (!isset($stuMap[$oid])) {
        // filled below
    }
}
if (!empty($openStuIds)) {
    foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('students')->select('id,first_name,last_name,admission_number'), 'id', $openStuIds) as $s) {
        $stuMap[$s['id']] = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''))
            . (!empty($s['admission_number']) ? ' (' . $s['admission_number'] . ')' : '');
    }
}

// Prefill invoice items if deep-linked
$prefillItems = [];
if ($prefillInvoiceId !== '') {
    $prefillItems = $sb->from('invoice_items')->select('id,description,amount')
        ->eq('invoice_id', $prefillInvoiceId)->execute()['data'] ?? [];
}

$statusColors = [
    'draft'    => 'bg-gray-100 text-gray-700',
    'approved' => 'bg-blue-50 text-blue-700',
    'applied'  => 'bg-emerald-50 text-emerald-700',
    'reversed' => 'bg-amber-50 text-amber-800',
    'voided'   => 'bg-red-50 text-red-700',
];

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6 flex flex-wrap items-start justify-between gap-3">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Credit Notes</h1>
        <p class="text-sm text-gray-500 mt-1">Reduce a billed amount or add student credit after payment. No cash refunds — credit stays on the student’s account.</p>
    </div>
    <button type="button" onclick="document.getElementById('createCreditCard').classList.toggle('hidden')"
            class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">
        Issue credit
    </button>
</div>

<div id="createCreditCard" class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-6 <?= $prefillInvoiceId ? '' : 'hidden' ?>">
    <h2 class="text-sm font-semibold text-gray-800 mb-4">Issue credit note</h2>
    <form method="POST" class="space-y-4">
        <?= csrfField() ?>
        <input type="hidden" name="invoice_item_id" id="creditItemId" value="<?= e($prefillItemId) ?>">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Invoice *</label>
                <select name="invoice_id" id="creditInvoice" required
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <option value="">Select invoice…</option>
                    <?php foreach ($openInvoices as $oi):
                        $label = ($oi['reference'] ?? '') . ' — ' . ($stuMap[$oi['student_id'] ?? ''] ?? 'Student')
                               . ' · ' . money((float)($oi['amount'] ?? 0))
                               . ' (' . ($oi['status'] ?? '') . ')';
                    ?>
                        <option value="<?= e($oi['id']) ?>"<?= selectedIf($prefillInvoiceId, $oi['id']) ?>><?= e($label) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input type="number" name="amount" step="0.01" min="0.01" required
                       value="<?= $prefillAmount !== null && $prefillAmount !== '' ? e((string)$prefillAmount) : '' ?>"
                       class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Reason code</label>
                <select name="reason_code" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <?php foreach ($reasonCodes as $code => $label): ?>
                        <option value="<?= e($code) ?>"<?= selectedIf($prefillReason, $code) ?>><?= e($label) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Line description (on invoice)</label>
                <input type="text" name="description" value="<?= e($prefillDesc) ?>"
                       placeholder="Credit — Transport withdrawn"
                       class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Reason (required) *</label>
            <textarea name="reason" required rows="2" placeholder="Why is this credit being issued?"
                      class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"></textarea>
        </div>
        <?php if (!empty($prefillItems)): ?>
            <p class="text-xs text-gray-500">Invoice lines (for reference):</p>
            <ul class="text-xs text-gray-600 space-y-0.5 mb-2">
                <?php foreach ($prefillItems as $it): ?>
                    <li><?= e($it['description'] ?? '') ?> — <?= money((float)($it['amount'] ?? 0)) ?></li>
                <?php endforeach; ?>
            </ul>
        <?php endif; ?>
        <div class="flex flex-wrap gap-2">
            <button type="submit" name="action" value="create_and_apply"
                    class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">
                Create &amp; apply
            </button>
            <button type="submit" name="action" value="create"
                    class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                Save as draft
            </button>
        </div>
    </form>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Number</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Invoice</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Reason</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($notes)): ?>
                <tr><td colspan="8" class="px-4 py-12 text-center text-gray-400">No credit notes yet</td></tr>
            <?php else: foreach ($notes as $n):
                $st = $n['status'] ?? 'draft';
            ?>
                <tr class="hover:bg-gray-50/50">
                    <td class="px-4 py-3 font-mono text-xs text-gray-900"><?= e($n['credit_number'] ?? '—') ?></td>
                    <td class="px-4 py-3 text-gray-600"><?= formatDate($n['applied_at'] ?? $n['created_at'] ?? null) ?></td>
                    <td class="px-4 py-3">
                        <?php if (!empty($n['invoice_id'])): ?>
                            <a href="<?= baseUrl('fees/invoice-print?id=' . e($n['invoice_id'])) ?>" target="_blank" class="text-emerald-600 hover:text-emerald-800 font-medium"><?= e($invMap[$n['invoice_id']] ?? 'Invoice') ?></a>
                        <?php else: ?>—<?php endif; ?>
                    </td>
                    <td class="px-4 py-3 text-gray-700"><?= e($stuMap[$n['student_id'] ?? ''] ?? '—') ?></td>
                    <td class="px-4 py-3 text-right font-medium text-gray-900"><?= money((float)($n['amount'] ?? 0)) ?></td>
                    <td class="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate" title="<?= e($n['reason'] ?? '') ?>"><?= e($n['reason'] ?? ($reasonCodes[$n['reason_code'] ?? ''] ?? '—')) ?></td>
                    <td class="px-4 py-3">
                        <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium <?= $statusColors[$st] ?? 'bg-gray-100 text-gray-600' ?>"><?= e(ucfirst($st)) ?></span>
                    </td>
                    <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        <?php if (in_array($st, ['draft', 'approved'], true)): ?>
                            <form method="POST" class="inline" onsubmit="return confirm('Apply this credit note? It will adjust the invoice and/or student credit.')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="apply">
                                <input type="hidden" name="credit_note_id" value="<?= e($n['id']) ?>">
                                <button type="submit" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Apply</button>
                            </form>
                            <form method="POST" class="inline" onsubmit="return confirm('Void this draft?')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="void_draft">
                                <input type="hidden" name="credit_note_id" value="<?= e($n['id']) ?>">
                                <button type="submit" class="text-red-500 hover:text-red-700 text-xs font-medium">Void</button>
                            </form>
                        <?php elseif ($st === 'applied'): ?>
                            <form method="POST" class="inline"
                                  onsubmit="var r=prompt('Reason for reversing this credit note (required):'); if(!r||!r.trim()){alert('A reason is required.');return false;} this.querySelector('[name=reverse_reason]').value=r.trim(); return confirm('Reverse this credit? The invoice total will go back up and any student credit from this note will be pulled back.');">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="reverse">
                                <input type="hidden" name="credit_note_id" value="<?= e($n['id']) ?>">
                                <input type="hidden" name="reverse_reason" value="">
                                <button type="submit" class="text-amber-700 hover:text-amber-900 text-xs font-medium">Reverse</button>
                            </form>
                        <?php else: ?>
                            <span class="text-gray-300 text-xs">—</span>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; endif; ?>
        </tbody>
    </table>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
