<?php
/**
 * Expense import — bring a QuickBooks (or any) export into the cashbook.
 *
 * Three screens: upload → decide → import.
 *   1. Upload the Excel file QuickBooks Desktop makes (Reports → Accountant &
 *      Taxes → Journal, or Transaction Detail by Account). Both shapes are
 *      recognised; a plain sheet with Date / Account / Payee / Memo / Amount
 *      columns works too.
 *   2. Say what each QuickBooks account is in Tuta's list, what each source
 *      account was paid from, and (for catch-all accounts) which memo words
 *      pick a better category. Suggestions are pre-filled by name.
 *   3. See every line that will land, duplicates flagged, then import. Each
 *      QuickBooks line becomes one expense through record_expense, so it posts
 *      to the ledger like anything typed by hand, with "QB-<trans>-<n>" as the
 *      reference so running the same file twice adds nothing.
 *
 * Bill payments are skipped (the bill itself is the expense); transfers,
 * deposits and tax lines are skipped too.
 */
$pageTitle = 'Import Expenses';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

if (!userCan('finance.books') && !isAdmin()) {
    flash('error', 'Importing expenses is part of the finance books.');
    redirect('dashboard');
}
require_once __DIR__ . '/../../includes/xlsx.php';

$MONEY_ACCOUNTS = ['cooperative bank', 'petty cash', 'accounts payable', 'bank', 'cash', 'mpesa', 'm-pesa', 'kcb', 'equity', 'ncba', 'undeposited funds'];
$SKIP_ACCOUNT_RE = '/tax account|sales tax|accounts receivable|opening bal|owner|equity|loan|retained/i';
$SKIP_TYPES = ['bill pmt -cheque', 'bill pmt -check', 'payment', 'deposit', 'transfer', 'sales receipt', 'invoice', 'credit card credit'];

// ── Categories (two levels) and cost centres for the pickers ──────
require_once __DIR__ . '/../../includes/finance-pickers.php';
$tree       = financeCategoryTree($sb, $sid, 'id,name,parent_category_id');
$categories = $tree['all']; $catById = $tree['byId']; $catLabel = $tree['label'];
$catOptions = fn(string $selected = '') => financeCategoryOptions($tree, $selected, null, '— skip these lines —');
$centres    = financeCentres($sb, $sid);
$kitchenId = ''; foreach ($centres as $c) if ($c['type'] === 'kitchen') { $kitchenId = $c['id']; break; }

/** Find a Tuta category by "Heading › Line" or plain name, case-insensitively. */
$findCat = function (string $path) use ($categories, $catById): string {
    [$h, $l] = array_pad(array_map('trim', explode('›', $path, 2)), 2, '');
    foreach ($categories as $c) {
        if (strcasecmp($c['name'], $l !== '' ? $l : $h) !== 0) continue;
        if ($l === '') { if (empty($c['parent_category_id'])) return $c['id']; continue; }
        $p = $catById[$c['parent_category_id'] ?? ''] ?? null;
        if ($p && strcasecmp($p['name'], $h) === 0) return $c['id'];
    }
    // Heading only, as a fallback for a line that doesn't exist here.
    foreach ($categories as $c) if (empty($c['parent_category_id']) && strcasecmp($c['name'], $h) === 0) return $c['id'];
    return '';
};

