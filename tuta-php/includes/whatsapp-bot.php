<?php
/**
 * WhatsApp parent assistant — the conversation.
 *
 * A parent messages the school's number. We find their learners by phone,
 * show each child's fee balance, and let them pay by M-Pesa from the chat:
 *
 *   parent: hi
 *   school: [Brian Wanjiru · Grade 5 · balance KES 12,500]  (Pay full) (Pay an amount) (Statement)
 *   parent: (Pay full)
 *   school: Check your phone — an M-Pesa prompt for KES 12,500 has been sent.
 *   …M-Pesa callback records the payment…
 *   school: Payment received: KES 12,500 (QAB1CD2EF3). New balance: KES 0. Thank you!
 *
 * Everything the parent starts is a "service conversation" — free on Meta's
 * side for 24 hours. State lives in wa_conversations; every message in
 * wa_messages. The school context is already set by the webhook.
 */

require_once __DIR__ . '/mpesa.php';

/** Entry point: one inbound message. */
function whatsappBotHandle(array $msg, string $schoolId): void
{
    $sb    = new Supabase();
    $phone = whatsappNormalizePhone((string)($msg['from'] ?? ''));
    if ($phone === '') return;

    $type = (string)($msg['type'] ?? '');
    $text = '';
    $choice = '';
    if ($type === 'text') {
        $text = trim((string)($msg['text']['body'] ?? ''));
    } elseif ($type === 'interactive') {
        $i = $msg['interactive'] ?? [];
        $choice = (string)($i['button_reply']['id'] ?? $i['list_reply']['id'] ?? '');
        $text   = (string)($i['button_reply']['title'] ?? $i['list_reply']['title'] ?? '');
    } elseif ($type === 'button') {          // quick-reply on a template
        $choice = (string)($msg['button']['payload'] ?? '');
        $text   = (string)($msg['button']['text'] ?? '');
    } else {
        whatsappSendFreeText($phone, "I can only read text for now. Reply *hi* to see your child's fee balance.");
        return;
    }

    whatsappLogMessage($phone, 'in', $type, ['text' => $text, 'choice' => $choice], (string)($msg['id'] ?? null));
    if (!empty($msg['id'])) whatsappMarkRead((string)$msg['id']);

    // ── Where are we in the conversation? ─────────────────────────
    $conv = $sb->from('wa_conversations')->select('state,context')->eq('school_id', $schoolId)->eq('phone', $phone)
        ->single()->execute()['data'][0] ?? null;
    $state = (string)($conv['state'] ?? 'idle');
    $ctx   = is_string($conv['context'] ?? null) ? (json_decode($conv['context'], true) ?: []) : (array)($conv['context'] ?? []);
    $save  = function (string $newState, array $newCtx = []) use ($sb, $schoolId, $phone, $conv) {
        $row = ['school_id' => $schoolId, 'phone' => $phone, 'state' => $newState, 'context' => $newCtx,
                'last_in_at' => date('c'), 'updated_at' => date('c')];
        if ($conv) $sb->from('wa_conversations')->eq('school_id', $schoolId)->eq('phone', $phone)->update($row);
        else       $sb->from('wa_conversations')->insert($row);
    };

    // ── Managers get Ask, not the fees menu ──────────────────────
    // A director's or administrator's number is routed to the Claude-backed
    // assistant; everyone else continues to the parent flow below.
    require_once __DIR__ . '/whatsapp-ask.php';
    if ($choice === '' && whatsappAskHandle($sb, $schoolId, $phone, $text, $conv ?: [], $save)) return;

    $schoolName = schoolSetting('school_name', '') ?: ($sb->from('schools')->select('name')->eq('id', $schoolId)->single()->execute()['data'][0]['name'] ?? 'the school');
    $lower = mb_strtolower($text);
    $isReset = $choice === 'menu' || in_array($lower, ['hi', 'hello', 'hey', 'menu', 'start', 'help', 'balance', 'fees', 'habari', 'niaje'], true);

    // Where the humans are. This number lives on the API, so nobody at the
    // school can read a chat here; anything that needs a person is sent on.
    $office = trim((string)schoolSetting('wa_office_phone', ''));
    $officeLine = $office !== ''
        ? "\n\n_This is the automated fees line. For anything else — absence, a payment plan, a question for a teacher — call or WhatsApp the office on *" . $office . "*._"
        : "\n\n_This is the automated fees line. For anything else, please contact the school office._";

    // ── Learners linked to this phone ─────────────────────────────
    $learners = whatsappBotLearnersFor($sb, $schoolId, $phone);

    // ── Button / list choices ─────────────────────────────────────
    if ($choice !== '' && !$isReset) {
        [$act, $arg] = array_pad(explode(':', $choice, 2), 2, '');
        if ($act === 'stu') {
            $stu = whatsappBotLearner($sb, $schoolId, $arg, $learners, $ctx);
            if ($stu) { whatsappBotSummary($sb, $schoolId, $phone, $stu, count($learners) > 1); $save('learner_menu', ['student_id' => $stu['id']]); return; }
        }
        if ($act === 'pay_full' || $act === 'pay_other' || $act === 'statement') {
            $stu = whatsappBotLearner($sb, $schoolId, $arg, $learners, $ctx);
            if (!$stu) { whatsappSendFreeText($phone, "I've lost track of which learner that was — reply *hi* to start again."); $save('idle'); return; }
            $open = whatsappBotOpenInvoices($sb, $schoolId, $stu['id']);
            if ($act === 'statement') { whatsappBotStatement($sb, $phone, $stu, $open); $save('learner_menu', ['student_id' => $stu['id']]); return; }
            if (!$open) { whatsappSendFreeText($phone, whatsappBotName($stu) . " has no balance due. 🎉"); $save('learner_menu', ['student_id' => $stu['id']]); return; }
            $inv = $open[0];                          // oldest open invoice first
            $bal = (float)$inv['amount'] - (float)($inv['paid_amount'] ?? 0);
            if ($act === 'pay_full') {
                whatsappBotStkPush($sb, $schoolId, $phone, $stu, $inv, $bal, count($open));
                $save('learner_menu', ['student_id' => $stu['id']]);
                return;
            }
            whatsappSendFreeText($phone, "How much would you like to pay towards " . whatsappBotName($stu) . "'s balance of " . money($bal)
                . " (invoice " . ($inv['reference'] ?? '') . ")?\n\nReply with the amount in numbers, e.g. *5000*.");
            $save('awaiting_amount', ['student_id' => $stu['id'], 'invoice_id' => $inv['id'], 'balance' => $bal]);
            return;
        }
        if ($act === 'switch') { whatsappBotChoose($phone, $learners); $save('choose_learner'); return; }
        if ($act === 'cancel') { whatsappSendFreeText($phone, "No problem. Reply *hi* any time to see the balance."); $save('idle'); return; }
    }

    // ── Typed replies that depend on state ───────────────────────
    if (!$isReset && $state === 'awaiting_amount' && $text !== '') {
        $amt = (float)str_replace([',', ' ', 'KES', 'kes', 'Ksh', 'ksh'], '', $text);
        $stu = whatsappBotLearner($sb, $schoolId, (string)($ctx['student_id'] ?? ''), $learners, $ctx);
        $inv = !empty($ctx['invoice_id']) ? ($sb->from('invoices')->select('id,reference,amount,paid_amount,status,student_id')
            ->eq('id', $ctx['invoice_id'])->eq('school_id', $schoolId)->single()->execute()['data'][0] ?? null) : null;
        if (!$stu || !$inv) { whatsappSendFreeText($phone, "Let's start again — reply *hi*."); $save('idle'); return; }
        $bal = (float)$inv['amount'] - (float)($inv['paid_amount'] ?? 0);
        if ($amt < 1) { whatsappSendFreeText($phone, "Please reply with just the amount in numbers, e.g. *5000*, or *cancel*."); return; }
        if ($amt > $bal) { $amt = $bal; }
        whatsappBotStkPush($sb, $schoolId, $phone, $stu, $inv, $amt, count(whatsappBotOpenInvoices($sb, $schoolId, $stu['id'])));
        $save('learner_menu', ['student_id' => $stu['id']]);
        return;
    }

    if (!$isReset && $state === 'awaiting_adm' && $text !== '') {
        $adm = trim($text);
        $stu = $sb->from('students')->select('id,first_name,last_name,admission_number,current_class_id,status')
            ->eq('school_id', $schoolId)->eq('admission_number', $adm)->single()->execute()['data'][0] ?? null;
        if (!$stu || ($stu['status'] ?? 'active') !== 'active') {
            whatsappSendFreeText($phone, "I couldn't find an active learner with admission number *" . $adm . "* at " . $schoolName . ". Check the number and try again, or contact the school office.");
            return;
        }
        whatsappBotSummary($sb, $schoolId, $phone, $stu, false);
        $save('learner_menu', ['student_id' => $stu['id'], 'via_adm' => true]);
        return;
    }

    if (!$isReset && in_array($lower, ['cancel', 'stop', 'no'], true)) {
        whatsappSendFreeText($phone, "Okay. Reply *hi* any time to see the balance.");
        $save('idle');
        return;
    }

    // ── Free text the assistant can't act on: say so, don't pretend ──
    if (!$isReset && $choice === '' && $text !== '' && !in_array($state, ['awaiting_adm', 'awaiting_amount'], true)) {
        whatsappSendFreeText($phone, "I can only help with fee balances, statements and payments here, so I haven't passed that on." . $officeLine . "\n\nReply *hi* to see the balance.");
        return;
    }

    // ── Default: greet and show what's linked to this phone ───────
    if (!$learners) {
        whatsappSendFreeText($phone, "Hello, and welcome to " . $schoolName . ". 👋\n\nI couldn't find a learner linked to this phone number. Reply with the learner's *admission number* and I'll show the fee balance." . $officeLine);
        $save('awaiting_adm');
        return;
    }
    if (count($learners) === 1) {
        whatsappBotSummary($sb, $schoolId, $phone, $learners[0], false, "Hello, and welcome to " . $schoolName . ". 👋\n\n", $officeLine);
        $save('learner_menu', ['student_id' => $learners[0]['id']]);
        return;
    }
    whatsappSendFreeText($phone, "Hello, and welcome to " . $schoolName . ". 👋" . $officeLine);
    whatsappBotChoose($phone, $learners);
    $save('choose_learner');
}

