<?php
/**
 * Finance Overview — the school-level money picture in one screen.
 *
 *   Money in  = fees collected (this year's invoices) + other income
 *   Money out = expenses
 *   Net       = surplus / deficit
 *
 * Plus expense budget-vs-actual per category (set budgets inline) and a
 * CSV export of the budget table. Scoped to the current academic year;
 * if no year is set, falls back to "all" (mirrors income/expenses pages).
 *
 * Backing table for budgets: category_budgets (migration 076).
 */
$pageTitle = 'Finance Overview';
$sb  = new Supabase();
$sid = schoolId();

$currentYear = cachedCurrentYear();
$yearId      = $currentYear['id'] ?? null;
$yearName    = $currentYear['name'] ?? null;

// ── POST: set/update a category budget ───────────────────────────
if (isPost() && verifyCsrf()) {
    if (input('action') === 'set_budget') {
        $catId  = input('category_id');
        $amount = (float)input('amount');

        if (!$yearId) {
            flash('error', 'Set an academic year as current (Settings → Academic Years) before adding budgets.');
        } elseif (!$catId) {
            flash('error', 'Pick a category.');
        } else {
            // Tenant guard: the category must belong to this school.
            $catChk = $sb->from('expense_categories')->select('id')
                ->eq('id', $catId)->eq('school_id', $sid)->single()->execute();
            if (empty($catChk['data'][0]['id'])) {
                flash('error', 'That category does not belong to your school.');
            } else {
                // Upsert by (school, category, year): update if it exists, else insert.
                $existing = $sb->from('category_budgets')->select('id')
                    ->eq('school_id', $sid)->eq('expense_category_id', $catId)
                    ->eq('academic_year_id', $yearId)->single()->execute();
                $existingId = $existing['data'][0]['id'] ?? null;

                if ($existingId) {
                    $sb->from('category_budgets')->eq('id', $existingId)->eq('school_id', $sid)->update([
                        'amount'     => $amount,
                        'updated_at' => date('c'),
                    ]);
                } else {
                    $sb->from('category_budgets')->insert([
                        'school_id'           => $sid,
                        'expense_category_id' => $catId,
                        'academic_year_id'    => $yearId,
                        'amount'              => $amount,
                    ]);
                }
                flash('success', 'Budget saved.');
            }
        }
    }
    redirect('finance/overview');
}

// ── Helper: sum a table's `amount` for the current year (or all) ──
$sumForYear = function (string $table) use ($sb, $sid, $yearId): array {
    // Returns [total, rows] — rows kept where useful (expenses for the table).
    $q = $sb->from($table)->select('amount,category_id,description,date,academic_year_id')
        ->eq('school_id', $sid);
    $rows = $q->execute()['data'] ?? [];
    $total = 0.0;
    foreach ($rows as $r) {
        if (!$yearId || ($r['academic_year_id'] ?? null) === $yearId) {
            $total += (float)($r['amount'] ?? 0);
        }
    }
    return [$total, $rows];
};

// ── Money in: fees collected + other income ──────────────────────
$invoices = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('invoices')->select('amount,paid_amount,status,academic_year_id')->eq('school_id', $sid)
);
$feesBilled = 0.0; $feesCollected = 0.0;
foreach ($invoices as $inv) {
    $st = $inv['status'] ?? '';
    if ($st === 'draft' || $st === 'cancelled') continue;
    if ($yearId && ($inv['academic_year_id'] ?? null) !== $yearId) continue;
    $feesBilled    += (float)($inv['amount'] ?? 0);
    $feesCollected += (float)($inv['paid_amount'] ?? 0);
}
$feesOutstanding = max(0.0, $feesBilled - $feesCollected);

[$incomeTotal, $incomeRows]   = $sumForYear('income');

