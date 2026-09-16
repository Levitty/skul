<?php
/**
 * School Briefing — an AI-generated, prioritised action list for the owner /
 * head, in the spirit of a "top issues" report. We compute the numbers in
 * PHP (deterministic, auditable) and Claude only sorts them into Urgent /
 * Monitor / Strengths / Stop and phrases them. The model never does the math,
 * so figures can't be invented. Backing: migration 092 + the ledger (090).
 */
$pageTitle = 'School Briefing';
require_once __DIR__ . '/../../includes/ledger.php';
require_once __DIR__ . '/../../includes/anthropic.php';
$sb  = new Supabase();
$sid = schoolId();

/* ── Compute the verified facts we'll hand the model ─────────────── */
function briefingFacts(Supabase $sb, string $sid): array
{
    $school   = cachedSchool();
    $classMap = cachedClassMap();                       // id => name
    $EXITED   = ['exited', 'inactive', 'graduated', 'transferred'];

    // Students (+ class).
    $students = Supabase::fetchAllPaged(fn($q) => $q->from('students')
        ->select('id,current_class_id,status')->eq('school_id', $sid));
    $active = 0; $studentClass = [];
    foreach ($students as $s) {
        $studentClass[$s['id']] = $s['current_class_id'] ?? '';
        if (!in_array(strtolower((string)($s['status'] ?? 'active')), $EXITED, true)) $active++;
    }

    // Invoices (issued) → billed / collected + per-class.
    $invoices = Supabase::fetchAllPaged(fn($q) => $q->from('invoices')
        ->select('amount,paid_amount,status,student_id')->eq('school_id', $sid)
        ->neq('status', 'cancelled'));
    $billed = $collected = 0.0; $byClass = [];
    foreach ($invoices as $inv) {
        if (($inv['status'] ?? '') === 'draft') continue;
        $a = (float)($inv['amount'] ?? 0); $p = (float)($inv['paid_amount'] ?? 0);
        $billed += $a; $collected += $p;
        $cid = $studentClass[$inv['student_id'] ?? ''] ?? '';
        $name = $classMap[$cid] ?? 'Unassigned';
        $byClass[$name] ??= ['billed' => 0.0, 'collected' => 0.0];
        $byClass[$name]['billed']    += $a;
        $byClass[$name]['collected'] += $p;
    }
    $classRows = [];
    foreach ($byClass as $name => $c) {
        $out = $c['billed'] - $c['collected'];
        $classRows[] = ['class' => $name, 'billed' => round($c['billed']),
            'collected' => round($c['collected']), 'outstanding' => round($out),
            'rate_pct' => $c['billed'] > 0 ? round($c['collected'] / $c['billed'] * 100) : 0];
    }
    usort($classRows, fn($a, $b) => $b['outstanding'] <=> $a['outstanding']);
    $classRows = array_slice($classRows, 0, 10);

    // Ledger truth (income / expense / surplus / balances).
    $accounts = ledgerAccounts($sb, $sid);
    $bal      = ledgerBalances($sb, $sid, null, date('Y-m-d'));
    $incomeTotal = $expenseTotal = 0.0; $expenseBreak = []; $incomeBreak = [];
    foreach ($accounts as $id => $acc) {
        $net = ledgerNet($acc, $bal[$id] ?? []);
        if ($acc['type'] === 'income'  && abs($net) >= 1) { $incomeTotal  += $net; $incomeBreak[]  = ['name' => $acc['name'], 'amount' => round($net)]; }
        if ($acc['type'] === 'expense' && abs($net) >= 1) { $expenseTotal += $net; $expenseBreak[] = ['name' => $acc['name'], 'amount' => round($net)]; }
    }
    usort($expenseBreak, fn($a, $b) => $b['amount'] <=> $a['amount']);

    // ── Academics + attendance (from report cards & grades) ─────────
    $reportCards = Supabase::fetchAllPaged(fn($q) => $q->from('report_cards')
        ->select('overall_percentage,attendance_percentage,class_id,student_id')->eq('school_id', $sid));
    $gradeRows = Supabase::fetchAllPaged(fn($q) => $q->from('grades')
        ->select('marks,subject_id,exam_id')->eq('school_id', $sid));
    $examMax = []; foreach ($sb->from('exams')->select('id,max_marks')->eq('school_id', $sid)->limit(300)->execute()['data'] ?? [] as $e) $examMax[$e['id']] = (float)($e['max_marks'] ?? 0);
    $subjName = []; foreach ($sb->from('subjects')->select('id,name')->eq('school_id', $sid)->limit(400)->execute()['data'] ?? [] as $s) $subjName[$s['id']] = $s['name'];

    $pcts = $attPcts = []; $clsAgg = [];
    foreach ($reportCards as $r) {
        if ($r['overall_percentage'] !== null) {
            $p = (float)$r['overall_percentage']; $pcts[] = $p;
            $cn = $classMap[$r['class_id'] ?? ''] ?? 'Unassigned';
            $clsAgg[$cn][] = $p;
        }
        if ($r['attendance_percentage'] !== null) $attPcts[] = (float)$r['attendance_percentage'];
    }
    $acadClass = [];
    foreach ($clsAgg as $cn => $arr) $acadClass[] = ['class' => $cn, 'avg_pct' => round(array_sum($arr) / count($arr)), 'students' => count($arr)];
    usort($acadClass, fn($a, $b) => $a['avg_pct'] <=> $b['avg_pct']);        // weakest first

    $subAgg = [];
    foreach ($gradeRows as $g) {
        if ($g['marks'] === null) continue;
        $mm = $examMax[$g['exam_id'] ?? ''] ?? 0;
        $subAgg[$g['subject_id'] ?? ''][] = $mm > 0 ? (float)$g['marks'] / $mm * 100 : (float)$g['marks'];
    }
    $subRows = [];
    foreach ($subAgg as $sidk => $arr) $subRows[] = ['subject' => $subjName[$sidk] ?? '?', 'avg_pct' => round(array_sum($arr) / count($arr))];
    usort($subRows, fn($a, $b) => $a['avg_pct'] <=> $b['avg_pct']);

    $academics = [
        'report_cards'          => count($reportCards),
        'avg_percentage'        => $pcts ? round(array_sum($pcts) / count($pcts)) : null,
        'students_below_50pct'  => count(array_filter($pcts, fn($p) => $p < 50)),
        'by_class'              => array_slice($acadClass, 0, 10),
        'weakest_subjects'      => array_slice($subRows, 0, 3),
        'strongest_subjects'    => array_slice(array_reverse($subRows), 0, 3),
    ];
    $attendance = [
        'avg_percentage'        => $attPcts ? round(array_sum($attPcts) / count($attPcts)) : null,
        'students_below_90pct'  => count(array_filter($attPcts, fn($p) => $p < 90)),
        'source'                => 'report cards (no daily attendance register in use)',
    ];

    $outstanding = $billed - $collected;
    return [
        'school'          => $school['name'] ?? 'School',
        'currency'        => 'KES',
        'as_of'           => date('j M Y'),
        'students_active' => $active,
        'fees' => [
            'billed'              => round($billed),
            'collected'           => round($collected),
            'outstanding'         => round($outstanding),
            'collection_rate_pct' => $billed > 0 ? round($collected / $billed * 100) : 0,
        ],
        'by_class'      => $classRows,
        'income_total'  => round($incomeTotal),
        'income_breakdown'  => $incomeBreak,
        'expense_total' => round($expenseTotal),
        'expense_breakdown' => array_slice($expenseBreak, 0, 8),
        'surplus'       => round($incomeTotal - $expenseTotal),
        'academics'     => $academics,
        'attendance'    => $attendance,
        'data_gaps' => [
            'no_expenses_recorded'       => $expenseTotal < 1,
            'no_other_income_or_uniform' => $incomeTotal <= round($billed) + 1,
            'little_academic_data'       => $academics['report_cards'] < 5,
            'no_daily_attendance_log'    => true,
        ],
    ];
}