// QuickBooks account → Tuta category, by name. Order matters: first match wins.
$ACCOUNT_RULES = [
    ['/fuel|petrol|diesel/i',                        'Transport › Fuel'],
    ['/transport/i',                                 'Transport › Fuel'],
    ['/vehicle|motor|bus/i',                         'Transport › Service & repairs'],
    ['/insurance/i',                                 'Transport › Insurance & licences'],
    ['/food|beverage|meal|catering|biscuit/i',       'Meals & catering › Food purchases'],
    ['/kitchen/i',                                   'Meals & catering › Food purchases'],
    ['/gas|lpg/i',                                   'Meals & catering › Cooking gas & firewood'],
    ['/stationer|printing/i',                        'Supplies & materials › Stationery & printing'],
    ['/computer|internet|software|it\b/i',           'Supplies & materials › Computers & software'],
    ['/repair|maint/i',                              'Repairs & maintenance'],
    ['/furniture|desk|equipment/i',                  'Repairs & maintenance › Furniture'],
    ['/electric|kplc|power|water|utilit/i',          'Utilities'],
    ['/salar|wage|payroll|staff/i',                  'Salaries & wages'],
    ['/advert|marketing|promotion/i',                'Marketing › Advertising'],
    ['/travel|entertain/i',                          'Other'],
    ['/rent/i',                                      'Rent'],
    ['/licen|county|government|nema|permit/i',       'Professional & statutory › County & government fees'],
    ['/audit|legal|consult|professional/i',          'Professional & statutory › Audit, legal & consultants'],
    ['/security|guard/i',                            'Professional & statutory › Security services'],
    ['/swim|sport|game|trip|activit|club/i',         'Activities'],
    ['/office|admin|general|misc|sundry|expense/i',  'Other'],
];
// Memo words that override the account — this is how "Office Expense" gets sorted.
$MEMO_RULES = [
    ['swim',                    'Activities › Swimming'],
    ['gas',                     'Meals & catering › Cooking gas & firewood'],
    ['lpg',                     'Meals & catering › Cooking gas & firewood'],
    ['textbook',                'Supplies & materials › Textbooks'],
    ['assessment book',         'Supplies & materials › Teaching materials'],
    ['exercise book',           'Supplies & materials › Stationery & printing'],
    ['stationar',               'Supplies & materials › Stationery & printing'],
    ['printing',                'Supplies & materials › Stationery & printing'],
    ['chess',                   'Activities › Coaching & clubs'],
    ['music',                   'Activities › Coaching & clubs'],
    ['drama',                   'Activities › Coaching & clubs'],
    ['coach',                   'Activities › Coaching & clubs'],
    ['hardware',                'Repairs & maintenance'],
    ['electrical',              'Repairs & maintenance › Electrical'],
    ['plumb',                   'Repairs & maintenance › Plumbing'],
    ['paint',                   'Repairs & maintenance › Buildings & painting'],
    ['software',                'Supplies & materials › Computers & software'],
    ['computer',                'Supplies & materials › Computers & software'],
    ['quickbooks',              'Supplies & materials › Computers & software'],
    ['insurance',               'Transport › Insurance & licences'],
    ['inspection',              'Transport › Insurance & licences'],
    ['e-citizen',               'Transport › Insurance & licences'],
    ['salar',                   'Salaries & wages'],
    ['wages',                   'Salaries & wages'],
    ['kenya power',             'Utilities › Electricity'],
    ['kplc',                    'Utilities › Electricity'],
    ['water',                   'Utilities › Water'],
    ['internet',                'Utilities › Internet & airtime'],
    ['airtime',                 'Utilities › Internet & airtime'],
    ['fuel',                    'Transport › Fuel'],
    ['diesel',                  'Transport › Fuel'],
    ['tyre',                    'Transport › Tyres'],
];
$METHOD_RULES = [
    ['/petty/i',                    'petty_cash'],
    ['/mpesa|m-pesa|safaricom/i',   'mpesa'],
    ['/payable|bill/i',             'bank_transfer'],
    ['/bank|cheque|check|coop|kcb|equity|ncba/i', 'cheque'],
    ['/cash/i',                     'cash'],
];

/** Excel serial or text → Y-m-d, or ''. */
$toDate = function ($v): string {
    if ($v === null || $v === '') return '';
    if (is_numeric($v) && (float)$v > 20000 && (float)$v < 80000) return date('Y-m-d', (int)(((float)$v - 25569) * 86400));
    $t = strtotime(str_replace('/', '-', (string)$v));
    return $t ? date('Y-m-d', $t) : '';
};

/**
 * Turn a workbook into expense lines:
 *   [date, type, ref, payee, memo, account, source, amount]
 * Recognises the QuickBooks Journal (Trans no + Account columns), the
 * Transaction Detail by Account report (hierarchical headers + Split), and a
 * flat sheet (Date, Account/Category, Payee/Name, Memo/Description, Amount).
 */