// Expenses live on a different schema: no academic_year_id, the date column is
// `expense_date`. Scope them to the current academic year's date window when one
// is set; otherwise count everything.
$yearStart = $currentYear['start_date'] ?? null;
$yearEnd   = $currentYear['end_date'] ?? null;
$expInYear = function ($d) use ($yearId, $yearStart, $yearEnd): bool {
    if (!$yearId || !$yearStart || !$yearEnd) return true;
    return $d !== '' && $d >= $yearStart && $d <= $yearEnd;
};
$expenseRows = $sb->from('expenses')->select('amount,category_id,expense_date')
    ->eq('school_id', $sid)->execute()['data'] ?? [];
$expenseTotal = 0.0;
foreach ($expenseRows as $r) {
    if ($expInYear($r['expense_date'] ?? '')) $expenseTotal += (float)($r['amount'] ?? 0);
}

// Uniform POS sales count as money in. (If the uniform_sales table isn't
// created yet, this query just returns nothing — no error surfaced.)
$uniformRows  = $sb->from('uniform_sales')->select('total_amount,sale_date')->eq('school_id', $sid)->execute()['data'] ?? [];
$uniformTotal = 0.0;
foreach ($uniformRows as $r) {
    if ($expInYear($r['sale_date'] ?? '')) $uniformTotal += (float)($r['total_amount'] ?? 0);
}

$totalIn  = $feesCollected + $incomeTotal + $uniformTotal;
$totalOut = $expenseTotal;
$net      = $totalIn - $totalOut;

// ── Expense actuals by category + budgets ────────────────────────
$catResult = $sb->from('expense_categories')->select('id,name')->eq('school_id', $sid)->order('name')->execute();
$categories = $catResult['data'] ?? [];

$actualByCat = []; // category_id|'_none' => actual spend (this year)
foreach ($expenseRows as $r) {
    if (!$expInYear($r['expense_date'] ?? '')) continue;
    $k = $r['category_id'] ?? '_none';
    $actualByCat[$k] = ($actualByCat[$k] ?? 0) + (float)($r['amount'] ?? 0);
}

$budgetByCat = [];
if ($yearId) {
    $budRes = $sb->from('category_budgets')->select('expense_category_id,amount')
        ->eq('school_id', $sid)->eq('academic_year_id', $yearId)->execute();
    foreach (($budRes['data'] ?? []) as $b) {
        $budgetByCat[$b['expense_category_id']] = (float)($b['amount'] ?? 0);
    }
}

// Build the budget-vs-actual rows: every category, plus an "Uncategorized"
// row when there's uncategorized spend.
$budgetRows = [];
foreach ($categories as $c) {
    $actual = (float)($actualByCat[$c['id']] ?? 0);
    $budget = (float)($budgetByCat[$c['id']] ?? 0);
    $budgetRows[] = [
        'id' => $c['id'], 'name' => $c['name'],
        'budget' => $budget, 'actual' => $actual,
        'variance' => $budget - $actual,
        'pct' => $budget > 0 ? ($actual / $budget) * 100 : null,
    ];
}
if (!empty($actualByCat['_none'])) {
    $budgetRows[] = [
        'id' => null, 'name' => 'Uncategorized',
        'budget' => 0, 'actual' => (float)$actualByCat['_none'],
        'variance' => -(float)$actualByCat['_none'], 'pct' => null,
    ];
}
$totalBudget = array_sum(array_column($budgetRows, 'budget'));

