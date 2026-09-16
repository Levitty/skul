<?php
/**
 * Parent portal — home. Lists the logged-in parent's children with a fee
 * balance and latest published result. Tapping a child opens their page.
 */
$pageTitle = 'My Children';
requireParent();

$sb       = new Supabase();
$children = parentChildren();
$childIds = array_column($children, 'id');

$balance    = []; // student_id => outstanding fee balance
$latestCard = []; // student_id => latest published report_cards row

$totalBilled = 0.0; // across all children (issued invoices only)
$totalPaid   = 0.0;

if (!empty($childIds)) {
    // Outstanding fees — one query for all children.
    $invRes = $sb->from('invoices')->select('student_id,amount,paid_amount,status')
        ->in('student_id', $childIds)->execute();
    foreach (($invRes['data'] ?? []) as $inv) {
        $st = $inv['status'] ?? '';
        // Parents never see drafts (not yet issued by the school) or cancelled.
        if ($st === 'cancelled' || $st === 'draft') continue;
        $k = $inv['student_id'];
        $balance[$k] = ($balance[$k] ?? 0) + ((float)$inv['amount'] - (float)$inv['paid_amount']);
        $totalBilled += (float)$inv['amount'];
        $totalPaid   += (float)$inv['paid_amount'];
    }

    // Latest PUBLISHED report card per child (drafts are never shown to parents).
    $rcRes = $sb->from('report_cards')
        ->select('student_id,term_id,overall_percentage,overall_grade,generated_at,status')
        ->in('student_id', $childIds)->eq('status', 'published')
        ->order('generated_at', false)->execute();
    foreach (($rcRes['data'] ?? []) as $rc) {
        $k = $rc['student_id'];
        if (!isset($latestCard[$k])) $latestCard[$k] = $rc; // first seen = latest
    }
}

$classMap = cachedClassMap();
$termMap  = [];
foreach (cachedTerms() as $t) $termMap[$t['id']] = $t['name'];

// Online payment is offered only when this school has configured M-Pesa.
require_once __DIR__ . '/../../includes/mpesa.php';
$mpesaConfigured = (new MpesaApi())->isConfigured();

require __DIR__ . '/../../includes/portal-top.php';
?>

<?php if (!empty($portalSchool['logo_url'])): ?>
<div class="flex flex-col items-center text-center mb-5">
    <img src="<?= e($portalSchool['logo_url']) ?>" alt="<?= e($portalSchool['name'] ?? 'School') ?>"
         class="w-20 h-20 rounded-2xl object-contain bg-white border border-gray-100 shadow-sm p-1.5 mb-2">
    <p class="font-bold text-gray-900"><?= e($portalSchool['name'] ?? 'School') ?></p>
    <p class="text-[11px] text-gray-400 uppercase tracking-wider">Parent Portal</p>
</div>
<?php endif; ?>

<?php
// Invited parents often have no name on file, so the account "name" can be
// their email — never show that raw. Greet by name only when it's a real name.
$pn = trim((string)($portalUser['name'] ?? ''));
$hasName = $pn !== '' && strpos($pn, '@') === false;
?>
<?php if ($hasName): ?>
    <p class="text-sm text-gray-500">Welcome back,</p>
    <h1 class="text-xl font-bold text-gray-900 mb-5"><?= e($pn) ?></h1>
<?php else: ?>
    <h1 class="text-xl font-bold text-gray-900 mb-0.5">Welcome back</h1>
    <p class="text-sm text-gray-500 mb-5">Here's an overview of your <?= count($children) === 1 ? 'child' : 'children' ?>.</p>
<?php endif; ?>

