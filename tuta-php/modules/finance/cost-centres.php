<?php
/**
 * Cost Centres — what each thing the school runs costs, and earns.
 *
 * A category says WHAT money was for (fuel, plumbing, food). A cost centre
 * says WHICH THING it was for: a bus, the kitchen, boarding, a building, a
 * project, a grade. Expenses carry one of each; fee heads carry a centre too,
 * so a service reads as a small P&L — billed, spent, per learner.
 *
 * Buses arrive from Transport on their own (trigger, mig. 140). The kitchen is
 * seeded. Everything else an administrator adds here. Figures come from
 * cost_centre_overview / cost_centre_report so the Ask assistant and this page
 * can never disagree.
 */
$pageTitle = 'Cost Centres';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

if (!userCan('finance.books') && !userCan('fees.manage') && !userCan('dashboard.finance') && !isAdmin()) {
    flash('error', 'Cost centres are part of the finance books.');
    redirect('dashboard');
}

$types = [
    'bus'        => ['', 'Bus',        'Earns its riders\' termly transport fees.'],
    'kitchen'    => ['', 'Kitchen',    'Earns the meal fee invoiced.'],
    'boarding'   => ['', 'Boarding',   'Earns the boarding fee invoiced.'],
    'activity'   => ['', 'Activity',   'Swimming, clubs — earns its fee if one is linked.'],
    'premises'   => ['', 'Building',   'A block, the grounds, the pool.'],
    'equipment'  => ['', 'Equipment',  'Generator, water pump, computer lab.'],
    'project'    => ['', 'Project',    'Has a start, an end and a budget.'],
    'class'      => ['', 'Class',      'A grade or stream — cost per learner.'],
    'department' => ['', 'Department', 'Office, transport department, kitchen staff.'],
    'other'      => ['', 'Other',      ''],
];

// ── Period ────────────────────────────────────────────────────────
$term  = cachedCurrentTerm();
$preset = input('period') ?: 'term';
$from = input('from'); $to = input('to');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
    if ($preset === 'month')     { $from = date('Y-m-01'); $to = date('Y-m-d'); }
    elseif ($preset === 'year')  { $from = date('Y-01-01'); $to = date('Y-m-d'); }
    else                         { $preset = 'term'; $from = $term['start_date'] ?? date('Y-01-01'); $to = date('Y-m-d'); }
} else { $preset = 'custom'; }
$qs  = 'period=' . e($preset) . ($preset === 'custom' ? '&from=' . e($from) . '&to=' . e($to) : '');
$back = fn(string $id = ''): string => 'finance/cost-centres?' . $qs . ($id ? '&id=' . $id : '');

