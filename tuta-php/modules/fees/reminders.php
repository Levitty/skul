<?php
/**
 * Fee reminders — the arrears follow-up agent (migration 110).
 *
 * The first read→propose→approve agent on the ontology: it reads overdue
 * Invoices and their Students/Guardians, drafts one personalised reminder per
 * invoice, and queues them as PROPOSALS. The bursar approves or dismisses in
 * batch (decide_fee_reminders — atomic, audited). Nothing reaches a parent
 * without that human gate.
 *
 * Sending (mig. 125): approved reminders go out from here over WhatsApp
 * (Meta Cloud API, templated — Settings → WhatsApp says which template and
 * which values fill its slots) or SMS, one parent at a time so every row
 * records its own outcome. Rows that fail stay approved with the reason
 * shown, so they can be retried or handled by hand. If neither channel is
 * configured the copy-and-send pack is still there.
 */
$pageTitle = 'Fee Reminders';
$sb  = new Supabase();
$sid = schoolId();
$me  = currentUser();

$uuid4 = function (): string {
    $rb = random_bytes(16);
    $rb[6] = chr((ord($rb[6]) & 0x0f) | 0x40);
    $rb[8] = chr((ord($rb[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($rb), 4));
};

$waReady  = function_exists('whatsappConfigured') && whatsappConfigured();
$smsReady = function_exists('smsConfigured') && smsConfigured();

if (isPost() && verifyCsrf()) {
    $action = input('action');

    // ── The agent's read-and-draft pass ──────────────────
    if ($action === 'draft') {
        $schoolName = $sb->from('schools')->select('name')->eq('id', $sid)->single()->execute()['data'][0]['name'] ?? 'the school';

        $invoices = $sb->from('invoices')
            ->select('id,reference,amount,paid_amount,due_date,student_id,status')
            ->eq('school_id', $sid)->in('status', ['unpaid', 'partial', 'overdue'])
            ->lt('due_date', date('Y-m-d'))->limit(500)->execute()['data'] ?? [];

        $existing = $sb->from('fee_reminders')->select('invoice_id')
            ->eq('school_id', $sid)->eq('status', 'draft')->execute()['data'] ?? [];
        $skip = array_column($existing, 'invoice_id');

        $stuIds = array_values(array_unique(array_column($invoices, 'student_id')));
        $stuMap = [];
        if ($stuIds) {
            $rows = Supabase::fetchByChunkedIn(
                fn($_sb) => $_sb->from('students')->select('id,first_name,last_name,guardian_name,guardian_phone'),
                'id', $stuIds);
            foreach ($rows as $s) $stuMap[$s['id']] = $s;
        }

        $batch = $uuid4();
        $made = 0; $noPhone = [];
        foreach ($invoices as $inv) {
            if (in_array($inv['id'], $skip, true)) continue;
            $bal = (float)$inv['amount'] - (float)($inv['paid_amount'] ?? 0);
            if ($bal <= 0) continue;
            $stu = $stuMap[$inv['student_id']] ?? null;
            if (!$stu) continue;
            $stuName = trim(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? ''));
            if (empty($stu['guardian_phone'])) { $noPhone[] = $stuName; continue; }
            $days = max(1, (int)floor((time() - strtotime($inv['due_date'])) / 86400));

            $msg = 'Dear ' . ($stu['guardian_name'] ?: 'Parent/Guardian') . ', a kind reminder from ' . $schoolName
                 . ': the fee balance for ' . $stuName . ' is KES ' . number_format($bal)
                 . ' (invoice ' . $inv['reference'] . ', ' . $days . ' days overdue).'
                 . ' Kindly clear at your earliest convenience. Thank you.';

            $sb->from('fee_reminders')->insert([
                'school_id'      => $sid,
                'batch_id'       => $batch,
                'invoice_id'     => $inv['id'],
                'student_id'     => $inv['student_id'],
                'guardian_name'  => $stu['guardian_name'] ?: null,
                'guardian_phone' => $stu['guardian_phone'],
                'balance'        => $bal,
                'days_overdue'   => $days,
                'message'        => $msg,
            ]);
            $made++;
        }
        auditLog('fee_reminders_drafted', 'fee_reminders', null, ['batch' => $batch, 'count' => $made, 'no_phone' => count($noPhone)]);
        $note = $made . ' reminder' . ($made !== 1 ? 's' : '') . ' drafted for review.';
        if ($noPhone) $note .= ' ' . count($noPhone) . ' famil' . (count($noPhone) !== 1 ? 'ies' : 'y') . ' skipped — no guardian phone on file.';
        flash($made ? 'success' : 'error', $made ? $note : 'No overdue invoices need a reminder right now.' . ($noPhone ? ' (' . count($noPhone) . ' skipped for missing phone.)' : ''));
        redirect('fees/reminders');
    }

    // ── The human gate ───────────────────────────────────
    if (in_array($action, ['approve', 'dismiss', 'mark_sent'], true)) {
        $ids = array_values($_POST['ids'] ?? []);
        if (!$ids) { flash('error', 'Nothing selected.'); redirect('fees/reminders'); }
        $decision = $action === 'approve' ? 'approved' : ($action === 'dismiss' ? 'dismissed' : 'sent');
        if ($decision === 'sent') {
            // Hand-sent: record the channel so the row isn't mistaken for an automatic send.
            foreach (array_chunk($ids, 200) as $chunk) {
                $sb->from('fee_reminders')->eq('school_id', $sid)->in('id', $chunk)->eq('status', 'approved')
                    ->update(['sent_via' => 'manual', 'sent_at' => date('c'), 'send_error' => null]);
            }
        }
        $res = $sb->rpc('decide_fee_reminders', [
            'p_school_id'  => $sid,
            'p_ids'        => $ids,
            'p_decision'   => $decision,
            'p_user_id'    => $me['id']    ?? null,
            'p_user_email' => $me['email'] ?? null,
        ]);
        $p = $res['data'] ?? null;
        if (!empty($res['error']) || !is_array($p) || empty($p['success'])) {
            flash('error', is_array($p) ? ($p['error'] ?? 'Could not record the decision.') : 'Could not record the decision.');
        } else {
            flash('success', (int)$p['count'] . ' reminder' . ((int)$p['count'] !== 1 ? 's' : '') . ' ' . $decision . '.');
        }
        redirect('fees/reminders');
    }

    // ── The sender ───────────────────────────────────────
    if (in_array($action, ['send_whatsapp', 'send_sms'], true)) {
        $ids = array_values($_POST['ids'] ?? []);
        if (!$ids) { flash('error', 'Nothing selected.'); redirect('fees/reminders'); }
        $viaWa = $action === 'send_whatsapp';
        if ($viaWa && !$waReady) { flash('error', 'WhatsApp is not configured — Settings → WhatsApp.'); redirect('fees/reminders'); }
        if (!$viaWa && !$smsReady) { flash('error', 'SMS is not configured — Settings → SMS.'); redirect('fees/reminders'); }

        $rows = [];
        foreach (Supabase::fetchByChunkedIn(
            fn($_sb) => $_sb->from('fee_reminders')->select('id,invoice_id,student_id,guardian_name,guardian_phone,balance,days_overdue,message,status')
                ->eq('school_id', $sid)->eq('status', 'approved'),
            'id', $ids) as $r) $rows[] = $r;
        if (!$rows) { flash('error', 'None of the selected reminders are still approved.'); redirect('fees/reminders'); }

        // Which values the WhatsApp template wants, in slot order.
        $schoolName = schoolSetting('school_name', '') ?: ($sb->from('schools')->select('name')->eq('id', $sid)->single()->execute()['data'][0]['name'] ?? 'the school');
        $tokens = ['message'];
        $tplName = null;
        if ($viaWa) {
            $tplName = trim((string)schoolSetting('wa_reminder_template', '')) ?: null;
            $tokens  = array_values(array_filter(array_map('trim', explode(',', (string)schoolSetting('wa_reminder_params', 'message')))));
            if (!$tokens) $tokens = ['message'];
        }
        $stuName = []; $invRef = [];
        if ($viaWa && in_array('student', $tokens, true)) {
            foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('students')->select('id,first_name,last_name'), 'id',
                array_values(array_unique(array_column($rows, 'student_id')))) as $s) {
                $stuName[$s['id']] = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''));
            }
        }
        if ($viaWa && in_array('invoice', $tokens, true)) {
            foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('invoices')->select('id,reference'), 'id',
                array_values(array_unique(array_column($rows, 'invoice_id')))) as $i) $invRef[$i['id']] = $i['reference'];
        }

        @set_time_limit(600);   // one HTTP call per parent
        $okIds = []; $failed = 0; $errors = [];
        foreach ($rows as $r) {
            if ($viaWa) {
                $vals = [
                    'message'  => $r['message'],
                    'guardian' => $r['guardian_name'] ?: 'Parent/Guardian',
                    'student'  => $stuName[$r['student_id']] ?? 'your child',
                    'balance'  => 'KES ' . number_format((float)$r['balance']),
                    'invoice'  => $invRef[$r['invoice_id']] ?? '',
                    'days'     => (string)(int)$r['days_overdue'],
                    'school'   => $schoolName,
                ];
                $params = array_map(fn($t) => (string)($vals[$t] ?? ''), $tokens);
                $res = whatsappSendText((string)$r['guardian_phone'], $params, $tplName);
                $ok = !empty($res['ok']); $err = $res['error'] ?? null; $pid = $res['id'] ?? null;
            } else {
                $res = smsSend([(string)$r['guardian_phone']], (string)$r['message']);
                $ok = (int)($res['sent'] ?? 0) > 0;
                $err = $ok ? null : ($res['error'] ?: ((int)($res['invalid'] ?? 0) > 0 ? 'Invalid phone number.' : 'Provider did not accept the message.'));
                $pid = null;
            }
            if ($ok) {
                $okIds[] = $r['id'];
                $sb->from('fee_reminders')->eq('id', $r['id'])->update([
                    'sent_via' => $viaWa ? 'whatsapp' : 'sms', 'provider_id' => $pid, 'send_error' => null, 'sent_at' => date('c'),
                ]);
            } else {
                $failed++;
                $errors[(string)$err] = ($errors[(string)$err] ?? 0) + 1;
                $sb->from('fee_reminders')->eq('id', $r['id'])->update(['send_error' => mb_substr((string)$err, 0, 300)]);
            }
        }
        if ($okIds) {
            $sb->rpc('decide_fee_reminders', [
                'p_school_id' => $sid, 'p_ids' => $okIds, 'p_decision' => 'sent',
                'p_user_id' => $me['id'] ?? null, 'p_user_email' => $me['email'] ?? null,
            ]);
        }
        auditLog('fee_reminders_sent', 'fee_reminders', null, ['via' => $viaWa ? 'whatsapp' : 'sms', 'sent' => count($okIds), 'failed' => $failed]);
        $note = count($okIds) . ' sent via ' . ($viaWa ? 'WhatsApp' : 'SMS') . '.';
        if ($failed) {
            arsort($errors);
            $note .= ' ' . $failed . ' failed — ' . implode(' · ', array_slice(array_keys($errors), 0, 2)) . '. They stay in the approved list with the reason.';
        }
        flash($okIds ? ($failed ? 'error' : 'success') : 'error', $note);
        redirect('fees/reminders');
    }
}

