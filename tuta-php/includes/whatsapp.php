<?php
/**
 * WhatsApp seam — send report cards (and other documents) to parents via
 * Meta's WhatsApp Cloud API.
 *
 * Business-INITIATED messages must use a pre-approved TEMPLATE. Report cards
 * use a template with a DOCUMENT header (the PDF) plus optional body-text
 * variables (e.g. student name, term). Nothing sends until Meta approves the
 * template on your WhatsApp Business account.
 *
 * Config lives in school_settings (Settings → WhatsApp):
 *   wa_enabled      '1' to turn on
 *   wa_token        permanent access token (Meta System-User token)
 *   wa_phone_id     WhatsApp phone-number ID (the ID, NOT the phone number)
 *   wa_template     approved template name (e.g. 'report_card_ready')
 *   wa_lang         template language code (default 'en')
 *   wa_api_version  Graph API version (default 'v21.0')
 *
 * Provider-agnostic by design (mirrors includes/sms.php): today it targets the
 * Meta Cloud API; a school could later point at a BSP that speaks the same shape.
 */

/** Normalise a Kenyan number to 2547XXXXXXXX. Reuses the SMS normaliser. */
function whatsappNormalizePhone(string $raw): string
{
    if (function_exists('smsNormalizePhone')) return smsNormalizePhone($raw);
    $d = preg_replace('/[^0-9]/', '', $raw);
    if ($d === '') return '';
    if (strpos($d, '254') === 0 && strlen($d) === 12) return $d;
    if ((strpos($d, '07') === 0 || strpos($d, '01') === 0) && strlen($d) === 10) return '254' . substr($d, 1);
    if ((strpos($d, '7') === 0 || strpos($d, '1') === 0) && strlen($d) === 9) return '254' . $d;
    return '';
}

/** True if WhatsApp is configured enough to send. */
function whatsappConfigured(): bool
{
    if (schoolSetting('wa_enabled', '0') !== '1') return false;
    foreach (['wa_token', 'wa_phone_id', 'wa_template'] as $k) {
        if (trim((string)schoolSetting($k, '')) === '') return false;
    }
    return true;
}

/**
 * Send ONE templated document message (e.g. a report-card PDF) to one parent.
 * $pdfUrl must be a PUBLICLY reachable URL — Meta fetches the file from it.
 * $bodyParams are the ordered text variables the template body expects
 * (e.g. [studentName, term]); pass [] if the template has no body variables.
 *
 * Returns ['ok' => bool, 'error' => string|null, 'id' => string|null].
 */
function whatsappSendDocument(string $phone, string $pdfUrl, string $filename, array $bodyParams = []): array
{
    if (!whatsappConfigured()) {
        return ['ok' => false, 'error' => 'WhatsApp is not configured (Settings → WhatsApp).', 'id' => null];
    }
    $to = whatsappNormalizePhone($phone);
    if ($to === '') return ['ok' => false, 'error' => 'Invalid phone number.', 'id' => null];

    $token    = trim((string)schoolSetting('wa_token', ''));
    $phoneId  = trim((string)schoolSetting('wa_phone_id', ''));
    $template = trim((string)schoolSetting('wa_template', ''));
    $lang     = trim((string)schoolSetting('wa_lang', 'en')) ?: 'en';
    $ver      = trim((string)schoolSetting('wa_api_version', 'v21.0')) ?: 'v21.0';

    $components = [[
        'type'       => 'header',
        'parameters' => [[
            'type'     => 'document',
            'document' => ['link' => $pdfUrl, 'filename' => $filename],
        ]],
    ]];
    if (!empty($bodyParams)) {
        $components[] = [
            'type'       => 'body',
            'parameters' => array_map(fn($t) => ['type' => 'text', 'text' => (string)$t], $bodyParams),
        ];
    }

    $payload = [
        'messaging_product' => 'whatsapp',
        'to'                => $to,
        'type'              => 'template',
        'template'          => [
            'name'       => $template,
            'language'   => ['code' => $lang],
            'components' => $components,
        ],
    ];

    $url = 'https://graph.facebook.com/' . $ver . '/' . rawurlencode($phoneId) . '/messages';
    [$code, $resp] = whatsappHttp('POST', $url, json_encode($payload), [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
    ]);
    $json = json_decode($resp, true);
    if ($code >= 200 && $code < 300 && !empty($json['messages'][0]['id'])) {
        return ['ok' => true, 'error' => null, 'id' => $json['messages'][0]['id']];
    }
    $err = $json['error']['message'] ?? ('HTTP ' . $code . ': ' . substr((string)$resp, 0, 200));
    return ['ok' => false, 'error' => $err, 'id' => null];
}

