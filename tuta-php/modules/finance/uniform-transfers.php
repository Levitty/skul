<?php
/**
 * Uniform → Transfers tab (render partial; included by finance/uniform.php).
 * Send → in transit (stock leaves source) → Receive at destination.
 *
 * The branches are always on screen, each with what it has on the shelf,
 * so the office can see who is short before deciding what to send. The
 * destination is picked by clicking a branch card, not a dropdown.
 *
 * Expects from the shell: $sb, $sid, $products, $variantsByProduct,
 * $siblings, $siblingMap.
 */

$schoolNameCache = [$sid => ($_SESSION['school_name'] ?? 'This school')];
foreach ($siblings as $s) $schoolNameCache[$s['id']] = $s['name'];

// ── What THIS school can send: active sizes with stock ────────────
$productNames = [];
foreach ($products as $p) $productNames[$p['id']] = $p['name'];
$sendVariants = [];
foreach ($products as $p) {
    if (empty($p['is_active'])) continue;
    foreach ($variantsByProduct[$p['id']] ?? [] as $v) {
        if (($v['is_active'] ?? true) && (int)($v['stock_quantity'] ?? 0) > 0) $sendVariants[] = $v;
    }
}

// ── What each SIBLING has on the shelf ────────────────────────────
$branchStock = [];   // school_id => ['units','sizes','low','out','items'=>[name => units]]
$sibIds = array_keys($siblingMap);
if (!empty($sibIds)) {
    foreach ($sibIds as $bid) $branchStock[$bid] = ['units' => 0, 'sizes' => 0, 'low' => 0, 'out' => 0, 'items' => []];
    $sibProducts = Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('uniform_products')->select('id,school_id,name,is_active'), 'school_id', $sibIds);
    $spById = [];
    foreach ($sibProducts as $p) if (!empty($p['is_active'])) $spById[$p['id']] = $p;
    if (!empty($spById)) {
        foreach (Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('uniform_variants')->select('product_id,size,stock_quantity,reorder_level,is_active'),
            'product_id', array_keys($spById)) as $v) {
            if (!($v['is_active'] ?? true)) continue;
            $p = $spById[$v['product_id']]; $bid = $p['school_id'];
            $q = (int)($v['stock_quantity'] ?? 0); $rl = (int)($v['reorder_level'] ?? 0);
            $branchStock[$bid]['sizes']++;
            $branchStock[$bid]['units'] += $q;
            if ($q === 0) $branchStock[$bid]['out']++;
            elseif ($rl > 0 && $q <= $rl) $branchStock[$bid]['low']++;
            $branchStock[$bid]['items'][$p['name']] = ($branchStock[$bid]['items'][$p['name']] ?? 0) + $q;
        }
    }
}

// ── Transfers involving this school, either direction ─────────────
$cols = 'id,transfer_number,from_school_id,to_school_id,status,notes,sent_at,received_at,cancelled_at,created_at';
$out = $sb->from('stock_transfers')->select($cols)->eq('from_school_id', $sid)->order('created_at', false)->limit(50)->execute()['data'] ?? [];
$in  = $sb->from('stock_transfers')->select($cols)->eq('to_school_id',   $sid)->order('created_at', false)->limit(50)->execute()['data'] ?? [];
$byId = [];
foreach (array_merge($out, $in) as $t) $byId[$t['id']] = $t;
$transfers = array_values($byId);
usort($transfers, fn($a, $b) => strcmp($b['sent_at'] ?? $b['created_at'] ?? '', $a['sent_at'] ?? $a['created_at'] ?? ''));

$itemsByTransfer = [];
$transferIds = array_column($transfers, 'id');
if (!empty($transferIds)) {
    foreach (Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('stock_transfer_items')->select('id,transfer_id,product_name,size,quantity'),
        'transfer_id', $transferIds
    ) as $it) $itemsByTransfer[$it['transfer_id']][] = $it;
}
$needNames = [];
foreach ($transfers as $t) {
    foreach ([$t['from_school_id'] ?? '', $t['to_school_id'] ?? ''] as $oid) {
        if ($oid && !isset($schoolNameCache[$oid])) $needNames[$oid] = true;
    }
}
if (!empty($needNames)) {
    $nr = $sb->from('schools')->select('id,name')->in('id', array_keys($needNames))->execute();
    foreach (($nr['data'] ?? []) as $row) $schoolNameCache[$row['id']] = $row['name'];
}

$incoming = count(array_filter($transfers, fn($t) => ($t['status'] ?? '') === 'sent' && ($t['to_school_id'] ?? '') === $sid));
$statusColors = ['sent' => 'bg-amber-50 text-amber-800', 'received' => 'bg-emerald-50 text-emerald-700', 'cancelled' => 'bg-gray-100 text-gray-600'];
$canSend = !empty($sendVariants);
?>

