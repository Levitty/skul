<?php
/**
 * Uniform → Stock tab (render partial; included by finance/uniform.php).
 *
 * One table is the catalogue AND the stock list: every item, collapsed to a
 * single line, expanding in place to its sizes with cost, selling price,
 * reorder level and on-hand. Stock never changes by typing over a number —
 * it moves through Receive delivery (purchase) or Adjust (count), so every
 * unit on the shelf has a movement behind it.
 *
 * Expects from the shell: $sb, $sid, $products, $variantsByProduct, $openId.
 */

$openId = $openId ?? '';

// ── Roll-ups per item, and the page-wide strip ────────────────────
$rows = [];
$tot = ['items' => 0, 'sizes' => 0, 'units' => 0, 'value' => 0.0, 'low' => 0];
foreach ($products as $p) {
    $vars = array_values(array_filter($variantsByProduct[$p['id']] ?? [], fn($v) => ($v['is_active'] ?? true)));
    $units = 0; $value = 0.0; $low = 0;
    foreach ($vars as $v) {
        $q = (int)($v['stock_quantity'] ?? 0);
        $c = $v['cost_price'] ?? $p['cost_price'] ?? null;
        $units += $q;
        $value += $q * (float)($c ?? 0);
        $rl = (int)($v['reorder_level'] ?? 0);
        if ($rl > 0 && $q <= $rl) $low++;
    }
    $rows[] = ['p' => $p, 'vars' => $vars, 'units' => $units, 'value' => $value, 'low' => $low];
    $tot['items']++;
    $tot['sizes'] += count($vars);
    $tot['units'] += $units;
    $tot['value'] += $value;
    $tot['low']   += $low;
}

// ── Movement history for one size, when asked ─────────────────────
$historyVariant = null; $historyRows = [];
$hv = trim((string)input('history'));
if ($hv !== '') {
    foreach ($variantsByProduct as $pid => $vs) {
        foreach ($vs as $v) {
            if ($v['id'] === $hv) {
                $pn = '';
                foreach ($products as $p) if ($p['id'] === $pid) { $pn = $p['name']; break; }
                $historyVariant = $v + ['product_name' => $pn];
                break 2;
            }
        }
    }
    if ($historyVariant) {
        $historyRows = $sb->from('stock_adjustments')
            ->select('adjustment_type,quantity,previous_quantity,new_quantity,reason,unit_cost,created_at')
            ->eq('variant_id', $hv)->order('created_at', false)->limit(100)->execute()['data'] ?? [];
    }
}
$typeLabel = [
    'purchase' => ['Received',     'text-emerald-700 bg-emerald-50'],
    'sale'     => ['Sold',         'text-gray-700 bg-gray-100'],
    'return'   => ['Returned',     'text-blue-700 bg-blue-50'],
    'damaged'  => ['Damaged',      'text-red-700 bg-red-50'],
    'adjustment' => ['Adjusted',   'text-amber-700 bg-amber-50'],
    'transfer_out' => ['Sent out', 'text-purple-700 bg-purple-50'],
    'transfer_in'  => ['Received (transfer)', 'text-purple-700 bg-purple-50'],
];

// JSON for the Receive / Adjust modals (active sizes only).
$stockJson = [];
foreach ($rows as $r) {
    if (empty($r['vars'])) continue;
    $sizes = [];
    foreach ($r['vars'] as $v) {
        $sizes[] = ['id' => $v['id'], 'size' => $v['size'], 'stock' => (int)($v['stock_quantity'] ?? 0),
                    'cost' => (float)($v['cost_price'] ?? $r['p']['cost_price'] ?? 0)];
    }
    $stockJson[$r['p']['id']] = ['name' => $r['p']['name'], 'sizes' => $sizes];
}
?>

<style>
.szgrid{display:grid;grid-template-columns:minmax(6rem,1.2fr) 1fr 1fr .9fr minmax(8rem,1.1fr) auto;gap:.5rem;align-items:center}
.szhead{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.03em}
.addgrid{display:grid;grid-template-columns:1fr 6rem auto;gap:.5rem;align-items:center}
.stkrow.hidden{display:none}
</style>