$drafts   = $sb->from('fee_reminders')->select('*')->eq('school_id', $sid)->eq('status', 'draft')->order('balance', false)->limit(300)->execute()['data'] ?? [];
$approved = $sb->from('fee_reminders')->select('*')->eq('school_id', $sid)->eq('status', 'approved')->order('decided_at', false)->limit(300)->execute()['data'] ?? [];
$recentSent = $sb->from('fee_reminders')->select('id,guardian_name,guardian_phone,balance,sent_via,sent_at,decided_at')
    ->eq('school_id', $sid)->eq('status', 'sent')->order('decided_at', false)->limit(20)->execute()['data'] ?? [];

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Fee Reminders</h1>
        <p class="text-sm text-gray-500 mt-1">The agent drafts a reminder per overdue invoice — nothing is sent until you approve it.</p>
    </div>
    <form method="POST">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="draft">
        <button type="submit" class="px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition">Draft reminders for overdue invoices</button>
    </form>
</div>

<!-- Channel status -->
<div class="flex flex-wrap gap-2 mb-5 text-xs">
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border <?= $waReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-500' ?>">
        <span class="w-1.5 h-1.5 rounded-full <?= $waReady ? 'bg-emerald-500' : 'bg-gray-300' ?>"></span>WhatsApp <?= $waReady ? 'connected' : 'not configured' ?>
    </span>
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border <?= $smsReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-500' ?>">
        <span class="w-1.5 h-1.5 rounded-full <?= $smsReady ? 'bg-emerald-500' : 'bg-gray-300' ?>"></span>SMS <?= $smsReady ? 'connected' : 'not configured' ?>
    </span>
    <?php if (!$waReady && !$smsReady): ?><a href="<?= baseUrl('settings?tab=whatsapp') ?>" class="text-emerald-700 font-medium hover:underline self-center">Connect a channel →</a><?php endif; ?>
