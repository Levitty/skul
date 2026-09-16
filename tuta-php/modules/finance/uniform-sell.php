<?php
/**
 * Uniform → Sell tab (render partial; included by finance/uniform.php).
 * The till and the recent-sales list. All POST handling lives in the shell.
 *
 * Expects from the shell: $sb, $sid, $products, $variantsByProduct,
 * $siblings, $today, $thisMonth, $thisYear, $methodLabels.
 */

// Till options: active items with at least one active size.
$tillProducts = [];
foreach ($products as $p) {
    if (empty($p['is_active'])) continue;
    $vars = array_values(array_filter($variantsByProduct[$p['id']] ?? [], fn($v) => ($v['is_active'] ?? true)));
    if (!empty($vars)) $tillProducts[] = ['product' => $p, 'variants' => $vars];
}
$tillJson = [];
foreach ($tillProducts as $tp) {
    $sizes = [];
    foreach ($tp['variants'] as $v) {
        $sizes[] = [
            'id'    => $v['id'],
            'size'  => $v['size'],
            'price' => (float)($v['price'] ?? $tp['product']['base_price'] ?? 0),
            'stock' => (int)($v['stock_quantity'] ?? 0),
        ];
    }
    $tillJson[$tp['product']['id']] = ['name' => $tp['product']['name'], 'sizes' => $sizes];
}

// Sales + the learners they may be tagged to.
$sales = $sb->from('uniform_sales')
    ->select('id,sale_number,total_amount,sale_date,payment_method,student_id,customer_name,notes')
    ->eq('school_id', $sid)->order('sale_date', false)->order('created_at', false)->limit(200)->execute()['data'] ?? [];

$students = $sb->from('students')->select('id,first_name,last_name,admission_number')
    ->eq('school_id', $sid)->eq('status', 'active')->order('first_name')->limit(2000)->execute()['data'] ?? [];
$studentMap = [];
foreach ($students as $s) {
    $studentMap[$s['id']] = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''))
        . (!empty($s['admission_number']) ? ' (' . $s['admission_number'] . ')' : '');
}
$saleLabel = fn(array $sale): string => trim((string)($sale['notes'] ?? '')) !== '' ? $sale['notes'] : '—';

$totDay = $totMonth = $totYear = 0.0;
foreach ($sales as $s) {
    $amt = (float)($s['total_amount'] ?? 0);
    $d   = $s['sale_date'] ?? '';
    if ($d === $today)                   $totDay   += $amt;
    if (str_starts_with($d, $thisMonth)) $totMonth += $amt;
    if (str_starts_with($d, $thisYear))  $totYear  += $amt;
}
?>

<div class="flex items-center justify-end gap-2 mb-4 flex-wrap">
    <a href="<?= baseUrl('finance/uniform') ?>?tab=sell&export=csv" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Export</a>
    <button type="button" onclick="openModal('recordSaleModal')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">+ New Sale</button>
</div>

<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Today</p>
        <p class="text-lg font-bold text-emerald-700 mt-1"><?= money($totDay) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500"><?= date('M Y') ?></p>
        <p class="text-lg font-bold text-gray-900 mt-1"><?= money($totMonth) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Year (<?= $thisYear ?>)</p>
        <p class="text-lg font-bold text-gray-900 mt-1"><?= money($totYear) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Sellable items</p>
        <p class="text-lg font-bold text-gray-900 mt-1"><?= count($tillProducts) ?></p>
    </div>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Recent Sales (<?= count($sales) ?>)</h2></div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Sale #</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Item</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Student / Customer</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600">Method</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php if (empty($sales)): ?>
                    <tr><td colspan="7" class="px-4 py-12 text-center text-gray-400">No uniform sales yet.</td></tr>
                <?php else: foreach ($sales as $s): ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 text-gray-600 whitespace-nowrap"><?= formatDate($s['sale_date'] ?? null) ?></td>
                        <td class="px-4 py-3 text-gray-500 text-xs font-mono"><?= e($s['sale_number'] ?? '') ?></td>
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($saleLabel($s)) ?></td>
                        <td class="px-4 py-3 text-right font-bold text-emerald-700"><?= money((float)($s['total_amount'] ?? 0)) ?></td>
                        <td class="px-4 py-3 text-gray-600"><?= $s['student_id'] ? e($studentMap[$s['student_id']] ?? 'Unknown') : ($s['customer_name'] ? e($s['customer_name']) : '<span class="text-gray-400">Walk-in</span>') ?></td>
                        <td class="px-4 py-3 text-gray-600"><span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><?= e($methodLabels[$s['payment_method'] ?? 'cash'] ?? ucfirst($s['payment_method'] ?? '')) ?></span></td>
                        <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                            <a href="<?= baseUrl('finance/uniform-receipt?id=' . urlencode($s['id'])) ?>" target="_blank" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Receipt</a>
                            <form method="POST" class="inline" onsubmit="return confirm('Delete this sale? Stock will be restored for line items.')">
                                <?= csrfField() ?>
                                <input type="hidden" name="tab" value="sell">
                                <input type="hidden" name="action" value="delete_sale">
                                <input type="hidden" name="sale_id" value="<?= e($s['id']) ?>">
                                <button type="submit" class="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- New Sale -->