<style>
.brc{cursor:pointer;transition:border-color .12s,box-shadow .12s}
.brc.on{border-color:#10b981;box-shadow:0 0 0 2px rgba(16,185,129,.18)}
.brc .tick{visibility:hidden}
.brc.on .tick{visibility:visible}
</style>

<?php if ($incoming > 0): ?>
<div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
    <strong><?= $incoming ?> transfer<?= $incoming === 1 ? '' : 's' ?> waiting for you to receive.</strong> Stock isn't in your catalogue until you click Receive below.
</div>
<?php endif; ?>

<form method="POST" id="sendForm" class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-6">
    <?= csrfField() ?>
    <input type="hidden" name="tab" value="transfers">
    <input type="hidden" name="action" value="send">
    <input type="hidden" name="to_school_id" id="toSchool" value="">

    <h2 class="text-sm font-semibold text-gray-800 mb-1">1. Where is it going?</h2>
    <p class="text-xs text-gray-500 mb-3">Your branches, with what each has on the shelf. Click one.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        <?php foreach ($siblings as $sib): $st = $branchStock[$sib['id']] ?? ['units' => 0, 'sizes' => 0, 'low' => 0, 'out' => 0, 'items' => []];
            arsort($st['items']); $top = array_slice($st['items'], 0, 3, true); ?>
        <div class="brc rounded-xl border border-gray-200 p-4 hover:bg-gray-50/60" data-id="<?= e($sib['id']) ?>" data-name="<?= e($sib['name']) ?>" onclick="pickBranch(this)" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pickBranch(this)}">
            <div class="flex items-start justify-between gap-2">
                <p class="text-sm font-semibold text-gray-900 leading-tight"><?= e($sib['name']) ?></p>
                <span class="tick text-emerald-600 text-sm font-bold flex-none"></span>
            </div>
            <?php if ($st['sizes'] === 0): ?>
                <p class="text-xs text-gray-400 mt-1.5">No uniform stock set up yet.</p>
            <?php else: ?>
                <p class="text-xs text-gray-600 mt-1.5"><b class="text-gray-900 tabular-nums"><?= number_format($st['units']) ?></b> units across <?= $st['sizes'] ?> size<?= $st['sizes'] === 1 ? '' : 's' ?></p>
                <?php if ($st['out'] > 0 || $st['low'] > 0): ?>
                    <p class="text-[11px] mt-1">
                        <?php if ($st['out'] > 0): ?><span class="inline-flex px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium"><?= $st['out'] ?> out of stock</span><?php endif; ?>
                        <?php if ($st['low'] > 0): ?><span class="inline-flex px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium ml-1"><?= $st['low'] ?> low</span><?php endif; ?>
                    </p>
                <?php endif; ?>
                <?php if ($top): ?>
                    <p class="text-[11px] text-gray-400 mt-1.5 truncate"><?= e(implode(' · ', array_map(fn($n, $u) => $n . ' ' . $u, array_keys($top), $top))) ?></p>
                <?php endif; ?>
            <?php endif; ?>
        </div>
        <?php endforeach; ?>
    </div>

    <h2 class="text-sm font-semibold text-gray-800 mb-1">2. What are you sending?</h2>
    <?php if (!$canSend): ?>
        <p class="text-xs text-gray-500 mb-2">Nothing on your shelf to send right now — every size here is at zero. <a href="<?= baseUrl('finance/uniform') ?>?tab=stock" class="text-emerald-700 font-medium hover:underline">Receive a delivery on the Stock tab</a> first.</p>
    <?php else: ?>
        <p class="text-xs text-gray-500 mb-3">Stock leaves here the moment you send and sits in transit until they click Receive. It lands in their catalogue matched by item name + size, created if missing.</p>
        <div class="flex items-center justify-between mb-2">
            <label class="block text-xs font-medium text-gray-600">Lines</label>
            <button type="button" onclick="addTransferLine()" class="text-xs font-medium text-emerald-600 hover:text-emerald-800">+ Add line</button>
        </div>
        <div id="transferLines" class="space-y-2 mb-4"></div>
        <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                <input type="text" name="notes" placeholder="e.g. XL sweaters for Term 3" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <button type="submit" id="sendBtn" disabled class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    onclick="return confirmSend();">Send to <span id="sendTo">…</span></button>
        </div>
        <template id="lineTpl">
            <div class="transfer-line" style="display:grid;grid-template-columns:1fr 6rem auto;gap:.5rem;align-items:center">
                <select name="variant_id[]" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                    <option value="">Item + size…</option>
                    <?php foreach ($sendVariants as $v): ?>
                        <option value="<?= e($v['id']) ?>" data-stock="<?= (int)$v['stock_quantity'] ?>"><?= e($productNames[$v['product_id']] ?? 'Item') ?> · <?= e($v['size']) ?> (<?= (int)$v['stock_quantity'] ?> here)</option>
                    <?php endforeach; ?>
                </select>
                <input type="number" name="quantity[]" min="1" value="1" required placeholder="Qty" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                <button type="button" onclick="this.closest('.transfer-line').remove()" class="text-red-500 text-xs font-medium px-2">Remove</button>
            </div>
        </template>
    <?php endif; ?>
