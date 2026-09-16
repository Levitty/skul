<?php
/**
 * Uniform — one page, three tabs.
 *
 *   Sell       the till + recent sales (the bursar's landing tab)
 *   Stock      the catalogue AND the stock list in one table: items collapsed
 *              to a line, expanding in place to their sizes with purchase
 *              price, selling price, reorder level and on-hand. Stock moves
 *              only through Receive delivery / Adjust, so every unit has a
 *              movement behind it (stock_adjustments).
 *   Transfers  send / receive between sibling branches — only when the
 *              school is in a group.
 *
 * All POST handling lives here; the tabs are render-only partials:
 *   uniform-sell.php · uniform-stock.php · uniform-transfers.php
 */
$pageTitle = 'Uniform';
$sb   = new Supabase();
$sid  = schoolId();
$user = currentUser();

$today     = date('Y-m-d');
$thisMonth = date('Y-m');
$thisYear  = date('Y');

$siblings   = siblingSchoolsInGroup($sid);
$siblingMap = [];
foreach ($siblings as $s) $siblingMap[$s['id']] = $s['name'];

$tab = in_array(input('tab'), ['sell', 'stock', 'transfers'], true) ? input('tab') : 'sell';
if ($tab === 'transfers' && empty($siblings)) $tab = 'sell';
$openId = trim((string)input('open'));

$methodLabels = [
    'cash' => 'Cash', 'mpesa' => 'M-Pesa', 'bank_transfer' => 'Bank Transfer',
    'mobile_money' => 'Mobile Money', 'cheque' => 'Cheque', 'card' => 'Card', 'other' => 'Other',
];

$back = fn(string $t, string $open = ''): string =>
    'finance/uniform?tab=' . $t . ($open !== '' ? '&open=' . urlencode($open) : '');