$parseWorkbook = function (array $wb) use ($toDate, $MONEY_ACCOUNTS, $SKIP_ACCOUNT_RE, $SKIP_TYPES): array {
    $lines = []; $shape = '';
    foreach ($wb as $sheet => $rows) {
        if (count($rows) < 2) continue;
        // Header row: first row with 3+ non-empty cells.
        $hi = null; $col = [];
        foreach (array_slice($rows, 0, 15, true) as $i => $r) {
            $cells = array_filter(array_map(fn($c) => trim((string)$c), $r), fn($c) => $c !== '');
            if (count($cells) >= 3) { $hi = $i; foreach ($r as $j => $h) { $h = strtolower(trim((string)$h)); if ($h !== '') $col[$h] = $j; } break; }
        }
        if ($hi === null) continue;
        $g = fn(array $r, string $k) => trim((string)($r[$col[$k]] ?? ''));
        $isMoney = fn(string $acc) => in_array(strtolower(trim($acc)), $MONEY_ACCOUNTS, true) || preg_match('/bank|petty|payable|cash at|m-?pesa/i', $acc);

        if (isset($col['trans no'], $col['account'])) {                       // ── Journal
            $shape = 'QuickBooks Journal'; $cur = null;
            $flush = function () use (&$cur, &$lines, $isMoney, $SKIP_ACCOUNT_RE, $SKIP_TYPES) {
                if (!$cur) return;
                if (in_array(strtolower($cur['type']), $SKIP_TYPES, true)) return;
                $source = '';
                foreach ($cur['lines'] as $l) if ($l['credit'] > 0 && $isMoney($l['account'])) { $source = $l['account']; break; }
                $n = 0;
                foreach ($cur['lines'] as $l) {
                    if ($l['debit'] <= 0 || $isMoney($l['account']) || preg_match($SKIP_ACCOUNT_RE, $l['account'])) continue;
                    $n++;
                    $lines[] = ['date' => $cur['date'], 'type' => $cur['type'], 'ref' => 'QB-' . $cur['no'] . '-' . $n, 'num' => $cur['num'],
                                'payee' => $cur['name'] ?: $l['name'], 'memo' => $l['memo'], 'account' => $l['account'], 'source' => $source, 'amount' => $l['debit']];
                }
            };
            foreach (array_slice($rows, $hi + 1) as $r) {
                $tn = $g($r, 'trans no');
                if ($tn !== '') { $flush(); $cur = ['no' => $tn, 'type' => $g($r, 'type'), 'date' => $toDate($r[$col['date']] ?? ''), 'num' => $g($r, 'num'), 'name' => $g($r, 'name'), 'lines' => []]; }
                if (!$cur) continue;
                $acc = $g($r, 'account'); if ($acc === '') continue;
                $cur['lines'][] = ['name' => $g($r, 'name'), 'memo' => $g($r, 'memo'), 'account' => $acc,
                                   'debit' => (float)str_replace(',', '', (string)($r[$col['debit']] ?? 0)), 'credit' => (float)str_replace(',', '', (string)($r[$col['credit']] ?? 0))];
            }
            $flush();
        } elseif (isset($col['type'], $col['split']) && isset($col['debit'])) {  // ── Transaction Detail by Account
            $shape = 'QuickBooks Transaction Detail'; $path = []; $n = 0;
            foreach (array_slice($rows, $hi + 1) as $r) {
                $type = $g($r, 'type');
                if ($type !== '') {
                    if (in_array(strtolower($type), $SKIP_TYPES, true)) continue;
                    $acc = end($path) ?: ''; if ($acc === '' || $isMoney($acc) || preg_match($SKIP_ACCOUNT_RE, $acc)) continue;
                    $amt = (float)str_replace(',', '', (string)($r[$col['debit']] ?? 0)) - (float)str_replace(',', '', (string)($r[$col['credit']] ?? 0));
                    if ($amt <= 0) continue;
                    $n++;
                    $lines[] = ['date' => $toDate($r[$col['date']] ?? ''), 'type' => $type, 'ref' => 'QB-TD-' . $n, 'num' => $g($r, 'num'),
                                'payee' => $g($r, 'name'), 'memo' => $g($r, 'memo'), 'account' => $acc, 'source' => $g($r, 'split'), 'amount' => $amt];
                    continue;
                }
                $label = ''; foreach ($r as $j => $v) { if ($j >= $col['type']) break; $v = trim((string)$v); if ($v !== '') { $label = $v; break; } }
                if ($label === '') continue;
                if (str_starts_with($label, 'Total ')) { array_pop($path); continue; }
                $path[] = $label;
            }
        } else {                                                                // ── Flat sheet
            $k = fn(array $names) => (function () use ($names, $col) { foreach ($names as $n) if (isset($col[$n])) return $col[$n]; return null; })();
            $cd = $k(['date', 'txn date', 'transaction date']); $ca = $k(['amount', 'total', 'debit', 'amount (kes)']); $cc = $k(['account', 'category', 'expense account']);
            $cp = $k(['payee', 'name', 'vendor', 'supplier']); $cm = $k(['memo', 'description', 'memo/description', 'details']); $cs = $k(['paid from', 'split', 'bank account', 'payment account', 'method']); $cn = $k(['num', 'no.', 'ref', 'reference', 'no']);
            if ($cd === null || $ca === null) continue;
            $shape = 'Sheet: ' . $sheet; $n = 0;
            foreach (array_slice($rows, $hi + 1) as $r) {
                $d = $toDate($r[$cd] ?? ''); $amt = abs((float)str_replace(',', '', (string)($r[$ca] ?? 0)));
                if ($d === '' || $amt <= 0) continue;
                $n++;
                $lines[] = ['date' => $d, 'type' => 'Row', 'ref' => 'IMP-' . substr(md5($sheet . $n . $d . $amt), 0, 8), 'num' => $cn !== null ? trim((string)($r[$cn] ?? '')) : '',
                            'payee' => $cp !== null ? trim((string)($r[$cp] ?? '')) : '', 'memo' => $cm !== null ? trim((string)($r[$cm] ?? '')) : '',
                            'account' => $cc !== null ? trim((string)($r[$cc] ?? '')) : 'Imported', 'source' => $cs !== null ? trim((string)($r[$cs] ?? '')) : '', 'amount' => $amt];
            }
        }
        if ($lines) break;
    }
    return ['shape' => $shape, 'lines' => $lines];
};

