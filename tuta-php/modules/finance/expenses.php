<?php
/**
 * Expenses — the cashbook.
 *
 * Built for the bursar who logs three lines a day: a quick-add row pinned
 * above a dense one-line-per-entry ledger, day headers with subtotals, and a
 * right rail that says where the month went (by category, by method, versus
 * last month). Categories are the school's own — shown in Title Case, stored
 * as typed.
 *
 * Money in the books: record_expense (mig. 103) inserts + posts the ledger;
 * edits re-post and voids reverse through the trigger from mig. 104; a void
 * is a governed action (void_expense, mig. 122) with a reason, gated by the
 * same approval rule as payment voids.
 */
$pageTitle = 'Expenses';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

// The dashboard's palette — categories borrow it so the page reads as one system.
$palette = ['#8b5cf6', '#14b8a6', '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899'];

/** Show ALL-CAPS category names in Title Case; leave mixed-case names alone. */
$titleCase = function (string $n): string {
    $n = trim($n);
    if ($n === '' || preg_match('/[a-z]/', $n)) return $n;
    $t = mb_convert_case(mb_strtolower($n), MB_CASE_TITLE);
    // Keep acronyms in brackets, e.g. "(KPLC)".
    return preg_replace_callback('/\(([^)]{2,6})\)/', fn($m) => '(' . mb_strtoupper($m[1]) . ')', $t);
};

$filterMonth = trim((string)input('month'));
// The period can be a month, "all", or a term ("term:<id>") — the school's own cut of the year.
$terms = cachedTerms();
$termById = []; foreach ($terms as $t) $termById[$t['id']] = $t;
$filterTerm = null;
if (str_starts_with($filterMonth, 'term:') && isset($termById[substr($filterMonth, 5)])) $filterTerm = $termById[substr($filterMonth, 5)];
if ($filterTerm === null && ($filterMonth === '' || (!preg_match('/^\d{4}-\d{2}$/', $filterMonth) && $filterMonth !== 'all'))) {
    $filterMonth = date('Y-m');
}
// A term runs from its first day to the day before the next term starts, so
// holiday spending is counted with the term that just ended.
$termSpan = function (array $t) use ($terms): array {
    $end = $t['end_date']; $next = null;
    foreach ($terms as $o) if ($o['start_date'] > $t['start_date'] && ($next === null || $o['start_date'] < $next)) $next = $o['start_date'];
    if ($next) $end = date('Y-m-d', strtotime($next . ' -1 day'));
    return [$t['start_date'], max($end, $t['end_date'])];
};
$back = fn(string $month = ''): string => 'finance/expenses?month=' . ($month !== '' ? $month : $filterMonth);