</div>

<!-- ── Proposals awaiting the human gate ── -->
<form method="POST" id="draftForm">
    <?= csrfField() ?>
    <input type="hidden" name="action" value="approve" id="draftAction">
    <div class="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6">
        <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-700">Awaiting your review <span class="text-gray-400 font-normal">(<?= count($drafts) ?>)</span></h2>
            <?php if ($drafts): ?>
            <div class="flex gap-2">
                <button type="submit" onclick="document.getElementById('draftAction').value='approve'" class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Approve selected</button>
                <button type="submit" onclick="document.getElementById('draftAction').value='dismiss'" class="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">Dismiss selected</button>
            </div>
            <?php endif; ?>
        </div>
        <?php if (!$drafts): ?>
            <div class="px-5 py-10 text-center text-gray-400 text-sm">No drafts waiting. Click "Draft reminders" to run the agent over overdue invoices.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead><tr class="text-left text-xs text-gray-400 uppercase">
                    <th class="px-5 py-2.5"><input type="checkbox" checked onclick="document.querySelectorAll('.rchk').forEach(c=>c.checked=this.checked)"></th>
                    <th class="px-5 py-2.5">Guardian</th><th class="px-5 py-2.5">Phone</th><th class="px-5 py-2.5">Balance</th><th class="px-5 py-2.5">Overdue</th><th class="px-5 py-2.5">Message</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-50">
                    <?php foreach ($drafts as $r): ?>
                    <tr>
                        <td class="px-5 py-3"><input type="checkbox" class="rchk" name="ids[]" value="<?= e($r['id']) ?>" checked></td>
                        <td class="px-5 py-3 font-medium text-gray-900"><?= e($r['guardian_name'] ?: '—') ?></td>
                        <td class="px-5 py-3 text-gray-600"><?= e($r['guardian_phone']) ?></td>
                        <td class="px-5 py-3 font-medium"><?= money((float)$r['balance']) ?></td>
                        <td class="px-5 py-3 text-red-600"><?= (int)$r['days_overdue'] ?> d</td>
                        <td class="px-5 py-3 text-gray-600 max-w-md"><span class="line-clamp-2"><?= e($r['message']) ?></span></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>
