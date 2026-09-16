<?php
/**
 * Activity Log — "what changed", for the owner/director.
 *
 * Renders the (append-only) audit_logs in plain language so a school owner who
 * can't personally watch a front-office clerk can see, at a glance, the
 * sensitive money actions: payments recorded, invoices cancelled/deleted,
 * students deactivated, etc. This is the trust/anti-fraud layer.
 *
 * Read-only. The "Sensitive only" view filters to the actions worth watching.
 */
$pageTitle = 'Activity Log';
$sb  = new Supabase();
$sid = schoolId();

$view = input('view') ?: 'sensitive';
if (!in_array($view, ['all', 'sensitive', 'payments'], true)) $view = 'sensitive';
$search = trim((string)input('q'));

// Action metadata: label, dot colour, and whether it's "sensitive" (worth the
// owner's attention) and/or money-related.
$meta = [
    'login'            => ['Signed in', 'bg-gray-300', false, false],
    'create'           => ['Created', 'bg-blue-400', false, false],
    'update'           => ['Updated', 'bg-amber-400', true,  false],
    'save'             => ['Saved changes', 'bg-amber-400', true, false],
    'delete'           => ['Deleted', 'bg-red-500', true,  false],
    'cancel'           => ['Cancelled', 'bg-red-500', true,  true],
    'deactivate'       => ['Deactivated', 'bg-red-400', true, false],
    'bulk_deactivate'  => ['Bulk deactivated', 'bg-red-400', true, false],
    'revoke'           => ['Revoked access', 'bg-red-400', true, false],
    'invite'           => ['Invited a user', 'bg-blue-400', true, false],
    'issue'            => ['Issued invoice', 'bg-emerald-400', false, true],
    'issue_drafts'     => ['Issued invoices', 'bg-emerald-400', false, true],
    'generate'         => ['Generated invoices', 'bg-emerald-400', false, true],
    'bulk_generate'    => ['Generated invoices (bulk)', 'bg-emerald-400', false, true],
    'publish'          => ['Published results', 'bg-blue-400', false, false],
    'promote'          => ['Promoted students', 'bg-blue-400', false, false],
    'graduate'         => ['Graduated students', 'bg-blue-400', false, false],
    'roll_forward'     => ['Rolled forward', 'bg-blue-400', false, false],
    'repeat'           => ['Repeated student', 'bg-blue-400', false, false],
    'bulk_import'      => ['Imported students', 'bg-blue-400', false, false],
    'bulk_print_marked'=> ['Bulk printed', 'bg-gray-300', false, false],
    'mpesa_stk_push'   => ['Sent M-Pesa prompt', 'bg-emerald-400', false, true],
    'mpesa_payment'    => ['M-Pesa payment recorded', 'bg-emerald-500', true, true],
    'mpesa_c2b_payment'=> ['M-Pesa payment recorded', 'bg-emerald-500', true, true],
    'payment_reconciled'=> ['Payment reconciled', 'bg-emerald-500', true, true],
];
$sensitiveFallback = ['delete', 'cancel', 'deactivate', 'revoke']; // anything containing these is sensitive

// Pull recent log (append-only; newest first).
$logs = $sb->from('audit_logs')
    ->select('id,user_email,action,entity_type,entity_id,payload,created_at')
    ->eq('school_id', $sid)->order('created_at', false)->limit(400)->execute()['data'] ?? [];

// Filter per view + search (in PHP — keeps the action-category logic in one place).
$rows = [];
foreach ($logs as $l) {
    $action = $l['action'] ?? '';
    $m = $meta[$action] ?? null;
    $isSensitive = $m ? $m[2] : (bool)array_filter($sensitiveFallback, fn($s) => str_contains($action, $s));
    $isMoney     = $m ? $m[3] : false;

    if ($view === 'sensitive' && !$isSensitive && !$isMoney) continue;
    if ($view === 'payments' && !$isMoney) continue;

    if ($search !== '') {
        $hay = strtolower(($l['user_email'] ?? '') . ' ' . $action . ' ' . ($l['entity_type'] ?? '') . ' ' . json_encode($l['payload'] ?? ''));
        if (!str_contains($hay, strtolower($search))) continue;
    }
    $rows[] = $l + ['_meta' => $m, '_sensitive' => $isSensitive, '_money' => $isMoney];
}