// ── Flow ──────────────────────────────────────────────────────────
$S = &$_SESSION['xp_import'];
$view = 'upload'; $error = '';

if (isPost() && verifyCsrf()) {
    $step = input('step');

    if ($step === 'upload') {
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            $error = 'Choose the Excel file QuickBooks exported and try again.';
        } else {
            $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
            if ($ext !== 'xlsx') $error = 'Please export from QuickBooks as an Excel workbook (.xlsx).';
            else {
                $wb = xlsxLoad($_FILES['file']['tmp_name']);
                $parsed = $parseWorkbook($wb);
                if (!$parsed['lines']) $error = 'No expense lines were found. This importer reads the QuickBooks Journal or Transaction Detail by Account report, or a sheet with Date, Account, Payee, Memo and Amount columns.';
                elseif (count($parsed['lines']) > 3000) $error = 'That is ' . count($parsed['lines']) . ' lines — split the export by month first.';
                else {
                    // Suggest mappings.
                    $accounts = []; $sources = [];
                    foreach ($parsed['lines'] as $l) { $accounts[$l['account']] = ($accounts[$l['account']] ?? 0) + $l['amount']; $sources[$l['source'] ?: '(unknown)'] = ($sources[$l['source'] ?: '(unknown)'] ?? 0) + $l['amount']; }
                    arsort($accounts); arsort($sources);
                    $accMap = []; foreach (array_keys($accounts) as $a) { $accMap[$a] = ''; foreach ($ACCOUNT_RULES as [$re, $path]) if (preg_match($re, $a)) { $accMap[$a] = $findCat($path); break; } }
                    $srcMap = []; foreach (array_keys($sources) as $s) { $srcMap[$s] = 'bank_transfer'; foreach ($METHOD_RULES as [$re, $m]) if (preg_match($re, $s)) { $srcMap[$s] = $m; break; } }
                    $memoMap = []; foreach ($MEMO_RULES as [$word, $path]) { $id = $findCat($path); if ($id !== '') $memoMap[$word] = $id; }
                    $S = ['file' => $_FILES['file']['name'], 'shape' => $parsed['shape'], 'lines' => $parsed['lines'],
                          'accounts' => $accounts, 'sources' => $sources, 'accMap' => $accMap, 'srcMap' => $srcMap, 'memoMap' => $memoMap, 'kitchen' => $kitchenId !== ''];
                    $view = 'decide';
                }
            }
        }
    }

    if ($step === 'decide' && !empty($S)) {
        foreach ((array)($_POST['acc'] ?? []) as $a => $cid) if (array_key_exists($a, $S['accMap'])) $S['accMap'][$a] = isset($catById[$cid]) ? $cid : '';
        foreach ((array)($_POST['src'] ?? []) as $s => $m) if (array_key_exists($s, $S['srcMap'])) $S['srcMap'][$s] = preg_replace('/[^a-z_]/', '', (string)$m) ?: 'bank_transfer';
        $mm = [];
        foreach ((array)($_POST['memo_word'] ?? []) as $i => $w) { $w = strtolower(trim((string)$w)); $cid = (string)($_POST['memo_cat'][$i] ?? ''); if ($w !== '' && isset($catById[$cid])) $mm[$w] = $cid; }
        $S['memoMap'] = $mm;
        $S['kitchen'] = input('tag_kitchen') === '1' && $kitchenId !== '';
        $S['from'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', input('from')) ? input('from') : '';
        $S['to']   = preg_match('/^\d{4}-\d{2}-\d{2}$/', input('to')) ? input('to') : '';
        $view = 'preview';
    }

    if ($step === 'import' && !empty($S)) {
        $view = 'preview'; // fall through to compute the plan, then import below
        $doImport = true;
    }
    if ($step === 'reset') { unset($_SESSION['xp_import']); redirect('finance/expense-import'); }
} elseif (!empty($S)) {
    $view = isset($S['from']) ? 'preview' : 'decide';
}