</form>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Transfers</h2></div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Number</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">From → To</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Items</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Sent</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($transfers)): ?>
                    <tr><td colspan="6" class="px-4 py-12 text-center text-gray-400">No transfers yet.</td></tr>
                <?php else: foreach ($transfers as $t):
                    $items = $itemsByTransfer[$t['id']] ?? [];
                    $st = $t['status'] ?? '';
                    $isDest = ($t['to_school_id'] ?? '') === $sid;
                    $isSrc  = ($t['from_school_id'] ?? '') === $sid; ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-mono text-xs text-gray-900"><?= e($t['transfer_number'] ?? '') ?></td>
                        <td class="px-4 py-3 text-gray-700"><?= e($schoolNameCache[$t['from_school_id']] ?? 'School') ?> → <?= e($schoolNameCache[$t['to_school_id']] ?? 'School') ?></td>
                        <td class="px-4 py-3 text-gray-600 text-xs">
                            <?php if (empty($items)): ?>—<?php else: foreach ($items as $it): ?>
                                <div><?= e($it['product_name']) ?> · <?= e($it['size']) ?> ×<?= (int)$it['quantity'] ?></div>
                            <?php endforeach; endif; ?>
                        </td>
                        <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium <?= $statusColors[$st] ?? 'bg-gray-100 text-gray-600' ?>"><?= e(ucfirst($st)) ?></span></td>
                        <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap"><?= formatDate($t['sent_at'] ?? null) ?></td>
                        <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                            <?php if ($st === 'sent' && $isDest): ?>
                                <form method="POST" class="inline" onsubmit="return confirm('Receive this stock into your catalogue?')">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="tab" value="transfers">
                                    <input type="hidden" name="action" value="receive">
                                    <input type="hidden" name="transfer_id" value="<?= e($t['id']) ?>">
                                    <button type="submit" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Receive</button>
                                </form>
                            <?php endif; ?>
                            <?php if ($st === 'sent' && $isSrc): ?>
                                <form method="POST" class="inline" onsubmit="var r=prompt('Cancel reason (optional):'); this.querySelector('[name=cancel_reason]').value=r||''; return confirm('Cancel transfer and restore stock here?');">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="tab" value="transfers">
                                    <input type="hidden" name="action" value="cancel">
                                    <input type="hidden" name="transfer_id" value="<?= e($t['id']) ?>">
                                    <input type="hidden" name="cancel_reason" value="">
                                    <button type="submit" class="text-red-500 hover:text-red-700 text-xs font-medium">Cancel</button>
                                </form>
                            <?php endif; ?>
                            <?php if ($st !== 'sent'): ?><span class="text-gray-300 text-xs">—</span><?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
        </table>
    </div>
</div>

<script>
window.pickBranch = function (card) {
    document.querySelectorAll('.brc').forEach(function (c) { c.classList.toggle('on', c === card); });
    document.getElementById('toSchool').value = card.dataset.id;
    var to = document.getElementById('sendTo'); if (to) to.textContent = card.dataset.name;
    var btn = document.getElementById('sendBtn'); if (btn) btn.disabled = false;
    var lines = document.getElementById('transferLines');
    if (lines && !lines.children.length) window.addTransferLine();
};
window.addTransferLine = function () {
    var tpl = document.getElementById('lineTpl'), box = document.getElementById('transferLines');
    if (!tpl || !box) return;
    box.appendChild(tpl.content.cloneNode(true));
};
window.confirmSend = function () {
    if (!document.getElementById('toSchool').value) { alert('Pick a branch first.'); return false; }
    var n = 0, over = [];
    document.querySelectorAll('#transferLines .transfer-line').forEach(function (l) {
        var sel = l.querySelector('select'), q = parseInt(l.querySelector('input').value, 10) || 0, opt = sel.selectedOptions[0];
        if (opt && opt.value && q > 0) { n++; var s = parseInt(opt.getAttribute('data-stock'), 10) || 0; if (q > s) over.push(opt.textContent.trim() + ' — only ' + s + ' here'); }
    });
    if (n === 0) { alert('Add at least one line.'); return false; }
    if (over.length) { alert('Not enough stock:\n' + over.join('\n')); return false; }
    return confirm('Send ' + n + ' line' + (n === 1 ? '' : 's') + ' to ' + document.getElementById('sendTo').textContent + '? Stock leaves your inventory until received or cancelled.');
};
if (document.getElementById('transferLines')) window.addTransferLine();
</script>
