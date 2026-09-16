<?php
/**
 * Chart of Accounts admin — view/add/rename accounts and map expense &
 * income categories to the account they should post to. System accounts
 * (the seeded defaults) can be renamed or deactivated but not deleted.
 * Backing tables: chart_of_accounts + account_code on the category tables
 * (migration 090).
 */
require_once __DIR__ . '/../../includes/ledger.php';

$pageTitle = 'Chart of Accounts';
$sb  = new Supabase();
$sid = schoolId();

$TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];
$normalFor = fn(string $t) => in_array($t, ['asset', 'expense'], true) ? 'debit' : 'credit';

if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'add') {
        $code = trim((string)input('code'));
        $name = trim((string)input('name'));
        $type = input('type');
        if ($code === '' || $name === '' || !in_array($type, $TYPES, true)) {
            flash('error', 'Code, name and a valid type are required.');
        } else {
            $dup = $sb->from('ledger_accounts')->select('id')
                ->eq('school_id', $sid)->eq('code', $code)->single()->execute();
            if (!empty($dup['data'][0]['id'])) {
                flash('error', "Account code $code already exists.");
            } else {
                $sb->from('ledger_accounts')->insert([
                    'school_id'   => $sid,
                    'code'        => $code,
                    'name'        => $name,
                    'type'        => $type,
                    'normal_side' => $normalFor($type),
                    'is_active'   => true,
                    'is_system'   => false,
                ]);
                flash('success', "Added $code · $name.");
            }
        }
    } elseif ($action === 'rename') {
        $id   = input('id');
        $name = trim((string)input('name'));
        if ($id && $name !== '') {
            $sb->from('ledger_accounts')->eq('id', $id)->eq('school_id', $sid)
               ->update(['name' => $name, 'updated_at' => date('c')]);
            flash('success', 'Account renamed.');
        }
    } elseif ($action === 'toggle') {
        $id  = input('id');
        $act = input('active') === '1';
        if ($id) {
            $sb->from('ledger_accounts')->eq('id', $id)->eq('school_id', $sid)
               ->update(['is_active' => $act, 'updated_at' => date('c')]);
            flash('success', $act ? 'Account activated.' : 'Account deactivated.');
        }
    } elseif ($action === 'map_expense' || $action === 'map_income') {
        $table = $action === 'map_expense' ? 'expense_categories' : 'income_categories';
        $catId = input('category_id');
        $code  = trim((string)input('account_code')) ?: null;
        if ($catId) {
            $sb->from($table)->eq('id', $catId)->eq('school_id', $sid)
               ->update(['account_code' => $code]);
            flash('success', 'Category mapping updated.');
        }
    } elseif ($action === 'rebuild') {
        // Replay every existing invoice/payment/expense/income into the ledger.
        // Idempotent — skips anything already posted, so it's safe to click again.
        $res = $sb->rpc('backfill_ledger', ['p_school_id' => $sid]);
        if (!empty($res['error'])) {
            flash('error', 'Rebuild failed: ' . $res['error']);
        } else {
            $r = $res['data'][0] ?? [];
            flash('success', sprintf(
                'Ledger rebuilt — %d invoices, %d payments, %d expenses, %d income posted (existing entries skipped).',
                (int)($r['invoices_posted'] ?? 0), (int)($r['payments_posted'] ?? 0),
                (int)($r['expenses_posted'] ?? 0), (int)($r['income_posted'] ?? 0)
            ));
        }
    }
    redirect('finance/chart-of-accounts');
}

$accounts = ledgerAccounts($sb, $sid);
$byType = ['asset' => [], 'liability' => [], 'equity' => [], 'income' => [], 'expense' => []];
foreach ($accounts as $a) $byType[$a['type']][] = $a;

// Category → account mappings.
$expCats = $sb->from('expense_categories')->select('id,name,account_code')
    ->eq('school_id', $sid)->order('name', true)->limit(500)->execute()['data'] ?? [];
$incCats = $sb->from('income_categories')->select('id,name,account_code')
    ->eq('school_id', $sid)->order('name', true)->limit(500)->execute()['data'] ?? [];

// Options limited to the sensible account type for each mapping.
$expenseAccts = array_filter($accounts, fn($a) => $a['type'] === 'expense');
$incomeAccts  = array_filter($accounts, fn($a) => $a['type'] === 'income');

$typeLabels = ['asset' => 'Assets', 'liability' => 'Liabilities', 'equity' => 'Equity', 'income' => 'Income', 'expense' => 'Expenses'];

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Chart of Accounts</h1>
        <p class="text-sm text-gray-500 mt-1">The accounts every transaction posts to. Seeded with a school default — adjust to taste.</p>
    </div>
    <form method="POST" action="<?= baseUrl('finance/chart-of-accounts') ?>"
          onsubmit="return confirm('Rebuild this school\'s ledger from all existing invoices, payments, expenses and income? Safe to run — it skips anything already posted.');">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="rebuild">
        <button class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Rebuild ledger
        </button>
    </form>
</div>