// ── The plan: what each line becomes ──────────────────────────────
$plan = []; $totals = ['lines' => 0, 'amount' => 0.0, 'skip' => 0, 'dup' => 0, 'dupAmount' => 0.0];
if ($view === 'preview' && !empty($S)) {
    // Already-imported references and same-day same-amount matches, for duplicate flags.
    $existing = Supabase::fetchAllPaged(fn($q) => $q->from('expenses')->select('expense_date,amount,vendor_name,invoice_number')->eq('school_id', $sid)) ?: [];
    $byRef = []; $byKey = []; $seenInFile = [];
    foreach ($existing as $e) { if (!empty($e['invoice_number'])) $byRef[$e['invoice_number']] = true; $byKey[$e['expense_date'] . '|' . round((float)$e['amount'], 2) . '|' . strtolower(trim((string)$e['vendor_name']))] = true; }
    foreach ($S['lines'] as $l) {
        if ($S['from'] && $l['date'] < $S['from']) continue;
        if ($S['to'] && $l['date'] > $S['to']) continue;
        $cid = $S['accMap'][$l['account']] ?? '';
        $hay = strtolower($l['memo'] . ' ' . $l['payee']);
        $why = 'account';
        foreach ($S['memoMap'] as $w => $mcid) { if ($w !== '' && str_contains($hay, $w)) { $cid = $mcid; $why = 'memo "' . $w . '"'; break; } }
        if ($cid === '' || $l['date'] === '') { $totals['skip']++; continue; }
        $method = $S['srcMap'][$l['source'] ?: '(unknown)'] ?? 'bank_transfer';
        $desc = $l['memo'] !== '' && stripos($l['memo'], 'multiple') === false ? $l['memo'] : ($l['payee'] !== '' ? $l['payee'] : $l['account']);
        if ($l['payee'] !== '' && stripos($desc, $l['payee']) === false && strlen($desc) < 60) $desc .= ' — ' . $l['payee'];
        if (stripos($l['memo'], 'multiple') !== false) $desc .= ' (several items on one cheque)';
        $cc = null;
        if ($S['kitchen'] && $kitchenId !== '' && preg_match('/meal|food|kitchen|catering|gas/i', $catLabel($cid))) $cc = $kitchenId;
        $key = $l['date'] . '|' . round($l['amount'], 2) . '|' . strtolower(trim($l['payee']));
        $dup = isset($byRef[$l['ref']]) ? 'already imported'
             : (isset($byKey[$key]) ? 'same day, amount, payee exists'
             : (isset($seenInFile[$key]) && $l['payee'] !== '' ? 'twice in this file' : ''));
        $seenInFile[$key] = true;
        $plan[] = ['date' => $l['date'], 'desc' => mb_substr($desc, 0, 200), 'cat' => $cid, 'why' => $why, 'method' => $method, 'payee' => $l['payee'], 'ref' => $l['ref'],
                   'num' => $l['num'], 'amount' => $l['amount'], 'account' => $l['account'], 'cc' => $cc, 'dup' => $dup];
        $totals['lines']++; $totals['amount'] += $l['amount'];
        if ($dup !== '') { $totals['dup']++; $totals['dupAmount'] += $l['amount']; }
    }
}