<!-- Toolbar -->
<div class="flex items-center gap-3 mb-4 flex-wrap">
    <input type="text" id="stkSearch" oninput="stkFilter()" placeholder="Search items…"
           class="flex-1 min-w-[12rem] px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
    <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" id="stkLowOnly" onchange="stkFilter()" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
        Low stock only
    </label>
    <button type="button" onclick="openReceive('', '')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Receive delivery</button>
    <button type="button" onclick="openModal('addItemModal')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">+ Add item</button>
</div>

<!-- Strip -->
<div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
    <?php foreach ([
        ['Items', number_format($tot['items']), 'text-gray-900'],
        ['Sizes', number_format($tot['sizes']), 'text-gray-900'],
        ['Units on hand', number_format($tot['units']), 'text-gray-900'],
        ['Stock value (at cost)', money($tot['value']), 'text-gray-900'],
        ['Low stock', number_format($tot['low']), $tot['low'] > 0 ? 'text-amber-600' : 'text-gray-900'],
    ] as [$lbl, $val, $cls]): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-[11px] font-medium text-gray-400 uppercase tracking-wide"><?= e($lbl) ?></p>
            <p class="text-lg font-bold mt-1 <?= $cls ?>"><?= e($val) ?></p>
        </div>
    <?php endforeach; ?>
</div>

<?php if ($historyVariant): ?>
<div class="bg-white rounded-xl border border-emerald-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-5">
    <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <h2 class="text-sm font-semibold text-gray-800">
            Movements — <?= e($historyVariant['product_name']) ?> · <?= e($historyVariant['size']) ?>
            <span class="text-gray-400 font-normal">(now <?= (int)($historyVariant['stock_quantity'] ?? 0) ?> on hand)</span>
        </h2>
        <a href="<?= baseUrl('finance/uniform') ?>?tab=stock" class="text-sm text-gray-500 hover:text-gray-800">Close</a>
    </div>
    <?php if (empty($historyRows)): ?>
        <p class="px-4 py-6 text-sm text-gray-400 text-center">No movements recorded yet for this size.</p>
    <?php else: ?>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead><tr class="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                <th class="text-left px-4 py-2 font-medium">When</th>
                <th class="text-left px-4 py-2 font-medium">Type</th>
                <th class="text-right px-4 py-2 font-medium">Qty</th>
                <th class="text-right px-4 py-2 font-medium">Before → After</th>
                <th class="text-right px-4 py-2 font-medium">Unit cost</th>
                <th class="text-left px-4 py-2 font-medium">Note</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($historyRows as $h): [$tl, $tc] = $typeLabel[$h['adjustment_type'] ?? ''] ?? [ucfirst((string)$h['adjustment_type']), 'text-gray-600 bg-gray-100']; ?>
                <tr>
                    <td class="px-4 py-2 text-gray-600 whitespace-nowrap"><?= e(date('d M Y H:i', strtotime((string)$h['created_at']))) ?></td>
                    <td class="px-4 py-2"><span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium <?= $tc ?>"><?= e($tl) ?></span></td>
                    <td class="px-4 py-2 text-right font-medium <?= (int)$h['quantity'] >= 0 ? 'text-emerald-700' : 'text-red-600' ?>"><?= (int)$h['quantity'] >= 0 ? '+' : '' ?><?= (int)$h['quantity'] ?></td>
                    <td class="px-4 py-2 text-right text-gray-500"><?= (int)$h['previous_quantity'] ?> → <?= (int)$h['new_quantity'] ?></td>
                    <td class="px-4 py-2 text-right text-gray-600"><?= $h['unit_cost'] !== null ? money((float)$h['unit_cost']) : '—' ?></td>
                    <td class="px-4 py-2 text-gray-600"><?= e($h['reason'] ?? '') ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php endif; ?>
</div>
<?php endif; ?>