// ── CSV export (must emit before any HTML) ───────────────────────
if (input('export') === 'csv') {
    $safe = fn($s) => preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string)$s, ' -'));
    $filename = 'finance_overview_' . $safe($yearName ?: 'all') . '_' . date('Y-m-d') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");

    fputcsv($out, ['Finance Overview']);
    fputcsv($out, ['Generated', date('Y-m-d H:i')]);
    fputcsv($out, ['Academic year', $yearName ?: 'All (no current year set)']);
    fputcsv($out, []);
    fputcsv($out, ['Money In / Out']);
    fputcsv($out, ['Fees collected', number_format($feesCollected, 2, '.', '')]);
    fputcsv($out, ['Other income',   number_format($incomeTotal, 2, '.', '')]);
    fputcsv($out, ['Total in',       number_format($totalIn, 2, '.', '')]);
    fputcsv($out, ['Expenses',       number_format($totalOut, 2, '.', '')]);
    fputcsv($out, ['Net (surplus/deficit)', number_format($net, 2, '.', '')]);
    fputcsv($out, ['Fees billed',       number_format($feesBilled, 2, '.', '')]);
    fputcsv($out, ['Fees outstanding',  number_format($feesOutstanding, 2, '.', '')]);
    fputcsv($out, []);
    fputcsv($out, ['Expense Budget vs Actual']);
    fputcsv($out, ['Category', 'Budget', 'Actual', 'Variance', '% Used']);
    foreach ($budgetRows as $r) {
        fputcsv($out, [
            $r['name'],
            number_format($r['budget'], 2, '.', ''),
            number_format($r['actual'], 2, '.', ''),
            number_format($r['variance'], 2, '.', ''),
            $r['pct'] === null ? '' : round($r['pct'], 1) . '%',
        ]);
    }
    fputcsv($out, ['TOTAL',
        number_format($totalBudget, 2, '.', ''),
        number_format($expenseTotal, 2, '.', ''),
        number_format($totalBudget - $expenseTotal, 2, '.', ''),
        $totalBudget > 0 ? round($expenseTotal / $totalBudget * 100, 1) . '%' : '',
    ]);
    fclose($out);
    exit;
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Finance Overview</h1>
        <p class="text-sm text-gray-500 mt-1">
            Money in vs money out
            <?php if ($yearName): ?>· <span class="font-medium text-gray-600"><?= e($yearName) ?></span><?php else: ?>· <span class="text-amber-600">all time (no current academic year set)</span><?php endif; ?>
        </p>
    </div>
    <a href="<?= baseUrl('finance/overview') ?>?export=csv" download
       class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition inline-flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        Export CSV
    </a>
</div>

<!-- Headline: In / Out / Net -->
<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Money In</p>
        <p class="text-2xl font-bold text-emerald-700 mt-1"><?= money($totalIn) ?></p>
        <p class="text-[11px] text-gray-400 mt-1">Fees <?= money($feesCollected) ?> · Income <?= money($incomeTotal) ?><?= $uniformTotal > 0 ? ' · Uniform ' . money($uniformTotal) : '' ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500">Money Out</p>
        <p class="text-2xl font-bold text-red-600 mt-1"><?= money($totalOut) ?></p>
        <p class="text-[11px] text-gray-400 mt-1">Expenses</p>
    </div>
    <div class="rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-white bg-gradient-to-br <?= $net >= 0 ? 'from-emerald-500 to-teal-600' : 'from-red-500 to-rose-600' ?>">
        <p class="text-xs opacity-80"><?= $net >= 0 ? 'Net Surplus' : 'Net Deficit' ?></p>
        <p class="text-2xl font-bold mt-1"><?= money(abs($net)) ?></p>
        <p class="text-[11px] opacity-80 mt-1">In − Out</p>
    </div>
</div>

<!-- Context: billed / outstanding -->
<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-[11px] text-gray-500">Fees billed</p>
        <p class="text-base font-bold text-gray-900"><?= money($feesBilled) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-[11px] text-gray-500">Fees collected</p>
        <p class="text-base font-bold text-emerald-700"><?= money($feesCollected) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-[11px] text-gray-500">Fees outstanding</p>
        <p class="text-base font-bold text-amber-700"><?= money($feesOutstanding) ?></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-[11px] text-gray-500">Other income</p>
        <p class="text-base font-bold text-gray-900"><?= money($incomeTotal) ?></p>
    </div>
</div>