// ── Import ────────────────────────────────────────────────────────
if (!empty($doImport) && $plan) {
    $ok = 0; $sum = 0.0; $fail = 0; $skippedDup = 0; $firstErr = '';
    $includeDup = input('include_dup') === '1';
    foreach ($plan as $p) {
        if ($p['dup'] !== '' && !$includeDup) { $skippedDup++; continue; }
        $r = $sb->rpc('record_expense', [
            'p_school_id' => $sid, 'p_description' => $p['desc'], 'p_amount' => $p['amount'], 'p_expense_date' => $p['date'],
            'p_category_id' => $p['cat'], 'p_vendor_name' => $p['payee'] ?: null, 'p_invoice_number' => $p['ref'],
            'p_payment_method' => $p['method'], 'p_user_id' => $me['id'] ?? null, 'p_user_email' => $me['email'] ?? null,
            'p_lines' => null, 'p_cost_centre_id' => $p['cc'], 'p_litres' => null, 'p_odometer_km' => null,
        ]);
        $d = $r['data'] ?? null;
        if (is_array($d) && !empty($d['success'])) { $ok++; $sum += $p['amount']; }
        else { $fail++; if ($firstErr === '') $firstErr = is_array($d) ? ($d['error'] ?? '') : (string)($r['error'] ?? ''); }
    }
    auditLog('import', 'expense', null, ['file' => $S['file'], 'shape' => $S['shape'], 'imported' => $ok, 'amount' => round($sum, 2), 'failed' => $fail, 'skipped_dup' => $skippedDup]);
    unset($_SESSION['xp_import']);
    if ($fail) flash('error', $ok . ' imported (' . money($sum) . '); ' . $fail . ' failed' . ($firstErr ? ' — ' . $firstErr : '') . '.');
    else flashLink('success', $ok . ' expenses imported, ' . money($sum) . '.' . ($skippedDup ? ' ' . $skippedDup . ' duplicates left out.' : ''), baseUrl('finance/expenses?month=all'), 'Open the cashbook');
    redirect('finance/expense-import');
}

require __DIR__ . '/../../includes/layout-top.php';
$f = 'px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 outline-none bg-white';
$card = 'bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]';
$methods = ['cheque' => 'Cheque / bank', 'bank_transfer' => 'Bank transfer', 'petty_cash' => 'Petty cash (the tin)', 'cash' => 'Cash', 'mpesa' => 'M-Pesa'];
?>

<div class="mb-5 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Import Expenses</h1>
        <p class="text-sm text-gray-500 mt-1">Bring QuickBooks history into the cashbook — every line lands as if typed, under Tuta's categories, posted to the ledger.</p>
    </div>
    <?php if ($view !== 'upload'): ?>
    <form method="POST"><?= csrfField() ?><input type="hidden" name="step" value="reset"><button class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">Start over</button></form>
    <?php endif; ?>
</div>

<?php if ($error): ?><div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><?= e($error) ?></div><?php endif; ?>

<?php if ($view === 'upload'): ?>
<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
    <div class="<?= $card ?> p-6">
        <form method="POST" enctype="multipart/form-data" class="space-y-4">
            <?= csrfField() ?><input type="hidden" name="step" value="upload">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">QuickBooks export (.xlsx)</label>
                <input type="file" name="file" accept=".xlsx" required class="block w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-medium">
            </div>
            <button class="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Read the file</button>
        </form>
    </div>
    <div class="<?= $card ?> p-5 text-sm text-gray-600 space-y-3">
        <p class="font-semibold text-gray-800">Which export</p>
        <p>In QuickBooks Desktop: <b>Reports → Accountant &amp; Taxes → Journal</b>, set the dates, then <b>Excel → Create New Worksheet</b>. Every cheque and bill comes through with its account lines.</p>
        <p><b>Transaction Detail by Account</b> works too. So does any sheet with Date, Account, Payee, Memo and Amount columns.</p>
        <p class="text-gray-500">Bill payments, deposits and transfers are ignored — the bill is the expense, the payment just settles it.</p>
    </div>
</div>

