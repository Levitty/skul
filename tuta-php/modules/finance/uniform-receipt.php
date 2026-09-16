<?php
/**
 * Uniform Sale Receipt — standalone printable page, same compact format as
 * the fee receipt so the two look like they came from the same book.
 * Receives ?id=UUID (uniform_sales.id).
 */
$pageTitle = 'Uniform Receipt';
$sb  = new Supabase();
$sid = schoolId();

$saleId = trim($_GET['id'] ?? '');
if (!$saleId) die('Sale ID is required.');

$sale = $sb->from('uniform_sales')
    ->select('id,sale_number,total_amount,sale_date,payment_method,transaction_ref,student_id,customer_name,customer_phone,sold_by,notes,created_at')
    ->eq('id', $saleId)->eq('school_id', $sid)->single()->execute()['data'][0] ?? null;
if (!$sale) die('Sale not found.');

// Lines → size → item, so the receipt reads "School sweater · 28".
$items = $sb->from('uniform_sale_items')->select('id,variant_id,quantity,unit_price,total_price')
    ->eq('sale_id', $saleId)->execute()['data'] ?? [];
$lines = [];
if (!empty($items)) {
    $vids = array_values(array_unique(array_column($items, 'variant_id')));
    $vmap = [];
    foreach (Supabase::fetchByChunkedIn(
        fn($_sb) => $_sb->from('uniform_variants')->select('id,product_id,size'), 'id', $vids
    ) as $v) $vmap[$v['id']] = $v;
    $pids = array_values(array_unique(array_filter(array_column($vmap, 'product_id'))));
    $pmap = [];
    if (!empty($pids)) {
        foreach (Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('uniform_products')->select('id,name'), 'id', $pids
        ) as $p) $pmap[$p['id']] = $p['name'];
    }
    foreach ($items as $it) {
        $v = $vmap[$it['variant_id']] ?? null;
        $lines[] = [
            'name'  => $v ? ($pmap[$v['product_id']] ?? 'Item') : 'Item',
            'size'  => $v['size'] ?? '',
            'qty'   => (int)($it['quantity'] ?? 0),
            'unit'  => (float)($it['unit_price'] ?? 0),
            'total' => (float)($it['total_price'] ?? 0),
        ];
    }
}
// Legacy single-line sales (before line items) carry their description in notes.
$legacyLabel = empty($lines) ? trim((string)($sale['notes'] ?? '')) : '';

$student = null; $className = '';
if (!empty($sale['student_id'])) {
    $student = $sb->from('students')->select('id,first_name,last_name,admission_number,current_class_id')
        ->eq('id', $sale['student_id'])->single()->execute()['data'][0] ?? null;
    if ($student && !empty($student['current_class_id'])) {
        $className = cachedClassMap()[$student['current_class_id']] ?? '';
    }
}

$school = cachedSchool();
$methodLabels  = methodLabelMap();
$methodDisplay = $methodLabels[$sale['payment_method'] ?? ''] ?? ucfirst($sale['payment_method'] ?? 'Cash');
$saleNumber    = !empty($sale['sale_number']) ? $sale['sale_number'] : 'U-' . strtoupper(substr($sale['id'], 0, 8));
$saleDate      = $sale['sale_date'] ?: substr((string)($sale['created_at'] ?? ''), 0, 10);

$soldBy = '';
if (!empty($sale['sold_by'])) {
    $pn = $sb->from('user_profiles')->select('full_name,email')->eq('id', $sale['sold_by'])->single()->execute();
    $soldBy = trim((string)($pn['data'][0]['full_name'] ?? '')) ?: (string)($pn['data'][0]['email'] ?? '');
}

$rcBrand = schoolSetting('brand_color', '#059669');
if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $rcBrand)) $rcBrand = '#059669';
$rcBits = array_filter([$school['address'] ?? '', $school['phone'] ?? '', $school['email'] ?? '']);
$buyer  = $student
    ? trim(($student['first_name'] ?? '') . ' ' . ($student['last_name'] ?? ''))
    : (trim((string)($sale['customer_name'] ?? '')) ?: 'Walk-in customer');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt <?= e($saleNumber) ?> — <?= e($school['name'] ?? 'School') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link rel="stylesheet" href="/assets/tuta-extra.css?v=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        @page { margin: 8mm; }
        @media print {
            .no-print { display: none !important; }
            body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
            .print-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; border-radius: 0 !important; max-width: 100% !important; width: 100% !important; margin: 0 !important; page-break-inside: avoid; }
        }
    </style>