// Pull a key detail out of the payload for the one-line summary.
$payloadSummary = function ($payload): string {
    $p = $payload;
    if (is_string($p)) { $d = json_decode($p, true); $p = is_array($d) ? $d : []; }
    if (!is_array($p)) return '';
    $bits = [];
    foreach (['amount', 'reference', 'email', 'reason', 'status', 'generated_count', 'overpayment'] as $k) {
        if (isset($p[$k]) && $p[$k] !== '' && $p[$k] !== null) {
            $v = is_scalar($p[$k]) ? (string)$p[$k] : json_encode($p[$k]);
            $label = $k === 'generated_count' ? 'count' : $k;
            $bits[] = $label . ': ' . $v;
        }
    }
    return implode(' · ', array_slice($bits, 0, 4));
};

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Activity Log</h1>
    <p class="text-sm text-gray-500 mt-1">Who did what, when. A tamper-evident record — the log can't be edited or deleted.</p>
</div>

<!-- Filters -->
<div class="flex flex-wrap items-center gap-3 mb-4">
    <div class="flex gap-2">
        <?php foreach (['sensitive' => 'Worth watching', 'payments' => 'Payments', 'all' => 'Everything'] as $k => $label):
            $active = $view === $k; ?>
            <a href="<?= baseUrl('activity') ?>?view=<?= e($k) ?><?= $search ? '&q=' . urlencode($search) : '' ?>"
               class="px-3 py-1.5 rounded-lg text-sm font-medium transition <?= $active ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50' ?>"><?= e($label) ?></a>
        <?php endforeach; ?>
    </div>
    <form method="GET" action="<?= baseUrl('activity') ?>" class="flex items-center gap-2">
        <input type="hidden" name="view" value="<?= e($view) ?>">
        <input type="text" name="q" value="<?= e($search) ?>" placeholder="Search email, amount, type…"
            class="px-3 py-1.5 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm w-56">
        <button type="submit" class="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Search</button>
    </form>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?php if (empty($rows)): ?>
        <div class="px-5 py-12 text-center text-gray-400 text-sm">Nothing logged for this view yet.</div>
    <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($rows as $l):
                $m = $l['_meta'];
                $label = $m ? $m[0] : ucfirst(str_replace('_', ' ', $l['action'] ?? 'action'));
                $dot   = $m ? $m[1] : 'bg-gray-300';
                $summary = $payloadSummary($l['payload'] ?? null);
            ?>
                <div class="px-5 py-3 flex items-start gap-3 <?= $l['_sensitive'] ? 'bg-red-50/30' : '' ?>">
                    <span class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 <?= $dot ?>"></span>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm text-gray-900">
                            <span class="font-medium"><?= e($label) ?></span>
                            <?php if (!empty($l['entity_type'])): ?><span class="text-gray-400"> · <?= e($l['entity_type']) ?></span><?php endif; ?>
                            <?php if ($l['_sensitive']): ?><span class="ml-1 text-[10px] font-semibold text-red-500 uppercase tracking-wide">watch</span><?php endif; ?>
                        </p>
                        <p class="text-xs text-gray-500 mt-0.5">
                            <?= e($l['user_email'] ?: 'system') ?>
                            <span class="text-gray-300 mx-1">·</span><?= formatDate($l['created_at']) ?>
                            <?php if ($summary): ?><span class="text-gray-300 mx-1">·</span><span class="text-gray-600"><?= e($summary) ?></span><?php endif; ?>
                        </p>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>
<p class="text-xs text-gray-400 mt-3">Showing the most recent activity (up to 400 events). "Worth watching" highlights cancellations, deletions, edits, access changes, and payments.</p>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