// ════════════════════════════════════════════════════════════════
// POST
// ════════════════════════════════════════════════════════════════
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // ── Sell ──────────────────────────────────────────────────────
    if ($action === 'record_sale') {
        $variantIds = (array)($_POST['line_variant'] ?? []);
        $qtys       = (array)($_POST['line_qty']     ?? []);
        $lines = [];
        foreach ($variantIds as $i => $vid) {
            $vid = trim((string)$vid); $q = (int)($qtys[$i] ?? 0);
            if ($vid !== '' && $q > 0) $lines[] = ['variant_id' => $vid, 'quantity' => $q];
        }
        $studentId = input('student_id') ?: null;
        $customer  = trim((string)input('customer_name')) ?: null;
        $method    = input('payment_method') ?: 'cash';
        $date      = input('sold_on') ?: $today;
        $extraNote = trim((string)input('note')) ?: null;
        $txRef     = trim((string)input('transaction_ref')) ?: null;

        if (empty($lines)) {
            flash('error', 'Add at least one item with a size and quantity.');
            redirect($back('sell'));
        }
        if ($studentId) {
            $stu = $sb->from('students')->select('id')->eq('id', $studentId)->eq('school_id', $sid)->single()->execute();
            if (empty($stu['data'][0]['id'])) $studentId = null;
        }
        $res = recordUniformSaleBasket($lines, $method, $date, $studentId, $customer, $extraNote, $txRef);
        if (!$res['success']) {
            flash('error', $res['error'] ?? 'Sale failed.');
            redirect($back('sell'));
        }
        $n = (int)($res['lines'] ?? count($lines));
        flashLink('success',
            'Sale ' . ($res['sale_number'] ?? '') . ' recorded — ' . money((float)($res['total_amount'] ?? 0))
            . ' for ' . $n . ' item' . ($n === 1 ? '' : 's') . '.',
            baseUrl('finance/uniform-receipt?id=' . urlencode((string)($res['sale_id'] ?? ''))),
            'Print receipt');
        redirect($back('sell'));
    }

    if ($action === 'delete_sale') {
        $id  = input('sale_id');
        $res = $sb->from('uniform_sales')->eq('id', $id)->eq('school_id', $sid)->delete();
        flash($res['error'] ? 'error' : 'success', $res['error'] ?: 'Sale deleted (stock restored for its line items).');
        redirect($back('sell'));
    }

    // ── Stock ─────────────────────────────────────────────────────
    if ($action === 'add_item') {
        $name    = trim((string)input('name'));
        $cost    = round((float)input('cost_price'), 2);
        $price   = round((float)input('price'), 2);
        $reorder = max(0, (int)input('reorder_level'));
        $labels  = (array)($_POST['new_size'] ?? []);
        $qtys    = (array)($_POST['new_qty']  ?? []);
        $sizes   = [];
        foreach ($labels as $i => $lbl) {
            $lbl = trim((string)$lbl);
            if ($lbl === '') continue;
            $sizes[] = ['size' => $lbl, 'quantity' => max(0, (int)($qtys[$i] ?? 0))];
        }
        if ($name === '') {
            flash('error', 'Item name is required.');
            redirect($back('stock'));
        }
        $res = createUniformItem($name, $cost, $price, $reorder, $sizes);
        if (!$res['success']) {
            flash('error', $res['error']);
            redirect($back('stock'));
        }
        $units = (int)($res['units'] ?? 0);
        flash('success', 'Added ' . $name . ' with ' . (int)($res['sizes'] ?? 0) . ' size' . ((int)($res['sizes'] ?? 0) === 1 ? '' : 's')
            . ($units > 0 ? ' and ' . $units . ' units of opening stock.' : '.'));
        redirect($back('stock', (string)($res['product_id'] ?? '')));
    }

    if ($action === 'edit_item') {
        $id    = input('product_id');
        $name  = trim((string)input('name'));
        $cost  = round((float)input('cost_price'), 2);
        $price = round((float)input('price'), 2);
        if (!$id || $name === '') {
            flash('error', 'Item name is required.');
            redirect($back('stock'));
        }
        $res = $sb->from('uniform_products')->eq('id', $id)->eq('school_id', $sid)->update([
            'name' => $name, 'base_price' => $price, 'cost_price' => $cost, 'updated_at' => date('c'),
        ]);
        if (empty($res['error'])) auditLog('update', 'uniform_product', $id, ['name' => $name, 'price' => $price, 'cost_price' => $cost]);
        flash($res['error'] ? 'error' : 'success', $res['error'] ?: 'Item updated.');
        redirect($back('stock', (string)$id));
    }

    if ($action === 'toggle_item') {
        $id = input('product_id');
        $to = input('to') === '1';
        $sb->from('uniform_products')->eq('id', $id)->eq('school_id', $sid)->update(['is_active' => $to, 'updated_at' => date('c')]);
        flash('success', $to ? 'Item shown on the till.' : 'Item hidden from the till.');
        redirect($back('stock', (string)$id));
    }

    if ($action === 'delete_item') {
        $res = deleteUniformProduct((string)input('product_id'));
        flash($res['success'] ? 'success' : 'error', $res['message'] ?? $res['error'] ?? 'Done.');
        redirect($back('stock'));
    }

    if ($action === 'save_sizes') {
        $pid  = input('product_id');
        $prod = $sb->from('uniform_products')->select('id,base_price,cost_price')
            ->eq('id', $pid)->eq('school_id', $sid)->single()->execute()['data'][0] ?? null;
        if (!$prod) {
            flash('error', 'Item not found.');
            redirect($back('stock'));
        }
        $ids      = (array)($_POST['variant_id']   ?? []);
        $labels   = (array)($_POST['size_label']   ?? []);
        $costs    = (array)($_POST['size_cost']    ?? []);
        $prices   = (array)($_POST['size_price']   ?? []);
        $reorders = (array)($_POST['size_reorder'] ?? []);
        $qtys     = (array)($_POST['size_qty']     ?? []);

        $saved = 0; $err = null; $seen = [];
        foreach ($labels as $i => $raw) {
            $label = trim((string)$raw);
            if ($label === '') continue;
            $key = strtolower($label);
            if (isset($seen[$key])) { $err = 'Duplicate size "' . $label . '".'; break; }
            $seen[$key] = true;

            $vid   = trim((string)($ids[$i] ?? ''));
            $price = ($prices[$i] ?? '') !== '' ? round((float)$prices[$i], 2) : round((float)$prod['base_price'], 2);
            $cost  = ($costs[$i]  ?? '') !== '' ? round((float)$costs[$i],  2) : null;
            $rl    = ($reorders[$i] ?? '') !== '' ? max(0, (int)$reorders[$i]) : null;
            // Opening stock only for brand-new rows; existing rows move via Receive / Adjust.
            $qty   = ($vid === '' && ($qtys[$i] ?? '') !== '') ? max(0, (int)$qtys[$i]) : null;

            $r = upsertUniformVariant((string)$pid, $label, $price, $qty, true, $vid !== '' ? $vid : null, $cost, $rl);
            if (!$r['success']) { $err = $r['error']; break; }
            $saved++;
        }
        if ($err) flash('error', $err);
        else      flash('success', $saved ? "Saved $saved size" . ($saved === 1 ? '' : 's') . '.' : 'Nothing to save — add a size first.');
        redirect($back('stock', (string)$pid));
    }

    if ($action === 'delete_size') {
        $res = deleteUniformVariant((string)input('variant_id'));
        flash($res['success'] ? 'success' : 'error', $res['message'] ?? $res['error'] ?? 'Done.');
        redirect($back('stock', (string)input('product_id')));
    }

    if ($action === 'receive_stock') {
        $vid  = (string)input('variant_id');
        $qty  = (int)input('quantity');
        $cost = input('unit_cost') !== '' && input('unit_cost') !== null ? round((float)input('unit_cost'), 2) : null;
        $note = trim((string)input('note')) ?: null;
        if ($vid === '' || $qty < 1) {
            flash('error', 'Pick a size and enter the quantity received.');
            redirect($back('stock'));
        }
        $res = receiveUniformStock($vid, $qty, $cost, $note);
        flash($res['success'] ? 'success' : 'error',
            $res['success']
                ? ('Received ' . (int)$res['received'] . ' — now ' . (int)$res['stock_quantity'] . ' on hand'
                   . (isset($res['unit_cost']) && $res['unit_cost'] !== null ? ' at ' . money((float)$res['unit_cost']) . ' each' : '') . '.')
                : ($res['error'] ?? 'Could not receive stock.'));
        redirect($back('stock', (string)input('product_id')));
    }

    if ($action === 'adjust_stock') {
        $vid    = (string)input('variant_id');
        $new    = max(0, (int)input('new_quantity'));
        $reason = trim((string)input('reason'));
        if ($vid === '' || $reason === '') {
            flash('error', 'A reason is required for a stock adjustment.');
            redirect($back('stock'));
        }
        $res = adjustUniformStock($vid, $new, $reason);
        flash($res['success'] ? 'success' : 'error',
            $res['success']
                ? (!empty($res['unchanged']) ? 'Count matches — nothing changed.' : 'Stock set to ' . (int)$res['stock_quantity'] . ' (was ' . (int)$res['previous'] . ').')
                : ($res['error'] ?? 'Could not adjust stock.'));
        redirect($back('stock', (string)input('product_id')));
    }

    // ── Transfers ─────────────────────────────────────────────────
    if ($action === 'send') {
        $toId  = input('to_school_id');
        $notes = trim((string)input('notes'));
        $variantIds = (array)($_POST['variant_id'] ?? []);
        $qtys       = (array)($_POST['quantity']   ?? []);
        $lines = [];
        foreach ($variantIds as $i => $vid) {
            $vid = trim((string)$vid); $q = (int)($qtys[$i] ?? 0);
            if ($vid !== '' && $q > 0) $lines[] = ['variant_id' => $vid, 'quantity' => $q];
        }
        if (!$toId || empty($siblingMap[$toId])) {
            flash('error', 'Pick a destination branch in your group.');
            redirect($back('transfers'));
        }
        $res = sendStockTransfer($toId, $lines, $notes !== '' ? $notes : null);
        flash($res['success'] ? 'success' : 'error',
            $res['success'] ? ('Transfer ' . ($res['transfer_number'] ?? '') . ' sent — waiting for ' . $siblingMap[$toId] . ' to receive.') : ($res['error'] ?? 'Send failed.'));
        redirect($back('transfers'));
    }

    if ($action === 'receive') {
        $res = receiveStockTransfer((string)input('transfer_id'));
        flash($res['success'] ? 'success' : 'error',
            $res['success'] ? ('Transfer ' . ($res['transfer_number'] ?? '') . ' received into your stock.') : ($res['error'] ?? 'Receive failed.'));
        redirect($back('transfers'));
    }

    if ($action === 'cancel') {
        $res = cancelStockTransfer((string)input('transfer_id'), trim((string)input('cancel_reason')));
        flash($res['success'] ? 'success' : 'error',
            $res['success'] ? 'Transfer cancelled — stock restored here.' : ($res['error'] ?? 'Cancel failed.'));
        redirect($back('transfers'));
    }

    flash('error', 'Unknown action.');
    redirect($back($tab));
}