<?php elseif ($view === 'decide'): ?>
<form method="POST">
    <?= csrfField() ?><input type="hidden" name="step" value="decide">
    <div class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-900">
        <b><?= e($S['file']) ?></b> — <?= e($S['shape']) ?> · <?= count($S['lines']) ?> expense lines · <?= money(array_sum(array_column($S['lines'], 'amount'))) ?>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        <div class="<?= $card ?> p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">What each QuickBooks account is here</h2>
            <p class="text-xs text-gray-500 mb-3">Pre-filled by name. "Skip" leaves those lines out.</p>
            <div class="space-y-2">
                <?php foreach ($S['accounts'] as $a => $amt): ?>
                <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-center">
                    <div class="min-w-0"><p class="text-sm text-gray-900 truncate"><?= e($a) ?></p><p class="text-[11px] text-gray-400 tabular-nums"><?= money($amt) ?></p></div>
                    <select name="acc[<?= e($a) ?>]" class="<?= $f ?> w-full"><?= $catOptions($S['accMap'][$a] ?? '') ?></select>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <div class="space-y-5">
            <div class="<?= $card ?> p-5">
                <h2 class="text-sm font-semibold text-gray-800 mb-1">What each was paid from</h2>
                <div class="space-y-2 mt-3">
                    <?php foreach ($S['sources'] as $s => $amt): ?>
                    <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-center">
                        <div class="min-w-0"><p class="text-sm text-gray-900 truncate"><?= e($s) ?></p><p class="text-[11px] text-gray-400 tabular-nums"><?= money($amt) ?></p></div>
                        <select name="src[<?= e($s) ?>]" class="<?= $f ?> w-full"><?php foreach ($methods as $k => $v): ?><option value="<?= $k ?>"<?= ($S['srcMap'][$s] ?? '') === $k ? ' selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            <div class="<?= $card ?> p-5">
                <h2 class="text-sm font-semibold text-gray-800 mb-1">Only this period</h2>
                <p class="text-xs text-gray-500 mb-3">Leave blank for the whole file. Useful at month end when the export overlaps what's already in.</p>
                <div class="flex items-center gap-2">
                    <input type="date" name="from" class="<?= $f ?>"><span class="text-gray-400 text-xs">to</span><input type="date" name="to" class="<?= $f ?>">
                </div>
                <?php if ($kitchenId !== ''): ?>
                <label class="flex items-center gap-2 text-sm text-gray-700 mt-4"><input type="checkbox" name="tag_kitchen" value="1" checked class="rounded"> Tag food, kitchen and gas lines to the <b>Kitchen</b> cost centre</label>
                <?php endif; ?>
            </div>
        </div>
    </div>

    <div class="<?= $card ?> p-5 mb-5">
        <h2 class="text-sm font-semibold text-gray-800 mb-1">Sort by what the memo says</h2>
        <p class="text-xs text-gray-500 mb-3">A catch-all account like "Office Expense" hides swimming, gas, textbooks and coaching. When a memo or payee contains a word below, that line goes to the category on the right instead of the account's. First match wins; edit, clear or add rows.</p>
        <div id="memoRows" class="space-y-2">
            <?php $i = 0; foreach ($S['memoMap'] as $w => $cid): ?>
            <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 items-center">
                <input type="text" name="memo_word[<?= $i ?>]" value="<?= e($w) ?>" class="<?= $f ?> w-full" placeholder="word in memo or payee">
                <select name="memo_cat[<?= $i ?>]" class="<?= $f ?> w-full"><?= $catOptions($cid) ?></select>
                <button type="button" onclick="this.parentNode.remove()" class="text-gray-400 hover:text-red-600 px-2 text-lg leading-none">&times;</button>
            </div>
            <?php $i++; endforeach; ?>
        </div>
        <button type="button" onclick="addMemoRow()" class="mt-3 text-sm font-medium text-emerald-700">+ Add a word</button>
        <template id="memoTpl"><div class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 items-center"><input type="text" name="memo_word[__i__]" class="<?= $f ?> w-full" placeholder="word in memo or payee"><select name="memo_cat[__i__]" class="<?= $f ?> w-full"><?= $catOptions() ?></select><button type="button" onclick="this.parentNode.remove()" class="text-gray-400 hover:text-red-600 px-2 text-lg leading-none">&times;</button></div></template>
    </div>

    <div class="flex justify-end"><button class="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm">Preview what will land →</button></div>
</form>
<script>
var memoN = <?= (int)$i ?>;
function addMemoRow(){ var t=document.getElementById('memoTpl').innerHTML.replace(/__i__/g, memoN++); var d=document.createElement('div'); d.innerHTML=t; document.getElementById('memoRows').appendChild(d.firstChild); }
</script>

<?php elseif ($view === 'preview'): ?>
<?php
$byCat = []; $byMonth = []; foreach ($plan as $p) { $byCat[$p['cat']] = ($byCat[$p['cat']] ?? 0) + $p['amount']; $byMonth[substr($p['date'], 0, 7)] = ($byMonth[substr($p['date'], 0, 7)] ?? 0) + $p['amount']; } arsort($byCat); ksort($byMonth); ?>
<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold text-gray-900 tabular-nums"><?= number_format($totals['lines']) ?></p><p class="text-xs text-gray-500">Lines to import · <?= money($totals['amount']) ?></p></div>
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold text-gray-900 tabular-nums"><?= count($byCat) ?></p><p class="text-xs text-gray-500">Categories · <?= count($byMonth) ?> months</p></div>
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold tabular-nums <?= $totals['dup'] ? 'text-amber-600' : 'text-gray-900' ?>"><?= number_format($totals['dup']) ?></p><p class="text-xs text-gray-500">Look like duplicates · <?= money($totals['dupAmount']) ?></p></div>
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold text-gray-400 tabular-nums"><?= number_format($totals['skip']) ?></p><p class="text-xs text-gray-500">Skipped (no category or date)</p></div>
</div>