<!-- The list -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <?php if (empty($rows)): ?>
        <div class="px-4 py-12 text-center text-sm text-gray-400">No items yet. Click <strong>+ Add item</strong> to set up your first one.</div>
    <?php else: ?>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                    <th class="text-left px-4 py-2.5 font-medium">Item</th>
                    <th class="text-left px-4 py-2.5 font-medium">Sizes</th>
                    <th class="text-right px-4 py-2.5 font-medium">On hand</th>
                    <th class="text-right px-4 py-2.5 font-medium">Value</th>
                    <th class="text-left px-4 py-2.5 font-medium">Status</th>
                    <th class="px-4 py-2.5"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($rows as $r): $p = $r['p']; $pid = $p['id']; $isOpen = ($openId === $pid);
                    $sizeText = implode(', ', array_map(fn($v) => $v['size'], array_slice($r['vars'], 0, 8)))
                              . (count($r['vars']) > 8 ? ' +' . (count($r['vars']) - 8) : '');
                    $search = strtolower($p['name'] . ' ' . $sizeText); ?>
                <tr class="stkrow cursor-pointer hover:bg-gray-50/60 <?= $isOpen ? 'bg-emerald-50/40' : '' ?>"
                    data-pid="<?= e($pid) ?>" data-s="<?= e($search) ?>" data-low="<?= $r['low'] > 0 ? '1' : '0' ?>"
                    onclick="stkToggle('<?= e($pid) ?>')">
                    <td class="px-4 py-3">
                        <span class="font-medium text-gray-900"><?= e($p['name']) ?></span>
                        <?php if (empty($p['is_active'])): ?><span class="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">hidden from till</span><?php endif; ?>
                    </td>
                    <td class="px-4 py-3 text-xs text-gray-500">
                        <?= empty($r['vars']) ? '<span class="text-amber-600">No sizes yet</span>' : e($sizeText) ?>
                    </td>
                    <td class="px-4 py-3 text-right text-gray-800 font-medium"><?= number_format($r['units']) ?></td>
                    <td class="px-4 py-3 text-right text-gray-600"><?= money($r['value']) ?></td>
                    <td class="px-4 py-3">
                        <?php if ($r['low'] > 0): ?>
                            <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700"><?= (int)$r['low'] ?> low</span>
                        <?php elseif ($r['units'] === 0 && !empty($r['vars'])): ?>
                            <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-600">Out of stock</span>
                        <?php else: ?>
                            <span class="text-gray-300">—</span>
                        <?php endif; ?>
                    </td>
                    <td class="px-4 py-3 text-right text-gray-400">
                        <svg class="w-4 h-4 inline transition-transform stkchev <?= $isOpen ? 'rotate-90' : '' ?>" data-pid="<?= e($pid) ?>" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                    </td>
                </tr>
                <tr class="stkdetail <?= $isOpen ? '' : 'hidden' ?>" data-pid="<?= e($pid) ?>">
                    <td colspan="6" class="px-4 py-4 bg-gray-50/60 border-t border-gray-100">
                        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-5">
                            <div>
                                <!-- Item details -->
                                <form method="POST" class="flex flex-wrap items-end gap-3 mb-5">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="tab" value="stock">
                                    <input type="hidden" name="action" value="edit_item">
                                    <input type="hidden" name="product_id" value="<?= e($pid) ?>">
                                    <div class="flex-1 min-w-[12rem]">
                                        <label class="block text-[11px] font-medium text-gray-500 mb-1">Item name</label>
                                        <input type="text" name="name" required value="<?= e($p['name']) ?>" class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                                    </div>
                                    <div class="w-32">
                                        <label class="block text-[11px] font-medium text-gray-500 mb-1">Purchase price</label>
                                        <input type="number" name="cost_price" step="0.01" min="0" value="<?= e((string)(float)($p['cost_price'] ?? 0)) ?>" class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                                    </div>
                                    <div class="w-32">
                                        <label class="block text-[11px] font-medium text-gray-500 mb-1">Selling price</label>
                                        <input type="number" name="price" step="0.01" min="0" value="<?= e((string)(float)($p['base_price'] ?? 0)) ?>" class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                                    </div>
                                    <button type="submit" class="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-white bg-white">Save item</button>
                                </form>

                                <!-- Sizes -->
                                <form method="POST" id="sizes-<?= e($pid) ?>">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="tab" value="stock">
                                    <input type="hidden" name="action" value="save_sizes">
                                    <input type="hidden" name="product_id" value="<?= e($pid) ?>">
                                    <div class="szgrid szhead mb-1.5">
                                        <span>Size</span><span>Purchase</span><span>Selling</span><span>Reorder at</span><span>On hand</span><span></span>
                                    </div>
                                    <div id="szrows-<?= e($pid) ?>" class="space-y-1.5">
                                        <?php foreach ($r['vars'] as $v): $q = (int)($v['stock_quantity'] ?? 0); $rl = (int)($v['reorder_level'] ?? 0); ?>
                                        <div class="szgrid">
                                            <input type="hidden" name="variant_id[]" value="<?= e($v['id']) ?>">
                                            <input type="text" name="size_label[]" required maxlength="20" value="<?= e($v['size']) ?>" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                                            <input type="number" name="size_cost[]" step="0.01" min="0" value="<?= e((string)(float)($v['cost_price'] ?? $p['cost_price'] ?? 0)) ?>" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                                            <input type="number" name="size_price[]" step="0.01" min="0" value="<?= e((string)(float)($v['price'] ?? 0)) ?>" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                                            <input type="number" name="size_reorder[]" min="0" step="1" value="<?= $rl ?>" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
                                            <input type="hidden" name="size_qty[]" value="">
                                            <div class="text-sm whitespace-nowrap">
                                                <span class="font-semibold <?= ($rl > 0 && $q <= $rl) ? 'text-amber-600' : 'text-gray-900' ?>"><?= $q ?></span>
                                                <button type="button" onclick="openReceive('<?= e($pid) ?>','<?= e($v['id']) ?>')" class="ml-2 text-[11px] text-emerald-700 hover:underline">Receive</button>
                                                <button type="button" onclick="openAdjust('<?= e($v['id']) ?>','<?= e(addslashes($p['name'] . ' · ' . $v['size'])) ?>',<?= $q ?>)" class="ml-1 text-[11px] text-gray-600 hover:underline">Adjust</button>
                                                <a href="<?= baseUrl('finance/uniform') ?>?tab=stock&open=<?= e($pid) ?>&history=<?= e($v['id']) ?>" class="ml-1 text-[11px] text-gray-500 hover:underline">History</a>
                                            </div>
                                            <button type="submit" form="delsz-<?= e($v['id']) ?>" onclick="return confirm('Delete size <?= e(addslashes($v['size'])) ?>? If it has sales it will be hidden instead.')" class="text-red-500 text-xs font-medium px-1">Delete</button>
                                        </div>
                                        <?php endforeach; ?>
                                    </div>
                                    <div class="flex items-center gap-4 mt-3">
                                        <button type="button" onclick="addSizeRow('<?= e($pid) ?>', <?= json_encode((float)($p['cost_price'] ?? 0)) ?>, <?= json_encode((float)($p['base_price'] ?? 0)) ?>)" class="text-sm font-medium text-emerald-600 hover:text-emerald-800">+ Add size</button>
                                        <button type="submit" class="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save sizes</button>
                                        <span class="text-[11px] text-gray-400">On-hand changes through Receive or Adjust, so every unit has a record.</span>
                                    </div>
                                </form>
                                <?php foreach ($r['vars'] as $v): ?>
                                    <form id="delsz-<?= e($v['id']) ?>" method="POST" class="hidden">
                                        <?= csrfField() ?>
                                        <input type="hidden" name="tab" value="stock">
                                        <input type="hidden" name="action" value="delete_size">
                                        <input type="hidden" name="variant_id" value="<?= e($v['id']) ?>">
                                        <input type="hidden" name="product_id" value="<?= e($pid) ?>">
                                    </form>
                                <?php endforeach; ?>
                            </div>

                            <!-- Item-level actions -->
                            <div class="flex lg:flex-col gap-2 items-start">
                                <form method="POST">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="tab" value="stock">
                                    <input type="hidden" name="action" value="toggle_item">
                                    <input type="hidden" name="product_id" value="<?= e($pid) ?>">
                                    <input type="hidden" name="to" value="<?= empty($p['is_active']) ? '1' : '0' ?>">
                                    <button type="submit" class="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-white bg-white whitespace-nowrap"><?= empty($p['is_active']) ? 'Show on till' : 'Hide from till' ?></button>
                                </form>
                                <form method="POST" onsubmit="return confirm('Delete <?= e(addslashes($p['name'])) ?>? If it has sales it will be hidden instead.')">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="tab" value="stock">
                                    <input type="hidden" name="action" value="delete_item">
                                    <input type="hidden" name="product_id" value="<?= e($pid) ?>">
                                    <button type="submit" class="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-100 rounded-lg hover:bg-red-50 bg-white whitespace-nowrap">Delete item</button>
                                </form>
                            </div>
                        </div>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <p id="stkEmpty" class="hidden px-4 py-8 text-center text-sm text-gray-400">Nothing matches.</p>
    <?php endif; ?>
