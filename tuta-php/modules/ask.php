<?php
/**
 * Ask — a manager types a question, the school's data answers it.
 *
 * The in-app door to includes/assistant.php. WhatsApp will be the other door.
 * The thread lives in the session and is capped so a long chat stays cheap;
 * the running cost is shown so nobody is surprised by the API bill.
 */
$pageTitle = 'Ask';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

// Two doors: a branch manager asks about their school; a group director with
// no branch open asks about every branch at once.
$groupId   = $_SESSION['group_id'] ?? null;
$groupMode = ($sid === '' && $groupId);
if (!$groupMode && !userCan('dashboard.finance') && !isAdmin()) {
    flash('error', 'Ask is for managers with finance visibility.');
    redirect('dashboard');
}
require_once __DIR__ . '/../includes/assistant.php';

$key     = 'ask_thread_' . ($groupMode ? 'group_' . $groupId : $sid);
$thread  = $_SESSION[$key] ?? ['turns' => [], 'cost' => 0.0, 'tokens' => 0];
$scopeName = $groupMode ? ($_SESSION['group_name'] ?? 'the group') : schoolSetting('school_name', 'this school');

if (isPost() && verifyCsrf()) {
    if (input('action') === 'clear') {
        unset($_SESSION[$key]);
        redirect('ask');
    }
    $q = mb_substr(trim((string)input('q')), 0, 600);
    if ($q !== '') {
        $history = array_slice($thread['turns'], -10);            // the last five exchanges
        $history[] = ['role' => 'user', 'content' => $q];
        $r = assistantAsk($sid, $history, $groupId);
        $thread['turns'][] = ['role' => 'user', 'content' => $q, 'at' => date('H:i')];
        if ($r['ok']) {
            $thread['turns'][] = ['role' => 'assistant', 'content' => $r['text'], 'tools' => $r['tools'], 'cost' => $r['cost_usd'], 'at' => date('H:i')];
            $thread['cost']   += $r['cost_usd'];
            $thread['tokens'] += $r['usage']['in'] + $r['usage']['out'];
            if (!$groupMode) auditLog('ask', 'assistant', null, ['q' => $q, 'tools' => $r['tools'], 'cost_usd' => $r['cost_usd']]);
        } else {
            $thread['turns'][] = ['role' => 'assistant', 'content' => $r['error'], 'error' => true, 'at' => date('H:i')];
        }
        $thread['turns'] = array_slice($thread['turns'], -30);
        $_SESSION[$key] = $thread;
    }
    redirect('ask');
}

if ($groupMode) {
    $examples = [
        'How is each branch doing on collections this term?',
        'Which branch has the most learners with a balance, and how much?',
        'How much came in across the group this week, branch by branch?',
        'Where are enquiries coming in and are they being followed up?',
        'Which branches are actually recording expenses?',
        'Who are the ten largest debtors anywhere in the group?',
        'How many children joined and how many left each branch this term?',
        'What does each bus cost per rider across the group?',
    ];
} else {
    $examples = [
        'How much have we collected this term, and what is still outstanding?',
        'Who are the ten biggest debtors?',
        'What came in this week, and by which method?',
        'How many learners do we have per class?',
        'What did we spend this month, by heading?',
        'What has each bus cost this term, and does it cover its riders\' fees?',
        'What should be in the petty cash tin?',
        'Which families with more than one child here owe money?',
    ];
    if ($groupId) $examples[] = 'Compare collection rates across all the branches.';
}
$prefill = mb_substr(trim((string)input('q')), 0, 600);

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="mb-5 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Ask<?= $groupMode ? ' <span class="text-base font-medium text-gray-400">· ' . e($scopeName) . ', all branches</span>' : '' ?></h1>
        <p class="text-sm text-gray-500 mt-1"><?= $groupMode
            ? 'Ask across every branch in plain words — compare, rank, drill in. Every figure comes from the branches\' own records; it cannot change anything.'
            : 'Ask about fees, learners, spending or transport in plain words. Every figure comes from the school\'s own records; it cannot change anything.' ?></p>
    </div>
    <div class="text-right text-xs text-gray-500">
        <?php if ($thread['turns']): ?>
            This chat: <strong class="text-gray-800">$<?= number_format($thread['cost'], 3) ?></strong> · <?= number_format($thread['tokens']) ?> tokens
            <form method="POST" class="inline ml-2"><?= csrfField() ?><input type="hidden" name="action" value="clear"><button class="underline hover:text-gray-800">Start over</button></form>
        <?php endif; ?>
    </div>