<div class="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
    <!-- Accounts list -->
    <div class="xl:col-span-2 space-y-4">
        <?php foreach ($TYPES as $t): $list = $byType[$t]; ?>
            <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700"><?= e($typeLabels[$t]) ?></h2></div>
                <table class="w-full text-sm">
                    <tbody class="divide-y divide-gray-50">
                        <?php foreach ($list as $a): ?>
                            <tr class="hover:bg-gray-50 <?= $a['is_active'] ? '' : 'opacity-50' ?>">
                                <td class="px-5 py-2.5 w-16 text-gray-400 font-mono text-xs align-middle"><?= e($a['code']) ?></td>
                                <td class="px-3 py-2.5 align-middle">
                                    <form method="POST" action="<?= baseUrl('finance/chart-of-accounts') ?>" class="flex items-center gap-2">
                                        <?= csrfField() ?>
                                        <input type="hidden" name="action" value="rename">
                                        <input type="hidden" name="id" value="<?= e($a['id']) ?>">
                                        <input name="name" value="<?= e($a['name']) ?>" class="flex-1 min-w-0 px-2 py-1 text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-emerald-300 rounded bg-transparent">
                                        <?php if (!$a['is_active']): ?><span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">inactive</span><?php endif; ?>
                                        <button class="text-xs text-emerald-600 hover:text-emerald-700 opacity-0 group-hover:opacity-100">Save</button>
                                    </form>
                                </td>
                                <td class="px-5 py-2.5 w-24 text-right align-middle">
                                    <form method="POST" action="<?= baseUrl('finance/chart-of-accounts') ?>" class="inline">
                                        <?= csrfField() ?>
                                        <input type="hidden" name="action" value="toggle">
                                        <input type="hidden" name="id" value="<?= e($a['id']) ?>">
                                        <input type="hidden" name="active" value="<?= $a['is_active'] ? '0' : '1' ?>">
                                        <button class="text-xs text-gray-400 hover:text-gray-600"><?= $a['is_active'] ? 'Deactivate' : 'Activate' ?></button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endforeach; ?>
    </div>

    <!-- Right column: add account + category mapping -->
    <div class="space-y-4">
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <h2 class="text-sm font-semibold text-gray-700 mb-3">Add an account</h2>
            <form method="POST" action="<?= baseUrl('finance/chart-of-accounts') ?>" class="space-y-3">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="add">
                <div class="flex gap-2">
                    <input name="code" placeholder="Code" class="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg" required>
                    <input name="name" placeholder="Account name" class="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg" required>
                </div>
                <select name="type" class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg">
                    <?php foreach ($TYPES as $t): ?><option value="<?= e($t) ?>"><?= e($typeLabels[$t]) ?></option><?php endforeach; ?>
                </select>
                <button class="w-full px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Add account</button>
            </form>
            <p class="text-[11px] text-gray-400 mt-2">The debit/credit side is set automatically from the type.</p>
        </div>

        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <h2 class="text-sm font-semibold text-gray-700 mb-1">Expense categories → account</h2>
            <p class="text-[11px] text-gray-400 mb-3">Which expense account each category posts to. Unmapped → <span class="font-mono">5900</span> General.</p>
            <div class="space-y-2">
                <?php foreach ($expCats as $c): ?>
                    <form method="POST" action="<?= baseUrl('finance/chart-of-accounts') ?>" class="flex items-center gap-2">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="map_expense">
                        <input type="hidden" name="category_id" value="<?= e($c['id']) ?>">
                        <span class="flex-1 text-sm text-gray-700 truncate"><?= e($c['name']) ?></span>
                        <select name="account_code" onchange="this.form.submit()" class="px-2 py-1.5 text-xs border border-gray-200 rounded-lg">
                            <option value="">— default (5900) —</option>
                            <?php foreach ($expenseAccts as $a): ?>
                                <option value="<?= e($a['code']) ?>" <?= ($c['account_code'] ?? '') === $a['code'] ? 'selected' : '' ?>><?= e($a['code'] . ' · ' . $a['name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </form>
                <?php endforeach; ?>
                <?php if (empty($expCats)): ?><p class="text-xs text-gray-400">No expense categories yet.</p><?php endif; ?>
            </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <h2 class="text-sm font-semibold text-gray-700 mb-1">Income categories → account</h2>
            <p class="text-[11px] text-gray-400 mb-3">Unmapped → <span class="font-mono">4100</span> Other Income.</p>
            <div class="space-y-2">
                <?php foreach ($incCats as $c): ?>
                    <form method="POST" action="<?= baseUrl('finance/chart-of-accounts') ?>" class="flex items-center gap-2">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="map_income">
                        <input type="hidden" name="category_id" value="<?= e($c['id']) ?>">
                        <span class="flex-1 text-sm text-gray-700 truncate"><?= e($c['name']) ?></span>
                        <select name="account_code" onchange="this.form.submit()" class="px-2 py-1.5 text-xs border border-gray-200 rounded-lg">
                            <option value="">— default (4100) —</option>
                            <?php foreach ($incomeAccts as $a): ?>
                                <option value="<?= e($a['code']) ?>" <?= ($c['account_code'] ?? '') === $a['code'] ? 'selected' : '' ?>><?= e($a['code'] . ' · ' . $a['name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </form>
                <?php endforeach; ?>
                <?php if (empty($incCats)): ?><p class="text-xs text-gray-400">No income categories yet.</p><?php endif; ?>
            </div>
        </div>
    </div>
</div>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