</form>

<!-- ── Approved: send ── -->
<?php if ($approved): $hasErr = (bool)array_filter($approved, fn($r) => !empty($r['send_error'])); ?>
<form method="POST" id="sendForm">
    <?= csrfField() ?>
    <input type="hidden" name="action" value="mark_sent" id="sendAction">
    <div class="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6">
        <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <h2 class="text-sm font-semibold text-gray-700">Approved — ready to send <span class="text-gray-400 font-normal">(<?= count($approved) ?>)</span></h2>
            <div class="flex gap-2 flex-wrap">
                <?php if ($waReady): ?>
                <button type="submit" onclick="document.getElementById('sendAction').value='send_whatsapp'; return confirm('Send the selected reminders over WhatsApp now?')" class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Send via WhatsApp</button>
                <?php endif; ?>
                <?php if ($smsReady): ?>
                <button type="submit" onclick="document.getElementById('sendAction').value='send_sms'; return confirm('Send the selected reminders by SMS now?')" class="px-3 py-1.5 text-xs font-medium text-white <?= $waReady ? 'bg-gray-700 hover:bg-gray-800' : 'bg-emerald-600 hover:bg-emerald-700' ?> rounded-lg transition">Send via SMS</button>
                <?php endif; ?>
                <button type="button" onclick="var t=document.getElementById('sendPack');t.select();document.execCommand('copy');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy all',1500);" class="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Copy all</button>
                <button type="submit" onclick="document.getElementById('sendAction').value='mark_sent'; return confirm('Mark the selected reminders as sent by hand?')" class="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Mark as sent</button>
            </div>
        </div>
        <?php if (!$waReady && !$smsReady): ?>
            <p class="px-5 pt-3 text-xs text-gray-500">No channel is connected yet. Copy these and send from the school line, then mark them as sent. Format: <span class="font-mono">phone — message</span></p>
        <?php elseif ($waReady): ?>
            <p class="px-5 pt-3 text-xs text-gray-500">WhatsApp sends each parent the approved template with <span class="font-mono"><?= e(schoolSetting('wa_reminder_params', 'message')) ?></span> filling its slots (Settings → WhatsApp → Fee reminders). Rows that fail stay here with the reason.</p>
        <?php endif; ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead><tr class="text-left text-xs text-gray-400 uppercase">
                    <th class="px-5 py-2.5"><input type="checkbox" checked onclick="document.querySelectorAll('.schk').forEach(c=>c.checked=this.checked)"></th>
                    <th class="px-5 py-2.5">Guardian</th><th class="px-5 py-2.5">Phone</th><th class="px-5 py-2.5">Balance</th><th class="px-5 py-2.5">Message</th>
                    <?php if ($hasErr): ?><th class="px-5 py-2.5">Last attempt</th><?php endif; ?>
                </tr></thead>
                <tbody class="divide-y divide-gray-50">
                    <?php foreach ($approved as $r): ?>
                    <tr class="<?= !empty($r['send_error']) ? 'bg-red-50/40' : '' ?>">
                        <td class="px-5 py-3"><input type="checkbox" class="schk" name="ids[]" value="<?= e($r['id']) ?>" checked></td>
                        <td class="px-5 py-3 font-medium text-gray-900"><?= e($r['guardian_name'] ?: '—') ?></td>
                        <td class="px-5 py-3 text-gray-600"><?= e($r['guardian_phone']) ?></td>
                        <td class="px-5 py-3 font-medium"><?= money((float)$r['balance']) ?></td>
                        <td class="px-5 py-3 text-gray-600 max-w-md"><span class="line-clamp-2"><?= e($r['message']) ?></span></td>
                        <?php if ($hasErr): ?><td class="px-5 py-3 text-xs text-red-600 max-w-xs"><?= e($r['send_error'] ?? '') ?></td><?php endif; ?>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <div class="px-5 pb-4">
            <details class="mt-3">
                <summary class="text-xs text-gray-500 cursor-pointer select-none">Copy-and-send pack</summary>
                <textarea id="sendPack" readonly rows="6" class="mt-2 w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-mono text-gray-700"><?php foreach ($approved as $r): ?><?= e($r['guardian_phone']) ?> — <?= e($r['message']) ?><?= "\n" ?><?php endforeach; ?></textarea>
            </details>
        </div>
    </div>
