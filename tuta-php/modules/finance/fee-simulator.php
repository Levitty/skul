<?php
/**
 * Fee Change Simulator — model a fee increase/decrease and see the revenue
 * impact before committing. Baseline is the CURRENT TERM's real billing
 * (non-cancelled invoices), grouped by class. All scenario maths runs live in
 * the browser so the admin can drag and see the effect instantly.
 */
$pageTitle = 'Fee Planner';
$sb  = new Supabase();
$sid = schoolId();

$currentTerm   = cachedCurrentTerm();
$currentTermId = $currentTerm['id'] ?? null;
$termsPerYear  = (int)(schoolSetting('terms_per_year', '3')) ?: 3;
$cur           = schoolSetting('currency_symbol', 'KES');

$classMap = [];
foreach (cachedClasses() as $c) $classMap[$c['id']] = $c['name'];

// Active students → class (chunk-safe for big schools).
$students = Supabase::fetchAllPaged(fn($_sb) =>
    $_sb->from('students')->select('id,current_class_id')->eq('school_id', $sid)->eq('status', 'active'));
$stuClass = [];
$classCount = [];
foreach ($students as $s) {
    $cid = $s['current_class_id'] ?? null;
    $stuClass[$s['id']] = $cid;
    if ($cid) $classCount[$cid] = ($classCount[$cid] ?? 0) + 1;
}

// Current-term billing (non-cancelled), grouped by the student's class.
$invoices = Supabase::fetchAllPaged(function ($_sb) use ($sid, $currentTermId) {
    $q = $_sb->from('invoices')->select('student_id,amount,status')
        ->eq('school_id', $sid)->neq('status', 'cancelled');
    if ($currentTermId) $q = $q->eq('term_id', $currentTermId);
    return $q;
});
$classBilled = [];      // class_id => total billed this term
$classBilledStu = [];   // class_id => set of billed student ids
$totalBilled = 0.0;
foreach ($invoices as $inv) {
    $cid = $stuClass[$inv['student_id']] ?? null;
    if ($inv['status'] === 'draft') continue; // drafts aren't committed revenue
    $amt = (float)($inv['amount'] ?? 0);
    $totalBilled += $amt;
    if ($cid) {
        $classBilled[$cid] = ($classBilled[$cid] ?? 0) + $amt;
        $classBilledStu[$cid][$inv['student_id']] = true;
    }
}

// Build the per-class rows the simulator works on.
$rows = [];
foreach ($classMap as $cid => $cname) {
    $billed = $classBilled[$cid] ?? 0.0;
    if ($billed <= 0) continue; // only classes actually being billed this term
    $billedStudents = isset($classBilledStu[$cid]) ? count($classBilledStu[$cid]) : 0;
    $rows[] = [
        'name'     => $cname,
        'students' => $billedStudents,
        'billed'   => round($billed, 2),
        'perStu'   => $billedStudents > 0 ? round($billed / $billedStudents, 2) : 0,
    ];
}
usort($rows, fn($a, $b) => $b['billed'] <=> $a['billed']);

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Fee Planner</h1>
    <p class="text-sm text-gray-500 mt-1">Model a fee change and see the revenue impact before you commit. Baseline is this term's actual billing<?= $currentTerm ? ' (' . e($currentTerm['name']) . ')' : '' ?>.</p>
</div>