// ════════════════════════════════════════════════════════════════
// POST
// ════════════════════════════════════════════════════════════════
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // ── Categories — the list is the manager's, so it stays the same at
    //    every branch and the group reports line up. Others pick from it. ──
    if (in_array($action, ['add_category', 'edit_category', 'delete_category'], true) && !isAdmin()) {
        flash('error', 'Categories are set by an administrator. Record the expense under the closest heading and ask them to add the line.');
        redirect($back());
    }
    // A parent must be a top-level heading of this school (two levels only).
    $resolveParent = function (?string $pid) use ($sb, $sid): ?string {
        if (!$pid) return null;
        $p = $sb->from('expense_categories')->select('id,parent_category_id')->eq('id', $pid)->eq('school_id', $sid)->single()->execute()['data'][0] ?? null;
        if (!$p || !empty($p['parent_category_id'])) return null;
        return $p['id'];
    };
    if ($action === 'add_category') {
        $name = trim((string)input('cat_name'));
        $desc = trim((string)input('cat_description'));
        $pid  = $resolveParent(input('parent_id') ?: null);
        if ($name === '') {
            flash('error', 'Category name is required.');
        } else {
            $row = ['school_id' => $sid, 'name' => $name, 'description' => $desc ?: null, 'parent_category_id' => $pid];
            if ($pid) {
                $pc = $sb->from('expense_categories')->select('account_code')->eq('id', $pid)->single()->execute()['data'][0] ?? [];
                if (!empty($pc['account_code'])) $row['account_code'] = $pc['account_code'];   // posts to the heading's P&L line
            }
            $r = $sb->from('expense_categories')->insert($row);
            flash($r['error'] ? 'error' : 'success', $r['error'] ?: 'Category "' . $name . '" added.');
        }
        redirect($back());
    }

    if ($action === 'edit_category') {
        $id   = input('category_id');
        $name = trim((string)input('cat_name'));
        $desc = trim((string)input('cat_description'));
        $pid  = $resolveParent(input('parent_id') ?: null);
        if ($pid === $id) $pid = null;
        if ($name === '') {
            flash('error', 'Category name is required.');
        } else {
            $hasKids = $sb->from('expense_categories')->select('id')->eq('parent_category_id', $id)->limit(1)->execute()['data'] ?? [];
            if ($pid && $hasKids) {
                flash('error', 'That is a heading with lines under it — move its lines first if you want it to become a line itself.');
                redirect($back());
            }
            $upd = ['name' => $name, 'description' => $desc ?: null, 'parent_category_id' => $pid];
            if ($pid) {
                $pc = $sb->from('expense_categories')->select('account_code')->eq('id', $pid)->single()->execute()['data'][0] ?? [];
                if (!empty($pc['account_code'])) $upd['account_code'] = $pc['account_code'];
            }
            $r = $sb->from('expense_categories')->eq('id', $id)->eq('school_id', $sid)->update($upd);
            flash($r['error'] ? 'error' : 'success', $r['error'] ?: 'Category updated.');
        }
        redirect($back());
    }

    if ($action === 'delete_category') {
        $id = input('category_id');
        $inUse = $sb->from('expenses')->select('id')->eq('category_id', $id)->eq('school_id', $sid)->limit(1)->execute();
        $kids  = $sb->from('expense_categories')->select('id')->eq('parent_category_id', $id)->limit(1)->execute();
        if (!empty($inUse['data'][0]['id'])) {
            flash('error', 'This category is used by existing expenses. Move those to another category first.');
        } elseif (!empty($kids['data'][0]['id'])) {
            flash('error', 'This heading has lines under it. Delete or move those first.');
        } else {
            $r = $sb->from('expense_categories')->eq('id', $id)->eq('school_id', $sid)->delete();
            flash($r['error'] ? 'error' : 'success', $r['error'] ?: 'Category deleted.');
        }
        redirect($back());
    }

    // ── Add (quick row and full form share one path) ──────────────
    if ($action === 'add_expense' || $action === 'quick_add') {
        $description   = trim((string)input('description'));
        $amount        = round((float)str_replace(',', '', (string)input('amount')), 2);
        $date          = input('date') ?: date('Y-m-d');
        $categoryId    = input('category_id') ?: null;
        $supplier      = trim((string)input('supplier')) ?: null;
        $reference     = trim((string)input('reference')) ?: null;
        $paymentMethod = input('payment_method') ?: 'cash';
        // "Not paid yet" is chosen in the same box as the method: it means a
        // supplier invoice we owe. The method is settled later, on Mark paid.
        $paymentStatus = $paymentMethod === 'unpaid' ? 'unpaid' : 'paid';
        if ($paymentStatus === 'unpaid') $paymentMethod = 'bank_transfer';
        $landMonth     = preg_match('/^\d{4}-\d{2}/', $date) ? substr($date, 0, 7) : $filterMonth;
        $ccId          = input('cost_centre_id') ?: null;
        $litres        = (float)str_replace(',', '', (string)input('litres')) ?: null;
        $odometer      = (int)str_replace(',', '', (string)input('odometer_km')) ?: null;

        // Optional line items — "12 reams × 450". When present, they are the
        // amount; the single Amount box is ignored so the two cannot disagree.
        $lines = [];
        foreach ((array)($_POST['line_desc'] ?? []) as $i => $d) {
            $d = trim((string)$d);
            if ($d === '') continue;
            $unitLabel = trim((string)($_POST['line_measure'][$i] ?? ''));
            $lines[] = [
                'description' => mb_substr($d . ($unitLabel !== '' && $unitLabel !== 'pcs' ? ' (' . $unitLabel . ')' : ''), 0, 120),
                'quantity'    => max(0.01, (float)($_POST['line_qty'][$i] ?? 1)),
                'unit_cost'   => max(0, (float)str_replace(',', '', (string)($_POST['line_unit'][$i] ?? 0))),
            ];
        }
        if ($lines) {
            $amount = 0;
            foreach ($lines as $ln) $amount += round($ln['quantity'] * $ln['unit_cost'], 2);
        }

        if ($categoryId) {
            $chk = $sb->from('expense_categories')->select('id')->eq('id', $categoryId)->eq('school_id', $sid)->single()->execute();
            if (empty($chk['data'][0]['id'])) $categoryId = null;
        }
        if ($ccId) {
            $chk = $sb->from('cost_centres')->select('id')->eq('id', $ccId)->eq('school_id', $sid)->single()->execute();
            if (empty($chk['data'][0]['id'])) $ccId = null;
        }
        $allowedMethods = array_column(cachedPaymentMethods(), 'code');
        $methodOk = $paymentStatus === 'unpaid' || empty($allowedMethods) || $paymentMethod === 'petty_cash' || in_array($paymentMethod, $allowedMethods, true);

        if ($description === '' || $amount <= 0) {
            flash('error', 'A description and an amount above zero are required.');
        } elseif (!$categoryId) {
            flash('error', 'Choose a category for this expense.');
        } elseif (!$methodOk) {
            flash('error', 'Choose a payment method from Settings → Payment Methods.');
        } else {
            $res = $sb->rpc('record_expense', [
                'p_school_id'      => $sid,
                'p_description'    => $description,
                'p_amount'         => $amount,
                'p_expense_date'   => $date,
                'p_category_id'    => $categoryId,
                'p_vendor_name'    => $supplier,
                'p_invoice_number' => $reference,
                'p_payment_method' => $paymentMethod,
                'p_user_id'        => $me['id']    ?? null,
                'p_user_email'     => $me['email'] ?? null,
                'p_lines'          => $lines ?: null,
                'p_cost_centre_id' => $ccId,
                'p_litres'         => $litres,
                'p_odometer_km'    => $odometer,
                'p_payment_status' => $paymentStatus,
            ]);
            $p = $res['data'] ?? null;
            if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
                $msg = is_array($p) ? ($p['error'] ?? 'Could not record the expense.') : 'Could not record the expense.';
                if (!is_array($p) && stripos((string)($res['error'] ?? ''), 'p_cost_centre_id') !== false) $msg = 'Migration 140 has not been run yet — the cost centre fields are not in the database.';
                if (!is_array($p) && stripos((string)($res['error'] ?? ''), 'p_payment_status') !== false) $msg = 'Migration 144 has not been run yet — unpaid invoices need it.';
                flash('error', $msg);
            } else {
                flash('success', money($amount) . ($paymentStatus === 'unpaid' ? ' recorded as owed to ' . ($supplier ?: 'the supplier') . ' — ' : ' booked — ') . $description . '.');
            }
        }
        redirect($back($landMonth));
    }

    // ── Edit ──────────────────────────────────────────────────────
    if ($action === 'edit_expense') {
        $id            = input('expense_id');
        $description   = trim((string)input('description'));
        $amount        = round((float)str_replace(',', '', (string)input('amount')), 2);
        $date          = input('date') ?: date('Y-m-d');
        $categoryId    = input('category_id') ?: null;
        $supplier      = trim((string)input('supplier')) ?: null;
        $reference     = trim((string)input('reference')) ?: null;
        $paymentMethod = input('payment_method') ?: 'cash';
        $ccId          = input('cost_centre_id') ?: null;
        $litres        = (float)str_replace(',', '', (string)input('litres')) ?: null;
        $odometer      = (int)str_replace(',', '', (string)input('odometer_km')) ?: null;

        if ($categoryId) {
            $chk = $sb->from('expense_categories')->select('id')->eq('id', $categoryId)->eq('school_id', $sid)->single()->execute();
            if (empty($chk['data'][0]['id'])) $categoryId = null;
        }
        if ($ccId) {
            $chk = $sb->from('cost_centres')->select('id')->eq('id', $ccId)->eq('school_id', $sid)->single()->execute();
            if (empty($chk['data'][0]['id'])) $ccId = null;
        }
        $allowedMethods = array_column(cachedPaymentMethods(), 'code');
        $methodOk = empty($allowedMethods) || $paymentMethod === 'petty_cash' || in_array($paymentMethod, $allowedMethods, true);
        if (!$methodOk && $id) {
            $existing = $sb->from('expenses')->select('payment_method')->eq('id', $id)->eq('school_id', $sid)->single()->execute();
            if (($existing['data'][0]['payment_method'] ?? null) === $paymentMethod) $methodOk = true;
        }

        if ($description === '' || $amount <= 0) {
            flash('error', 'A description and an amount above zero are required.');
        } elseif (!$categoryId) {
            flash('error', 'Choose a category for this expense.');
        } elseif (!$methodOk) {
            flash('error', 'Choose a payment method from Settings → Payment Methods.');
        } else {
            // The ledger trigger (mig. 104) reverses the old posting and re-posts the new.
            $r = $sb->from('expenses')->eq('id', $id)->eq('school_id', $sid)->update([
                'description' => $description, 'amount' => $amount, 'expense_date' => $date,
                'category_id' => $categoryId, 'vendor_name' => $supplier, 'invoice_number' => $reference,
                'payment_method' => $paymentMethod, 'updated_at' => date('c'),
                'cost_centre_id' => $ccId, 'litres' => $litres, 'odometer_km' => $odometer,
            ]);
            if (empty($r['error'])) auditLog('update', 'expense', $id, ['description' => $description, 'amount' => $amount]);
            flash($r['error'] ? 'error' : 'success', $r['error'] ?: 'Expense updated.');
        }
        redirect($back());
    }

    // ── Mark a supplier invoice paid ──────────────────────────────
    if ($action === 'mark_paid') {
        $id  = (string)input('expense_id');
        $pm  = input('paid_method') ?: 'cheque';
        $res = $sb->rpc('mark_expense_paid', [
            'p_school_id' => $sid, 'p_expense_id' => $id,
            'p_paid_date' => input('paid_date') ?: date('Y-m-d'),
            'p_method'    => $pm, 'p_reference' => trim((string)input('paid_reference')) ?: null,
            'p_user_id'   => $me['id'] ?? null, 'p_user_email' => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        if (is_array($p) && !empty($p['success'])) flash('success', money((float)$p['amount']) . ' paid to ' . ($p['vendor'] ?: 'the supplier') . '.');
        else flash('error', is_array($p) ? ($p['error'] ?? 'Could not mark it paid.') : 'Could not mark it paid.');
        redirect($back());
    }

    // ── Void (with reason; approval-gated like payment voids) ─────
    if ($action === 'void_expense') {
        $id     = (string)input('expense_id');
        $reason = trim((string)input('void_reason'));
        if ($id === '' || $reason === '') {
            flash('error', 'A reason is required to void an expense.');
            redirect($back());
        }
        $row = $sb->from('expenses')->select('id,description,amount,expense_date')
            ->eq('id', $id)->eq('school_id', $sid)->single()->execute()['data'][0] ?? null;
        if (!$row) {
            flash('error', 'Expense not found.');
            redirect($back());
        }
        if (approvalRequired('require_approval_void_expense', 'true')) {
            $sb->from('approval_requests')->insert([
                'school_id'       => $sid,
                'action_type'     => 'void_expense',
                'target_type'     => 'expense',
                'target_id'       => $id,
                'payload'         => json_encode([
                    'reason' => $reason, 'amount' => $row['amount'] ?? 0,
                    'description' => $row['description'] ?? '', 'expense_date' => $row['expense_date'] ?? '',
                ]),
                'status'          => 'pending',
                'requested_by'    => $me['email'] ?? null,
                'requested_by_id' => $me['id'] ?? null,
            ]);
            auditLog('approval_requested', 'expense', $id, ['action' => 'void_expense', 'reason' => $reason]);
            flash('success', 'Void sent for approval — a school administrator must approve it.');
            redirect($back());
        }
        $res = voidExpense($id, $reason);
        flash($res['success'] ? 'success' : 'error',
            $res['success'] ? 'Expense voided — ' . money((float)($row['amount'] ?? 0)) . ' reversed in the books.' : ($res['error'] ?? 'Could not void.'));
        redirect($back());
    }

    flash('error', 'Unknown action.');
    redirect($back());
}

// ════════════════════════════════════════════════════════════════
// Data
// ════════════════════════════════════════════════════════════════
$categories = $sb->from('expense_categories')->select('id,name,description,parent_category_id')
    ->eq('school_id', $sid)->order('name')->execute()['data'] ?? [];
$catMap = []; $catColor = []; $catParent = []; $catById = [];
foreach ($categories as $i => $c) {
    $catMap[$c['id']]    = $titleCase($c['name']);
    $catById[$c['id']]   = $c;
    $catParent[$c['id']] = $c['parent_category_id'] ?? null;
}
// Two levels: headings (no parent) and the lines under them. A line borrows
// its heading's colour so the cashbook reads by heading at a glance.
$headings = array_values(array_filter($categories, fn($c) => empty($c['parent_category_id']) || !isset($catById[$c['parent_category_id']])));
$children = [];
foreach ($categories as $c) if (!empty($c['parent_category_id']) && isset($catById[$c['parent_category_id']])) $children[$c['parent_category_id']][] = $c;
foreach ($headings as $i => $h) {
    $catColor[$h['id']] = $palette[$i % count($palette)];
    foreach ($children[$h['id']] ?? [] as $k) $catColor[$k['id']] = $palette[$i % count($palette)];
}
/** <option>s grouped by heading; the heading itself is selectable as "(general)". */
$catOptions = function (string $selected = '') use ($headings, $children, $catMap): string {
    $o = '';
    foreach ($headings as $h) {
        $kids = $children[$h['id']] ?? [];
        if (!$kids) { $o .= '<option value="' . e($h['id']) . '"' . ($selected === $h['id'] ? ' selected' : '') . '>' . e($catMap[$h['id']]) . '</option>'; continue; }
        $o .= '<optgroup label="' . e($catMap[$h['id']]) . '">';
        $o .= '<option value="' . e($h['id']) . '"' . ($selected === $h['id'] ? ' selected' : '') . '>' . e($catMap[$h['id']]) . ' (general)</option>';
        foreach ($kids as $k) $o .= '<option value="' . e($k['id']) . '"' . ($selected === $k['id'] ? ' selected' : '') . '>' . e($catMap[$k['id']]) . '</option>';
        $o .= '</optgroup>';
    }
    return $o;
};

// Cost centres — the "for which" of a spend. Buses arrive from Transport by
// themselves; the rest are set up on Finance → Cost Centres.
$ccRes = $sb->from('cost_centres')->select('id,name,type')->eq('school_id', $sid)->eq('is_active', 'true')->order('type')->order('name')->execute();
$centres = $ccRes['data'] ?? [];
$ccMigrationMissing = !empty($ccRes['error']) && stripos((string)$ccRes['error'], 'cost_centres') !== false;
// Owing (mig. 144): payment_status / paid_date exist once it has run.
$owingProbe = $sb->from('expenses')->select('paid_date')->eq('school_id', $sid)->limit(1)->execute();
$owingMissing = !empty($owingProbe['error']) && stripos((string)$owingProbe['error'], 'paid_date') !== false;
$ccMap = []; $ccType = [];
foreach ($centres as $c) { $ccMap[$c['id']] = $c['name']; $ccType[$c['id']] = $c['type']; }
$ccIcon = [];   // no icons in the UI — the name says what it is
$ccOptions = function (string $selected = '') use ($centres, $ccIcon): string {
    $o = '<option value="">— none —</option>';
    foreach ($centres as $c) $o .= '<option value="' . e($c['id']) . '" data-type="' . e($c['type']) . '"' . ($selected === $c['id'] ? ' selected' : '') . '>' . e($c['name']) . '</option>';
    return $o;
};

$allExpenses = Supabase::fetchAllPaged(fn($q) => $q->from('expenses')
    ->select('id,category_id,amount,description,expense_date,invoice_number,vendor_name,payment_method,created_at' . ($ccMigrationMissing ? '' : ',cost_centre_id,litres,odometer_km') . ($owingMissing ? '' : ',payment_status,paid_date,paid_reference'))
    ->eq('school_id', $sid)->order('expense_date', false)->order('created_at', false));

$methodLabels      = methodLabelMap();
$configuredMethods = cachedPaymentMethods();
$methodName = fn(string $code): string => $methodLabels[$code] ?? ucfirst(str_replace('_', ' ', $code));

$filterCat    = trim((string)input('category'));
$filterMethod = trim((string)input('method'));
$filterQ      = trim((string)input('q'));

$expenses = [];
foreach ($allExpenses as $exp) {
    $d = (string)($exp['expense_date'] ?? '');
    if ($filterTerm) { [$ts, $te] = $termSpan($filterTerm); if ($d < $ts || $d > $te) continue; }
    elseif ($filterMonth !== 'all' && !str_starts_with($d, $filterMonth)) continue;
    if ($filterCat !== '' && ($exp['category_id'] ?? '') !== $filterCat) continue;
    if ($filterMethod === 'unpaid') { if (($exp['payment_status'] ?? 'paid') !== 'unpaid') continue; }
    elseif ($filterMethod !== '' && ($exp['payment_method'] ?? '') !== $filterMethod) continue;
    if ($filterQ !== '') {
        $hay = strtolower(($exp['description'] ?? '') . ' ' . ($exp['invoice_number'] ?? '') . ' ' . ($exp['vendor_name'] ?? '') . ' ' . ($exp['payment_method'] ?? ''));
        if (!str_contains($hay, strtolower($filterQ))) continue;
    }
    $expenses[] = $exp;
}

// Months that have data (plus this month), newest first.
$monthSet = [date('Y-m') => true];
foreach ($allExpenses as $exp) {
    $d = substr((string)($exp['expense_date'] ?? ''), 0, 7);
    if (preg_match('/^\d{4}-\d{2}$/', $d)) $monthSet[$d] = true;
}
$monthOptions = array_keys($monthSet); rsort($monthOptions);
$segMonths = array_slice($monthOptions, 0, 3);
if ($filterMonth !== 'all' && !in_array($filterMonth, $segMonths, true)) $segMonths[] = $filterMonth;

// ── Roll-ups for the view ─────────────────────────────────────────
$total = 0.0; $byCat = []; $byMethod = []; $byDay = []; $noRef = 0; $largest = 0.0; $byCC = []; $untagged = 0.0;
$owed = 0.0; $owedN = 0; $owedBy = [];
foreach ($expenses as $exp) {
    $amt = (float)($exp['amount'] ?? 0);
    $total += $amt;
    if (($exp['payment_status'] ?? 'paid') === 'unpaid') { $owed += $amt; $owedN++; $v = trim((string)($exp['vendor_name'] ?? '')) ?: '(no supplier)'; $owedBy[$v] = ($owedBy[$v] ?? 0) + $amt; }
    if (!empty($exp['cost_centre_id'])) $byCC[$exp['cost_centre_id']] = ($byCC[$exp['cost_centre_id']] ?? 0) + $amt; else $untagged += $amt;
    $cid = $exp['category_id'] ?? '_none';
    $byCat[$cid] = ['amt' => ($byCat[$cid]['amt'] ?? 0) + $amt, 'n' => ($byCat[$cid]['n'] ?? 0) + 1];
    $m = (string)($exp['payment_method'] ?? 'cash');
    $byMethod[$m] = ($byMethod[$m] ?? 0) + 1;
    $day = (string)($exp['expense_date'] ?? '') ?: '_unknown';
    $byDay[$day][] = $exp;
    if (trim((string)($exp['invoice_number'] ?? '')) === '') $noRef++;
    if ($amt > $largest) $largest = $amt;
}
uasort($byCat, fn($a, $b) => $b['amt'] <=> $a['amt']);
arsort($byCC); arsort($owedBy);
arsort($byMethod);
krsort($byDay);
$count   = count($expenses);
$days    = count(array_filter(array_keys($byDay), fn($k) => $k !== '_unknown'));
$avgDay  = $days > 0 ? $total / $days : 0.0;
$maxCat  = $byCat ? max(array_column($byCat, 'amt')) : 0.0;

// Versus the month before (only meaningful for a single month, no other filters).
$prevTotal = null; $prevLabel = '';
if (!$filterTerm && $filterMonth !== 'all' && $filterCat === '' && $filterMethod === '' && $filterQ === '') {
    $prev = date('Y-m', strtotime($filterMonth . '-01 -1 month'));
    $prevLabel = date('M', strtotime($prev . '-01'));
    $prevTotal = 0.0; $prevHas = false;
    foreach ($allExpenses as $exp) {
        if (str_starts_with((string)($exp['expense_date'] ?? ''), $prev)) { $prevTotal += (float)($exp['amount'] ?? 0); $prevHas = true; }
    }
    if (!$prevHas) $prevTotal = null;
}

// A catch-all category doing real volume is worth a nudge.
$catchAll = null;
foreach ($categories as $c) {
    if (in_array(strtolower(trim($c['name'])), ['expenses', 'expense', 'other', 'others', 'misc', 'miscellaneous', 'general'], true)
        && ($byCat[$c['id']]['n'] ?? 0) >= 10) { $catchAll = $c; break; }
}

// Per-category counts/totals across all time (for the Categories panel).
$catAll = [];
foreach ($allExpenses as $exp) {
    $cid = $exp['category_id'] ?? '_none';
    $catAll[$cid] = ['amt' => ($catAll[$cid]['amt'] ?? 0) + (float)($exp['amount'] ?? 0), 'n' => ($catAll[$cid]['n'] ?? 0) + 1];
}

$monthLabel = $filterTerm ? $filterTerm['name'] . ' ' . date('Y', strtotime($filterTerm['start_date'])) : ($filterMonth === 'all' ? 'All time' : date('M Y', strtotime($filterMonth . '-01')));
$filtersOn  = $filterCat !== '' || $filterMethod !== '' || $filterQ !== '';
$qs = fn(array $over = []): string => http_build_query(array_filter(array_merge(
    ['month' => $filterMonth, 'category' => $filterCat, 'method' => $filterMethod, 'q' => $filterQ], $over
), fn($v) => $v !== '' && $v !== null));

require __DIR__ . '/../../includes/layout-top.php';
?>

<style>
.xp-ln{display:grid;grid-template-columns:minmax(0,1fr) 170px 200px 120px 84px;gap:12px;align-items:center;padding:7px 16px;min-height:38px}
.xp-ln .xp-ops{visibility:hidden}
.xp-ln:hover .xp-ops{visibility:visible}
.xp-qa{display:grid;grid-template-columns:minmax(0,2fr) 100px minmax(0,1.3fr) minmax(0,1.1fr) 112px minmax(0,1fr) 128px auto;gap:6px;align-items:center}
.xp-fuel{display:none}.xp-fuel.on{display:grid}
.xp-lines-head,.xp-line{display:grid;grid-template-columns:minmax(0,2.2fr) 64px 84px 96px 96px 22px;gap:6px;align-items:center}
.xp-lines-head{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;padding:0 2px 4px}
.xp-line input,.xp-line select{width:100%;padding:5px 7px;font-size:13px;border:1px solid #e5e7eb;border-radius:6px;background:#fff}
.xp-line .xp-total{text-align:right;font-size:13px;font-weight:600;color:#111827;font-variant-numeric:tabular-nums}
.xp-chip{display:inline-block;font-size:11.5px;font-weight:500;border-radius:6px;padding:2px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-decoration:none}
.xp-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:.02em}
@media (max-width:1100px){.xp-ln{grid-template-columns:minmax(0,1fr) 110px 100px}.xp-ln .xp-pay,.xp-ln .xp-ops{display:none}.xp-qa{grid-template-columns:1fr 1fr 1fr 1fr}}
</style>

<div class="flex items-start justify-between mb-5 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Expenses</h1>
        <p class="text-sm text-gray-500 mt-1">The cashbook. Type a line, press Enter, it's booked.</p>
    </div>
    <div class="flex gap-2 flex-wrap">
        <?php if ($filterTerm) { [$rs, $re] = $termSpan($filterTerm); $reportQ = 'from=' . e($rs) . '&to=' . e($re); }
              else $reportQ = $filterMonth !== 'all' ? 'from=' . e($filterMonth) . '-01&to=' . e(date('Y-m-t', strtotime($filterMonth . '-01'))) : ''; ?>
        <a href="<?= baseUrl('finance/expense-report') ?>?<?= $reportQ ?>" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Report</a>
        <button type="button" onclick="document.getElementById('catSection').classList.toggle('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Categories</button>
        <button type="button" onclick="openModal('addExpenseModal')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">+ Full expense</button>
    </div>
</div>

<?php if ($ccMigrationMissing): ?>
<div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800"><strong>Migration 140 hasn't been run.</strong> Cost centres ("for which" — a bus, the kitchen) and the standard category headings arrive with it. Expenses still book as before.</div>
<?php endif; ?>

<!-- Tiles, in the dashboard's colour language -->
<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-violet-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        </div>
        <div class="min-w-0">
            <p class="text-lg font-bold text-gray-900 leading-tight tabular-nums truncate"><?= money($total) ?></p>
            <p class="text-xs text-gray-500 mt-0.5"><?= e($monthLabel) ?><?= $filtersOn ? ' · filtered' : '' ?>
                <?php if ($prevTotal !== null && $prevTotal > 0): $d = ($total - $prevTotal) / $prevTotal * 100; ?>
                    · <span class="<?= $d > 0 ? 'text-amber-600' : 'text-emerald-600' ?> font-medium"><?= $d > 0 ? '▲' : '▼' ?> <?= number_format(abs($d), 0) ?>%</span> vs <?= e($prevLabel) ?>
                <?php endif; ?>
            </p>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
        </div>
        <div>
            <p class="text-lg font-bold text-gray-900 leading-tight tabular-nums"><?= number_format($count) ?></p>
            <p class="text-xs text-gray-500 mt-0.5">Entries<?= $days > 0 ? ' · ' . money($avgDay) . ' a day' : '' ?></p>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
        </div>
        <div class="min-w-0">
            <p class="text-lg font-bold text-gray-900 leading-tight tabular-nums truncate"><?= money($largest) ?></p>
            <p class="text-xs text-gray-500 mt-0.5">Largest single</p>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        </div>
        <div class="min-w-0">
            <?php if ($owedN > 0): ?>
            <p class="text-lg font-bold text-amber-700 leading-tight tabular-nums truncate"><?= money($owed) ?></p>
            <p class="text-xs text-gray-500 mt-0.5"><a href="<?= baseUrl('finance/expenses') ?>?<?= $qs(['method' => 'unpaid']) ?>" class="hover:text-gray-800">Owed to suppliers · <?= $owedN ?> invoice<?= $owedN === 1 ? '' : 's' ?></a></p>
            <?php else: ?>
            <p class="text-lg font-bold text-gray-900 leading-tight tabular-nums"><?= number_format($noRef) ?></p>
            <p class="text-xs text-gray-500 mt-0.5">Without a reference</p>
            <?php endif; ?>
        </div>
    </div>
</div>

<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
<section class="min-w-0">

    <!-- Filters -->
    <form method="GET" action="<?= baseUrl('finance/expenses') ?>" class="flex items-center gap-2 flex-wrap mb-3">
        <div class="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            <?php foreach ($segMonths as $m): ?>
                <a href="<?= baseUrl('finance/expenses') ?>?<?= $qs(['month' => $m]) ?>" class="px-3 py-1.5 text-sm rounded-md <?= $filterMonth === $m ? 'bg-emerald-500 text-white font-semibold' : 'text-gray-600 hover:bg-gray-50' ?>"><?= e(date($m === date('Y-m') ? 'M Y' : 'M', strtotime($m . '-01'))) ?></a>
            <?php endforeach; ?>
            <a href="<?= baseUrl('finance/expenses') ?>?<?= $qs(['month' => 'all']) ?>" class="px-3 py-1.5 text-sm rounded-md <?= $filterMonth === 'all' ? 'bg-emerald-500 text-white font-semibold' : 'text-gray-600 hover:bg-gray-50' ?>">All</a>
        </div>
        <?php if ($terms): ?>
        <div class="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" title="By term — holidays count with the term just ended">
            <?php $yr = date('Y'); foreach ($terms as $t): if (substr($t['start_date'], 0, 4) !== $yr && substr($t['end_date'], 0, 4) !== $yr) continue; $on = $filterTerm && $filterTerm['id'] === $t['id']; ?>
                <a href="<?= baseUrl('finance/expenses') ?>?<?= $qs(['month' => 'term:' . $t['id']]) ?>" class="px-3 py-1.5 text-sm rounded-md <?= $on ? 'bg-emerald-500 text-white font-semibold' : 'text-gray-600 hover:bg-gray-50' ?>"><?= e($t['name']) ?></a>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
        <?php if (count($monthOptions) > 3): ?>
        <select name="month" onchange="this.form.submit()" class="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white text-gray-600">
            <option value="<?= e($filterMonth) ?>">Older…</option>
            <?php foreach (array_slice($monthOptions, 3) as $m): ?>
                <option value="<?= e($m) ?>"><?= e(date('M Y', strtotime($m . '-01'))) ?></option>
            <?php endforeach; ?>
        </select>
        <?php else: ?>
        <input type="hidden" name="month" value="<?= e($filterMonth) ?>">
        <?php endif; ?>
        <select name="method" onchange="this.form.submit()" class="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white text-gray-600">
            <option value="">All methods</option>
            <option value="unpaid"<?= $filterMethod === 'unpaid' ? ' selected' : '' ?>>Not yet paid (owed)</option>
            <?php $mcodes = []; foreach ($configuredMethods as $m) $mcodes[$m['code']] = $m['name'];
                  foreach (array_keys($byMethod) as $c) if (!isset($mcodes[$c])) $mcodes[$c] = $methodName($c);
                  foreach ($mcodes as $code => $label): ?>
                <option value="<?= e($code) ?>"<?= $filterMethod === $code ? ' selected' : '' ?>><?= e($label) ?></option>
            <?php endforeach; ?>
        </select>
        <?php if ($filterCat !== ''): ?>
            <input type="hidden" name="category" value="<?= e($filterCat) ?>">
            <a href="<?= baseUrl('finance/expenses') ?>?<?= $qs(['category' => '']) ?>" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border" style="color:<?= e($catColor[$filterCat] ?? '#374151') ?>;border-color:<?= e($catColor[$filterCat] ?? '#d1d5db') ?>;background:<?= e(($catColor[$filterCat] ?? '#9ca3af') . '14') ?>">
                <?= e($catMap[$filterCat] ?? 'Category') ?> <span class="opacity-60"></span>
            </a>
        <?php endif; ?>
        <div class="flex-1 min-w-[180px] flex gap-1.5">
            <input type="search" name="q" value="<?= e($filterQ) ?>" placeholder="Description, M-Pesa code, supplier…" class="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <button type="submit" class="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Go</button>
            <?php if ($filtersOn): ?><a href="<?= baseUrl('finance/expenses') ?>?month=<?= e($filterMonth) ?>" class="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800">Clear</a><?php endif; ?>
        </div>
    </form>

    <!-- Quick add -->
    <div class="bg-white rounded-xl border border-emerald-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-3 py-2.5 mb-3">
        <div class="flex items-center justify-between mb-1.5 px-0.5">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Quick add</span>
            <span class="text-[11px] text-gray-400">What · amount · category · for which · paid by · ref · date — Enter to save</span>
        </div>
        <form method="POST" class="xp-qa" autocomplete="off" id="quickAdd">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="quick_add">
            <input type="text" name="description" required placeholder="What was it for?" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <input type="text" name="amount" required inputmode="decimal" placeholder="0.00" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm text-right tabular-nums focus:border-emerald-400 outline-none">
            <select name="category_id" required class="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-emerald-400 outline-none">
                <option value="">Category…</option>
                <?= $catOptions() ?>
            </select>
            <select name="cost_centre_id" class="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-emerald-400 outline-none" title="For which — a bus, the kitchen, a building. Leave blank for a general spend.">
                <?= str_replace('>— none —<', '>For which… (optional)<', $ccOptions()) ?>
            </select>
            <select name="payment_method" class="xp-method w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-emerald-400 outline-none" data-ref="qaRef" title="Petty cash = the office tin. Cash = fee collections not yet banked.">
                <option value="petty_cash">Petty cash (the tin)</option>
                <?= paymentMethodOptions() ?>
                <option value="unpaid">Not paid yet — supplier invoice</option>
            </select>
            <input type="text" name="reference" id="qaRef" placeholder="Reference" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <input type="date" name="date" value="<?= date('Y-m-d') ?>" required class="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <button type="submit" class="px-4 py-1.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save</button>
        </form>
    </div>

    <!-- Cashbook -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <?php if (empty($expenses)): ?>
            <p class="px-4 py-12 text-center text-gray-400 text-sm">Nothing here<?= $filtersOn ? ' for these filters' : ' yet' ?>. Book the first line above.</p>
        <?php else: foreach ($byDay as $day => $rows):
            $dayTotal = array_sum(array_map(fn($r) => (float)($r['amount'] ?? 0), $rows)); ?>
            <div class="flex items-baseline justify-between px-4 py-2 bg-gray-50/80 border-t first:border-t-0 border-b border-gray-100 text-[12.5px] font-semibold text-gray-800">
                <span><?= $day === '_unknown' ? 'Unknown date' : e(date('D j M Y', strtotime($day))) ?> <span class="font-normal text-gray-400 ml-1"><?= count($rows) ?> <?= count($rows) === 1 ? 'entry' : 'entries' ?></span></span>
                <span class="tabular-nums"><?= money($dayTotal) ?></span>
            </div>
            <div class="divide-y divide-gray-50">
                <?php foreach ($rows as $exp):
                    $pm  = (string)($exp['payment_method'] ?? 'cash');
                    $cid = $exp['category_id'] ?? '';
                    $col = $catColor[$cid] ?? '#6b7280';
                    $ref = trim((string)($exp['invoice_number'] ?? ''));
                    $vendor = trim((string)($exp['vendor_name'] ?? '')); ?>
                <div class="xp-ln hover:bg-gray-50/60">
                    <div class="min-w-0 truncate text-sm font-medium text-gray-900" title="<?= e($exp['description'] ?? '') ?>"><?= e($exp['description'] ?? '') ?><?= $vendor !== '' ? ' <span class="text-gray-400 font-normal">· ' . e($vendor) . '</span>' : '' ?><?php if (!empty($exp['cost_centre_id']) && isset($ccMap[$exp['cost_centre_id']])): ?> <a href="<?= baseUrl('finance/cost-centres') ?>?id=<?= e($exp['cost_centre_id']) ?>" class="text-[11px] font-medium text-gray-500 hover:text-gray-800 whitespace-nowrap"><?= $ccIcon[$ccType[$exp['cost_centre_id']] ?? 'other'] ?? '' ?> <?= e($ccMap[$exp['cost_centre_id']]) ?><?= !empty($exp['litres']) ? ' · ' . rtrim(rtrim(number_format((float)$exp['litres'], 1), '0'), '.') . ' L' : '' ?></a><?php endif; ?></div>
                    <a href="<?= baseUrl('finance/expenses') ?>?<?= $qs(['category' => $cid]) ?>" class="xp-chip" style="color:<?= e($col) ?>;background:<?= e($col) ?>18" title="Filter by this category"><?= e($catMap[$cid] ?? 'Uncategorised') ?></a>
                    <div class="xp-pay flex items-center gap-2 text-xs text-gray-500 min-w-0">
                        <?php if (($exp['payment_status'] ?? 'paid') === 'unpaid'): ?>
                            <span class="flex-none inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Owed</span>
                        <?php else: ?>
                            <span class="font-semibold text-gray-700 flex-none"><?= e($methodName($pm)) ?></span>
                        <?php endif; ?>
                        <?php if ($ref !== ''): ?><span class="xp-mono text-gray-700 truncate"><?= e($ref) ?></span><?php endif; ?>
                        <?php if (!empty($exp['paid_date']) && !empty($exp['paid_reference']) && ($exp['payment_status'] ?? 'paid') === 'paid' && $exp['paid_date'] !== $exp['expense_date']): ?><span class="text-gray-400 truncate">paid <?= e(date('j M', strtotime($exp['paid_date']))) ?></span><?php endif; ?>
                    </div>
                    <div class="text-right text-sm font-semibold text-gray-900 tabular-nums"><?= money((float)($exp['amount'] ?? 0)) ?></div>
                    <div class="xp-ops flex justify-end gap-2.5 text-xs">
                        <?php if (($exp['payment_status'] ?? 'paid') === 'unpaid'): ?><button type="button" onclick="openMarkPaid('<?= e($exp['id']) ?>','<?= e(addslashes((string)($exp['description'] ?? ''))) ?>','<?= e(money((float)($exp['amount'] ?? 0))) ?>','<?= e(addslashes((string)($exp['vendor_name'] ?? ''))) ?>')" class="text-amber-700 hover:text-amber-900 font-semibold">Mark paid</button><?php endif; ?>
                        <button type="button" onclick="editExpense(<?= htmlspecialchars(json_encode($exp), ENT_QUOTES, 'UTF-8') ?>)" class="text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>
                        <button type="button" onclick="openVoidExpense('<?= e($exp['id']) ?>','<?= e(addslashes((string)($exp['description'] ?? ''))) ?>','<?= e(money((float)($exp['amount'] ?? 0))) ?>')" class="text-red-500 hover:text-red-700 font-medium">Void</button>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        <?php endforeach; ?>
            <div class="flex justify-between px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
                <span><?= number_format($count) ?> entries · <?= e($monthLabel) ?></span>
                <span>Total <b class="text-gray-900 tabular-nums"><?= money($total) ?></b></span>
            </div>
        <?php endif; ?>
    </div>

    <!-- Categories (collapsed) -->
    <div id="catSection" class="hidden mt-5 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <h2 class="text-sm font-semibold text-gray-800 mb-1">Categories</h2>
        <p class="text-xs text-gray-500 mb-4">Headings are what the P&amp;L shows; the lines under them are what the office picks. A category is a <em>kind</em> of spend — a bus or the kitchen is a <a href="<?= baseUrl('finance/cost-centres') ?>" class="text-emerald-700 underline">cost centre</a>, not a category.<?= isAdmin() ? '' : ' Only an administrator can change the list.' ?></p>
        <?php if (isAdmin()): ?>
        <form method="POST" class="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-gray-100">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_category">
            <div class="flex-1 min-w-[160px]">
                <label class="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input type="text" name="cat_name" required placeholder="e.g. Generator fuel" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="min-w-[180px]">
                <label class="block text-xs font-medium text-gray-600 mb-1">Under</label>
                <select name="parent_id" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white">
                    <option value="">— a new heading —</option>
                    <?php foreach ($headings as $h): ?><option value="<?= e($h['id']) ?>"><?= e($catMap[$h['id']]) ?></option><?php endforeach; ?>
                </select>
            </div>
            <div class="flex-1 min-w-[160px]">
                <label class="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input type="text" name="cat_description" placeholder="Optional" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Add</button>
        </form>
        <?php endif; ?>
        <?php if (empty($categories)): ?>
            <p class="text-sm text-gray-400 text-center py-4">No categories yet.</p>
        <?php else: ?>
            <div class="divide-y divide-gray-50">
                <?php foreach ($headings as $h): $rows = array_merge([$h], $children[$h['id']] ?? []);
                      foreach ($rows as $c): $isKid = $c['id'] !== $h['id']; $st = $catAll[$c['id']] ?? ['amt' => 0, 'n' => 0]; $kidCount = count($children[$c['id']] ?? []); ?>
                <div class="flex items-center gap-3 py-2 group <?= $isKid ? 'pl-6' : '' ?>">
                    <span class="w-2.5 h-2.5 <?= $isKid ? 'rounded-full opacity-60' : 'rounded-sm' ?> flex-none" style="background:<?= e($catColor[$c['id']]) ?>"></span>
                    <span class="text-sm <?= $isKid ? 'text-gray-700' : 'font-semibold text-gray-900' ?> min-w-0 truncate"><?= e($catMap[$c['id']]) ?><?php if (!empty($c['description'])): ?> <span class="text-gray-400 font-normal">— <?= e($c['description']) ?></span><?php endif; ?></span>
                    <span class="ml-auto text-xs text-gray-500 tabular-nums whitespace-nowrap"><?= (int)$st['n'] ?> · <?= money((float)$st['amt']) ?></span>
                    <?php if (isAdmin()): ?>
                    <span class="flex gap-2 text-xs">
                        <button type="button" onclick="editCategory('<?= e($c['id']) ?>','<?= e(addslashes($c['name'])) ?>','<?= e(addslashes($c['description'] ?? '')) ?>','<?= e($c['parent_category_id'] ?? '') ?>')" class="text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>
                        <form method="POST" class="inline" onsubmit="return confirm('Delete this category?')">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="delete_category">
                            <input type="hidden" name="category_id" value="<?= e($c['id']) ?>">
                            <button type="submit" class="text-red-500 hover:text-red-700 font-medium <?= ((int)$st['n'] > 0 || $kidCount > 0) ? 'opacity-40 cursor-not-allowed' : '' ?>" <?= ((int)$st['n'] > 0 || $kidCount > 0) ? 'disabled title="In use"' : '' ?>>Delete</button>
                        </form>
                    </span>
                    <?php endif; ?>
                </div>
                <?php endforeach; endforeach; ?>
            </div>
        <?php endif; ?>
    </div>
</section>

<!-- Rail -->
<aside class="space-y-4">
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <h3 class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">By category</h3>
        <?php if (empty($byCat)): ?>
            <p class="text-sm text-gray-400">Nothing in view.</p>
        <?php else: ?>
        <ul class="space-y-2">
            <?php $shown = 0; $restAmt = 0.0; $restN = 0;
            foreach ($byCat as $cid => $st):
                if ($shown >= 7) { $restAmt += $st['amt']; $restN++; continue; }
                $shown++; $col = $catColor[$cid] ?? '#9ca3af'; $w = $maxCat > 0 ? $st['amt'] / $maxCat * 100 : 0; ?>
            <li>
                <a href="<?= baseUrl('finance/expenses') ?>?<?= $qs(['category' => $cid === '_none' ? '' : $cid]) ?>" class="block rounded-md -mx-1 px-1 py-0.5 hover:bg-gray-50">
                    <div class="flex items-center justify-between gap-2 text-[12.5px]">
                        <span class="font-medium text-gray-800 truncate"><?= e($catMap[$cid] ?? 'Uncategorised') ?> <span class="text-gray-400 font-normal">· <?= (int)$st['n'] ?></span></span>
                        <span class="font-semibold text-gray-900 tabular-nums flex-none"><?= number_format($st['amt']) ?></span>
                    </div>
                    <div class="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden"><div class="h-full rounded-full" style="width:<?= (int)$w ?>%;background:<?= e($col) ?>"></div></div>
                </a>
            </li>
            <?php endforeach; ?>
            <?php if ($restN > 0): ?>
            <li class="flex items-center justify-between text-[12.5px] text-gray-500 pt-1"><span><?= $restN ?> more</span><span class="tabular-nums"><?= number_format($restAmt) ?></span></li>
            <?php endif; ?>
        </ul>
        <?php endif; ?>
        <?php if ($catchAll): ?>
            <p class="text-[11.5px] text-gray-500 mt-3 pt-3 border-t border-gray-100"><?= (int)($byCat[$catchAll['id']]['n'] ?? 0) ?> entries sit in <b class="text-gray-700"><?= e($catMap[$catchAll['id']]) ?></b>, a catch-all. Real categories make the report worth reading — edit those lines when you have a minute.</p>
        <?php endif; ?>
    </div>

    <?php if ($owedN > 0): ?>
    <div class="bg-white rounded-xl border border-amber-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <div class="flex items-baseline justify-between mb-3">
            <h3 class="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Owed to suppliers</h3>
            <span class="text-xs font-semibold text-amber-800 tabular-nums"><?= money($owed) ?></span>
        </div>
        <ul class="space-y-1.5">
            <?php foreach (array_slice($owedBy, 0, 8, true) as $v => $amt): ?>
            <li class="flex items-center justify-between text-[12.5px]"><span class="text-gray-800 truncate"><?= e($v) ?></span><span class="font-semibold text-gray-900 tabular-nums flex-none"><?= number_format($amt) ?></span></li>
            <?php endforeach; ?>
        </ul>
        <p class="text-[11px] text-gray-500 mt-3 pt-3 border-t border-amber-100">Invoices recorded but not yet paid. Hover a line and choose <b>Mark paid</b> when the cheque goes.</p>
    </div>
    <?php endif; ?>

    <?php if ($centres): ?>
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <div class="flex items-baseline justify-between mb-3">
            <h3 class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">For which</h3>
            <a href="<?= baseUrl('finance/cost-centres') ?>" class="text-[11px] text-emerald-700 font-medium">All centres →</a>
        </div>
        <?php if (empty($byCC)): ?>
            <p class="text-sm text-gray-400">Nothing tagged to a bus, kitchen or building in view.</p>
        <?php else: $maxCC = max($byCC); ?>
        <ul class="space-y-2">
            <?php foreach (array_slice($byCC, 0, 6, true) as $cid => $amt): $w = $maxCC > 0 ? $amt / $maxCC * 100 : 0; ?>
            <li>
                <a href="<?= baseUrl('finance/cost-centres') ?>?id=<?= e($cid) ?>" class="block rounded-md -mx-1 px-1 py-0.5 hover:bg-gray-50">
                    <div class="flex items-center justify-between gap-2 text-[12.5px]">
                        <span class="font-medium text-gray-800 truncate"><?= e($ccMap[$cid] ?? '—') ?></span>
                        <span class="font-semibold text-gray-900 tabular-nums flex-none"><?= number_format($amt) ?></span>
                    </div>
                    <div class="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden"><div class="h-full rounded-full bg-gray-700" style="width:<?= (int)$w ?>%"></div></div>
                </a>
            </li>
            <?php endforeach; ?>
            <?php if ($untagged > 0): ?><li class="flex items-center justify-between text-[12.5px] text-gray-500 pt-1"><span>General (no centre)</span><span class="tabular-nums"><?= number_format($untagged) ?></span></li><?php endif; ?>
        </ul>
        <?php endif; ?>
    </div>
    <?php endif; ?>

    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <h3 class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">Paid by</h3>
        <?php if (empty($byMethod)): ?>
            <p class="text-sm text-gray-400">Nothing in view.</p>
        <?php else: $mi = 0; ?>
        <div class="flex h-2 rounded-full overflow-hidden bg-gray-100 mb-2.5">
            <?php foreach ($byMethod as $code => $n): ?>
                <div style="width:<?= $count > 0 ? round($n / $count * 100, 1) : 0 ?>%;background:<?= e($palette[$mi++ % count($palette)]) ?>"></div>
            <?php endforeach; ?>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600"><?php $mi = 0; foreach ($byMethod as $code => $n): ?>
            <a href="<?= baseUrl('finance/expenses') ?>?<?= $qs(['method' => $code]) ?>" class="hover:text-gray-900"><span class="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style="background:<?= e($palette[$mi++ % count($palette)]) ?>"></span><?= e($methodName((string)$code)) ?> <b class="text-gray-900 tabular-nums"><?= (int)$n ?></b></a>
        <?php endforeach; ?></div>
        <?php if (($byMethod['other'] ?? 0) > 0 && $count > 0 && $byMethod['other'] / $count >= 0.2): ?>
            <p class="text-[11.5px] text-gray-500 mt-3 pt-3 border-t border-gray-100">A fifth or more are "Other". The school's method list in Settings is probably missing something they actually use.</p>
        <?php endif; ?>
        <?php endif; ?>
    </div>
</aside>
</div>

<!-- Edit category -->
<div id="editCatModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Category</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit_category">
            <input type="hidden" name="category_id" id="editCatId">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" name="cat_name" id="editCatName" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Under</label>
                <select name="parent_id" id="editCatParent" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white">
                    <option value="">— a heading of its own —</option>
                    <?php foreach ($headings as $h): ?><option value="<?= e($h['id']) ?>"><?= e($catMap[$h['id']]) ?></option><?php endforeach; ?>
                </select>
                <p class="text-[11px] text-gray-400 mt-1">Moving a line under a heading also moves its past expenses to that heading's P&amp;L line.</p>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" name="cat_description" id="editCatDesc" placeholder="Optional" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save</button>
                <button type="button" onclick="closeModal('editCatModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Full expense -->
<div id="addExpenseModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Add Expense</h3>
        <p class="text-xs text-gray-500 mb-4">The full form — same as the quick row, plus supplier.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_expense">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input type="text" name="description" required placeholder="e.g. Diesel — KCX 092V" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                    <input type="text" name="amount" required inputmode="decimal" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                    <input type="date" name="date" value="<?= date('Y-m-d') ?>" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
            </div>
            <!-- Optional: what was on the receipt. Filling these sets the amount. -->
            <div class="mb-4 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-gray-600">Items on the receipt <span class="text-gray-400 font-normal">(optional)</span></span>
                    <button type="button" onclick="xpAddLine('addLines')" class="text-xs font-medium text-emerald-700">+ Add item</button>
                </div>
                <div class="xp-lines-head"><span>Item</span><span class="text-right">Qty</span><span>Unit</span><span class="text-right">Price each</span><span class="text-right">Total</span><span></span></div>
                <div id="addLines" class="space-y-1.5"></div>
                <div class="flex justify-between text-xs mt-2 pt-2 border-t border-gray-200 text-gray-500"><span>Items total — becomes the amount</span><strong id="addLinesTotal" class="text-gray-800 tabular-nums">—</strong></div>
                <p class="text-[11px] text-gray-400 mt-1">e.g. Milk · 10 · pcs · 50 = 500. Leave empty for a single-amount receipt.</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select name="category_id" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select…</option>
                        <?= $catOptions() ?>
                    </select>
                    <p class="text-[11px] text-gray-400 mt-1">What kind of spend. Pick the most specific line.</p></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">For which <span class="text-gray-400 font-normal">(optional)</span></label>
                    <select name="cost_centre_id" class="xp-cc w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white" onchange="xpFuelFields('addExpenseModal')"><?= $ccOptions() ?></select>
                    <p class="text-[11px] text-gray-400 mt-1">A bus, the kitchen, a building. Blank for a general spend.</p></div>
            </div>
            <div class="xp-fuel grid-cols-2 gap-4 mb-4 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                <div><label class="block text-xs font-medium text-gray-700 mb-1">Litres</label>
                    <input type="text" name="litres" inputmode="decimal" placeholder="e.g. 42.5" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white"></div>
                <div><label class="block text-xs font-medium text-gray-700 mb-1">Odometer (km)</label>
                    <input type="text" name="odometer_km" inputmode="numeric" placeholder="reading on the dash" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white"></div>
                <p class="col-span-2 text-[11px] text-amber-700">For fuel on a bus. Both together give km per litre and cost per km on the bus's page.</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Paid from</label>
                    <select name="payment_method" class="xp-method w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm" data-ref="addRef"><option value="petty_cash">Petty cash (the tin)</option><?= paymentMethodOptions() ?><option value="unpaid">Not paid yet — supplier invoice</option></select>
                    <p class="text-[11px] text-gray-400 mt-1">"Cash" means fee collections not yet banked — it does not move the petty cash book. "Not paid yet" records what we owe; mark it paid when the cheque goes.</p></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                    <input type="text" name="supplier" list="supplierList" placeholder="Optional" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1" id="addRefLabel">Reference</label>
                    <input type="text" name="reference" id="addRef" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Add Expense</button>
                <button type="button" onclick="closeModal('addExpenseModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit expense (ids are wired to the hoisted editExpense() in layout-top) -->
<div id="editExpenseModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Expense</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit_expense">
            <input type="hidden" name="expense_id" id="editExpId">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input type="text" name="description" id="editExpDesc" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                    <input type="text" name="amount" id="editExpAmount" required inputmode="decimal" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                    <input type="date" name="date" id="editExpDate" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select name="category_id" id="editExpCat" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select…</option>
                        <?= $catOptions() ?>
                    </select></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">For which</label>
                    <select name="cost_centre_id" id="editExpCC" class="xp-cc w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white" onchange="xpFuelFields('editExpenseModal')"><?= $ccOptions() ?></select></div>
            </div>
            <div class="xp-fuel grid-cols-2 gap-4 mb-4 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                <div><label class="block text-xs font-medium text-gray-700 mb-1">Litres</label>
                    <input type="text" name="litres" id="editExpLitres" inputmode="decimal" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white"></div>
                <div><label class="block text-xs font-medium text-gray-700 mb-1">Odometer (km)</label>
                    <input type="text" name="odometer_km" id="editExpOdo" inputmode="numeric" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm bg-white"></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <select name="payment_method" id="editExpMethod" class="xp-method w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm" data-ref="editExpRef"><option value="petty_cash">Petty cash (the tin)</option><?= paymentMethodOptions() ?></select></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                    <input type="text" name="supplier" id="editExpSupplier" list="supplierList" placeholder="Optional" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                    <input type="text" name="reference" id="editExpRef" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Changes</button>
                <button type="button" onclick="closeModal('editExpenseModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Mark a supplier invoice paid -->
<div id="markPaidModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Mark paid</h3>
        <p class="text-sm text-gray-600 mb-4" id="markPaidLabel"></p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="mark_paid">
            <input type="hidden" name="expense_id" id="markPaidId">
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Paid on *</label>
                    <input type="date" name="paid_date" value="<?= date('Y-m-d') ?>" max="<?= date('Y-m-d') ?>" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Paid from</label>
                    <select name="paid_method" class="xp-method w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm" data-ref="markPaidRef"><?= paymentMethodOptions() ?><option value="petty_cash">Petty cash (the tin)</option></select></div>
            </div>
            <div class="mb-5"><label class="block text-sm font-medium text-gray-700 mb-1" id="markPaidRefLabel">Reference</label>
                <input type="text" name="paid_reference" id="markPaidRef" placeholder="cheque no. / M-Pesa code" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Mark paid</button>
                <button type="button" onclick="closeModal('markPaidModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Void expense -->
<div id="voidExpenseModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Void expense</h3>
        <p class="text-sm text-gray-600 mb-1" id="voidExpLabel"></p>
        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">This removes the line and reverses it in the books, with your reason on record. Use Edit for a typo.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="void_expense">
            <input type="hidden" name="expense_id" id="voidExpId">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <textarea name="void_reason" required rows="3" placeholder="e.g. Entered twice / receipt was for another school" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"></textarea>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition">Void expense</button>
                <button type="button" onclick="closeModal('voidExpenseModal')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<datalist id="supplierList">
    <?php $seenV = []; foreach ($allExpenses as $exp) { $v = trim((string)($exp['vendor_name'] ?? '')); if ($v !== '' && !isset($seenV[strtolower($v)])) { $seenV[strtolower($v)] = true; echo '<option value="' . e($v) . '">'; } } ?>
</datalist>

<script>
(function () {
    // The reference field says what it wants, by method.
    var labels = {mpesa: 'M-Pesa code', mobile_money: 'Transaction code', bank_transfer: 'Bank reference', cheque: 'Cheque number', card: 'Card slip no.', cash: 'Receipt no. (optional)'};
    function relabel(sel) {
        var ref = document.getElementById(sel.dataset.ref); if (!ref) return;
        var t = labels[sel.value] || 'Reference';
        ref.placeholder = t;
        var lbl = document.getElementById(sel.dataset.ref + 'Label'); if (lbl) lbl.textContent = t;
        ref.style.fontFamily = (sel.value === 'cash') ? '' : 'ui-monospace, SFMono-Regular, Menlo, monospace';
    }
    document.querySelectorAll('.xp-method').forEach(function (s) { s.addEventListener('change', function () { relabel(s); }); relabel(s); });

    // Litres + odometer only make sense for a bus; show them when one is picked.
    window.xpFuelFields = function (modalId) {
        var m = document.getElementById(modalId); if (!m) return;
        var sel = m.querySelector('.xp-cc'), box = m.querySelector('.xp-fuel'); if (!sel || !box) return;
        var opt = sel.options[sel.selectedIndex];
        var isBus = opt && opt.getAttribute('data-type') === 'bus';
        var hasVal = false; box.querySelectorAll('input').forEach(function (i) { if (i.value) hasVal = true; });
        box.classList.toggle('on', isBus || hasVal);
    };
    xpFuelFields('addExpenseModal');

    window.openMarkPaid = function (id, label, amount, vendor) {
        document.getElementById('markPaidId').value = id;
        document.getElementById('markPaidLabel').textContent = label + ' · ' + amount + (vendor ? ' · ' + vendor : '');
        openModal('markPaidModal');
    };
    window.openVoidExpense = function (id, label, amount) {
        document.getElementById('voidExpId').value = id;
        document.getElementById('voidExpLabel').textContent = label + ' · ' + amount;
        openModal('voidExpenseModal');
    };
    var qa = document.getElementById('quickAdd');
    if (qa) qa.querySelector('input[name="description"]').focus();
})();
</script>

<script>
// Line items on the Add Expense form. Each line is qty × unit; the total
// replaces whatever is in the Amount box so the two never disagree.
var XP_UNITS = ['pcs','kg','g','L','ml','dozen','tray','crate','bag','sack','box','pkt','ream','m','roll','hrs','days'];
function xpAddLine(boxId) {
    var box = document.getElementById(boxId), r = document.createElement('div');
    r.className = 'xp-line';
    r.innerHTML = '<input name="line_desc[]" placeholder="Milk">' +
                  '<input name="line_qty[]" type="number" min="0.01" step="any" value="1" class="text-right" title="How many">' +
                  '<select name="line_measure[]" title="Unit">' + XP_UNITS.map(function (u) { return '<option>' + u + '</option>'; }).join('') + '</select>' +
                  '<input name="line_unit[]" type="number" min="0" step="any" class="text-right" placeholder="0.00" title="Price for one">' +
                  '<span class="xp-total">—</span>' +
                  '<button type="button" class="text-gray-400 hover:text-red-600 text-lg leading-none" onclick="this.parentNode.remove();xpLinesTotal(\'' + boxId + '\')">&times;</button>';
    r.querySelectorAll('input,select').forEach(function (i) { i.addEventListener('input', function () { xpLinesTotal(boxId); }); });
    box.appendChild(r); r.querySelector('input').focus();
}
function xpLinesTotal(boxId) {
    var t = 0, any = false;
    document.querySelectorAll('#' + boxId + ' > div').forEach(function (r) {
        var i = r.querySelectorAll('input'); var v = (parseFloat(i[1].value) || 0) * (parseFloat(i[2].value) || 0);
        var cell = r.querySelector('.xp-total'); if (cell) cell.textContent = v ? v.toLocaleString(undefined, {maximumFractionDigits: 2}) : '—';
        if (i[0].value.trim() !== '') { any = true; t += v; }
    });
    var out = document.getElementById(boxId + 'Total');
    if (out) out.textContent = any ? 'KES ' + t.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';
    var form = document.getElementById(boxId).closest('form'), amt = form ? form.querySelector('input[name="amount"]') : null;
    if (amt && any) { amt.value = t.toFixed(2); amt.readOnly = true; amt.classList.add('bg-gray-50'); }
    else if (amt) { amt.readOnly = false; amt.classList.remove('bg-gray-50'); }
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