// ── POST (administrators shape the list; everyone reads it) ───────
if (isPost() && verifyCsrf()) {
    $action = input('action');
    if (!isAdmin()) { flash('error', 'Only an administrator can change cost centres.'); redirect($back()); }
    $clean = fn(string $k, int $n) => mb_substr(trim((string)input($k)), 0, $n);

    if ($action === 'save') {
        $id   = input('id') ?: null;
        $name = $clean('name', 60);
        $type = array_key_exists(input('type'), $types) ? input('type') : 'other';
        if ($name === '') { flash('error', 'Give it the name people use — "Kitchen", "New block", "Grade 4".'); redirect($back($id ?? '')); }
        $row = [
            'name'          => $name,
            'type'          => $type,
            'class_id'      => $type === 'class' ? (input('class_id') ?: null) : null,
            'budget_amount' => (float)str_replace(',', '', (string)input('budget_amount')) ?: null,
            'budget_period' => in_array(input('budget_period'), ['term', 'year', 'total'], true) ? input('budget_period') : null,
            'start_date'    => input('start_date') ?: null,
            'end_date'      => input('end_date') ?: null,
            'notes'         => $clean('notes', 240) ?: null,
            'is_active'     => input('is_active', '1') === '1',
            'updated_at'    => date('c'),
        ];
        if ($row['budget_amount'] && !$row['budget_period']) $row['budget_period'] = 'term';
        if ($id) {
            $cur = $sb->from('cost_centres')->select('id,vehicle_id')->eq('id', $id)->eq('school_id', $sid)->single()->execute()['data'][0] ?? null;
            if (!$cur) { flash('error', 'Not found.'); redirect($back()); }
            if ($cur['vehicle_id']) { unset($row['name'], $row['type']); }   // a bus is named on Transport → Buses
            $r = $sb->from('cost_centres')->eq('id', $id)->eq('school_id', $sid)->update($row);
            if (empty($r['error'])) auditLog('update', 'cost_centre', $id, ['name' => $name]);
        } else {
            $row['school_id'] = $sid;
            $r = $sb->from('cost_centres')->insert($row);
            $id = $r['data'][0]['id'] ?? null;
            if (empty($r['error'])) auditLog('create', 'cost_centre', $id, ['name' => $name, 'type' => $type]);
        }
        $err = (string)($r['error'] ?? '');
        if ($err !== '' && stripos($err, 'uq_cost_centres_name') !== false) $err = 'There is already a cost centre called "' . $name . '".';
        if ($err !== '' && stripos($err, 'cost_centres') !== false && stripos($err, 'not find') !== false) $err = 'Migration 140 has not been run yet.';
        flash($err ? 'error' : 'success', $err ?: ($name . ' saved.'));
        redirect($back($id ?? ''));
    }

    // Which fee heads earn for this centre — its income side.
    if ($action === 'link_heads') {
        $id = input('id');
        $want = array_values(array_filter((array)($_POST['fee_head_ids'] ?? []), 'is_string'));
        $heads = $sb->from('fee_heads')->select('id,cost_centre_id')->eq('school_id', $sid)->execute()['data'] ?? [];
        foreach ($heads as $h) {
            $has = $h['cost_centre_id'] === $id;
            $should = in_array($h['id'], $want, true);
            if ($should && !$has) $sb->from('fee_heads')->eq('id', $h['id'])->eq('school_id', $sid)->update(['cost_centre_id' => $id]);
            if (!$should && $has) $sb->from('fee_heads')->eq('id', $h['id'])->eq('school_id', $sid)->update(['cost_centre_id' => null]);
        }
        auditLog('update', 'cost_centre', $id, ['fee_heads' => $want]);
        flash('success', 'Income lines updated.');
        redirect($back($id));
    }

    flash('error', 'Unknown action.');
    redirect($back());
}

// ── Data ──────────────────────────────────────────────────────────
$ov  = $sb->rpc('cost_centre_overview', ['p_school_id' => $sid, 'p_from' => $from, 'p_to' => $to]);
$centres = is_array($ov['data'] ?? null) ? $ov['data'] : [];
$rpcMissing = !empty($ov['error']) && stripos((string)$ov['error'], 'cost_centre_overview') !== false;
$classMap = cachedClassMap();

$detailId = input('id');
$detail = null;
if ($detailId !== '') {
    $rep = $sb->rpc('cost_centre_report', ['p_school_id' => $sid, 'p_cost_centre_id' => $detailId, 'p_from' => $from, 'p_to' => $to])['data'] ?? null;
    if (is_array($rep) && empty($rep['error'])) $detail = $rep;
    else { flash('error', 'Cost centre not found.'); redirect($back()); }
    $allHeads = $sb->from('fee_heads')->select('id,name,amount,cost_centre_id,is_active')->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute()['data'] ?? [];
}

$totalSpend = array_sum(array_map(fn($c) => (float)$c['spend'], $centres));
$totalIncome = array_sum(array_map(fn($c) => (float)$c['income'], $centres));
$byType = [];
foreach ($centres as $c) $byType[$c['type']][] = $c;
$typeOrder = array_keys($types);
uksort($byType, fn($a, $b) => array_search($a, $typeOrder) <=> array_search($b, $typeOrder));

// How much of the budget applies to this window.
$budgetFor = function (array $c) use ($from, $to): ?float {
    if (empty($c['budget_amount'])) return null;
    $b = (float)$c['budget_amount'];
    if (($c['budget_period'] ?? 'term') === 'total') return $b;
    $days = max(1, (strtotime($to) - strtotime($from)) / 86400 + 1);
    $span = ($c['budget_period'] ?? 'term') === 'year' ? 365 : 120;
    return $days >= $span ? $b : round($b * $days / $span);
};

$periodLabel = $preset === 'term' ? ('This term' . (isset($term['name']) ? ' · ' . $term['name'] : ''))
             : ($preset === 'month' ? date('F Y') : ($preset === 'year' ? date('Y') . ' to date' : date('j M', strtotime($from)) . ' – ' . date('j M Y', strtotime($to))));