<div id="recordSaleModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-1">New Uniform Sale</h3>
        <?php if (empty($tillProducts)): ?>
            <p class="text-sm text-gray-500 mb-4">Add an item with sizes on the <strong>Stock</strong> tab first.</p>
            <a href="<?= baseUrl('finance/uniform') ?>?tab=stock" class="inline-block px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Go to Stock</a>
        <?php else: ?>
        <p class="text-xs text-gray-500 mb-4">Everything the customer is buying goes on one receipt. Add a line per item and size.</p>
        <form method="POST" onsubmit="return validateSale()">
            <?= csrfField() ?>
            <input type="hidden" name="tab" value="sell">
            <input type="hidden" name="action" value="record_sale">

            <div class="grid text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1" style="grid-template-columns:1.3fr 1.1fr 4.5rem 6rem auto;gap:.5rem">
                <span>Item</span><span>Size</span><span>Qty</span><span class="text-right">Total</span><span></span>
            </div>
            <div id="saleLines" class="space-y-2 mb-2"></div>
            <div class="flex items-center justify-between mb-4">
                <button type="button" onclick="addSaleLine()" class="text-sm font-medium text-emerald-600 hover:text-emerald-800">+ Add line</button>
                <div class="text-sm">
                    <span class="text-gray-500 mr-2" id="saleCount">0 items</span>
                    <span class="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold" id="saleTotal">—</span>
                </div>
            </div>
            <template id="saleLineTpl">
                <div class="sale-line grid items-center" style="grid-template-columns:1.3fr 1.1fr 4.5rem 6rem auto;gap:.5rem">
                    <select class="ln-prod w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select an item…</option>
                        <?php foreach ($tillProducts as $tp): ?>
                            <option value="<?= e($tp['product']['id']) ?>"><?= e($tp['product']['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                    <select name="line_variant[]" class="ln-size w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Size…</option>
                    </select>
                    <input type="number" name="line_qty[]" value="1" min="1" class="ln-qty w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <span class="ln-total text-sm text-right text-gray-800 font-medium">—</span>
                    <button type="button" class="ln-remove text-gray-400 hover:text-red-500 text-xs px-1" title="Remove line"></button>
                </div>
            </template>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 pt-4 border-t border-gray-100">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                    <input type="date" name="sold_on" value="<?= $today ?>" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <select name="payment_method" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <?php foreach ($methodLabels as $k => $v): ?>
                            <option value="<?= e($k) ?>"><?= e($v) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Transaction ref</label>
                    <input type="text" name="transaction_ref" placeholder="M-Pesa code (optional)" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Student (optional)</label>
                    <div class="stupick relative">
                        <input type="text" id="uniStuSearch" autocomplete="off" value="Walk-in / not a student"
                            placeholder="Search student…"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <input type="hidden" name="student_id" id="uniStuId">
                        <div id="uniStuList" class="hidden absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                            <div class="stuopt px-3 py-2 text-sm cursor-pointer hover:bg-emerald-50 text-gray-500 border-b border-gray-50" data-id="" data-search="" data-label="Walk-in / not a student">Walk-in / not a student</div>
                            <?php foreach ($students as $s): ?>
                                <?php $needle = strtolower(trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? '') . ' ' . ($s['admission_number'] ?? ''))); ?>
                                <div class="stuopt px-3 py-2 text-sm cursor-pointer hover:bg-emerald-50 text-gray-900 border-b border-gray-50 last:border-0" data-id="<?= e($s['id']) ?>" data-search="<?= e($needle) ?>" data-label="<?= e($studentMap[$s['id']]) ?>"><?= e($studentMap[$s['id']]) ?></div>
                            <?php endforeach; ?>
                            <div id="uniStuNone" class="hidden px-3 py-3 text-sm text-gray-400">No matching student</div>
                        </div>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Walk-in customer</label>
                    <input type="text" name="customer_name" placeholder="Name (if not a student)" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mb-5">
                <input type="text" name="note" placeholder="Note (optional)" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Record Sale</button>
                <button type="button" onclick="closeModal('recordSaleModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
        <?php endif; ?>
    </div>
</div>

<script>
window.TILL_CATALOGUE = <?= json_encode($tillJson, JSON_HEX_TAG | JSON_HEX_AMP) ?>;

function fmtMoney(n) { return Number(n).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}); }