/**
 * Send ONE templated TEXT message (no document header) — e.g. a fee reminder.
 * $bodyParams are the ordered {{1}}, {{2}} … variables the approved template
 * expects. Returns ['ok' => bool, 'error' => string|null, 'id' => string|null].
 */
function whatsappSendText(string $phone, array $bodyParams = [], ?string $templateName = null): array
{
    if (!whatsappConfigured()) {
        return ['ok' => false, 'error' => 'WhatsApp is not configured (Settings → WhatsApp).', 'id' => null];
    }
    $to = whatsappNormalizePhone($phone);
    if ($to === '') return ['ok' => false, 'error' => 'Invalid phone number.', 'id' => null];

    $token   = trim((string)schoolSetting('wa_token', ''));
    $phoneId = trim((string)schoolSetting('wa_phone_id', ''));
    $tpl     = $templateName ?: trim((string)schoolSetting('wa_template', ''));
    $lang    = trim((string)schoolSetting('wa_lang', 'en')) ?: 'en';
    $ver     = trim((string)schoolSetting('wa_api_version', 'v21.0')) ?: 'v21.0';

    $template = ['name' => $tpl, 'language' => ['code' => $lang]];
    if (!empty($bodyParams)) {
        $template['components'] = [[
            'type'       => 'body',
            'parameters' => array_map(fn($t) => ['type' => 'text', 'text' => (string)$t], $bodyParams),
        ]];
    }

    $url = 'https://graph.facebook.com/' . $ver . '/' . rawurlencode($phoneId) . '/messages';
    [$code, $resp] = whatsappHttp('POST', $url, json_encode([
        'messaging_product' => 'whatsapp',
        'to'                => $to,
        'type'              => 'template',
        'template'          => $template,
    ]), [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
    ]);

    $json = json_decode($resp, true);
    if ($code >= 200 && $code < 300 && !empty($json['messages'][0]['id'])) {
        return ['ok' => true, 'error' => null, 'id' => $json['messages'][0]['id']];
    }
    return ['ok' => false, 'error' => whatsappError($json, $code, (string)$resp), 'id' => null];
}

/**
 * List the message templates on the school's WhatsApp Business Account, so
 * the settings tab can show what is actually approved (name, language,
 * status) instead of guessing. Needs wa_waba_id + wa_token.
 * Returns ['ok'=>bool, 'error'=>string|null, 'templates'=>[[name,language,status,category,variables], …]].
 */
function whatsappListTemplates(): array
{
    $token = trim((string)schoolSetting('wa_token', ''));
    $waba  = trim((string)schoolSetting('wa_waba_id', ''));
    $ver   = trim((string)schoolSetting('wa_api_version', 'v21.0')) ?: 'v21.0';
    if ($token === '' || $waba === '') {
        return ['ok' => false, 'error' => 'Enter the WhatsApp Business Account ID and token, then save.', 'templates' => []];
    }
    $url = 'https://graph.facebook.com/' . $ver . '/' . rawurlencode($waba)
         . '/message_templates?fields=name,language,status,category,components,rejected_reason&limit=100';
    [$code, $resp] = whatsappHttp('GET', $url, null, ['Authorization: Bearer ' . $token]);
    $json = json_decode($resp, true);
    if ($code < 200 || $code >= 300 || !is_array($json) || !isset($json['data'])) {
        return ['ok' => false, 'error' => whatsappError($json, $code, (string)$resp), 'templates' => []];
    }
    $out = [];
    foreach ($json['data'] as $t) {
        // How many {{n}} slots the body expects — what wa_reminder_params must match.
        $vars = 0;
        foreach (($t['components'] ?? []) as $c) {
            if (($c['type'] ?? '') === 'BODY') $vars = preg_match_all('/\{\{\d+\}\}/', (string)($c['text'] ?? ''));
        }
        $out[] = [
            'name'      => (string)($t['name'] ?? ''),
            'language'  => (string)($t['language'] ?? ''),
            'status'    => (string)($t['status'] ?? ''),
            'category'  => (string)($t['category'] ?? ''),
            'variables' => (int)$vars,
            'reason'    => (string)($t['rejected_reason'] ?? ''),
        ];
    }
    usort($out, fn($a, $b) => [$a['status'] !== 'APPROVED', $a['name']] <=> [$b['status'] !== 'APPROVED', $b['name']]);
    return ['ok' => true, 'error' => null, 'templates' => $out];
}