/* ── Helpers ───────────────────────────────────────────────────── */

function whatsappBotName(array $stu): string
{
    return trim(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? ''));
}

/** Active learners whose guardian phone (either) or guardians-table phone matches. */
function whatsappBotLearnersFor(Supabase $sb, string $schoolId, string $phone): array
{
    $tail = substr($phone, -9);              // 7XXXXXXXX — matches 07…, 2547…, +2547…
    if (strlen($tail) < 9) return [];
    $cols = 'id,first_name,last_name,admission_number,current_class_id,status,guardian_phone,guardian_phone_2';
    $found = [];
    foreach (['guardian_phone', 'guardian_phone_2'] as $col) {
        $rows = $sb->from('students')->select($cols)->eq('school_id', $schoolId)->eq('status', 'active')
            ->ilike($col, '%' . $tail . '%')->limit(20)->execute()['data'] ?? [];
        foreach ($rows as $r) $found[$r['id']] = $r;
    }
    // Guardians table (full admission form) — any parent on the record.
    $g = $sb->from('guardians')->select('student_id')->ilike('phone', '%' . $tail . '%')->limit(20)->execute()['data'] ?? [];
    $gids = array_values(array_unique(array_filter(array_column($g, 'student_id'))));
    $gids = array_values(array_diff($gids, array_keys($found)));
    if ($gids) {
        foreach (Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('students')->select($cols)->eq('school_id', $schoolId)->eq('status', 'active'), 'id', $gids) as $r) {
            $found[$r['id']] = $r;
        }
    }
    $out = array_values($found);
    usort($out, fn($a, $b) => strcmp(whatsappBotName($a), whatsappBotName($b)));
    return $out;
}