require __DIR__ . '/../../includes/layout-top.php';
$f = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none bg-white';
$l = 'block text-xs font-medium text-gray-600 mb-1';
$card = 'bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]';
?>

<div class="mb-5 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <?php if ($detail): ?>
            <p class="text-xs text-gray-500 mb-1"><a href="<?= baseUrl($back()) ?>" class="hover:text-gray-800">← All cost centres</a></p>
            <h1 class="text-2xl font-bold text-gray-900"><?= $types[$detail['centre']['type']][0] ?? '' ?> <?= e($detail['centre']['name']) ?></h1>
            <p class="text-sm text-gray-500 mt-1"><?= e($types[$detail['centre']['type']][1] ?? 'Cost centre') ?><?= !empty($detail['centre']['notes']) ? ' · ' . e($detail['centre']['notes']) : '' ?><?= empty($detail['centre']['is_active']) ? ' · <span class="text-amber-600">inactive</span>' : '' ?></p>
        <?php else: ?>
            <h1 class="text-2xl font-bold text-gray-900">Cost Centres</h1>
            <p class="text-sm text-gray-500 mt-1">What each bus, the kitchen, each building and project costs — and, where it charges a fee, whether it pays for itself.</p>
        <?php endif; ?>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
        <form method="GET" action="<?= baseUrl('finance/cost-centres') ?>" class="flex items-center gap-1.5">
            <?php if ($detail): ?><input type="hidden" name="id" value="<?= e($detailId) ?>"><?php endif; ?>
            <div class="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                <?php foreach (['term' => 'Term', 'month' => 'Month', 'year' => 'Year'] as $k => $lbl): ?>
                    <a href="<?= baseUrl('finance/cost-centres') ?>?period=<?= $k ?><?= $detail ? '&id=' . e($detailId) : '' ?>" class="px-3 py-1.5 text-sm rounded-md <?= $preset === $k ? 'bg-emerald-500 text-white font-semibold' : 'text-gray-600 hover:bg-gray-50' ?>"><?= $lbl ?></a>
                <?php endforeach; ?>
            </div>
            <input type="hidden" name="period" value="custom">
            <input type="date" name="from" value="<?= e($from) ?>" class="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
            <span class="text-gray-400 text-xs">to</span>
            <input type="date" name="to" value="<?= e($to) ?>" class="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
            <button class="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">Go</button>
        </form>
        <?php if (isAdmin() && !$detail): ?>
            <button type="button" onclick="ccOpen()" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm">+ Cost centre</button>
        <?php endif; ?>
    </div>
</div>

<?php if ($rpcMissing): ?>
<div class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
    <strong>Migration 140 hasn't been run.</strong> It creates the cost centres table, the standard category headings, and the reports this page reads.
</div>
<?php elseif (!$detail): ?>

<!-- ── Overview ─────────────────────────────────────────────────── -->
<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <?php $tiles = [
        ['bg-violet-500', money($totalSpend), 'Tagged spend · ' . $periodLabel],
        ['bg-teal-500',   money($totalIncome), 'Income of centres that charge'],
        ['bg-amber-500',  count($centres), 'Cost centres'],
        ['bg-rose-500',   count(array_filter($centres, fn($c) => (float)$c['spend'] > 0)), 'With spend this period'],
    ]; foreach ($tiles as [$bg, $val, $lbl]): ?>
    <div class="<?= $card ?> p-4 flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl <?= $bg ?> flex-shrink-0"></div>
        <div class="min-w-0"><p class="text-lg font-bold text-gray-900 leading-tight tabular-nums truncate"><?= e((string)$val) ?></p><p class="text-xs text-gray-500 mt-0.5"><?= e($lbl) ?></p></div>
    </div>
    <?php endforeach; ?>
</div>