/**
 * Submit a message template to Meta for approval on the school's WABA.
 * $body uses {{1}}..{{n}}; $examples gives one sample value per slot (Meta
 * requires them for review). Returns ['ok', 'error', 'id', 'status'].
 */
function whatsappCreateTemplate(string $name, string $language, string $category, string $body, array $examples): array
{
    $token = trim((string)schoolSetting('wa_token', ''));
    $waba  = trim((string)schoolSetting('wa_waba_id', ''));
    $ver   = trim((string)schoolSetting('wa_api_version', 'v21.0')) ?: 'v21.0';
    if ($token === '' || $waba === '') {
        return ['ok' => false, 'error' => 'Enter the WhatsApp Business Account ID and token, then save.', 'id' => null, 'status' => null];
    }
    $component = ['type' => 'BODY', 'text' => $body];
    if ($examples) $component['example'] = ['body_text' => [array_values(array_map('strval', $examples))]];
    $url = 'https://graph.facebook.com/' . $ver . '/' . rawurlencode($waba) . '/message_templates';
    [$code, $resp] = whatsappHttp('POST', $url, json_encode([
        'name'       => $name,
        'language'   => $language,
        'category'   => $category,
        'components' => [$component],
    ]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
    $json = json_decode($resp, true);
    if ($code >= 200 && $code < 300 && !empty($json['id'])) {
        return ['ok' => true, 'error' => null, 'id' => $json['id'], 'status' => $json['status'] ?? 'PENDING'];
    }
    return ['ok' => false, 'error' => whatsappError($json, $code, (string)$resp), 'id' => null, 'status' => null];
}

/**
 * Delete a template (every language of that name) from the school's WABA.
 * Used to clear a rejected attempt so the same name can be resubmitted.
 */
function whatsappDeleteTemplate(string $name): array
{
    $token = trim((string)schoolSetting('wa_token', ''));
    $waba  = trim((string)schoolSetting('wa_waba_id', ''));
    $ver   = trim((string)schoolSetting('wa_api_version', 'v21.0')) ?: 'v21.0';
    if ($token === '' || $waba === '' || trim($name) === '') {
        return ['ok' => false, 'error' => 'WABA ID, token and template name are required.'];
    }
    $url = 'https://graph.facebook.com/' . $ver . '/' . rawurlencode($waba) . '/message_templates?name=' . rawurlencode(trim($name));
    [$code, $resp] = whatsappHttp('DELETE', $url, null, ['Authorization: Bearer ' . $token]);
    $json = json_decode($resp, true);
    if ($code >= 200 && $code < 300 && !empty($json['success'])) return ['ok' => true, 'error' => null];
    return ['ok' => false, 'error' => whatsappError($json, $code, (string)$resp)];
}

/**
 * Tuta's standard fee-reminder template: the drafted reminder, slot by slot,
 * with enough fixed wording for Meta's review to accept it as UTILITY.
 * Slot order matches wa_reminder_params = guardian, school, student, balance, days.
 */
function whatsappStandardReminderTemplate(): array
{
    // Dated name: Meta holds a deleted template's name for up to 30 days, so a
    // fixed name can be refused after a rejected attempt is cleared. The date
    // makes every submission unique; settings pick up whichever name was used.
    return [
        'name'     => 'tuta_fee_reminder_' . date('ymd'),
        'language' => 'en_US',
        'category' => 'UTILITY',
        'body'     => 'Dear {{1}}, a kind reminder from {{2}}: the fee balance for {{3}} is {{4}}, now {{5}} days overdue. '
                    . 'Kindly clear it at your earliest convenience. For any query, contact the school office. Thank you.',
        'examples' => ['Jane Wanjiru', 'Utawala Springs Academy', 'Brian Wanjiru', 'KES 12,500', '14'],
        'params'   => 'guardian, school, student, balance, days',
    ];
}

/* ═══════════════════════════════════════════════════════════════════
 * Two-way: free-form and interactive messages (inside the 24-hour window
 * a parent opens by messaging first), webhook helpers, and a message log.
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Put the request into a school's context when there is no logged-in user
 * (webhooks, callbacks), so schoolSetting() and friends resolve for it.
 */
function whatsappSchoolContext(string $schoolId): void
{
    initSession();
    $_SESSION['school_id'] = $schoolId;
}

/** Low-level: POST one message object to the school's number. */
function whatsappPostMessage(array $message, string $kind = 'text'): array
{
    $token   = trim((string)schoolSetting('wa_token', ''));
    $phoneId = trim((string)schoolSetting('wa_phone_id', ''));
    $ver     = trim((string)schoolSetting('wa_api_version', 'v21.0')) ?: 'v21.0';
    if ($token === '' || $phoneId === '') return ['ok' => false, 'error' => 'WhatsApp is not configured.', 'id' => null];
    $message = ['messaging_product' => 'whatsapp'] + $message;
    $url = 'https://graph.facebook.com/' . $ver . '/' . rawurlencode($phoneId) . '/messages';
    [$code, $resp] = whatsappHttp('POST', $url, json_encode($message),
        ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
    $json = json_decode($resp, true);
    $ok = $code >= 200 && $code < 300 && !empty($json['messages'][0]['id']);
    $id = $ok ? $json['messages'][0]['id'] : null;
    $err = $ok ? null : whatsappError($json, $code, (string)$resp);
    whatsappLogMessage((string)($message['to'] ?? ''), 'out', $ok ? $kind : 'error',
        $ok ? $message : ['sent' => $message, 'error' => $err], $id);
    return ['ok' => $ok, 'error' => $err, 'id' => $id];
}

/** Plain text — only deliverable inside the 24-hour service window. */
function whatsappSendFreeText(string $phone, string $text): array
{
    $to = whatsappNormalizePhone($phone);
    if ($to === '') return ['ok' => false, 'error' => 'Invalid phone number.', 'id' => null];
    return whatsappPostMessage(['to' => $to, 'type' => 'text', 'text' => ['preview_url' => false, 'body' => mb_substr($text, 0, 4000)]], 'text');
}

/** Up to three reply buttons. $buttons = ['id' => 'Title (≤20 chars)', …]. */
function whatsappSendButtons(string $phone, string $body, array $buttons, ?string $footer = null): array
{
    $to = whatsappNormalizePhone($phone);
    if ($to === '') return ['ok' => false, 'error' => 'Invalid phone number.', 'id' => null];
    $btns = [];
    foreach (array_slice($buttons, 0, 3, true) as $id => $title) {
        $btns[] = ['type' => 'reply', 'reply' => ['id' => mb_substr((string)$id, 0, 256), 'title' => mb_substr((string)$title, 0, 20)]];
    }
    $interactive = ['type' => 'button', 'body' => ['text' => mb_substr($body, 0, 1024)], 'action' => ['buttons' => $btns]];
    if ($footer !== null && $footer !== '') $interactive['footer'] = ['text' => mb_substr($footer, 0, 60)];
    return whatsappPostMessage(['to' => $to, 'type' => 'interactive', 'interactive' => $interactive], 'interactive');
}

/** A list picker (up to 10 rows). $rows = [['id'=>, 'title'=> (≤24), 'description'=> (≤72)], …]. */
function whatsappSendList(string $phone, string $body, string $buttonText, string $sectionTitle, array $rows): array
{
    $to = whatsappNormalizePhone($phone);
    if ($to === '') return ['ok' => false, 'error' => 'Invalid phone number.', 'id' => null];
    $r = [];
    foreach (array_slice($rows, 0, 10) as $row) {
        $item = ['id' => mb_substr((string)$row['id'], 0, 200), 'title' => mb_substr((string)$row['title'], 0, 24)];
        if (!empty($row['description'])) $item['description'] = mb_substr((string)$row['description'], 0, 72);
        $r[] = $item;
    }
    $interactive = [
        'type'   => 'list',
        'body'   => ['text' => mb_substr($body, 0, 1024)],
        'action' => ['button' => mb_substr($buttonText, 0, 20), 'sections' => [['title' => mb_substr($sectionTitle, 0, 24), 'rows' => $r]]],
    ];
    return whatsappPostMessage(['to' => $to, 'type' => 'interactive', 'interactive' => $interactive], 'interactive');
}

/** Blue ticks: mark an inbound message as read. */
function whatsappMarkRead(string $messageId): void
{
    $token   = trim((string)schoolSetting('wa_token', ''));
    $phoneId = trim((string)schoolSetting('wa_phone_id', ''));
    $ver     = trim((string)schoolSetting('wa_api_version', 'v21.0')) ?: 'v21.0';
    if ($token === '' || $phoneId === '' || $messageId === '') return;
    whatsappHttp('POST', 'https://graph.facebook.com/' . $ver . '/' . rawurlencode($phoneId) . '/messages',
        json_encode(['messaging_product' => 'whatsapp', 'status' => 'read', 'message_id' => $messageId]),
        ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
}

/**
 * Check Meta's X-Hub-Signature-256 against the app secret. Returns true when
 * valid, or when no secret is configured (so a school can go live before
 * pasting it — but the settings tab nags until they do).
 */
function whatsappVerifySignature(string $rawBody, string $header, string $appSecret): bool
{
    if ($appSecret === '') return true;
    if (strpos($header, 'sha256=') !== 0) return false;
    $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $appSecret);
    return hash_equals($expected, $header);
}

/** Append to the message log. Never throws; logging must not break sending. */
function whatsappLogMessage(string $phone, string $direction, string $kind, $body, ?string $waMessageId = null): void
{
    try {
        $sid = schoolId();
        if ($sid === '') return;
        if (is_array($body)) {
            // Keep the log readable: drop the token-bearing bits and long blobs.
            unset($body['messaging_product']);
            $body = json_decode(mb_substr(json_encode($body), 0, 4000), true) ?: ['truncated' => true];
        }
        (new Supabase())->from('wa_messages')->insert([
            'school_id' => $sid, 'phone' => $phone, 'direction' => $direction,
            'kind' => $kind, 'body' => $body, 'wa_message_id' => $waMessageId,
        ]);
    } catch (\Throwable $e) {}
}

/** Turn a Meta Graph error into something an administrator can act on. */
function whatsappError(?array $json, int $code, string $raw): string
{
    $err  = $json['error'] ?? null;
    $msg  = $err['message'] ?? '';
    // Meta puts the human-readable reason in error_user_msg (template
    // management) or error_data.details (messaging). Prefer those.
    $sub  = $err['error_user_msg'] ?? ($err['error_data']['details'] ?? '');
    if (!empty($err['error_user_title']) && $sub !== '') $sub = $err['error_user_title'] . ': ' . $sub;
    $ecod = (int)($err['code'] ?? 0);

    $hints = [
        190 => 'The access token is invalid or expired — generate a new permanent token in Meta.',
        131  => 'Template problem — check the template name, language and that Meta has approved it.',
        132  => 'Template name or language does not match an approved template.',
        100  => 'Bad request — usually a wrong Phone Number ID or template name.',
        131047 => 'Cannot message this number outside the 24-hour window without an approved template.',
        131026 => 'That number is not on WhatsApp, or cannot receive messages.',
        133010 => 'The phone number is not registered on this WhatsApp Business account.',
    ];
    $hint = $hints[$ecod] ?? null;

    $out = $msg !== '' ? $msg : ('HTTP ' . $code . ': ' . substr($raw, 0, 160));
    if ($sub !== '')  $out .= ' — ' . $sub;
    if ($hint)        $out .= ' (' . $hint . ')';
    return $out;
}

/** Minimal cURL wrapper. Returns [httpCode, responseBody]. */
function whatsappHttp(string $method, string $url, ?string $body, array $headers): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, (string)$resp];
}
