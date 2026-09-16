<?php
/**
 * Petty Cash Book (migration 138).
 *
 * The cash the office physically holds — handed over by the director in
 * whatever amount, spent on the small things, counted at the end of the
 * week. Three actions and nothing else: cash received, cash spent, count
 * the tin. A spend is an ordinary expense paid by 'petty_cash', so the P&L,
 * categories and approvals keep reading one table.
 *
 * Simple mode (a school setting) shows what, amount, category. Detailed adds
 * who was paid, a receipt number and line items. Both post the same journal.
 */
$pageTitle = 'Petty Cash';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

if (!userCan('finance.books') && !userCan('fees.manage')) {
    flash('error', 'You do not have permission to keep the petty cash book.');
    redirect('dashboard');
}

$detailed = schoolSetting('petty_cash_mode', 'simple') === 'detailed';
$month    = preg_match('/^\d{4}-\d{2}$/', (string)input('month')) ? input('month') : date('Y-m');
$from     = $month . '-01';
$to       = date('Y-m-t', strtotime($from));
$back     = fn() => 'finance/petty-cash?month=' . $month;

require_once __DIR__ . '/../../includes/finance-pickers.php';
$tree       = financeCategoryTree($sb, $sid, 'id,name,parent_category_id');
$categories = $tree['all'];
$catOptions = fn() => financeCategoryOptions($tree);
$centres    = financeCentres($sb, $sid);

