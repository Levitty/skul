<?php
/**
 * Payroll bridge — post each month's payroll into the books (migration 109).
 *
 * Payroll runs live in the HR system; the ledger never saw them, so the P&L
 * overstated profit by the school's largest cost. The bursar copies three
 * figures from the HR payroll run (gross, statutory withheld, net paid) and
 * this posts the balanced journal: DR 5000 Salaries / CR 2200 Statutory /
 * CR cash. A second form records the later statutory remittance to KRA/NSSF/SHA.
 * One posting per month per school (idempotent). Automated HR feed can replace
 * the typing later — the posting shape stays identical.
 */
$pageTitle = 'Payroll';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'post_run') {
        $res = $sb->rpc('record_payroll_run', [
            'p_school_id'  => $sid,
            'p_period'     => input('period'),
            'p_gross'      => (float)str_replace(',', '', (string)input('gross')),
            'p_statutory'  => (float)str_replace(',', '', (string)input('statutory')),
            'p_net'        => null,   // derived: gross - statutory
            'p_method'     => input('method') ?: 'bank',
            'p_note'       => trim((string)input('note')) ?: null,
            'p_user_id'    => $me['id']    ?? null,
            'p_user_email' => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
            flash('error', is_array($p) ? ($p['error'] ?? 'Could not post the payroll.') : 'Could not post the payroll.');
        } else {
            flash('success', 'Payroll ' . input('period') . ' posted — gross ' . money((float)$p['gross']) . ', statutory ' . money((float)$p['statutory']) . ', net ' . money((float)$p['net']) . '.');
        }
        redirect('finance/payroll');
    }

    if ($action === 'remit') {
        $res = $sb->rpc('record_statutory_remittance', [
            'p_school_id'  => $sid,
            'p_amount'     => (float)str_replace(',', '', (string)input('amount')),
            'p_date'       => input('date') ?: date('Y-m-d'),
            'p_method'     => input('method') ?: 'bank',
            'p_note'       => trim((string)input('note')) ?: null,
            'p_user_id'    => $me['id']    ?? null,
            'p_user_email' => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
            flash('error', is_array($p) ? ($p['error'] ?? 'Could not record the remittance.') : 'Could not record the remittance.');
        } else {
            flash('success', 'Statutory remittance of ' . money((float)$p['amount']) . ' recorded.');
        }
        redirect('finance/payroll');
    }
}

$postings = $sb->from('payroll_postings')->select('*')->eq('school_id', $sid)
    ->order('period', false)->limit(24)->execute()['data'] ?? [];
$defaultPeriod = date('Y-m', strtotime('first day of last month'));

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Payroll</h1>
    <p class="text-sm text-gray-500 mt-1">Post each month's payroll from the HR run into the books — salaries are the school's largest cost and belong in the P&amp;L.</p>
</div>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
    <!-- Post a month's run -->
    <div class="bg-white rounded-xl border border-gray-100 p-5">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">Post a payroll month</h2>
        <form method="POST" class="space-y-3">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="post_run">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Month *</label>
                <input type="month" name="period" required value="<?= e($defaultPeriod) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Gross pay (KES) *</label>
                    <input type="text" name="gross" id="prGross" required inputmode="numeric" oninput="prCalc()" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Statutory withheld</label>
                    <input type="text" name="statutory" id="prStat" inputmode="numeric" value="0" oninput="prCalc()" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <p class="text-[11px] text-gray-400 mt-0.5">PAYE + NSSF + SHA</p>
                </div>
            </div>
            <p class="text-sm text-gray-600">Net paid out: <span id="prNet" class="font-semibold text-gray-900">—</span></p>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Paid from</label>
                    <select name="method" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                        <option value="bank">Bank</option>
                        <option value="mpesa">M-Pesa</option>
                        <option value="cash">Cash</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Note</label>
                    <input type="text" name="note" maxlength="160" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                </div>
            </div>
            <button type="submit" class="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition">Post to ledger</button>
        </form>
    </div>

    <!-- Remit statutory -->
    <div class="bg-white rounded-xl border border-gray-100 p-5">
        <h2 class="text-sm font-semibold text-gray-700 mb-1">Record statutory remittance</h2>
        <p class="text-xs text-gray-500 mb-3">When the withheld PAYE / NSSF / SHA is actually paid to KRA &amp; funds, record it here — it clears the Statutory Liabilities account.</p>
        <form method="POST" class="space-y-3">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="remit">
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Amount (KES) *</label>
                    <input type="text" name="amount" required inputmode="numeric" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input type="date" name="date" value="<?= e(date('Y-m-d')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Paid from</label>
                    <select name="method" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                        <option value="bank">Bank</option>
                        <option value="mpesa">M-Pesa</option>
                        <option value="cash">Cash</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Note</label>
                    <input type="text" name="note" maxlength="160" placeholder="e.g. PAYE July" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                </div>
            </div>
            <button type="submit" class="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 transition">Record remittance</button>
        </form>
    </div>
</div>

<!-- Posted months -->
<div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Posted months</h2></div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead><tr class="text-left text-xs text-gray-400 uppercase">
                <th class="px-5 py-2.5">Month</th><th class="px-5 py-2.5">Gross</th><th class="px-5 py-2.5">Statutory</th><th class="px-5 py-2.5">Net paid</th><th class="px-5 py-2.5">Method</th><th class="px-5 py-2.5">Posted by</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php foreach ($postings as $p): ?>
                <tr>
                    <td class="px-5 py-3 font-medium text-gray-900"><?= e($p['period']) ?></td>
                    <td class="px-5 py-3"><?= money((float)$p['gross_pay']) ?></td>
                    <td class="px-5 py-3"><?= money((float)$p['statutory']) ?></td>
                    <td class="px-5 py-3"><?= money((float)$p['net_paid']) ?></td>
                    <td class="px-5 py-3 text-gray-500"><?= e(ucfirst($p['payment_method'] ?? '')) ?></td>
                    <td class="px-5 py-3 text-xs text-gray-400"><?= e($p['posted_by'] ?? '') ?></td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($postings)): ?>
                <tr><td colspan="6" class="px-5 py-10 text-center text-gray-400">No payroll posted yet. Post last month's run to complete the expense side of the books.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<script>
function prCalc(){
    var g = parseFloat((document.getElementById('prGross').value||'').replace(/,/g,'')) || 0;
    var s = parseFloat((document.getElementById('prStat').value||'').replace(/,/g,'')) || 0;
    var el = document.getElementById('prNet');
    el.textContent = (g > 0 && s <= g) ? 'KES ' + (g - s).toLocaleString() : '—';
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