<!-- Budget vs Actual -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div>
            <h2 class="text-base font-semibold text-gray-900">Expense Budget vs Actual</h2>
            <p class="text-xs text-gray-500 mt-0.5">Set a budget per category for <?= e($yearName ?: 'the year') ?>. Actuals come from recorded expenses.</p>
        </div>
        <a href="<?= baseUrl('finance/expenses') ?>" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Manage expenses →</a>
    </div>

    <?php if (!$yearId): ?>
        <div class="px-5 py-4 bg-amber-50 border-b border-amber-100 text-amber-800 text-sm">
            No current academic year is set, so budgets can't be saved. Set one in <strong>Settings → Academic Years</strong>; actuals below still reflect all expenses.
        </div>
    <?php endif; ?>

    <?php if (empty($budgetRows)): ?>
        <div class="px-5 py-10 text-center text-gray-400 text-sm">No expense categories yet. Add some on the Expenses page.</div>
    <?php else: ?>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-5 py-3 font-semibold text-gray-600">Category</th>
                    <th class="text-left px-4 py-3 font-semibold text-gray-600 w-48">Budget</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Actual</th>
                    <th class="text-right px-4 py-3 font-semibold text-gray-600">Variance</th>
                    <th class="text-left px-5 py-3 font-semibold text-gray-600 w-1/4">Used</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($budgetRows as $r):
                    $pct      = $r['pct'];
                    $over     = $r['budget'] > 0 && $r['actual'] > $r['budget'];
                    $barColor = $pct === null ? 'bg-gray-300' : ($pct > 100 ? 'bg-red-500' : ($pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'));
                ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-5 py-3 font-medium text-gray-900"><?= e($r['name']) ?></td>
                        <td class="px-4 py-3">
                            <?php if ($r['id'] && $yearId): ?>
                            <form method="POST" class="flex items-center gap-1.5">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="set_budget">
                                <input type="hidden" name="category_id" value="<?= e($r['id']) ?>">
                                <input type="number" name="amount" step="0.01" min="0" value="<?= $r['budget'] > 0 ? e(number_format($r['budget'], 2, '.', '')) : '' ?>"
                                    placeholder="0.00"
                                    class="w-28 px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                                <button type="submit" class="px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">Save</button>
                            </form>
                            <?php else: ?>
                                <span class="text-gray-300 text-xs">—</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-right font-medium <?= $over ? 'text-red-600' : 'text-gray-900' ?>"><?= money($r['actual']) ?></td>
                        <td class="px-4 py-3 text-right font-medium <?= $r['budget'] <= 0 ? 'text-gray-300' : ($r['variance'] < 0 ? 'text-red-600' : 'text-emerald-700') ?>">
                            <?= $r['budget'] > 0 ? money($r['variance']) : '—' ?>
                        </td>
                        <td class="px-5 py-3">
                            <?php if ($pct === null): ?>
                                <span class="text-xs text-gray-400">No budget set</span>
                            <?php else: ?>
                            <div class="flex items-center gap-2">
                                <div class="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                    <div class="h-full <?= $barColor ?>" style="width: <?= min(100, $pct) ?>%"></div>
                                </div>
                                <span class="text-xs <?= $pct > 100 ? 'text-red-600 font-semibold' : 'text-gray-600' ?> w-12 text-right"><?= number_format($pct, 0) ?>%</span>
                            </div>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
            <tfoot>
                <tr class="bg-gray-50 border-t border-gray-200">
                    <td class="px-5 py-3 font-bold text-gray-700">Total</td>
                    <td class="px-4 py-3 font-bold text-gray-900"><?= money($totalBudget) ?></td>
                    <td class="px-4 py-3 text-right font-bold <?= $totalBudget > 0 && $expenseTotal > $totalBudget ? 'text-red-600' : 'text-gray-900' ?>"><?= money($expenseTotal) ?></td>
                    <td class="px-4 py-3 text-right font-bold <?= ($totalBudget - $expenseTotal) < 0 ? 'text-red-600' : 'text-emerald-700' ?>"><?= $totalBudget > 0 ? money($totalBudget - $expenseTotal) : '—' ?></td>
                    <td class="px-5 py-3 text-gray-500 text-xs"><?= $totalBudget > 0 ? number_format($expenseTotal / $totalBudget * 100, 0) . '% of budget' : '' ?></td>
                </tr>
            </tfoot>
        </table>
    </div>
    <?php endif; ?>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