<?php if (empty($rows)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        No issued invoices for the current term yet — generate and issue invoices first, then the planner can model changes against real billing.
    </div>
<?php else: ?>

<!-- Controls -->
<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-5">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Percentage change</label>
            <div class="flex items-center gap-3">
                <input type="range" id="pct" min="-20" max="50" step="1" value="0" class="flex-1">
                <span id="pctOut" class="text-sm font-semibold text-gray-900 w-14 text-right">0%</span>
            </div>
            <p class="text-[11px] text-gray-400 mt-1">Raise or cut all fees by this %.</p>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Flat change per student (<?= e($cur) ?>)</label>
            <input type="number" id="flat" value="0" step="100" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            <p class="text-[11px] text-gray-400 mt-1">Added on top of the % change, per student, per term.</p>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Apply to</label>
            <select id="scope" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <option value="__all__">All classes</option>
                <?php foreach ($rows as $r): ?>
                    <option value="<?= e($r['name']) ?>"><?= e($r['name']) ?></option>
                <?php endforeach; ?>
            </select>
            <p class="text-[11px] text-gray-400 mt-1">Limit the change to one class, or apply school-wide.</p>
        </div>
    </div>
</div>

<!-- Headline impact -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500 uppercase tracking-wide">This term now</p>
        <p class="text-2xl font-bold text-gray-900 mt-1" id="baseTerm"></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500 uppercase tracking-wide">This term projected</p>
        <p class="text-2xl font-bold text-emerald-600 mt-1" id="projTerm"></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500 uppercase tracking-wide">Change per term</p>
        <p class="text-2xl font-bold mt-1" id="deltaTerm"></p>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-xs text-gray-500 uppercase tracking-wide">Change per year (×<?= $termsPerYear ?>)</p>
        <p class="text-2xl font-bold mt-1" id="deltaYear"></p>
    </div>
</div>

<!-- Per-class breakdown -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100 text-gray-600">
                <th class="text-left px-4 py-3 font-semibold">Class</th>
                <th class="text-center px-4 py-3 font-semibold">Students billed</th>
                <th class="text-right px-4 py-3 font-semibold">Now / term</th>
                <th class="text-right px-4 py-3 font-semibold">Projected / term</th>
                <th class="text-right px-4 py-3 font-semibold">Change</th>
            </tr>
        </thead>
        <tbody id="rows" class="divide-y divide-gray-50"></tbody>
    </table>
</div>

<script>
var CUR = <?= jsonHtml($cur) ?>;
var TERMS = <?= (int)$termsPerYear ?>;
var ROWS = <?= jsonHtml($rows, JSON_UNESCAPED_SLASHES) ?>;

function money(n) {
    var sign = n < 0 ? '-' : '';
    return sign + CUR + ' ' + Math.abs(Math.round(n)).toLocaleString();
}
function project(row, pct, flat, scope) {
    var applies = (scope === '__all__' || scope === row.name);
    if (!applies) return row.billed;
    // Percentage on current billing + flat per billed student.
    return row.billed * (1 + pct / 100) + flat * row.students;
}
function render() {
    var pct = parseFloat(document.getElementById('pct').value) || 0;
    var flat = parseFloat(document.getElementById('flat').value) || 0;
    var scope = document.getElementById('scope').value;
    document.getElementById('pctOut').textContent = (pct > 0 ? '+' : '') + pct + '%';

    var baseTot = 0, projTot = 0, html = '';
    ROWS.forEach(function (r) {
        var proj = project(r, pct, flat, scope);
        var d = proj - r.billed;
        baseTot += r.billed; projTot += proj;
        var dCls = d > 0 ? 'text-emerald-600' : (d < 0 ? 'text-red-600' : 'text-gray-400');
        html += '<tr class="hover:bg-gray-50/50">'
            + '<td class="px-4 py-3 font-medium text-gray-900">' + r.name + '</td>'
            + '<td class="px-4 py-3 text-center text-gray-600">' + r.students + '</td>'
            + '<td class="px-4 py-3 text-right text-gray-700">' + money(r.billed) + '</td>'
            + '<td class="px-4 py-3 text-right font-medium text-gray-900">' + money(proj) + '</td>'
            + '<td class="px-4 py-3 text-right font-semibold ' + dCls + '">' + (d > 0 ? '+' : '') + money(d) + '</td>'
            + '</tr>';
    });
    document.getElementById('rows').innerHTML = html;

    var dTerm = projTot - baseTot;
    var dPct = baseTot > 0 ? (dTerm / baseTot * 100) : 0;
    document.getElementById('baseTerm').textContent = money(baseTot);
    document.getElementById('projTerm').textContent = money(projTot);
    var dt = document.getElementById('deltaTerm');
    dt.textContent = (dTerm >= 0 ? '+' : '') + money(dTerm) + '  (' + (dPct >= 0 ? '+' : '') + dPct.toFixed(1) + '%)';
    dt.className = 'text-2xl font-bold mt-1 ' + (dTerm >= 0 ? 'text-emerald-600' : 'text-red-600');
    var dy = document.getElementById('deltaYear');
    dy.textContent = (dTerm >= 0 ? '+' : '') + money(dTerm * TERMS);
    dy.className = 'text-2xl font-bold mt-1 ' + (dTerm >= 0 ? 'text-emerald-600' : 'text-red-600');
}
document.getElementById('pct').addEventListener('input', render);
document.getElementById('flat').addEventListener('input', render);
document.getElementById('scope').addEventListener('change', render);
render();
</script>

<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