/** Resolve a learner the parent is allowed to see: linked by phone, or reached via admission number this conversation. */
function whatsappBotLearner(Supabase $sb, string $schoolId, string $studentId, array $learners, array $ctx): ?array
{
    foreach ($learners as $l) if ($l['id'] === $studentId) return $l;
    if (!empty($ctx['via_adm']) && ($ctx['student_id'] ?? '') === $studentId && $studentId !== '') {
        return $sb->from('students')->select('id,first_name,last_name,admission_number,current_class_id,status')
            ->eq('id', $studentId)->eq('school_id', $schoolId)->single()->execute()['data'][0] ?? null;
    }
    return null;
}

function whatsappBotOpenInvoices(Supabase $sb, string $schoolId, string $studentId): array
{
    $rows = $sb->from('invoices')->select('id,reference,amount,paid_amount,status,due_date,created_at')
        ->eq('school_id', $schoolId)->eq('student_id', $studentId)
        ->in('status', ['unpaid', 'partial', 'overdue'])->order('due_date')->order('created_at')->limit(20)->execute()['data'] ?? [];
    return array_values(array_filter($rows, fn($r) => ((float)$r['amount'] - (float)($r['paid_amount'] ?? 0)) > 0.005));
}

/** The learner card: name, class, balance, and the three buttons. */
function whatsappBotSummary(Supabase $sb, string $schoolId, string $phone, array $stu, bool $multi, string $prefix = '', string $suffix = ''): void
{
    $open = whatsappBotOpenInvoices($sb, $schoolId, $stu['id']);
    $bal = 0.0; foreach ($open as $i) $bal += (float)$i['amount'] - (float)($i['paid_amount'] ?? 0);
    $class = cachedClassMap()[$stu['current_class_id'] ?? ''] ?? '';
    $body = $prefix . '*' . whatsappBotName($stu) . '*' . ($class !== '' ? ' · ' . $class : '')
          . (!empty($stu['admission_number']) ? ' · Adm ' . $stu['admission_number'] : '') . "\n\n";
    if ($bal <= 0) {
        $body .= "Fee balance: *KES 0* — nothing due. 🎉" . $suffix;
        $btns = ['statement:' . $stu['id'] => 'Statement'];
        if ($multi) $btns['switch'] = 'Another learner';
        whatsappSendButtons($phone, $body, $btns);
        return;
    }
    $overdue = array_filter($open, fn($i) => !empty($i['due_date']) && $i['due_date'] < date('Y-m-d'));
    $body .= "Fee balance: *" . money($bal) . "*";
    $body .= count($open) === 1 ? "\nInvoice " . ($open[0]['reference'] ?? '') . (!empty($open[0]['due_date']) ? ", due " . date('j M', strtotime($open[0]['due_date'])) : '')
                                : "\n" . count($open) . " invoices open" . ($overdue ? ", " . count($overdue) . " overdue" : '');
    $body .= "\n\nYou can pay by M-Pesa right here." . $suffix;
    $btns = ['pay_full:' . $stu['id'] => 'Pay full balance', 'pay_other:' . $stu['id'] => 'Pay an amount', 'statement:' . $stu['id'] => 'Statement'];
    whatsappSendButtons($phone, $body, $btns, $multi ? 'Reply "menu" to pick another learner' : null);
}