</div>

<!-- Add item -->
<div id="addItemModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Add item</h3>
        <p class="text-xs text-gray-500 mb-4">Prices here are the defaults for every size; you can change any size afterwards.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="tab" value="stock">
            <input type="hidden" name="action" value="add_item">
            <div class="mb-3">
                <label class="block text-sm font-medium text-gray-700 mb-1">Item name *</label>
                <input type="text" name="name" required placeholder="e.g. School sweater" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="grid grid-cols-3 gap-3 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Purchase price</label>
                    <input type="number" name="cost_price" step="0.01" min="0" placeholder="0.00" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Selling price *</label>
                    <input type="number" name="price" step="0.01" min="0" placeholder="0.00" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Reorder at</label>
                    <input type="number" name="reorder_level" min="0" step="1" value="0" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mb-1 flex items-center justify-between">
                <label class="block text-sm font-medium text-gray-700">Sizes and quantity on hand</label>
                <button type="button" onclick="addNewItemSizeRow()" class="text-xs font-medium text-emerald-600 hover:text-emerald-800">+ Add size</button>
            </div>
            <p class="text-[11px] text-gray-400 mb-2">Leave empty for a one-size item (a tie, a badge). Quantities are recorded as opening stock.</p>
            <div class="addgrid szhead mb-1"><span>Size</span><span>Qty</span><span></span></div>
            <div id="newItemSizes" class="space-y-1.5 mb-5"></div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Add item</button>
                <button type="button" onclick="closeModal('addItemModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Receive delivery -->