if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'set_mode' && isAdmin()) {
        $val = input('mode') === 'detailed' ? 'detailed' : 'simple';
        $ex  = $sb->from('school_settings')->select('id')->eq('school_id', $sid)->eq('key', 'petty_cash_mode')->single()->execute();
        if (!empty($ex['data'])) {
            $sb->from('school_settings')->eq('school_id', $sid)->eq('key', 'petty_cash_mode')->update(['value' => $val, 'updated_at' => date('c')]);
        } else {
            $sb->from('school_settings')->insert(['school_id' => $sid, 'key' => 'petty_cash_mode', 'value' => $val]);
        }
        Supabase::clearCache('settings_' . $sid);
        redirect($back());
    }

    if ($action === 'receive') {
        $res = $sb->rpc('petty_cash_receive', [
            'p_school_id'  => $sid,
            'p_amount'     => (float)str_replace(',', '', (string)input('amount')),
            'p_source'     => input('source') ?: 'director_cash',
            'p_date'       => input('date') ?: null,
            'p_note'       => mb_substr(trim((string)input('note')), 0, 160) ?: null,
            'p_user_id'    => $me['id'] ?? null,
            'p_user_email' => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        flash(is_array($p) && !empty($p['success']) ? 'success' : 'error',
              is_array($p) ? ($p['message'] ?? $p['error'] ?? 'Could not record it.') : 'Could not record it.');
        redirect($back());
    }

    if ($action === 'spend') {
        $what  = mb_substr(trim((string)input('what')), 0, 200);
        $catId = input('category_id');
        $lines = [];
        {
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
        }
        $amount = (float)str_replace(',', '', (string)input('amount'));
        if ($lines) { $amount = 0; foreach ($lines as $ln) $amount += round($ln['quantity'] * $ln['unit_cost'], 2); }
        $ccId = input('cost_centre_id') ?: null;
        if ($ccId) {
            $chk = $sb->from('cost_centres')->select('id')->eq('id', $ccId)->eq('school_id', $sid)->single()->execute();
            if (empty($chk['data'][0]['id'])) $ccId = null;
        }
        $litres   = (float)str_replace(',', '', (string)input('litres')) ?: null;
        $odometer = (int)str_replace(',', '', (string)input('odometer_km')) ?: null;
        if ($what === '') {
            flash('error', 'Say what the cash was spent on.');
            redirect($back());
        }
        if (!$catId) {
            flash('error', 'Choose a category — it is what puts the spend on the P&L.');
            redirect($back());
        }
        $res = $sb->rpc('record_expense', [
            'p_school_id'      => $sid,
            'p_description'    => $what,
            'p_amount'         => $amount,
            'p_expense_date'   => input('date') ?: null,
            'p_category_id'    => $catId,
            'p_vendor_name'    => $detailed ? (mb_substr(trim((string)input('vendor')), 0, 120) ?: null) : null,
            'p_invoice_number' => $detailed ? (mb_substr(trim((string)input('ref')), 0, 60) ?: null) : null,
            'p_payment_method' => 'petty_cash',
            'p_user_id'        => $me['id'] ?? null,
            'p_user_email'     => $me['email'] ?? null,
            'p_lines'          => $lines ?: null,
            'p_cost_centre_id' => $ccId,
            'p_litres'         => $litres,
            'p_odometer_km'    => $odometer,
        ]);
        $p = $res['data'] ?? null;
        if (is_array($p) && !empty($p['success'])) {
            flash('success', money((float)$p['amount']) . ' spent on ' . $what . '. Book balance ' . money((float)$sb->rpc('petty_cash_book_balance', ['p_school_id' => $sid])['data']) . '.');
        } else {
            flash('error', is_array($p) ? ($p['error'] ?? 'Could not record the spend.') : 'Could not record the spend.');
        }
        redirect($back());
    }

    if ($action === 'count') {
        $res = $sb->rpc('petty_cash_count', [
            'p_school_id'  => $sid,
            'p_counted'    => (float)str_replace(',', '', (string)input('counted')),
            'p_date'       => input('date') ?: null,
            'p_note'       => mb_substr(trim((string)input('note')), 0, 200) ?: null,
            'p_user_id'    => $me['id'] ?? null,
            'p_user_email' => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        flash(is_array($p) && !empty($p['success']) ? 'success' : 'error',
              is_array($p) ? ($p['message'] ?? $p['error'] ?? 'Could not sign the count.') : 'Could not sign the count.');
        redirect($back());
    }
}

// ── Read ─────────────────────────────────────────────────────────
$sum = $sb->rpc('petty_cash_summary', ['p_school_id' => $sid, 'p_from' => $from, 'p_to' => $to])['data'] ?? [];
$balance   = (float)($sum['balance'] ?? 0);
$received  = (float)($sum['received'] ?? 0);
$spent     = (float)($sum['spent'] ?? 0);
$noReceipt = (int)($sum['no_receipt'] ?? 0);
$byCat     = (array)($sum['by_category'] ?? []);
$lastCount = $sum['last_count'] ?? null;
$entries   = (array)($sum['entries'] ?? []);

// Running balance down the page: start from today's book balance and walk
// backwards, so each row shows what the tin held after that entry.
$run = $balance;
foreach ($entries as $i => $e) {
    $entries[$i]['bal'] = $run;
    if ($e['kind'] === 'in')         $run -= (float)$e['amount'];
    elseif ($e['kind'] === 'out')    $run += (float)$e['amount'];
    elseif ($e['kind'] === 'count')  $run -= (float)($e['variance'] ?? 0);
}

$sourceLabels = ['director_cash' => 'Director — cash', 'director_mpesa' => 'Director — M-Pesa', 'bank' => 'Bank withdrawal', 'collections' => 'School collections'];
$catColors = ['#0ea5e9', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#6b7280'];
$monthLabel = date('F Y', strtotime($from));
$prevMonth  = date('Y-m', strtotime($from . ' -1 month'));
$nextMonth  = date('Y-m', strtotime($from . ' +1 month'));

require __DIR__ . '/../../includes/layout-top.php';
$f = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none';
$l = 'block text-xs font-medium text-gray-600 mb-1';
?>

<style>
.pc-lines-head,.pc-line{display:grid;grid-template-columns:minmax(0,2.2fr) 64px 84px 96px 96px 22px;gap:6px;align-items:center}
.pc-lines-head{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;padding:0 2px 4px}
.pc-line input,.pc-line select{width:100%;padding:5px 7px;font-size:13px;border:1px solid #e5e7eb;border-radius:6px;background:#fff}
.pc-line .pc-total{text-align:right;font-size:13px;font-weight:600;color:#111827;font-variant-numeric:tabular-nums}
</style>
<div class="mb-6 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Petty Cash Book</h1>
        <p class="text-sm text-gray-500 mt-1">The cash the office holds — what came in, what went out, what should be in the tin.</p>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
        <?php if (isAdmin()): ?>
        <form method="POST" class="inline-flex border border-gray-200 rounded-lg p-0.5 bg-white text-xs">
            <?= csrfField() ?><input type="hidden" name="action" value="set_mode">
            <button name="mode" value="simple"   class="px-3 py-1.5 rounded-md <?= !$detailed ? 'bg-gray-900 text-white' : 'text-gray-600' ?>">Simple</button>
            <button name="mode" value="detailed" class="px-3 py-1.5 rounded-md <?= $detailed ? 'bg-gray-900 text-white' : 'text-gray-600' ?>">Detailed</button>
        </form>
        <?php endif; ?>
        <button type="button" onclick="openM('mCount')" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Count the tin</button>
        <button type="button" onclick="openM('mIn')" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">+ Cash received</button>
        <button type="button" onclick="openM('mOut')" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm">+ Cash spent</button>
    </div>
</div>

<?php if ($balance < 0): ?>
<div class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
    <strong>The book shows <?= money($balance) ?> — more has been spent from the tin than was recorded going in.</strong>
    The tin was never empty in reality; the money it held was not written down here. Record what the director or the bank gave the office as <em>Cash received</em>, dated when it happened (it can be backdated), and the balance comes right. If old spends were imported from another system, one <em>Cash received</em> for the float that funded them is enough.
</div>
<?php endif; ?>

<!-- Tiles -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <?php foreach ([
        ['bg-emerald-500', money($balance), 'In the tin', 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z'],
        ['bg-sky-500',     money($received), 'Received · ' . date('M', strtotime($from)), 'M12 4v16m8-8H4'],
        ['bg-rose-500',    money($spent), 'Spent · ' . date('M', strtotime($from)), 'M20 12H4'],
        ['bg-amber-500',   (string)$noReceipt, 'Spends without a receipt', 'M9 12h6m-6 4h6M7 4h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z'],
    ] as $t): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl <?= $t[0] ?> flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="<?= $t[3] ?>"/></svg>
        </div>
        <div class="min-w-0"><p class="text-xl font-bold text-gray-900 leading-tight truncate"><?= e($t[1]) ?></p><p class="text-xs text-gray-500 mt-0.5"><?= e($t[2]) ?></p></div>
    </div>
    <?php endforeach; ?>
</div>

<div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <!-- The book -->
    <div class="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div>
                <h2 class="text-sm font-semibold text-gray-700">The book · <?= e($monthLabel) ?></h2>
                <p class="text-xs text-gray-500 mt-0.5">Newest first. Balance is what the tin held after each entry.</p>
            </div>
            <div class="flex items-center gap-1 text-sm">
                <a href="<?= baseUrl('finance/petty-cash?month=' . $prevMonth) ?>" class="px-2 py-1 rounded hover:bg-gray-100 text-gray-500">&larr;</a>
                <a href="<?= baseUrl('finance/petty-cash?month=' . $nextMonth) ?>" class="px-2 py-1 rounded hover:bg-gray-100 text-gray-500">&rarr;</a>
            </div>
        </div>
        <?php if (!$entries): ?>
            <div class="px-5 py-12 text-center text-sm text-gray-400">Nothing in the book for <?= e($monthLabel) ?>. Start with the cash the office was handed.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                        <th class="text-left px-5 py-2.5 font-semibold">Date</th>
                        <th class="text-left px-3 py-2.5 font-semibold">What</th>
                        <?php if ($detailed): ?><th class="text-left px-3 py-2.5 font-semibold">Paid to</th><?php endif; ?>
                        <th class="text-left px-3 py-2.5 font-semibold">Category</th>
                        <th class="text-right px-3 py-2.5 font-semibold">In</th>
                        <th class="text-right px-3 py-2.5 font-semibold">Out</th>
                        <th class="text-right px-3 py-2.5 font-semibold">Balance</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                <?php foreach ($entries as $e):
                    $dt = date('j M', strtotime($e['date'])); ?>
                    <?php if ($e['kind'] === 'in'): ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap"><?= $dt ?></td>
                        <td class="px-3 py-2.5 text-gray-900"><?= e($e['what']) ?><span class="block text-xs text-gray-400"><?= e($sourceLabels[$e['source']] ?? $e['source']) ?></span></td>
                        <?php if ($detailed): ?><td></td><?php endif; ?>
                        <td class="px-3 py-2.5"><span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700">Received</span></td>
                        <td class="px-3 py-2.5 text-right font-semibold text-sky-700 whitespace-nowrap"><?= money((float)$e['amount']) ?></td>
                        <td></td>
                        <td class="px-3 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap"><?= money((float)$e['bal']) ?></td>
                    </tr>
                    <?php elseif ($e['kind'] === 'count'): $v = (float)($e['variance'] ?? 0); ?>
                    <tr class="bg-amber-50/40">
                        <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap"><?= $dt ?></td>
                        <td class="px-3 py-2.5 text-gray-900" colspan="<?= $detailed ? 2 : 1 ?>">Tin counted: <?= money((float)$e['counted']) ?><?= $e['note'] ? '<span class="block text-xs text-gray-500">' . e($e['note']) . '</span>' : '' ?></td>
                        <td class="px-3 py-2.5"><span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold <?= $v == 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700' ?>"><?= $v == 0 ? 'Matches' : ($v < 0 ? 'Short ' : 'Over ') . money(abs($v)) ?></span></td>
                        <td class="px-3 py-2.5 text-right whitespace-nowrap <?= $v > 0 ? 'text-sky-700 font-semibold' : '' ?>"><?= $v > 0 ? money($v) : '' ?></td>
                        <td class="px-3 py-2.5 text-right whitespace-nowrap <?= $v < 0 ? 'text-rose-600 font-semibold' : '' ?>"><?= $v < 0 ? money(abs($v)) : '' ?></td>
                        <td class="px-3 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap"><?= money((float)$e['bal']) ?></td>
                    </tr>
                    <?php else: ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap"><?= $dt ?></td>
                        <td class="px-3 py-2.5 text-gray-900">
                            <?= e($e['what']) ?>
                            <?php if ($detailed && !empty($e['ref'])): ?><span class="block text-xs text-gray-400">Receipt <?= e($e['ref']) ?></span><?php endif; ?>
                            <?php if ($detailed && (int)($e['lines'] ?? 0) > 0): ?><span class="block text-xs text-gray-400"><?= (int)$e['lines'] ?> line<?= (int)$e['lines'] === 1 ? '' : 's' ?></span><?php endif; ?>
                        </td>
                        <?php if ($detailed): ?><td class="px-3 py-2.5 text-gray-600"><?= e($e['vendor'] ?: '—') ?></td><?php endif; ?>
                        <td class="px-3 py-2.5"><span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700"><?= e($e['category'] ?: 'Uncategorised') ?></span>
                            <?php if (empty($e['ref']) && empty($e['receipt'])): ?><span class="ml-1 text-[10px] text-amber-600">no receipt</span><?php endif; ?></td>
                        <td></td>
                        <td class="px-3 py-2.5 text-right font-semibold text-rose-600 whitespace-nowrap"><?= money((float)$e['amount']) ?></td>
                        <td class="px-3 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap"><?= money((float)$e['bal']) ?></td>
                    </tr>
                    <?php endif; ?>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>

    <!-- Right rail -->
    <div class="space-y-6">
        <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 class="text-sm font-semibold text-gray-700 mb-1">Where the cash went</h2>
            <p class="text-xs text-gray-500 mb-4"><?= e($monthLabel) ?>, by category. This is the line that reaches the P&amp;L.</p>
            <?php if (!$byCat): ?><p class="text-sm text-gray-400 italic">No spending yet this month.</p><?php endif; ?>
            <div class="space-y-3">
            <?php foreach ($byCat as $i => $c): $pct = $spent > 0 ? round((float)$c['amount'] / $spent * 100) : 0; $col = $catColors[$i % count($catColors)]; ?>
                <div>
                    <div class="flex justify-between text-sm mb-1"><span class="text-gray-700"><?= e($c['category']) ?></span><span class="text-gray-900 font-medium"><?= money((float)$c['amount']) ?> <span class="text-gray-400 text-xs"><?= $pct ?>%</span></span></div>
                    <div class="h-2 rounded-full bg-gray-100 overflow-hidden"><div class="h-full" style="width:<?= $pct ?>%;background:<?= $col ?>"></div></div>
                </div>
            <?php endforeach; ?>
            </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 class="text-sm font-semibold text-gray-700 mb-1">Last count</h2>
            <?php if ($lastCount): $v = (float)($lastCount['variance'] ?? 0); ?>
                <p class="text-sm text-gray-700"><?= date('j F', strtotime($lastCount['entry_date'])) ?> — counted <strong><?= money((float)$lastCount['counted_amount']) ?></strong>, book said <strong><?= money((float)$lastCount['book_amount']) ?></strong>.</p>
                <p class="text-sm mt-1 <?= $v == 0 ? 'text-emerald-700' : 'text-amber-700' ?>"><?= $v == 0 ? 'No difference.' : ($v < 0 ? 'Short ' : 'Over ') . money(abs($v)) . ($lastCount['note'] ? ' — ' . e($lastCount['note']) : '') ?></p>
                <p class="text-xs text-gray-400 mt-1">by <?= e($lastCount['created_by_email'] ?? 'staff') ?></p>
            <?php else: ?>
                <p class="text-sm text-gray-400 italic">The tin has never been counted. Do it weekly.</p>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- Cash received -->
<div id="mIn" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(17,24,20,.45)" onclick="if(event.target===this)closeM('mIn')">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-md" role="dialog" aria-modal="true">
    <form method="POST">
      <?= csrfField() ?><input type="hidden" name="action" value="receive">
      <div class="px-5 py-4 border-b border-gray-100"><h3 class="text-base font-bold text-gray-900">Cash received</h3><p class="text-xs text-gray-500">Money handed to the office for petty spending.</p></div>
      <div class="px-5 py-4 space-y-4">
        <div><label class="<?= $l ?>">Amount *</label><input name="amount" type="number" min="1" step="1" required class="<?= $f ?>" placeholder="10000"></div>
        <div><label class="<?= $l ?>">From</label>
          <select name="source" class="<?= $f ?>"><?php foreach ($sourceLabels as $k => $v): ?><option value="<?= e($k) ?>"><?= e($v) ?></option><?php endforeach; ?></select></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="<?= $l ?>">Date</label><input name="date" type="date" value="<?= date('Y-m-d') ?>" class="<?= $f ?>"></div>
          <div><label class="<?= $l ?>">Note</label><input name="note" maxlength="160" class="<?= $f ?>" placeholder="Week 3"></div>
        </div>
      </div>
      <div class="px-5 py-4 bg-gray-50 flex justify-end gap-2"><button type="button" onclick="closeM('mIn')" class="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-white">Cancel</button><button type="submit" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Record</button></div>
    </form>
  </div>
</div>

<!-- Cash spent -->
<div id="mOut" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(17,24,20,.45)" onclick="if(event.target===this)closeM('mOut')">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-lg" role="dialog" aria-modal="true">
    <form method="POST" id="spendForm">
      <?= csrfField() ?><input type="hidden" name="action" value="spend">
      <div class="px-5 py-4 border-b border-gray-100"><h3 class="text-base font-bold text-gray-900">Cash spent</h3><p class="text-xs text-gray-500">One receipt, however many things are on it.</p></div>
      <div class="px-5 py-4 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="<?= $l ?>">What *</label><input name="what" required maxlength="200" class="<?= $f ?>" placeholder="Stationery for the office"></div>
          <div><label class="<?= $l ?>">Category *</label>
            <select name="category_id" required class="<?= $f ?>">
              <option value="">Choose…</option>
              <?= $catOptions() ?>
            </select>
            <?php if (!$categories): ?><p class="text-[11px] text-amber-600 mt-1">No categories yet — <a href="<?= baseUrl('finance/expenses') ?>" class="underline">add them under Expenses</a>.</p><?php endif; ?>
          </div>
          <div><label class="<?= $l ?>">For which <span class="text-gray-400 font-normal">(optional)</span></label>
            <select name="cost_centre_id" id="pcCC" class="<?= $f ?>" onchange="pcFuel()">
              <?= financeCentreOptions($centres, '', 'For which… (optional)') ?>
            </select>
          </div>
          <div id="pcFuelBox" class="hidden col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
            <div><label class="<?= $l ?>">Litres</label><input name="litres" inputmode="decimal" class="<?= $f ?>" placeholder="42.5"></div>
            <div><label class="<?= $l ?>">Odometer (km)</label><input name="odometer_km" inputmode="numeric" class="<?= $f ?>" placeholder="reading on the dash"></div>
          </div>
          <div><label class="<?= $l ?>">Date</label><input name="date" type="date" value="<?= date('Y-m-d') ?>" class="<?= $f ?>"></div>
          <?php if ($detailed): ?>
          <div><label class="<?= $l ?>">Paid to</label><input name="vendor" maxlength="120" class="<?= $f ?>" placeholder="Naivas"></div>
          <div><label class="<?= $l ?>">Receipt no.</label><input name="ref" maxlength="60" class="<?= $f ?>" placeholder="NV-88213"></div>
          <?php endif; ?>
        </div>
        <div>
          <label class="<?= $l ?>">Amount *</label>
          <input name="amount" id="amountField" type="number" min="1" step="any" required class="<?= $f ?>" placeholder="5400">
          <button type="button" id="itemiseBtn" onclick="showLines()" class="mt-1.5 text-xs text-emerald-700 font-medium <?= $detailed ? 'hidden' : '' ?>">Itemise this receipt (quantity × cost)</button>
        </div>
        <div id="lineBox" class="<?= $detailed ? '' : 'hidden' ?> rounded-lg border border-gray-100 bg-gray-50/60 p-3">
          <div class="flex items-center justify-between mb-2"><span class="text-xs font-medium text-gray-600">Items on the receipt</span><button type="button" onclick="addLine()" class="text-xs text-emerald-700 font-medium">+ Add item</button></div>
          <div class="pc-lines-head"><span>Item</span><span class="text-right">Qty</span><span>Unit</span><span class="text-right">Price each</span><span class="text-right">Total</span><span></span></div>
          <div id="lines" class="space-y-1.5"></div>
          <div class="flex justify-between text-xs mt-2 pt-2 border-t border-gray-200 text-gray-500"><span>Items total — becomes the amount</span><strong id="lineTotal" class="text-gray-800 tabular-nums">—</strong></div>
          <p class="text-[11px] text-gray-400 mt-1">e.g. Milk · 10 · pcs · 50 = 500.</p>
        </div>
        <p class="text-[11px] text-gray-400">Posts to the category's expense head and takes it out of Petty Cash.</p>
      </div>
      <div class="px-5 py-4 bg-gray-50 flex justify-end gap-2"><button type="button" onclick="closeM('mOut')" class="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-white">Cancel</button><button type="submit" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Record</button></div>
    </form>
  </div>
</div>

<!-- Count the tin -->
<div id="mCount" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(17,24,20,.45)" onclick="if(event.target===this)closeM('mCount')">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-md" role="dialog" aria-modal="true">
    <form method="POST">
      <?= csrfField() ?><input type="hidden" name="action" value="count">
      <div class="px-5 py-4 border-b border-gray-100"><h3 class="text-base font-bold text-gray-900">Count the tin</h3><p class="text-xs text-gray-500">Weekly, or whenever cash is handed over.</p></div>
      <div class="px-5 py-4 space-y-4">
        <div class="flex justify-between text-sm"><span class="text-gray-500">The book says</span><strong id="bookSays" data-v="<?= e((string)$balance) ?>"><?= money($balance) ?></strong></div>
        <div><label class="<?= $l ?>">Counted in the tin *</label><input name="counted" id="counted" type="number" min="0" step="1" required class="<?= $f ?>" oninput="calcDiff()"></div>
        <div class="flex justify-between text-sm"><span class="text-gray-500">Difference</span><strong id="diff">—</strong></div>
        <div id="whyBox" class="hidden"><label class="<?= $l ?>">Explain the difference *</label><input name="note" id="why" maxlength="200" class="<?= $f ?>" placeholder="e.g. 200 given for boda, receipt to follow"></div>
        <div><label class="<?= $l ?>">Date</label><input name="date" type="date" value="<?= date('Y-m-d') ?>" class="<?= $f ?>"></div>
        <p class="text-[11px] text-gray-400">A difference is posted to <em>Cash over &amp; short</em> in your name — visible, not absorbed. The book then starts from what was counted.</p>
      </div>
      <div class="px-5 py-4 bg-gray-50 flex justify-end gap-2"><button type="button" onclick="closeM('mCount')" class="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-white">Cancel</button><button type="submit" class="px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700">Sign the count</button></div>
    </form>
  </div>
</div>

<script>
function openM(id){ document.getElementById(id).classList.remove('hidden'); var f=document.querySelector('#'+id+' input:not([type=hidden]),#'+id+' select'); if(f) f.focus(); <?= $detailed ? "if(id==='mOut'&&!document.getElementById('lines').children.length) addLine();" : '' ?> }
function showLines(){ document.getElementById('lineBox').classList.remove('hidden'); document.getElementById('itemiseBtn').classList.add('hidden'); if(!document.getElementById('lines').children.length) addLine(); }
function closeM(id){ document.getElementById(id).classList.add('hidden'); }
document.addEventListener('keydown',function(e){ if(e.key==='Escape') ['mIn','mOut','mCount'].forEach(closeM); });
function fmt(n){ return 'KES ' + Math.round(n).toLocaleString(); }
function calcDiff(){
    var b = parseFloat(document.getElementById('bookSays').dataset.v)||0, c = parseFloat(document.getElementById('counted').value);
    var d = document.getElementById('diff'), w = document.getElementById('whyBox');
    if (isNaN(c)) { d.textContent='—'; d.className=''; w.classList.add('hidden'); return; }
    var v = c - b; d.textContent = (v>0?'+':'') + fmt(v); d.className = v===0 ? 'text-emerald-700' : 'text-amber-700';
    w.classList.toggle('hidden', v===0); document.getElementById('why').required = v!==0;
}
function pcFuel(){
    var s=document.getElementById('pcCC'), b=document.getElementById('pcFuelBox'); if(!s||!b) return;
    var o=s.options[s.selectedIndex]; b.classList.toggle('hidden', !(o && o.getAttribute('data-type')==='bus'));
}
var PC_UNITS=['pcs','kg','g','L','ml','dozen','tray','crate','bag','sack','box','pkt','ream','m','roll','hrs','days'];
function addLine(){
    var box=document.getElementById('lines'), r=document.createElement('div');
    r.className='pc-line';
    r.innerHTML='<input name="line_desc[]" placeholder="Milk">'+
                '<input name="line_qty[]" type="number" min="0.01" step="any" value="1" class="text-right" title="How many">'+
                '<select name="line_measure[]" title="Unit">'+PC_UNITS.map(function(u){return '<option>'+u+'</option>';}).join('')+'</select>'+
                '<input name="line_unit[]" type="number" min="0" step="any" class="text-right" placeholder="0.00" title="Price for one">'+
                '<span class="pc-total">—</span>'+
                '<button type="button" class="text-gray-400 hover:text-red-600 text-lg" onclick="this.parentNode.remove();lineTotal()">&times;</button>';
    r.querySelectorAll('input,select').forEach(function(i){ i.addEventListener('input', lineTotal); });
    box.appendChild(r); r.querySelector('input').focus(); lineTotal();
}
function lineTotal(){
    var t=0; document.querySelectorAll('#lines > div').forEach(function(r){ var i=r.querySelectorAll('input'); var v=(parseFloat(i[1].value)||0)*(parseFloat(i[2].value)||0); var c=r.querySelector('.pc-total'); if(c) c.textContent=v?v.toLocaleString(undefined,{maximumFractionDigits:2}):'—'; t+=v; });
    var any=false; document.querySelectorAll('#lines > div').forEach(function(r){ if(r.querySelector('input').value.trim()!=='') any=true; });
    var a=document.getElementById('amountField');
    document.getElementById('lineTotal').textContent = any ? fmt(t) : '—';
    if (any){ a.value=t.toFixed(2); a.readOnly=true; a.classList.add('bg-gray-50'); } else { a.readOnly=false; a.classList.remove('bg-gray-50'); }
}
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
