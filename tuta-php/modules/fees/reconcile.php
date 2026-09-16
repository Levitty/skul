<?php
/**
 * Payment Reconciliation — resolve M-Pesa payments that didn't auto-match.
 *
 * Lists unmatched C2B payments (mpesa_c2b_payments.status='unmatched'). For
 * each, an admin types the invoice reference OR admission number and applies
 * it; the shared reconcile core records the payment, advances the invoice, and
 * banks any overpayment as credit — then the row is marked matched.
 *
 * This is also the screen a future Co-op IPN / aggregator feed will drop its
 * unmatched tail into (same table pattern).
 */
$pageTitle = 'Reconcile Payments';
require_once __DIR__ . '/../../includes/payment-reconcile.php';
$sb  = new Supabase();
$sid = schoolId();

if (isPost() && verifyCsrf()) {
    $action = input('action');
    $cid    = input('c2b_id');

    // Load the unmatched payment (scoped to school).
    $row = null;
    if ($cid) {
        $r = $sb->from('mpesa_c2b_payments')
            ->select('id,trans_id,phone,amount,bill_ref,payer_name,status')
            ->eq('id', $cid)->eq('school_id', $sid)->single()->execute();
        $row = $r['data'][0] ?? null;
    }

    if (!$row) {
        flash('error', 'Payment not found.');
    } elseif ($action === 'apply') {
        $token = trim((string)input('token'));
        $invoice = reconcileMatchInvoice($sb, $sid, ['account_ref' => $token, 'phone' => $row['phone'] ?? '']);
        if (!$invoice) {
            flash('error', 'No open invoice found for "' . $token . '". Check the reference / admission number.');
        } else {
            $res = reconcileApplyPayment($sb, $sid, $invoice['id'], [
                'amount'    => (float)$row['amount'],
                'reference' => $row['trans_id'] ?? '',
                'method'    => 'mpesa',
                'phone'     => $row['phone'] ?? null,
                'actor'     => (currentUser()['email'] ?? 'staff'),
            ]);
            if (!empty($res['ok'])) {
                $sb->from('mpesa_c2b_payments')->eq('id', $cid)->eq('school_id', $sid)->update([
                    'status'       => 'matched',
                    'invoice_id'   => $invoice['id'],
                    'match_method' => 'manual',
                    'match_notes'  => 'Manually matched to ' . ($invoice['reference'] ?? $invoice['id']),
                ]);
                $extra = !empty($res['duplicate']) ? ' (was already recorded)' : (($res['overpayment'] ?? 0) > 0 ? ' · ' . money($res['overpayment']) . ' added as credit' : '');
                flash('success', 'Payment applied to ' . ($invoice['reference'] ?? 'invoice') . $extra . '.');
            } else {
                flash('error', $res['error'] ?? 'Could not apply payment.');
            }
        }
    } elseif ($action === 'resolve') {
        // Clear from the queue without recording (test payment, paid elsewhere, etc.)
        $sb->from('mpesa_c2b_payments')->eq('id', $cid)->eq('school_id', $sid)->update([
            'status'      => 'matched',
            'match_notes' => 'Manually resolved (no invoice) by ' . (currentUser()['email'] ?? 'staff'),
        ]);
        flash('success', 'Payment cleared from the queue.');
    }
    redirect('fees/reconcile');
}

// Unmatched queue.
$unmatched = $sb->from('mpesa_c2b_payments')
    ->select('id,trans_id,phone,amount,bill_ref,payer_name,created_at')
    ->eq('school_id', $sid)->eq('status', 'unmatched')
    ->order('created_at', false)->limit(300)->execute()['data'] ?? [];

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Reconcile Payments</h1>
    <p class="text-sm text-gray-500 mt-1">M-Pesa payments that couldn't be matched to a student automatically. Attach each to an invoice.</p>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-700">Unmatched <span class="text-gray-400 font-normal">(<?= count($unmatched) ?>)</span></h2>
    </div>
    <?php if (empty($unmatched)): ?>
        <div class="px-5 py-12 text-center text-gray-400 text-sm">Nothing to reconcile — every payment matched.</div>
    <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($unmatched as $p): ?>
                <div class="px-5 py-4">
                    <div class="flex items-start justify-between gap-4 flex-wrap">
                        <div class="min-w-0">
                            <p class="font-semibold text-gray-900"><?= money((float)$p['amount']) ?>
                                <span class="text-xs font-normal text-gray-400 ml-1"><?= e($p['payer_name'] ?: 'Unknown payer') ?></span>
                            </p>
                            <p class="text-xs text-gray-500 mt-1">
                                <?php if (!empty($p['phone'])): ?><span><?= e($p['phone']) ?></span><?php endif; ?>
                                <?php if (!empty($p['bill_ref'])): ?><span class="text-gray-300 mx-1">·</span>Ref typed: <span class="font-mono"><?= e($p['bill_ref']) ?></span><?php endif; ?>
                                <span class="text-gray-300 mx-1">·</span><?= e($p['trans_id']) ?>
                                <span class="text-gray-300 mx-1">·</span><?= formatDate($p['created_at']) ?>
                            </p>
                        </div>
                        <div class="flex items-end gap-2 flex-wrap">
                            <form method="POST" action="<?= baseUrl('fees/reconcile') ?>" class="flex items-end gap-2">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="apply">
                                <input type="hidden" name="c2b_id" value="<?= e($p['id']) ?>">
                                <div>
                                    <label class="block text-[11px] text-gray-500 mb-1">Invoice ref or admission no.</label>
                                    <input type="text" name="token" required value="<?= e($p['bill_ref'] ?? '') ?>" placeholder="INV-… or ADM…"
                                        class="px-3 py-1.5 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm w-44">
                                </div>
                                <button type="submit" class="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Apply</button>
                            </form>
                            <form method="POST" action="<?= baseUrl('fees/reconcile') ?>" onsubmit="return confirm('Clear this payment from the queue without recording it against an invoice?')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="resolve">
                                <input type="hidden" name="c2b_id" value="<?= e($p['id']) ?>">
                                <button type="submit" class="px-3 py-1.5 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Dismiss</button>
                            </form>
                        </div>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