/** A line: item → sizes (with price + stock) → qty → line total. */
function addSaleLine() {
    var tpl = document.getElementById('saleLineTpl'), box = document.getElementById('saleLines');
    if (!tpl || !box) return null;
    var frag = tpl.content.cloneNode(true);
    var line = frag.querySelector('.sale-line');
    var prod = line.querySelector('.ln-prod'), size = line.querySelector('.ln-size'), qty = line.querySelector('.ln-qty');
    prod.addEventListener('change', function () {
        size.innerHTML = '<option value="">Size…</option>';
        var entry = window.TILL_CATALOGUE[prod.value];
        if (entry) entry.sizes.forEach(function (s) {
            var o = document.createElement('option');
            o.value = s.id;
            o.setAttribute('data-price', s.price);
            o.setAttribute('data-stock', s.stock);
            o.textContent = s.size + ' — ' + fmtMoney(s.price) + ' (' + s.stock + ' in stock)';
            if (s.stock <= 0) o.disabled = true;
            size.appendChild(o);
        });
        // One size only? Pick it for them.
        if (entry && entry.sizes.length === 1 && entry.sizes[0].stock > 0) size.value = entry.sizes[0].id;
        size.dispatchEvent(new Event('change'));
    });
    size.addEventListener('change', function () {
        var opt = size.selectedOptions[0];
        var stock = opt ? (parseInt(opt.getAttribute('data-stock'), 10) || 0) : 0;
        qty.max = stock > 0 ? stock : '';
        if (stock > 0 && parseInt(qty.value, 10) > stock) qty.value = stock;
        recalcSale();
    });
    qty.addEventListener('input', recalcSale);
    line.querySelector('.ln-remove').addEventListener('click', function () { line.remove(); recalcSale(); });
    box.appendChild(frag);
    prod.focus();
    recalcSale();
    return line;
}
function lineTotals() {
    var total = 0, count = 0;
    document.querySelectorAll('#saleLines .sale-line').forEach(function (line) {
        var opt = line.querySelector('.ln-size').selectedOptions[0];
        var price = opt && opt.value ? (parseFloat(opt.getAttribute('data-price')) || 0) : 0;
        var q = parseInt(line.querySelector('.ln-qty').value, 10) || 0;
        var t = price * q;
        line.querySelector('.ln-total').textContent = t > 0 ? fmtMoney(t) : '—';
        if (opt && opt.value && q > 0) { total += t; count += q; }
    });
    return {total: total, count: count};
}
function recalcSale() {
    var r = lineTotals();
    document.getElementById('saleTotal').textContent = r.total > 0 ? 'KES ' + fmtMoney(r.total) : '—';
    document.getElementById('saleCount').textContent = r.count + ' item' + (r.count === 1 ? '' : 's');
}
function validateSale() {
    var complete = 0, incomplete = 0, over = [];
    document.querySelectorAll('#saleLines .sale-line').forEach(function (line) {
        var size = line.querySelector('.ln-size'), q = parseInt(line.querySelector('.ln-qty').value, 10) || 0;
        var opt = size.selectedOptions[0];
        if (opt && opt.value && q > 0) {
            complete++;
            var stock = parseInt(opt.getAttribute('data-stock'), 10) || 0;
            if (q > stock) over.push(opt.textContent.split(' — ')[0] + ' (have ' + stock + ', asked ' + q + ')');
        } else if ((opt && opt.value) || line.querySelector('.ln-prod').value) {
            incomplete++;
        }
    });
    if (complete === 0) { alert('Add at least one item with a size and quantity.'); return false; }
    if (incomplete > 0) { alert('One line is missing a size or quantity — finish it or remove it.'); return false; }
    if (over.length) { alert('Not enough stock:\n' + over.join('\n')); return false; }
    var r = lineTotals();
    return confirm('Record sale of ' + r.count + ' item' + (r.count === 1 ? '' : 's') + ' for KES ' + fmtMoney(r.total) + '?');
}
// Start with one empty line so the till is ready the moment it opens.
if (document.getElementById('saleLines')) addSaleLine();
(function(){
  var s=document.getElementById('uniStuSearch'),l=document.getElementById('uniStuList'),
      h=document.getElementById('uniStuId'),n=document.getElementById('uniStuNone');
  if(!s) return;
  var opts=[].slice.call(l.querySelectorAll('.stuopt'));
  function open(){ l.classList.remove('hidden'); flt(); }
  function close(){ l.classList.add('hidden'); }
  function flt(){ var q=s.value.trim().toLowerCase(),c=0; opts.forEach(function(o){ var ok=!q||o.getAttribute('data-search').indexOf(q)>-1; o.classList.toggle('hidden',!ok); if(ok)c++; }); n.classList.toggle('hidden',c>0); }
  s.addEventListener('focus',function(){ s.select(); open(); });
  s.addEventListener('input',function(){ h.value=''; open(); });
  opts.forEach(function(o){ o.addEventListener('click',function(){ h.value=o.getAttribute('data-id'); s.value=o.getAttribute('data-label'); close(); }); });
  document.addEventListener('click',function(e){ if(!e.target.closest('.stupick')) close(); });
})();
</script>
