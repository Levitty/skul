<?php
/**
 * Approvals — maker-checker queue.
 *
 * Dangerous actions (currently invoice cancellation) that were requested while
 * approvals are enabled land here. A DIFFERENT administrator approves (which
 * executes the action) or rejects. The requester can't approve their own
 * request — that's the whole point of the control.
 */
$pageTitle = 'Approvals';
$sb  = new Supabase();
$sid = schoolId();

if (!isAdmin()) {
    flash('error', 'Only administrators can review approvals.');
    redirect('dashboard');
}

$me = currentUser();

if (isPost() && verifyCsrf()) {
    if (input('action') === 'decide') {
        $rid      = input('request_id');
        $decision = input('decision');
        $note     = trim((string)input('note'));

        // The decision is one governed Action: decide_approval_request (mig. 100)
        // atomically checks the invariant (maker ≠ checker, still pending),
        // executes the gated action, flips the request, and writes the audit
        // line — all in the database, so a half-applied decision is impossible.
        if (!in_array($decision, ['approve', 'reject'], true)) {
            flash('error', 'Invalid decision.');
            redirect('approvals');
        }

        $res = $sb->rpc('decide_approval_request', [
            'p_request_id'    => $rid,
            'p_school_id'     => $sid,
            'p_decision'      => $decision,
            'p_decider_id'    => $me['id']    ?? null,
            'p_decider_email' => $me['email'] ?? null,
            'p_note'          => $note !== '' ? $note : null,
        ]);

        // PostgREST surfaces a RAISE EXCEPTION as an HTTP 4xx in 'error'; the
        // RPC's own validation failures come back inside the JSONB payload.
        $payload = $res['data'] ?? null;
        if (!empty($res['error'])) {
            flash('error', 'Could not record the decision. Please try again.');
        } elseif (!is_array($payload) || empty($payload['success'])) {
            flash('error', $payload['error'] ?? 'The decision could not be applied.');
        } elseif (($payload['decision'] ?? '') === 'approved') {
            flash('success', 'Approved and applied.');
        } else {
            flash('success', 'Request rejected.');
        }
        redirect('approvals');
    }
}

$pending = $sb->from('approval_requests')->select('*')->eq('school_id', $sid)
    ->eq('status', 'pending')->order('requested_at', false)->limit(200)->execute()['data'] ?? [];
$recent  = $sb->from('approval_requests')->select('*')->eq('school_id', $sid)
    ->neq('status', 'pending')->order('requested_at', false)->limit(20)->execute()['data'] ?? [];

// Enrich invoice targets with their reference.
$invIds = [];
foreach (array_merge($pending, $recent) as $r) {
    if (($r['target_type'] ?? '') === 'invoice' && !empty($r['target_id'])) $invIds[] = $r['target_id'];
}
$invRef = [];
if (!empty($invIds)) {
    $rows = Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('invoices')->select('id,reference,amount,status'), 'id', array_values(array_unique($invIds)));
    foreach ($rows as $i) $invRef[$i['id']] = $i;
}

$actionLabel = [
    'cancel_invoice'     => 'Cancel invoice',
    'assign_discount'    => 'Assign discount',
    'void_payment'       => 'Void payment',
    'void_expense'       => 'Void expense',
    'apply_credit_note'   => 'Apply credit note',
    'reverse_credit_note' => 'Reverse credit note',
];
$reasonOf = function ($payload): string {
    $p = is_string($payload) ? json_decode($payload, true) : $payload;
    return is_array($p) ? trim((string)($p['reason'] ?? '')) : '';
};

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Approvals</h1>
    <p class="text-sm text-gray-500 mt-1">Requests from bursar / front office awaiting a school admin. Admins are not blocked by this queue for their own actions.</p>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
    <div class="px-5 py-4 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-700">Pending <span class="text-gray-400 font-normal">(<?= count($pending) ?>)</span></h2>
    </div>
    <?php if (empty($pending)): ?>
        <div class="px-5 py-12 text-center text-gray-400 text-sm">Nothing waiting for approval.</div>
    <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($pending as $r):
                $inv = $invRef[$r['target_id']] ?? null;
                $reason = $reasonOf($r['payload'] ?? null);
                $isMine = !empty($r['requested_by_id']) && ($me['id'] ?? '') === $r['requested_by_id'];
            ?>
                <div class="px-5 py-4">
                    <div class="flex items-start justify-between gap-4 flex-wrap">
                        <div class="min-w-0">
                            <p class="font-semibold text-gray-900">
                                <?= e($actionLabel[$r['action_type']] ?? ucfirst(str_replace('_', ' ', $r['action_type']))) ?>
                                <?php if ($inv): ?><span class="text-gray-500 font-normal">· <?= e($inv['reference'] ?? '') ?> (<?= money((float)($inv['amount'] ?? 0)) ?>)</span><?php endif; ?>
                            </p>
                            <p class="text-xs text-gray-500 mt-1">Requested by <?= e($r['requested_by'] ?: 'unknown') ?><span class="text-gray-300 mx-1">·</span><?= formatDate($r['requested_at']) ?></p>
                            <?php if ($reason !== ''): ?><p class="text-sm text-gray-700 mt-1.5 bg-gray-50 rounded-lg px-3 py-2"><span class="text-gray-400">Reason:</span> <?= e($reason) ?></p><?php endif; ?>
                        </div>
                        <div class="flex-shrink-0">
                            <?php if ($isMine): ?>
                                <p class="text-xs text-amber-600 max-w-[180px]">You requested this — another administrator must approve it.</p>
                            <?php else: ?>
                                <form method="POST" action="<?= baseUrl('approvals') ?>" class="flex flex-col gap-2 w-56">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="decide">
                                    <input type="hidden" name="request_id" value="<?= e($r['id']) ?>">
                                    <input type="text" name="note" placeholder="Note (optional)" class="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                                    <div class="flex gap-2">
                                        <button type="submit" name="decision" value="approve" onclick="return confirm('Approve and apply this action?')" class="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Approve</button>
                                        <button type="submit" name="decision" value="reject" class="flex-1 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">Reject</button>
                                    </div>
                                </form>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php if (!empty($recent)): ?>
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Recently decided</h2></div>
    <div class="divide-y divide-gray-50">
        <?php foreach ($recent as $r):
            $inv = $invRef[$r['target_id']] ?? null; ?>
            <div class="px-5 py-3 flex items-center justify-between gap-3">
                <div class="min-w-0 text-sm">
                    <span class="text-gray-900"><?= e($actionLabel[$r['action_type']] ?? $r['action_type']) ?></span>
                    <?php if ($inv): ?><span class="text-gray-400">· <?= e($inv['reference'] ?? '') ?></span><?php endif; ?>
                    <span class="text-xs text-gray-400 ml-1">by <?= e($r['requested_by'] ?: '—') ?></span>
                </div>
                <div class="text-xs flex-shrink-0">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full font-medium <?= $r['status'] === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700' ?>"><?= e(ucfirst($r['status'])) ?></span>
                    <span class="text-gray-400 ml-1"><?= e($r['decided_by'] ?? '') ?></span>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