<?php if (!$centres): ?>
<div class="<?= $card ?> p-8 text-center text-sm text-gray-500">No cost centres yet. Buses appear here as soon as they're added under Transport → Buses; the kitchen and anything else an administrator adds with the button above.</div>
<?php else: ?>
<?php foreach ($byType as $t => $rows): [$icon, $tLabel, $tHint] = $types[$t] ?? ['', ucfirst($t), '']; ?>
<div class="mb-5">
    <div class="flex items-baseline gap-2 mb-2 px-1">
        <h2 class="text-sm font-semibold text-gray-800"><?= e($tLabel) ?><?= count($rows) > 1 ? 's' : '' ?></h2>
        <span class="text-[11px] text-gray-400"><?= e($tHint) ?></span>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <?php foreach ($rows as $c): $spend = (float)$c['spend']; $inc = (float)$c['income']; $n = (int)$c['learners']; $bud = $budgetFor($c);
              $earns = $c['income_basis'] !== 'none' && ($inc > 0 || in_array($c['type'], ['bus', 'kitchen', 'boarding', 'activity'], true)); ?>
        <a href="<?= baseUrl($back($c['id'])) ?>" class="<?= $card ?> p-4 hover:border-emerald-200 transition block <?= empty($c['is_active']) ? 'opacity-60' : '' ?>">
            <div class="flex items-start justify-between gap-2 mb-2">
                <span class="font-semibold text-gray-900 truncate"><?= e($c['name']) ?></span>
                <?php if ($earns): $m = $inc - $spend; ?>
                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-none <?= $inc <= 0 && $spend <= 0 ? 'bg-gray-100 text-gray-500' : ($m >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700') ?>"><?= $inc <= 0 && $spend <= 0 ? 'no data' : ($m >= 0 ? 'covers itself' : 'short ' . number_format(abs($m))) ?></span>
                <?php endif; ?>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center">
                <div><p class="text-sm font-bold text-gray-900 tabular-nums"><?= number_format($spend) ?></p><p class="text-[10px] text-gray-400 uppercase tracking-wide">Spent</p></div>
                <?php if ($earns): ?><div><p class="text-sm font-bold text-emerald-700 tabular-nums"><?= number_format($inc) ?></p><p class="text-[10px] text-gray-400 uppercase tracking-wide"><?= $c['type'] === 'bus' ? 'Rider fees' : 'Billed' ?></p></div>
                <?php else: ?><div><p class="text-sm font-bold text-gray-400">—</p><p class="text-[10px] text-gray-400 uppercase tracking-wide">No fee</p></div><?php endif; ?>
                <div><p class="text-sm font-bold text-gray-900 tabular-nums"><?= $n > 0 ? number_format($spend / $n) : '—' ?></p><p class="text-[10px] text-gray-400 uppercase tracking-wide"><?= $n > 0 ? 'per learner · ' . $n : 'learners' ?></p></div>
            </div>
            <?php if ($bud !== null): $pct = $bud > 0 ? min(100, $spend / $bud * 100) : 0; ?>
            <div class="mt-3">
                <div class="flex justify-between text-[11px] text-gray-500 mb-1"><span>Budget <?= number_format($bud) ?></span><span class="<?= $spend > $bud ? 'text-rose-600 font-semibold' : '' ?>"><?= (int)round($bud > 0 ? $spend / $bud * 100 : 0) ?>%</span></div>
                <div class="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full <?= $spend > $bud ? 'bg-rose-500' : 'bg-emerald-500' ?>" style="width:<?= (int)$pct ?>%"></div></div>
            </div>
            <?php endif; ?>
            <?php if ((int)$c['entries'] === 0): ?><p class="text-[11px] text-gray-400 mt-2">Nothing tagged to it yet — pick it under "For which" when recording a spend.</p><?php endif; ?>
        </a>
        <?php endforeach; ?>
    </div>
</div>
<?php endforeach; ?>
<p class="text-[11px] text-gray-400 mt-2">Spend counts only expenses tagged to a centre; general spend (chalk, Kenya Power) sits on the Expenses page under its category. Salaries are not yet allocated — a bus without its driver's wage looks cheaper than it is. A bus's income is what its current riders are charged for the term; a kitchen's is the meal fee invoiced in the period.</p>
<?php endif; ?>

<?php else: $c = $detail['centre']; $o = $detail['overview'] ?? []; $spend = (float)$detail['spend']; $inc = (float)($o['income'] ?? 0); $n = (int)($o['learners'] ?? 0); $bud = $budgetFor($c); $fuel = $detail['fuel'] ?? []; ?>

<!-- ── One centre ───────────────────────────────────────────────── -->
<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold text-gray-900 tabular-nums"><?= money($spend) ?></p><p class="text-xs text-gray-500"><?= (int)$detail['entries'] ?> entries · <?= e($periodLabel) ?></p></div>
    <?php if (($o['income_basis'] ?? 'none') !== 'none'): ?>
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold text-emerald-700 tabular-nums"><?= money($inc) ?></p><p class="text-xs text-gray-500"><?= $c["type"] === "bus" ? "Riders' fees for the term" : "Billed in the term(s) this period covers" ?></p></div>
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold tabular-nums <?= $inc - $spend >= 0 ? 'text-emerald-700' : 'text-rose-600' ?>"><?= ($inc - $spend >= 0 ? '+' : '−') . money(abs($inc - $spend)) ?></p><p class="text-xs text-gray-500">Income less spend<?= $c['type'] === 'bus' ? ' (excl. driver wage)' : '' ?></p></div>
    <?php else: ?>
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold text-gray-400">—</p><p class="text-xs text-gray-500">No fee attached</p></div>
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold text-gray-900 tabular-nums"><?= $bud !== null ? money($bud) : '—' ?></p><p class="text-xs text-gray-500">Budget for the period<?= $bud !== null && $spend > $bud ? ' · <span class="text-rose-600 font-semibold">over by ' . number_format($spend - $bud) . '</span>' : '' ?></p></div>
    <?php endif; ?>
    <div class="<?= $card ?> p-4"><p class="text-lg font-bold text-gray-900 tabular-nums"><?= $n > 0 ? money($spend / $n) : '—' ?></p><p class="text-xs text-gray-500"><?= $n > 0 ? 'Per learner · ' . $n . ($c['type'] === 'bus' ? ' riders' : ' learners') : 'No learners linked' ?></p></div>
</div>

<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
<section class="space-y-5 min-w-0">
    <?php if ($c['type'] === 'bus'): ?>
    <div class="<?= $card ?> p-5">
        <h2 class="text-sm font-semibold text-gray-800 mb-1">Fuel</h2>
        <p class="text-xs text-gray-500 mb-4">From fuel entries that carry litres and an odometer reading. Two readings or more give the distance.</p>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div class="rounded-lg bg-gray-50 p-3"><p class="text-lg font-bold text-gray-900 tabular-nums"><?= number_format((float)($fuel['litres'] ?? 0), 0) ?> L</p><p class="text-[11px] text-gray-500">Litres bought</p></div>
            <div class="rounded-lg bg-gray-50 p-3"><p class="text-lg font-bold text-gray-900 tabular-nums"><?= isset($fuel['km']) && $fuel['km'] !== null ? number_format((int)$fuel['km']) . ' km' : '—' ?></p><p class="text-[11px] text-gray-500">Distance (<?= (int)($fuel['readings'] ?? 0) ?> readings)</p></div>
            <div class="rounded-lg bg-gray-50 p-3"><p class="text-lg font-bold text-gray-900 tabular-nums"><?= isset($fuel['km_per_litre']) && $fuel['km_per_litre'] !== null ? number_format((float)$fuel['km_per_litre'], 1) : '—' ?></p><p class="text-[11px] text-gray-500">km per litre</p></div>
            <div class="rounded-lg bg-gray-50 p-3"><p class="text-lg font-bold text-gray-900 tabular-nums"><?= isset($fuel['cost_per_km']) && $fuel['cost_per_km'] !== null ? 'KES ' . number_format((float)$fuel['cost_per_km'], 0) : '—' ?></p><p class="text-[11px] text-gray-500">All-in cost per km</p></div>
        </div>
        <?php if ((int)($fuel['readings'] ?? 0) < 2): ?><p class="text-[11px] text-amber-700 mt-3">Type the odometer reading on each fuel receipt and this fills in. It's the number that tells you whether the bus is being driven further than the routes need.</p><?php endif; ?>
    </div>
    <?php endif; ?>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="<?= $card ?> p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-3">By category</h2>
            <?php $bc = (array)$detail['by_category']; if (!$bc): ?><p class="text-sm text-gray-400">Nothing in this period.</p><?php else: $mx = max(array_map(fn($r) => (float)$r['amount'], $bc)); ?>
            <ul class="space-y-2.5">
                <?php foreach ($bc as $r): ?>
                <li>
                    <div class="flex justify-between text-[12.5px]"><span class="text-gray-800 truncate"><?= e($r['category']) ?><?= $r['heading'] !== $r['category'] ? ' <span class="text-gray-400">· ' . e($r['heading']) . '</span>' : '' ?></span><span class="font-semibold tabular-nums"><?= number_format((float)$r['amount']) ?></span></div>
                    <div class="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden"><div class="h-full rounded-full bg-violet-500" style="width:<?= $mx > 0 ? (int)((float)$r['amount'] / $mx * 100) : 0 ?>%"></div></div>
                </li>
                <?php endforeach; ?>
            </ul>
            <?php endif; ?>
        </div>
        <div class="<?= $card ?> p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-3">By month</h2>
            <?php $bm = (array)$detail['by_month']; if (!$bm): ?><p class="text-sm text-gray-400">Nothing in this period.</p><?php else: $mx = max(array_map(fn($r) => (float)$r['amount'], $bm)); ?>
            <div class="flex items-end gap-2 h-32">
                <?php foreach ($bm as $r): $h = $mx > 0 ? max(4, (float)$r['amount'] / $mx * 100) : 4; ?>
                <div class="flex-1 flex flex-col items-center justify-end h-full" title="<?= e(money((float)$r['amount'])) ?>">
                    <span class="text-[10px] text-gray-500 tabular-nums mb-1"><?= number_format((float)$r['amount'] / 1000, 0) ?>K</span>
                    <div class="w-full rounded-t bg-teal-500" style="height:<?= (int)$h ?>%"></div>
                    <span class="text-[10px] text-gray-400 mt-1"><?= e(date('M', strtotime($r['month'] . '-01'))) ?></span>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
    </div>

    <div class="<?= $card ?> overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100 flex items-baseline justify-between"><h2 class="text-sm font-semibold text-gray-800">Entries</h2><a href="<?= baseUrl('finance/expenses') ?>?month=all" class="text-[11px] text-emerald-700 font-medium">Expenses page →</a></div>
        <?php $rc = (array)$detail['recent']; if (!$rc): ?><p class="px-5 py-8 text-center text-sm text-gray-400">Nothing tagged to <?= e($c['name']) ?> in this period.</p><?php else: ?>
        <div class="overflow-x-auto"><table class="w-full text-sm">
            <thead class="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500"><tr><th class="text-left px-5 py-2 font-medium">Date</th><th class="text-left px-3 py-2 font-medium">What</th><th class="text-left px-3 py-2 font-medium">Category</th><th class="text-right px-3 py-2 font-medium">Litres</th><th class="text-right px-3 py-2 font-medium">Odometer</th><th class="text-right px-5 py-2 font-medium">KES</th></tr></thead>
            <tbody class="divide-y divide-gray-50">
            <?php foreach ($rc as $r): ?>
                <tr><td class="px-5 py-2 text-gray-500 whitespace-nowrap"><?= e(date('j M', strtotime($r['date']))) ?></td>
                    <td class="px-3 py-2 text-gray-900"><?= e($r['description']) ?><?= !empty($r['vendor']) ? ' <span class="text-gray-400">· ' . e($r['vendor']) . '</span>' : '' ?></td>
                    <td class="px-3 py-2 text-gray-600"><?= e($r['category'] ?? '—') ?></td>
                    <td class="px-3 py-2 text-right tabular-nums text-gray-600"><?= $r['litres'] !== null ? number_format((float)$r['litres'], 1) : '' ?></td>
                    <td class="px-3 py-2 text-right tabular-nums text-gray-600"><?= $r['odometer_km'] !== null ? number_format((int)$r['odometer_km']) : '' ?></td>
                    <td class="px-5 py-2 text-right font-semibold tabular-nums"><?= number_format((float)$r['amount']) ?></td></tr>
            <?php endforeach; ?>
            </tbody></table></div>
        <?php endif; ?>
    </div>
</section>

<aside class="space-y-4">
    <?php if (isAdmin()): ?>
    <div class="<?= $card ?> p-5">
        <h2 class="text-sm font-semibold text-gray-800 mb-3">Settings</h2>
        <form method="POST" class="space-y-3">
            <?= csrfField() ?><input type="hidden" name="action" value="save"><input type="hidden" name="id" value="<?= e($c['id']) ?>">
            <?php if (!empty($c['vehicle_id'])): ?>
                <p class="text-xs text-gray-500">This is a bus — its name, plate and driver live on <a href="<?= baseUrl('transport/buses') ?>" class="text-emerald-700 underline">Transport → Buses</a>.</p>
                <input type="hidden" name="name" value="<?= e($c['name']) ?>"><input type="hidden" name="type" value="bus">
            <?php else: ?>
                <div><label class="<?= $l ?>">Name</label><input name="name" value="<?= e($c['name']) ?>" required maxlength="60" class="<?= $f ?>"></div>
                <div><label class="<?= $l ?>">Type</label><select name="type" class="<?= $f ?>" onchange="document.getElementById('ccClassRow').classList.toggle('hidden', this.value!=='class')"><?php foreach ($types as $k => $t): ?><option value="<?= $k ?>"<?= $c['type'] === $k ? ' selected' : '' ?>><?= e($t[1]) ?></option><?php endforeach; ?></select></div>
                <div id="ccClassRow" class="<?= $c['type'] === 'class' ? '' : 'hidden' ?>"><label class="<?= $l ?>">Class</label><select name="class_id" class="<?= $f ?>"><option value="">—</option><?php foreach ($classMap as $cid => $cn): ?><option value="<?= e($cid) ?>"<?= ($c['class_id'] ?? '') === $cid ? ' selected' : '' ?>><?= e($cn) ?></option><?php endforeach; ?></select></div>
            <?php endif; ?>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="<?= $l ?>">Budget (KES)</label><input name="budget_amount" value="<?= $c['budget_amount'] !== null ? e(number_format((float)$c['budget_amount'], 0, '.', '')) : '' ?>" inputmode="numeric" class="<?= $f ?>" placeholder="optional"></div>
                <div><label class="<?= $l ?>">Per</label><select name="budget_period" class="<?= $f ?>"><?php foreach (['term' => 'Term', 'year' => 'Year', 'total' => 'Whole project'] as $k => $v): ?><option value="<?= $k ?>"<?= ($c['budget_period'] ?? 'term') === $k ? ' selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select></div>
            </div>
            <?php if (in_array($c['type'], ['project', 'other'], true) || $c['start_date'] || $c['end_date']): ?>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="<?= $l ?>">Starts</label><input type="date" name="start_date" value="<?= e($c['start_date'] ?? '') ?>" class="<?= $f ?>"></div>
                <div><label class="<?= $l ?>">Ends</label><input type="date" name="end_date" value="<?= e($c['end_date'] ?? '') ?>" class="<?= $f ?>"></div>
            </div>
            <?php endif; ?>
            <div><label class="<?= $l ?>">Notes</label><input name="notes" value="<?= e($c['notes'] ?? '') ?>" maxlength="240" class="<?= $f ?>"></div>
            <input type="hidden" name="is_active" value="0">
            <label class="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" name="is_active" value="1" <?= !empty($c['is_active']) ? 'checked' : '' ?> class="rounded"> Active — offered when recording a spend</label>
            <button class="w-full px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Save</button>
        </form>
    </div>
    <?php endif; ?>

    <?php if ($c['type'] !== 'bus' && $c['type'] !== 'class'): ?>
    <div class="<?= $card ?> p-5">
        <h2 class="text-sm font-semibold text-gray-800 mb-1">Income</h2>
        <p class="text-xs text-gray-500 mb-3">Fee heads that earn for <?= e($c['name']) ?>. What they're invoiced in the period is the income above.</p>
        <?php if (isAdmin()): ?>
        <form method="POST" class="space-y-1.5">
            <?= csrfField() ?><input type="hidden" name="action" value="link_heads"><input type="hidden" name="id" value="<?= e($c['id']) ?>">
            <?php if (!$allHeads): ?><p class="text-sm text-gray-400">No fee heads set up.</p><?php endif; ?>
            <?php foreach ($allHeads as $h): $mine = ($h['cost_centre_id'] ?? '') === $c['id']; $other = !$mine && !empty($h['cost_centre_id']); ?>
            <label class="flex items-center gap-2 text-sm <?= $other ? 'text-gray-400' : 'text-gray-800' ?>">
                <input type="checkbox" name="fee_head_ids[]" value="<?= e($h['id']) ?>" <?= $mine ? 'checked' : '' ?> <?= $other ? 'disabled title="Linked to another centre"' : '' ?> class="rounded">
                <span class="truncate"><?= e($h['name']) ?></span><span class="ml-auto text-xs text-gray-400 tabular-nums"><?= number_format((float)$h['amount']) ?></span>
            </label>
            <?php endforeach; ?>
            <?php if ($allHeads): ?><button class="mt-2 w-full px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Save income lines</button><?php endif; ?>
        </form>
        <?php else: ?>
            <?php $mine = (array)$detail['fee_heads']; if (!$mine): ?><p class="text-sm text-gray-400">None linked.</p><?php else: ?>
            <ul class="text-sm text-gray-800 space-y-1"><?php foreach ($mine as $h): ?><li class="flex justify-between"><span><?= e($h['name']) ?></span><span class="text-gray-400 tabular-nums"><?= number_format((float)$h['amount']) ?></span></li><?php endforeach; ?></ul>
            <?php endif; ?>
        <?php endif; ?>
    </div>
    <?php elseif ($c['type'] === 'bus'): ?>
    <div class="<?= $card ?> p-5">
        <h2 class="text-sm font-semibold text-gray-800 mb-1">Income</h2>
        <p class="text-xs text-gray-500">A bus earns what its current riders are charged for the term — the learners on the routes assigned to it under <a href="<?= baseUrl('transport/buses') ?>" class="text-emerald-700 underline">Transport → Buses</a>. <?= $n ?> rider<?= $n === 1 ? '' : 's' ?> now.</p>
    </div>
    <?php endif; ?>
</aside>
</div>
<?php endif; ?>

<?php if (isAdmin() && !$detail): ?>
<div id="ccModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(17,24,20,.45)" onclick="if(event.target===this)ccClose()">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-md" role="dialog" aria-modal="true">
    <form method="POST">
      <?= csrfField() ?><input type="hidden" name="action" value="save">
      <div class="px-5 py-4 border-b border-gray-100"><h3 class="text-base font-bold text-gray-900">New cost centre</h3><p class="text-xs text-gray-500">A thing money gets spent on. Buses come from Transport by themselves.</p></div>
      <div class="px-5 py-4 space-y-3">
        <div><label class="<?= $l ?>">Name *</label><input name="name" required maxlength="60" class="<?= $f ?>" placeholder="Kindergarten block"></div>
        <div><label class="<?= $l ?>">Type</label><select name="type" id="ccNewType" class="<?= $f ?>" onchange="document.getElementById('ccNewClass').classList.toggle('hidden', this.value!=='class')"><?php foreach ($types as $k => $t): if ($k === 'bus') continue; ?><option value="<?= $k ?>"><?= e($t[1]) ?><?= $t[2] ? ' — ' . e($t[2]) : '' ?></option><?php endforeach; ?></select></div>
        <div id="ccNewClass" class="hidden"><label class="<?= $l ?>">Class</label><select name="class_id" class="<?= $f ?>"><option value="">—</option><?php foreach ($classMap as $cid => $cn): ?><option value="<?= e($cid) ?>"><?= e($cn) ?></option><?php endforeach; ?></select></div>
        <div class="grid grid-cols-2 gap-3">
            <div><label class="<?= $l ?>">Budget (KES)</label><input name="budget_amount" inputmode="numeric" class="<?= $f ?>" placeholder="optional"></div>
            <div><label class="<?= $l ?>">Per</label><select name="budget_period" class="<?= $f ?>"><option value="term">Term</option><option value="year">Year</option><option value="total">Whole project</option></select></div>
        </div>
        <div><label class="<?= $l ?>">Notes</label><input name="notes" maxlength="240" class="<?= $f ?>" placeholder="optional"></div>
      </div>
      <div class="px-5 py-4 bg-gray-50 flex justify-end gap-2"><button type="button" onclick="ccClose()" class="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-white">Cancel</button><button type="submit" class="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Add</button></div>
    </form>
  </div>
</div>
<script>
function ccOpen(){ document.getElementById('ccModal').classList.remove('hidden'); document.querySelector('#ccModal input[name=name]').focus(); }
function ccClose(){ document.getElementById('ccModal').classList.add('hidden'); }
document.addEventListener('keydown', function(e){ if(e.key==='Escape') ccClose(); });
</script>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