</form>
<?php endif; ?>

<?php if ($recentSent): ?>
<div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-100"><h2 class="text-sm font-semibold text-gray-700">Recently sent <span class="text-gray-400 font-normal">(last <?= count($recentSent) ?>)</span></h2></div>
    <div class="divide-y divide-gray-50">
        <?php $viaLabel = ['whatsapp' => ['WhatsApp', 'bg-emerald-50 text-emerald-700'], 'sms' => ['SMS', 'bg-blue-50 text-blue-700'], 'manual' => ['By hand', 'bg-gray-100 text-gray-600']];
        foreach ($recentSent as $r): [$vl, $vc] = $viaLabel[$r['sent_via'] ?? ''] ?? ['Sent', 'bg-gray-100 text-gray-600']; ?>
        <div class="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
            <div class="min-w-0"><span class="font-medium text-gray-900"><?= e($r['guardian_name'] ?: '—') ?></span> <span class="text-gray-400">· <?= e($r['guardian_phone']) ?> · <?= money((float)$r['balance']) ?></span></div>
            <div class="flex items-center gap-2 flex-none text-xs text-gray-500">
                <span class="inline-flex px-2 py-0.5 rounded-full font-medium <?= $vc ?>"><?= e($vl) ?></span>
                <?= e(formatDate($r['sent_at'] ?? $r['decided_at'] ?? null)) ?>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