</div>

<?php if (!claudeConfigured()): ?>
<div class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
    <strong>Not switched on yet.</strong> Add <code>ANTHROPIC_API_KEY</code> to <code>config.php</code> on the server.
</div>
<?php endif; ?>

<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6">
    <div>
        <!-- Thread -->
        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
            <div class="p-5 space-y-5 min-h-[14rem]" id="thread">
                <?php if (!$thread['turns']): ?>
                    <p class="text-sm text-gray-400 text-center py-10">Ask something, or pick an example on the right.</p>
                <?php endif; ?>
                <?php foreach ($thread['turns'] as $t): ?>
                    <?php if ($t['role'] === 'user'): ?>
                        <div class="flex justify-end">
                            <div class="max-w-[80%] bg-emerald-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm"><?= nl2br(e($t['content'])) ?></div>
                        </div>
                    <?php else: ?>
                        <div class="flex justify-start">
                            <div class="max-w-[85%]">
                                <div class="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed <?= !empty($t['error']) ? 'bg-red-50 text-red-700' : '' ?>"><?= nl2br(e($t['content'])) ?></div>
                                <?php if (!empty($t['tools'])): ?>
                                    <p class="text-[11px] text-gray-400 mt-1 ml-1">Checked: <?= e(implode(', ', array_map(fn($x) => str_replace('_', ' ', $x), $t['tools']))) ?> · $<?= number_format((float)($t['cost'] ?? 0), 3) ?></p>
                                <?php endif; ?>
                            </div>
                        </div>
                    <?php endif; ?>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- Ask -->
        <form method="POST" class="flex gap-2" id="askForm">
            <?= csrfField() ?>
            <input type="text" name="q" id="q" maxlength="600" autocomplete="off" autofocus <?= claudeConfigured() ? '' : 'disabled' ?> value="<?= e($prefill) ?>"
                   placeholder="<?= $groupMode ? 'e.g. Which branch is furthest behind on fees, and by how much?' : 'e.g. Who owes more than 20,000 in Grade 5?' ?>"
                   class="flex-1 px-4 py-3 text-sm rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none bg-white">
            <button type="submit" id="askBtn" <?= claudeConfigured() ? '' : 'disabled' ?>
                    class="px-5 py-3 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-sm disabled:opacity-50">Ask</button>
        </form>
        <p class="text-[11px] text-gray-400 mt-2">Answers take a few seconds — it reads the records before it replies.</p>
    </div>

    <!-- Examples -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Try asking</h2>
        <div class="space-y-1.5">
            <?php foreach ($examples as $ex): ?>
                <button type="button" onclick="document.getElementById('q').value=this.textContent;document.getElementById('q').focus()"
                        class="w-full text-left text-sm text-gray-700 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-gray-200"><?= e($ex) ?></button>
            <?php endforeach; ?>
        </div>
        <p class="text-[11px] text-gray-400 mt-4 leading-relaxed">It only reads. It can tell you who owes; it cannot send them a reminder — that stays a person's decision on the Send SMS page.</p>
    </div>
</div>

<script>
document.getElementById('askForm').addEventListener('submit', function () {
    var b = document.getElementById('askBtn'); b.disabled = true; b.textContent = 'Thinking…';
});
// A question handed over from another page (the group dashboard's Ask box)
// is asked straight away — the person already pressed Ask once.
<?php if ($prefill !== '' && claudeConfigured()): ?>
if (!sessionStorage.getItem('ask_prefill_sent:' + <?= json_encode($prefill) ?>)) {
    sessionStorage.setItem('ask_prefill_sent:' + <?= json_encode($prefill) ?>, '1');
    document.getElementById('askForm').requestSubmit();
}
<?php endif; ?>
var th = document.getElementById('thread'); if (th) th.scrollTop = th.scrollHeight;
</script>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
