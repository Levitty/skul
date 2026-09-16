<?php
/**
 * Income & Donations — track non-fee income by category.
 */
$pageTitle = 'Income & Donations';
$sb  = new Supabase();
$sid = schoolId();

// Get current academic year
$currentYear = cachedCurrentYear();

// Handle POST actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // --- Income Categories ---
    if ($action === 'add_category') {
        $name = input('name');
        $desc = input('description');

        if (!$name) {
            flash('error', 'Category name is required.');
        } else {
            $result = $sb->from('income_categories')->insert([
                'school_id'   => $sid,
                'name'        => $name,
                'description' => $desc ?: null,
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Category added.');
            }
        }
        redirect('finance/income');
    }

    if ($action === 'edit_category') {
        $id   = input('category_id');
        $name = input('name');
        $desc = input('description');

        if (!$name) {
            flash('error', 'Category name is required.');
        } else {
            $result = $sb->from('income_categories')->eq('id', $id)->eq('school_id', $sid)->update([
                'name'        => $name,
                'description' => $desc ?: null,
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Category updated.');
            }
        }
        redirect('finance/income');
    }

    if ($action === 'delete_category') {
        $id = input('category_id');
        $result = $sb->from('income_categories')->eq('id', $id)->eq('school_id', $sid)->delete();
        if ($result['error']) {
            flash('error', $result['error']);
        } else {
            flash('success', 'Category deleted.');
        }
        redirect('finance/income');
    }

    // --- Income Entries ---
    if ($action === 'add_income') {
        $description = input('description');
        $amount      = (float)input('amount');
        $date        = input('date') ?: date('Y-m-d');
        $categoryId  = input('category_id') ?: null;
        $source      = input('source') ?: null;
        $reference   = input('reference') ?: null;

        // Reject a category_id that isn't this school's (forged POST guard).
        if ($categoryId) {
            $chk = $sb->from('income_categories')->select('id')->eq('id', $categoryId)->eq('school_id', $sid)->single()->execute();
            if (empty($chk['data'][0]['id'])) $categoryId = null;
        }

        if (!$description || $amount <= 0) {
            flash('error', 'Description and a valid amount are required.');
        } else {
            $row = [
                'school_id'   => $sid,
                'category_id' => $categoryId,
                'amount'      => $amount,
                'description' => $description,
                'date'        => $date,
                'source'      => $source,
                'reference'   => $reference,
            ];
            if ($currentYear) {
                $row['academic_year_id'] = $currentYear['id'];
            }
            $result = $sb->from('income')->insert($row);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Income of ' . money($amount) . ' recorded.');
            }
        }
        redirect('finance/income');
    }

    if ($action === 'edit_income') {
        $id          = input('income_id');
        $description = input('description');
        $amount      = (float)input('amount');
        $date        = input('date') ?: date('Y-m-d');
        $categoryId  = input('category_id') ?: null;
        $source      = input('source') ?: null;
        $reference   = input('reference') ?: null;

        // Reject a category_id that isn't this school's (forged POST guard).
        if ($categoryId) {
            $chk = $sb->from('income_categories')->select('id')->eq('id', $categoryId)->eq('school_id', $sid)->single()->execute();
            if (empty($chk['data'][0]['id'])) $categoryId = null;
        }

        if (!$description || $amount <= 0) {
            flash('error', 'Description and a valid amount are required.');
        } else {
            $result = $sb->from('income')->eq('id', $id)->eq('school_id', $sid)->update([
                'category_id' => $categoryId,
                'amount'      => $amount,
                'description' => $description,
                'date'        => $date,
                'source'      => $source,
                'reference'   => $reference,
                'updated_at'  => date('c'),
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Income entry updated.');
            }
        }
        redirect('finance/income');
    }

    if ($action === 'delete_income') {
        $id = input('income_id');
        $result = $sb->from('income')->eq('id', $id)->eq('school_id', $sid)->delete();
        if ($result['error']) {
            flash('error', $result['error']);
        } else {
            flash('success', 'Income entry deleted.');
        }
        redirect('finance/income');
    }
}

// Fetch categories
$catResult = $sb->from('income_categories')->select('id,name,description')->eq('school_id', $sid)->order('name')->execute();
$categories = $catResult['data'] ?? [];
$catMap = [];
foreach ($categories as $c) $catMap[$c['id']] = $c['name'];

// Fetch income entries
$incomeResult = $sb->from('income')->select('*')->eq('school_id', $sid)->order('date', false)->execute();
$incomeEntries = $incomeResult['data'] ?? [];

// Compute summaries
$totalIncome  = 0;
$monthIncome  = 0;
$currentMonth = date('Y-m');
$incByCat     = [];
$incCount     = count($incomeEntries);

foreach ($incomeEntries as $entry) {
    $amt = (float)($entry['amount'] ?? 0);
    // Count entries in the current academic year; when no year is configured
    // yet, fall back to counting everything (mirrors expenses.php) so the
    // headline figure is never silently zero.
    if (!$currentYear || ($entry['academic_year_id'] ?? null) === $currentYear['id']) {
        $totalIncome += $amt;
    }
    $entryDate = $entry['date'] ?? '';
    if (str_starts_with($entryDate, $currentMonth)) {
        $monthIncome += $amt;
    }
    $catId = $entry['category_id'] ?? '_none';
    $incByCat[$catId] = ($incByCat[$catId] ?? 0) + $amt;
}

// Find top source category
$topIncCatName = 'None';
$topIncCatAmt  = 0;
foreach ($incByCat as $catId => $catTotal) {
    if ($catTotal > $topIncCatAmt) {
        $topIncCatAmt  = $catTotal;
        $topIncCatName = $catId === '_none' ? 'Uncategorized' : ($catMap[$catId] ?? 'Unknown');
    }
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<!-- ── Mini Dashboard ─────────────────────────────────── -->
<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-lg font-bold text-gray-900 leading-tight"><?= money($totalIncome) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Total (Year)</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-lg font-bold text-gray-900 leading-tight"><?= money($monthIncome) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight"><?= date('M Y') ?></p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= number_format($incCount) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Entries</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-xl font-bold text-gray-900 leading-tight"><?= count($categories) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Categories</p>
            </div>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
            </div>
            <div class="min-w-0">
                <p class="text-sm font-bold text-gray-900 leading-tight truncate"><?= e($topIncCatName) ?></p>
                <p class="text-[11px] text-gray-500 leading-tight">Top Source</p>
            </div>
        </div>
    </div>
</div>

<!-- Categories Section -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-6">
    <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-gray-900">Income Categories</h2>
        <button onclick="document.getElementById('addCategoryModal').classList.remove('hidden')" class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
            + Add Category
        </button>
    </div>
    <?php if (empty($categories)): ?>
        <p class="text-sm text-gray-400">No categories yet. Add one to organize your income entries.</p>
    <?php else: ?>
        <div class="flex flex-wrap gap-2">
            <?php foreach ($categories as $cat): ?>
                <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-sm">
                    <span class="font-medium text-gray-700"><?= e($cat['name']) ?></span>
                    <?php if ($cat['description']): ?>
                        <span class="text-gray-400" title="<?= e($cat['description']) ?>">&#8505;</span>
                    <?php endif; ?>
                    <button onclick="editCategory('<?= e($cat['id']) ?>','<?= e(addslashes($cat['name'])) ?>','<?= e(addslashes($cat['description'] ?? '')) ?>')" class="text-emerald-600 hover:text-emerald-800 text-xs">Edit</button>
                    <form method="POST" class="inline" onsubmit="return confirm('Delete this category? Income entries using it will keep their data but lose the category link.')">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="delete_category">
                        <input type="hidden" name="category_id" value="<?= e($cat['id']) ?>">
                        <button type="submit" class="text-red-500 hover:text-red-700 text-xs">Del</button>
                    </form>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<!-- Income Table -->
<div class="flex items-center justify-between mb-4">
    <div>
        <h2 class="text-lg font-bold text-gray-900">Income Entries</h2>
        <p class="text-sm text-gray-500 mt-0.5"><?= count($incomeEntries) ?> record<?= count($incomeEntries) !== 1 ? 's' : '' ?></p>
    </div>
    <button onclick="document.getElementById('addIncomeModal').classList.remove('hidden')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
        + Add Income
    </button>
</div>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Description</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Source</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Reference</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($incomeEntries)): ?>
                <tr><td colspan="7" class="px-4 py-12 text-center text-gray-400">No income entries yet</td></tr>
            <?php else: ?>
                <?php foreach ($incomeEntries as $inc): ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 text-gray-600"><?= e($inc['date'] ?? '—') ?></td>
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($inc['description'] ?? '') ?></td>
                        <td class="px-4 py-3 text-gray-600">
                            <?php if ($inc['category_id'] && isset($catMap[$inc['category_id']])): ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><?= e($catMap[$inc['category_id']]) ?></span>
                            <?php else: ?>
                                <span class="text-gray-400">—</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-gray-600"><?= e($inc['source'] ?? '—') ?></td>
                        <td class="px-4 py-3 text-right font-medium text-emerald-600"><?= money((float)($inc['amount'] ?? 0)) ?></td>
                        <td class="px-4 py-3 text-gray-500"><?= e($inc['reference'] ?? '—') ?></td>
                        <td class="px-4 py-3 text-right">
                            <button onclick="editIncome(<?= htmlspecialchars(json_encode($inc), ENT_QUOTES, 'UTF-8') ?>)" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium mr-2">Edit</button>
                            <form method="POST" class="inline" onsubmit="return confirm('Delete this income entry?')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="delete_income">
                                <input type="hidden" name="income_id" value="<?= e($inc['id']) ?>">
                                <button type="submit" class="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<!-- Add Category Modal -->
<div id="addCategoryModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Add Income Category</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_category">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" name="name" required placeholder="e.g. Donations"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" name="description" placeholder="Optional description"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Add Category</button>
                <button type="button" onclick="document.getElementById('addCategoryModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Category Modal -->
<div id="editCategoryModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Category</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit_category">
            <input type="hidden" name="category_id" id="editCatId">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" name="name" id="editCatName" required
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" name="description" id="editCatDesc"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Changes</button>
                <button type="button" onclick="document.getElementById('editCategoryModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Add Income Modal -->
<div id="addIncomeModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Add Income</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_income">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input type="text" name="description" required placeholder="e.g. Church donation for science lab"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                    <input type="number" name="amount" step="0.01" min="0.01" required
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                    <input type="date" name="date" value="<?= date('Y-m-d') ?>" required
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select name="category_id" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">— None —</option>
                        <?php foreach ($categories as $cat): ?>
                            <option value="<?= e($cat['id']) ?>"><?= e($cat['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Source</label>
                    <input type="text" name="source" placeholder="e.g. Parent, NGO, Government"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input type="text" name="reference" placeholder="Receipt or reference number"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>

            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Add Income</button>
                <button type="button" onclick="document.getElementById('addIncomeModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Income Modal -->
<div id="editIncomeModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Income</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit_income">
            <input type="hidden" name="income_id" id="editIncId">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input type="text" name="description" id="editIncDesc" required
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                    <input type="number" name="amount" id="editIncAmount" step="0.01" min="0.01" required
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                    <input type="date" name="date" id="editIncDate" required
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select name="category_id" id="editIncCat" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">— None —</option>
                        <?php foreach ($categories as $cat): ?>
                            <option value="<?= e($cat['id']) ?>"><?= e($cat['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Source</label>
                    <input type="text" name="source" id="editIncSource"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input type="text" name="reference" id="editIncRef"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>

            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Changes</button>
                <button type="button" onclick="document.getElementById('editIncomeModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
function editCategory(id, name, desc) {
    document.getElementById('editCatId').value = id;
    document.getElementById('editCatName').value = name;
    document.getElementById('editCatDesc').value = desc;
    document.getElementById('editCategoryModal').classList.remove('hidden');
}

function editIncome(inc) {
    document.getElementById('editIncId').value = inc.id;
    document.getElementById('editIncDesc').value = inc.description || '';
    document.getElementById('editIncAmount').value = inc.amount || '';
    document.getElementById('editIncDate').value = inc.date || '';
    document.getElementById('editIncCat').value = inc.category_id || '';
    document.getElementById('editIncSource').value = inc.source || '';
    document.getElementById('editIncRef').value = inc.reference || '';
    document.getElementById('editIncomeModal').classList.remove('hidden');
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