// ════════════════════════════════════════════════════════════════
// Shared data — every tab reads the catalogue
// ════════════════════════════════════════════════════════════════
$products = $sb->from('uniform_products')->select('id,name,base_price,cost_price,is_active')
    ->eq('school_id', $sid)->order('name')->execute()['data'] ?? [];
$productIds = array_column($products, 'id');
$variantsByProduct = [];
if (!empty($productIds)) {
    foreach (Supabase::fetchByChunkedIn(
        // No colour filter: colour isn't a dimension the pages offer, and a
        // stray value must never hide stock (mig. 123 folds any into the label).
        fn($_sb) => $_sb->from('uniform_variants')
            ->select('id,product_id,size,price,cost_price,stock_quantity,reorder_level,is_active')
            ->order('size'),
        'product_id', $productIds
    ) as $v) $variantsByProduct[$v['product_id']][] = $v;
}

// ── CSV export of sales (Sell tab) ────────────────────────────────
if ($tab === 'sell' && input('export') === 'csv') {
    $sales = $sb->from('uniform_sales')
        ->select('id,sale_number,total_amount,sale_date,payment_method,student_id,customer_name,notes')
        ->eq('school_id', $sid)->order('sale_date', false)->limit(5000)->execute()['data'] ?? [];
    $stuIds = array_values(array_unique(array_filter(array_column($sales, 'student_id'))));
    $studentMap = [];
    if (!empty($stuIds)) {
        foreach (Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('students')->select('id,first_name,last_name,admission_number'), 'id', $stuIds
        ) as $s) {
            $studentMap[$s['id']] = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''))
                . (!empty($s['admission_number']) ? ' (' . $s['admission_number'] . ')' : '');
        }
    }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="uniform_sales_' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['Date', 'Sale #', 'Item', 'Total', 'Student / Customer', 'Method']);
    foreach ($sales as $s) {
        $who = $s['student_id'] ? ($studentMap[$s['student_id']] ?? 'Unknown') : ($s['customer_name'] ?: 'Walk-in');
        fputcsv($out, [
            $s['sale_date'] ?? '', $s['sale_number'] ?? '',
            trim((string)($s['notes'] ?? '')) !== '' ? $s['notes'] : '—',
            number_format((float)($s['total_amount'] ?? 0), 2, '.', ''),
            $who, $methodLabels[$s['payment_method'] ?? 'cash'] ?? ($s['payment_method'] ?? ''),
        ]);
    }
    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';

$tabs = [
    'sell'  => 'Sell',
    'stock' => 'Stock',
];
if (!empty($siblings)) $tabs['transfers'] = 'Transfers';
$subtitle = [
    'sell'      => 'Record sales at the counter. Items and sizes come from the Stock tab.',
    'stock'     => 'Every item and size, with what it cost, what it sells for, and what is on the shelf.',
    'transfers' => 'Move stock between branches when one runs short.',
][$tab];
?>

<div class="mb-5">
    <h1 class="text-2xl font-bold text-gray-900">Uniform</h1>
    <p class="text-sm text-gray-500 mt-1"><?= e($subtitle) ?></p>
</div>

<div class="inline-flex rounded-lg border border-gray-200 bg-white p-1 mb-5">
    <?php foreach ($tabs as $key => $label): ?>
        <a href="<?= baseUrl('finance/uniform') ?>?tab=<?= $key ?>"
           class="px-4 py-1.5 text-sm font-medium rounded-md transition <?= $tab === $key ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50' ?>">
            <?= e($label) ?>
        </a>
    <?php endforeach; ?>
</div>

<?php
require __DIR__ . '/uniform-' . $tab . '.php';
require __DIR__ . '/../../includes/layout-bottom.php';