$SCHEMA = [
    'type' => 'object', 'additionalProperties' => false,
    'required' => ['headline', 'sections'],
    'properties' => [
        'headline' => ['type' => 'string'],
        'sections' => [
            'type' => 'array',
            'items' => [
                'type' => 'object', 'additionalProperties' => false,
                'required' => ['category', 'items'],
                'properties' => [
                    'category' => ['type' => 'string', 'enum' => ['urgent', 'monitor', 'strengths', 'stop']],
                    'items' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object', 'additionalProperties' => false,
                            'required' => ['title', 'detail'],
                            'properties' => [
                                'title'  => ['type' => 'string'],
                                'detail' => ['type' => 'string'],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ],
];

$SYSTEM = <<<SYS
You are a whole-school performance advisor for a Kenyan primary/secondary school. You will be given a JSON block of VERIFIED figures already computed from the school's records — covering fees & finance, academics (report-card averages, subject performance, class results), attendance, and enrolment. Your job is ONLY to prioritise and phrase them — never invent, recompute, or estimate a number that isn't in the data.

Produce a short, action-oriented briefing for the school owner/head, sorted into four categories:
- "urgent": needs action now (e.g. very low fee collection, a class far behind academically, attendance slipping, a cash/expense red flag).
- "monitor": worth watching (moderate concerns, notable data gaps).
- "strengths": what's working — protect it (strong collection, high-performing class or subject, good attendance).
- "stop": things to stop/retire/reallocate (waste, unused items, overstock).

Rules:
- Cover the whole school, not just money — weave in academics (weak subjects/classes by %), attendance, and enrolment wherever the data warrants, alongside the finance items.
- Every figure must come from the data; format money as "KES 1,234" (whole shillings) and academic/attendance figures as percentages (e.g. "48%").
- Be specific and concrete: name the class, subject, amount, or rate. One clear action per item where possible.
- Keep each item to a title (short) + one or two sentences of detail.
- Aim for 5–9 items total across the categories, most important first. Omit a category if nothing fits.
- If the data shows a gap (e.g. no expenses recorded, so surplus is overstated), call it out under "monitor" — do not treat an inflated surplus as real profit.
- Plain, practical language a busy head teacher can act on. No preamble.
SYS;

/* ── Generate on demand ──────────────────────────────────────────── */
$error = '';
if (isPost() && verifyCsrf() && input('action') === 'generate') {
    $facts  = briefingFacts($sb, $sid);
    $result = claudeMessage($SYSTEM, "Here are the verified figures:\n\n" . json_encode($facts, JSON_PRETTY_PRINT), $SCHEMA);
    if (!$result['ok']) {
        $error = $result['error'];
    } else {
        $sb->from('school_briefings')->insert([
            'school_id'    => $sid,
            'generated_by' => currentUser()['id'] ?? null,
            'model'        => 'claude-opus-4-8',
            'facts'        => $facts,
            'briefing'     => $result['data'],
        ]);
        flash('success', 'Briefing generated.');
        redirect('finance/briefing');
    }
}

/* ── Load the latest briefing ────────────────────────────────────── */
$latest = $sb->from('school_briefings')->select('generated_at,facts,briefing')
    ->eq('school_id', $sid)->order('generated_at', false)->single()->execute()['data'][0] ?? null;

$catMeta = [
    'urgent'    => [' Urgent — act now',     'border-red-200 bg-red-50',       'text-red-800'],
    'monitor'   => [' Monitor',              'border-amber-200 bg-amber-50',   'text-amber-800'],
    'strengths' => [' Strengths — protect',  'border-emerald-200 bg-emerald-50','text-emerald-800'],
    'stop'      => ['⏸ Stop / reallocate',     'border-gray-200 bg-gray-50',     'text-gray-700'],
];
$order = ['urgent', 'monitor', 'strengths', 'stop'];

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">School Briefing</h1>
        <p class="text-sm text-gray-500 mt-1">An AI-prioritised action list from your live figures — every number is computed from your records, not guessed.</p>
    </div>
    <form method="POST" action="<?= baseUrl('finance/briefing') ?>">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="generate">
        <button class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
            <?= $latest ? 'Regenerate' : 'Generate briefing' ?>
        </button>
    </form>
</div>

<?php if (!claudeConfigured()): ?>
    <div class="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
        AI isn't configured yet. Add <code class="text-xs">define('ANTHROPIC_API_KEY', 'sk-ant-…');</code> to <code class="text-xs">config.php</code>, then click Generate.
    </div>
<?php endif; ?>
<?php if ($error): ?>
    <div class="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"><?= e($error) ?></div>
<?php endif; ?>

<?php if (!$latest): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-sm text-gray-500">No briefing yet. Click <span class="font-medium text-gray-700">Generate briefing</span> to produce one from this school's current fees, collections and ledger.</p>
    </div>
<?php else:
    $b = $latest['briefing']; $f = $latest['facts'];
    $secByCat = [];
    foreach ($b['sections'] ?? [] as $sec) $secByCat[$sec['category']] = $sec['items'] ?? [];
?>
    <p class="text-xs text-gray-400 mb-3">Generated <?= e(date('j M Y, g:i a', strtotime($latest['generated_at']))) ?> · <?= e($f['school'] ?? '') ?></p>
    <?php if (!empty($b['headline'])): ?>
        <div class="rounded-xl p-5 mb-4 text-white bg-gradient-to-br from-slate-700 to-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p class="text-[11px] uppercase tracking-wide opacity-70 mb-1">Bottom line</p>
            <p class="text-lg font-semibold leading-snug"><?= e($b['headline']) ?></p>
        </div>
    <?php endif; ?>

    <!-- Key figures strip -->
    <?php
    $fe = $f['fees'] ?? [];
    $cards = [
        ['Students', number_format($f['students_active'] ?? 0), 'text-gray-900'],
        ['Billed', money($fe['billed'] ?? 0), 'text-gray-900'],
        ['Collected', money($fe['collected'] ?? 0), 'text-emerald-600'],
        ['Outstanding', money($fe['outstanding'] ?? 0), 'text-amber-600'],
        ['Collection', ($fe['collection_rate_pct'] ?? 0) . '%', 'text-gray-900'],
    ];
    if (($f['academics']['avg_percentage'] ?? null) !== null)  $cards[] = ['Avg score', $f['academics']['avg_percentage'] . '%', 'text-gray-900'];
    if (($f['attendance']['avg_percentage'] ?? null) !== null) $cards[] = ['Attendance', $f['attendance']['avg_percentage'] . '%', 'text-gray-900'];
    ?>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
        <?php foreach ($cards as [$lbl, $val, $cls]): ?>
            <div class="bg-white rounded-xl border border-gray-100 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p class="text-[11px] font-medium text-gray-400 uppercase tracking-wide"><?= e($lbl) ?></p>
                <p class="text-base font-bold mt-1 <?= $cls ?>"><?= e($val) ?></p>
            </div>
        <?php endforeach; ?>
    </div>

    <!-- Categorised action list -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <?php foreach ($order as $cat): $items = $secByCat[$cat] ?? []; if (!$items) continue; [$title, $box, $txt] = $catMeta[$cat]; ?>
            <div class="rounded-xl border <?= $box ?> p-4">
                <h2 class="text-sm font-bold <?= $txt ?> mb-2"><?= e($title) ?></h2>
                <ul class="space-y-2.5">
                    <?php foreach ($items as $it): ?>
                        <li>
                            <p class="text-sm font-semibold text-gray-800"><?= e($it['title'] ?? '') ?></p>
                            <p class="text-[13px] text-gray-600 leading-snug"><?= e($it['detail'] ?? '') ?></p>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </div>
        <?php endforeach; ?>
    </div>
    <p class="text-[11px] text-gray-400 mt-4">Figures computed from live records; the AI prioritises and phrases them. Verify anything before acting on it.</p>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