function whatsappBotChoose(string $phone, array $learners): void
{
    $sb = new Supabase(); $sid = schoolId(); $classMap = cachedClassMap();
    $rows = [];
    foreach (array_slice($learners, 0, 10) as $l) {
        $open = whatsappBotOpenInvoices($sb, $sid, $l['id']);
        $bal = 0.0; foreach ($open as $i) $bal += (float)$i['amount'] - (float)($i['paid_amount'] ?? 0);
        $rows[] = ['id' => 'stu:' . $l['id'], 'title' => whatsappBotName($l),
                   'description' => trim(($classMap[$l['current_class_id'] ?? ''] ?? '') . ' · balance ' . money($bal), ' ·')];
    }
    whatsappSendList($phone, "Which learner would you like to see?", 'Choose', 'Your learners', $rows);
}

/** A short statement: open invoices and the last few payments. */
function whatsappBotStatement(Supabase $sb, string $phone, array $stu, array $open): void
{
    $sid = schoolId();
    $t = "*Statement — " . whatsappBotName($stu) . "*\n";
    if (!$open) {
        $t .= "\nNo open invoices.";
    } else {
        $tot = 0.0;
        foreach ($open as $i) {
            $b = (float)$i['amount'] - (float)($i['paid_amount'] ?? 0); $tot += $b;
            $t .= "\n" . ($i['reference'] ?? 'Invoice') . ": " . money((float)$i['amount']) . " billed, " . money((float)($i['paid_amount'] ?? 0)) . " paid, *" . money($b) . "* due"
                . (!empty($i['due_date']) ? " (" . date('j M Y', strtotime($i['due_date'])) . ")" : '');
        }
        $t .= "\n\nTotal due: *" . money($tot) . "*";
    }
    $pays = $sb->from('payments')->select('amount,payment_date,method,receipt_number,invoice_id')
        ->eq('school_id', $sid)->eq('status', 'completed')->order('payment_date', false)->limit(50)->execute()['data'] ?? [];
    $invIds = array_column($sb->from('invoices')->select('id')->eq('school_id', $sid)->eq('student_id', $stu['id'])->limit(200)->execute()['data'] ?? [], 'id');
    $mine = array_values(array_filter($pays, fn($p) => in_array($p['invoice_id'], $invIds, true)));
    if ($mine) {
        $t .= "\n\n*Recent payments*";
        foreach (array_slice($mine, 0, 5) as $p) {
            $t .= "\n" . date('j M Y', strtotime((string)$p['payment_date'])) . " — " . money((float)$p['amount'])
                . (!empty($p['receipt_number']) ? " (" . $p['receipt_number'] . ")" : '');
        }
    }
    whatsappSendFreeText($phone, $t);
}