</head>
<body class="bg-gray-100 min-h-screen flex flex-col items-center py-8 px-4 gap-4">

    <div class="no-print fixed top-4 right-4 flex gap-3 z-50 flex-wrap justify-end">
        <button onclick="window.print()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg shadow-lg font-medium transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print Receipt
        </button>
        <button onclick="if(window.history.length>1){history.back()}else{window.close()};setTimeout(function(){window.location.href='<?= baseUrl('finance/uniform') ?>?tab=sell'},150)" class="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg shadow-lg font-medium border border-gray-200 transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Back
        </button>
    </div>

    <div class="print-card bg-white w-full max-w-2xl rounded-xl shadow-lg border border-gray-200 overflow-hidden relative">

        <div class="flex items-center gap-3 px-5 py-2.5 relative z-10" style="border-bottom: 2px solid <?= e($rcBrand) ?>;">
            <?php if (!empty($school['logo_url'])): ?>
                <img src="<?= e($school['logo_url']) ?>" alt="" class="w-10 h-10 object-contain rounded flex-shrink-0">
            <?php else: ?>
                <div class="w-10 h-10 rounded flex items-center justify-center flex-shrink-0" style="background: <?= e($rcBrand) ?>;">
                    <span class="text-white text-sm font-bold"><?= e(strtoupper(substr($school['name'] ?? 'S', 0, 2))) ?></span>
                </div>
            <?php endif; ?>
            <div class="min-w-0">
                <h1 class="text-sm font-bold text-gray-900 uppercase tracking-wide leading-tight"><?= e($school['name'] ?? 'School') ?></h1>
                <?php if ($rcBits): ?><p class="text-[10px] text-gray-500 leading-tight"><?= e(implode('  ·  ', $rcBits)) ?></p><?php endif; ?>
            </div>
        </div>
        <div class="flex items-center justify-between px-5 py-1.5 relative z-10" style="background: <?= e($rcBrand) ?>;">
            <h2 class="text-xs font-bold text-white uppercase tracking-widest">Uniform Sale Receipt</h2>
            <span class="text-[11px] font-mono text-white" style="opacity: .9;"><?= e($saleNumber) ?></span>
        </div>

        <div class="px-5 py-3 relative z-10">
            <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] text-gray-500 min-w-0 truncate">Uniform sale · <?= e(date('j M Y', strtotime($saleDate))) ?></span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700 flex-shrink-0 ml-2">Paid</span>
            </div>

            <!-- Buyer block -->
            <div class="rounded-lg border border-gray-300 overflow-hidden mb-2">
                <table class="w-full text-xs">
                    <tbody>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 w-40 border-r border-gray-200 align-top"><?= $student ? 'Student Name' : 'Customer' ?></td>
                            <td class="px-3 py-1.5 text-gray-900 font-semibold"><?= e($buyer) ?><?php if ($student && !empty($student['admission_number'])): ?> <span class="font-normal text-gray-400">· Adm <?= e($student['admission_number']) ?></span><?php endif; ?></td>
                        </tr>
                        <?php if ($className): ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Class</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= e($className) ?></td>
                        </tr>
                        <?php endif; ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Payment Method</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= e($methodDisplay) ?></td>
                        </tr>
                        <?php if (!empty($sale['transaction_ref'])): ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Transaction ID</td>
                            <td class="px-3 py-1.5 text-gray-800 font-mono"><?= e($sale['transaction_ref']) ?></td>
                        </tr>
                        <?php endif; ?>
                        <?php if ($soldBy !== ''): ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Served By</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= e($soldBy) ?></td>
                        </tr>
                        <?php endif; ?>
                        <tr>
                            <td class="px-3 py-1.5 text-gray-500 border-r border-gray-200">Date</td>
                            <td class="px-3 py-1.5 text-gray-800"><?= e(date('j M Y', strtotime($saleDate))) ?></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Lines -->
            <div class="rounded-lg border border-gray-300 overflow-hidden">
                <table class="w-full text-xs">
                    <thead>
                        <tr class="bg-gray-50 border-b border-gray-300 text-[10px] uppercase tracking-wide text-gray-500">
                            <th class="text-left px-3 py-1.5 font-semibold">Item</th>
                            <th class="text-right px-3 py-1.5 font-semibold w-12">Qty</th>
                            <th class="text-right px-3 py-1.5 font-semibold w-24">Each</th>
                            <th class="text-right px-3 py-1.5 font-semibold w-28">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (!empty($lines)): foreach ($lines as $l): ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-900"><?= e($l['name']) ?><?php if ($l['size'] !== ''): ?> <span class="text-gray-400">· <?= e($l['size']) ?></span><?php endif; ?></td>
                            <td class="px-3 py-1.5 text-right text-gray-800"><?= $l['qty'] ?></td>
                            <td class="px-3 py-1.5 text-right text-gray-800"><?= money($l['unit']) ?></td>
                            <td class="px-3 py-1.5 text-right text-gray-900 font-medium"><?= money($l['total']) ?></td>
                        </tr>
                        <?php endforeach; else: ?>
                        <tr class="border-b border-gray-200">
                            <td class="px-3 py-1.5 text-gray-900" colspan="3"><?= e($legacyLabel !== '' ? $legacyLabel : 'Uniform') ?></td>
                            <td class="px-3 py-1.5 text-right text-gray-900 font-medium"><?= money((float)$sale['total_amount']) ?></td>
                        </tr>
                        <?php endif; ?>
                    </tbody>
                    <tfoot>
                        <tr class="bg-gray-50">
                            <td class="px-3 py-2 text-gray-700 font-semibold" colspan="3">Total Paid</td>
                            <td class="px-3 py-2 text-right text-gray-900 font-bold"><?= money((float)$sale['total_amount']) ?></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <?php $rcNote = trim((string)schoolSetting('receipt_note', '')); if ($rcNote !== ''): ?>
            <p class="text-center text-[11px] font-semibold text-gray-700 mt-3">NB: <?= e($rcNote) ?></p>
            <?php endif; ?>

            <div class="text-center text-[9px] text-gray-400 mt-2 leading-relaxed">
                <p>For enquiries, contact <?= e($school['phone'] ?? 'the school office') ?><?= !empty($school['email']) ? ' or ' . e($school['email']) : '' ?>.</p>
                <?php $rcKraPin = trim((string)schoolSetting('kra_pin', '')); if ($rcKraPin !== ''): ?>
                    <p>KRA PIN: <?= e($rcKraPin) ?></p>
                <?php endif; ?>
                <p class="font-mono text-gray-300 pt-1">Sale ID: <?= e($sale['id']) ?></p>
            </div>
        </div>
    </div>
</body>
</html>