<?php if (empty($children)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-gray-500 text-sm">No children are linked to your account yet.</p>
        <p class="text-gray-400 text-xs mt-1">Please contact the school office.</p>
    </div>
<?php else: ?>
    <?php
    $totalOutstanding = 0.0;
    foreach ($children as $c) $totalOutstanding += max(0.0, (float)($balance[$c['id']] ?? 0));
    $childCount = count($children);
    ?>
    <!-- Summary across all children -->
    <div class="rounded-xl p-4 mb-5 text-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] bg-gradient-to-br <?= $totalOutstanding > 0 ? 'from-red-500 to-rose-600' : 'from-emerald-500 to-teal-600' ?>">
        <p class="text-xs/none opacity-80"><?= $totalOutstanding > 0 ? 'Total outstanding' : 'All fees' ?></p>
        <p class="text-2xl font-bold mt-1"><?= $totalOutstanding > 0 ? e(money($totalOutstanding)) : 'Cleared' ?></p>
        <div class="flex gap-5 mt-3 pt-3 border-t border-white/20">
            <div>
                <p class="text-[11px] uppercase tracking-wider opacity-70"><?= $childCount === 1 ? 'Child' : 'Children' ?></p>
                <p class="text-sm font-semibold"><?= (int)$childCount ?></p>
            </div>
            <?php if ($totalBilled > 0): ?>
            <div>
                <p class="text-[11px] uppercase tracking-wider opacity-70">Billed</p>
                <p class="text-sm font-semibold"><?= e(money($totalBilled)) ?></p>
            </div>
            <div>
                <p class="text-[11px] uppercase tracking-wider opacity-70">Paid</p>
                <p class="text-sm font-semibold"><?= e(money($totalPaid)) ?></p>
            </div>
            <?php endif; ?>
        </div>
    </div>

    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">My children</p>
    <div class="space-y-3">
        <?php foreach ($children as $c): ?>
            <?php
            $bal   = max(0.0, (float)($balance[$c['id']] ?? 0));
            $card  = $latestCard[$c['id']] ?? null;
            $cls   = $classMap[$c['current_class_id'] ?? ''] ?? '';
            $initials = strtoupper(substr($c['first_name'] ?? '', 0, 1) . substr($c['last_name'] ?? '', 0, 1));
            ?>
            <a href="<?= baseUrl('portal/child?id=' . $c['id']) ?>"
               class="block bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-emerald-200 transition">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        <?= e($initials ?: 'S') ?>
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="font-semibold text-gray-900 text-sm truncate"><?= e($c['first_name'] . ' ' . $c['last_name']) ?></p>
                        <p class="text-xs text-gray-500"><?= e($cls ?: 'Class not set') ?></p>
                    </div>
                    <svg class="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-gray-50 rounded-lg px-3 py-2">
                        <p class="text-[11px] text-gray-500">Fee balance</p>
                        <p class="text-sm font-semibold <?= $bal > 0 ? 'text-red-600' : 'text-emerald-600' ?>">
                            <?= $bal > 0 ? e(money($bal)) : 'Cleared' ?>
                        </p>
                        <?php if ($bal > 0 && $mpesaConfigured): ?>
                            <p class="text-[11px] font-medium text-emerald-600 mt-0.5">Tap to pay with M-Pesa &rarr;</p>
                        <?php endif; ?>
                    </div>
                    <div class="bg-gray-50 rounded-lg px-3 py-2">
                        <p class="text-[11px] text-gray-500">Latest result</p>
                        <p class="text-sm font-semibold text-gray-900">
                            <?php if ($card): ?>
                                <?= number_format((float)$card['overall_percentage'], 0) ?>% · <?= e($card['overall_grade'] ?? '') ?>
                            <?php else: ?>
                                <span class="text-gray-400 font-normal">Not published</span>
                            <?php endif; ?>
                        </p>
                        <?php if ($card && !empty($termMap[$card['term_id'] ?? ''])): ?>
                            <p class="text-[11px] text-gray-400 mt-0.5 truncate"><?= e($termMap[$card['term_id']]) ?></p>
                        <?php endif; ?>
                    </div>
                </div>
            </a>
        <?php endforeach; ?>
    </div>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/portal-bottom.php'; ?>