<div class="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
    <div class="<?= $card ?> p-5">
        <h2 class="text-sm font-semibold text-gray-800 mb-3">By category</h2>
        <?php $mx = $byCat ? max($byCat) : 0; ?>
        <ul class="space-y-2">
            <?php foreach ($byCat as $cid => $amt): ?>
            <li><div class="flex justify-between text-[12.5px]"><span class="text-gray-800 truncate"><?= e($catLabel($cid)) ?></span><span class="font-semibold tabular-nums"><?= number_format($amt) ?></span></div>
                <div class="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden"><div class="h-full rounded-full bg-violet-500" style="width:<?= $mx > 0 ? (int)($amt / $mx * 100) : 0 ?>%"></div></div></li>
            <?php endforeach; ?>
        </ul>
    </div>
    <div class="<?= $card ?> p-5">
        <h2 class="text-sm font-semibold text-gray-800 mb-3">By month</h2>
        <?php $mx = $byMonth ? max($byMonth) : 0; ?>
        <div class="flex items-end gap-2 h-36">
            <?php foreach ($byMonth as $m => $amt): ?>
            <div class="flex-1 flex flex-col items-center justify-end h-full" title="<?= e(money($amt)) ?>"><span class="text-[10px] text-gray-500 tabular-nums mb-1"><?= number_format($amt / 1000000, 1) ?>M</span><div class="w-full rounded-t bg-teal-500" style="height:<?= $mx > 0 ? max(3, (int)($amt / $mx * 100)) : 3 ?>%"></div><span class="text-[10px] text-gray-400 mt-1"><?= e(date('M', strtotime($m . '-01'))) ?></span></div>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<form method="POST" onsubmit="return confirm('Import <?= (int)$totals['lines'] - (int)$totals['dup'] ?> expenses into the cashbook? Each can be edited or voided afterwards.')">
    <?= csrfField() ?><input type="hidden" name="step" value="import">
    <div class="<?= $card ?> overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <h2 class="text-sm font-semibold text-gray-800">Every line, as it will land</h2>
            <?php if ($totals['dup']): ?><label class="text-xs text-gray-600 flex items-center gap-2"><input type="checkbox" name="include_dup" value="1" class="rounded"> Import the <?= $totals['dup'] ?> likely duplicates too</label><?php endif; ?>
        </div>
        <div class="overflow-x-auto" style="max-height:60vh"><table class="w-full text-sm">
            <thead class="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 sticky top-0"><tr><th class="text-left px-4 py-2">Date</th><th class="text-left px-3 py-2">What</th><th class="text-left px-3 py-2">Category</th><th class="text-left px-3 py-2">Paid by</th><th class="text-left px-3 py-2">Ref</th><th class="text-right px-4 py-2">KES</th></tr></thead>
            <tbody class="divide-y divide-gray-50">
            <?php foreach ($plan as $p): ?>
                <tr class="<?= $p['dup'] ? 'bg-amber-50/60' : '' ?>">
                    <td class="px-4 py-1.5 text-gray-500 whitespace-nowrap"><?= e(date('j M y', strtotime($p['date']))) ?></td>
                    <td class="px-3 py-1.5 text-gray-900"><?= e($p['desc']) ?><?= $p['dup'] ? ' <span class="text-[11px] text-amber-700">· ' . e($p['dup']) . '</span>' : '' ?></td>
                    <td class="px-3 py-1.5 text-gray-700"><?= e($catLabel($p['cat'])) ?><?= $p['why'] !== 'account' ? ' <span class="text-[11px] text-gray-400">by ' . e($p['why']) . '</span>' : '' ?><?= $p['cc'] ? ' <span class="text-[11px] text-gray-400">· Kitchen</span>' : '' ?></td>
                    <td class="px-3 py-1.5 text-gray-600"><?= e($methods[$p['method']] ?? $p['method']) ?></td>
                    <td class="px-3 py-1.5 text-gray-400 font-mono text-xs"><?= e($p['ref']) ?></td>
                    <td class="px-4 py-1.5 text-right tabular-nums font-medium"><?= number_format($p['amount']) ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table></div>
        <div class="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
            <span class="text-xs text-gray-500">Lines marked amber already seem to be in the cashbook and are left out unless you tick the box.</span>
            <div class="flex gap-2">
                <button type="button" onclick="history.back()" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">← Change the sorting</button>
                <button type="submit" class="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm">Import <?= (int)$totals['lines'] - (int)$totals['dup'] ?> expenses</button>
            </div>
        </div>
    </div>
</form>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