/** Fire the M-Pesa prompt and tell the parent what to expect. */
function whatsappBotStkPush(Supabase $sb, string $schoolId, string $phone, array $stu, array $inv, float $amount, int $openCount): void
{
    $mpesa = new MpesaApi();
    if (!$mpesa->isConfigured()) {
        whatsappSendFreeText($phone, "M-Pesa payments from WhatsApp aren't switched on at this school yet. Please pay through the school's usual channels, or contact the office.");
        return;
    }
    $amount = round($amount, 2);
    if ($amount < 1) { whatsappSendFreeText($phone, "The amount must be at least KES 1."); return; }
    $ref = $inv['reference'] ?? ('INV-' . substr((string)$inv['id'], 0, 8));
    $r = $mpesa->stkPush($phone, $amount, $ref, 'School Fees');
    if (empty($r['success'])) {
        whatsappLogMessage($phone, 'out', 'error', ['stk' => $r['error'] ?? 'failed']);
        whatsappSendFreeText($phone, "I couldn't send the M-Pesa prompt just now (" . ($r['error'] ?? 'M-Pesa error') . "). Please try again in a moment.");
        return;
    }
    $sb->from('mpesa_stk_requests')->insert([
        'school_id' => $schoolId, 'invoice_id' => $inv['id'], 'phone' => $phone, 'amount' => $amount,
        'checkout_request_id' => $r['checkout_id'] ?? '', 'merchant_request_id' => $r['merchant_request'] ?? '',
        'status' => 'pending', 'source' => 'whatsapp', 'wa_phone' => $phone,
    ]);
    auditLog('mpesa_stk_push', 'invoice', $inv['id'], ['phone' => $phone, 'amount' => $amount, 'source' => 'whatsapp', 'checkout_id' => $r['checkout_id'] ?? '']);
    $t = "📲 Check your phone — an M-Pesa prompt for *" . money($amount) . "* (" . $ref . ", " . whatsappBotName($stu) . ") has been sent. Enter your M-Pesa PIN to complete it.\n\nI'll confirm here as soon as it goes through.";
    if ($openCount > 1) $t .= "\n\nThis pays the oldest invoice first; " . ($openCount - 1) . " more remain. Reply *hi* afterwards to pay the next.";
    whatsappSendFreeText($phone, $t);
}