<div id="receiveModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Receive delivery</h3>
        <p class="text-xs text-gray-500 mb-4">Adds to what's on hand and records the purchase. The cost you enter becomes this size's purchase price.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="tab" value="stock">
            <input type="hidden" name="action" value="receive_stock">
            <input type="hidden" name="product_id" id="rcvPid" value="">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Item *</label>
                    <select id="rcvProduct" required onchange="rcvProductChange()" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select…</option>
                        <?php foreach ($stockJson as $pid => $entry): ?>
                            <option value="<?= e($pid) ?>"><?= e($entry['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Size *</label>
                    <select name="variant_id" id="rcvSize" required onchange="rcvSizeChange()" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select…</option>
                    </select>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Quantity received *</label>
                    <input type="number" name="quantity" min="1" step="1" required value="1" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Unit cost</label>
                    <input type="number" name="unit_cost" id="rcvCost" step="0.01" min="0" placeholder="per piece" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mb-5">
                <label class="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <input type="text" name="note" placeholder="e.g. Supplier invoice 4471" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Receive</button>
                <button type="button" onclick="closeModal('receiveModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Adjust (stock count) -->
<div id="adjustModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Adjust stock</h3>
        <p class="text-xs text-gray-500 mb-4">For a stock count, damage or loss. Enter what is actually on the shelf.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="tab" value="stock">
            <input type="hidden" name="action" value="adjust_stock">
            <input type="hidden" name="variant_id" id="adjVid" value="">
            <input type="hidden" name="product_id" id="adjPid" value="">
            <p class="text-sm text-gray-800 font-medium mb-3" id="adjLabel"></p>
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Currently</label>
                    <div id="adjCurrent" class="px-3 py-2 rounded-lg bg-gray-50 text-gray-700 text-sm">—</div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Actual count *</label>
                    <input type="number" name="new_quantity" id="adjNew" min="0" step="1" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mb-5">
                <label class="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <input type="text" name="reason" required placeholder="e.g. Term 2 stock count / 2 damaged" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 shadow-sm transition">Save count</button>
                <button type="button" onclick="closeModal('adjustModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
window.STOCK_JSON = <?= json_encode($stockJson, JSON_HEX_TAG | JSON_HEX_AMP) ?>;

function stkToggle(pid) {
    var d = document.querySelector('.stkdetail[data-pid="' + pid + '"]');
    var c = document.querySelector('.stkchev[data-pid="' + pid + '"]');
    var r = document.querySelector('.stkrow[data-pid="' + pid + '"]');
    if (!d) return;
    var open = d.classList.toggle('hidden');
    if (c) c.classList.toggle('rotate-90', !open);
    if (r) r.classList.toggle('bg-emerald-50/40', !open);
}
// Clicks inside the detail row must not bubble up to the row toggle.
document.querySelectorAll('.stkdetail').forEach(function (d) {
    d.addEventListener('click', function (e) { e.stopPropagation(); });
});
function stkFilter() {
    var q = (document.getElementById('stkSearch').value || '').trim().toLowerCase();
    var low = document.getElementById('stkLowOnly').checked;
    var shown = 0;
    document.querySelectorAll('.stkrow').forEach(function (r) {
        var ok = (!q || r.dataset.s.indexOf(q) > -1) && (!low || r.dataset.low === '1');
        r.classList.toggle('hidden', !ok);
        if (!ok) {
            var d = document.querySelector('.stkdetail[data-pid="' + r.dataset.pid + '"]');
            if (d) d.classList.add('hidden');
        }
        if (ok) shown++;
    });
    var em = document.getElementById('stkEmpty');
    if (em) em.classList.toggle('hidden', shown > 0);
}
function addSizeRow(pid, cost, price) {
    var box = document.getElementById('szrows-' + pid);
    if (!box) return;
    var row = document.createElement('div');
    row.className = 'szgrid';
    row.innerHTML =
        '<input type="hidden" name="variant_id[]" value="">' +
        '<input type="text" name="size_label[]" required maxlength="20" placeholder="e.g. 32" class="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 text-sm bg-white">' +
        '<input type="number" name="size_cost[]" step="0.01" min="0" value="' + cost + '" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">' +
        '<input type="number" name="size_price[]" step="0.01" min="0" required value="' + price + '" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">' +
        '<input type="number" name="size_reorder[]" min="0" step="1" value="0" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">' +
        '<input type="number" name="size_qty[]" min="0" step="1" value="0" title="Opening stock" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">' +
        '<button type="button" class="text-gray-500 text-xs font-medium px-1">Remove</button>';
    row.querySelector('button').addEventListener('click', function () { row.remove(); });
    box.appendChild(row);
    row.querySelector('input[name="size_label[]"]').focus();
}
function addNewItemSizeRow() {
    var box = document.getElementById('newItemSizes');
    var row = document.createElement('div');
    row.className = 'addgrid';
    row.innerHTML =
        '<input type="text" name="new_size[]" maxlength="20" placeholder="e.g. 28" class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm">' +
        '<input type="number" name="new_qty[]" min="0" step="1" value="0" class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm">' +
        '<button type="button" class="text-gray-500 text-xs font-medium px-1">Remove</button>';
    row.querySelector('button').addEventListener('click', function () { row.remove(); });
    box.appendChild(row);
    row.querySelector('input').focus();
}
function rcvProductChange() {
    var pid = document.getElementById('rcvProduct').value;
    var sel = document.getElementById('rcvSize');
    document.getElementById('rcvPid').value = pid;
    sel.innerHTML = '<option value="">Select…</option>';
    var entry = window.STOCK_JSON[pid];
    if (!entry) return;
    entry.sizes.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.size + ' (now ' + s.stock + ')'; o.setAttribute('data-cost', s.cost);
        sel.appendChild(o);
    });
}
function rcvSizeChange() {
    var opt = document.getElementById('rcvSize').selectedOptions[0];
    var c = document.getElementById('rcvCost');
    if (opt && opt.value && c && !c.value) c.value = parseFloat(opt.getAttribute('data-cost') || '0') || '';
}
function openReceive(pid, vid) {
    var p = document.getElementById('rcvProduct');
    p.value = pid || '';
    rcvProductChange();
    if (vid) { document.getElementById('rcvSize').value = vid; rcvSizeChange(); }
    document.getElementById('rcvCost').value = '';
    if (vid) rcvSizeChange();
    openModal('receiveModal');
}
function openAdjust(vid, label, current) {
    document.getElementById('adjVid').value = vid;
    document.getElementById('adjLabel').textContent = label;
    document.getElementById('adjCurrent').textContent = current;
    var n = document.getElementById('adjNew'); n.value = current;
    // Keep the row open after save.
    var row = document.querySelector('.szgrid input[name="variant_id[]"][value="' + vid + '"]');
    var form = row ? row.closest('form') : null;
    document.getElementById('adjPid').value = form ? (form.querySelector('input[name="product_id"]') || {}).value || '' : '';
    openModal('adjustModal');
    setTimeout(function () { n.focus(); n.select(); }, 50);
}
</script>
