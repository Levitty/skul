<?php
/**
 * WhatsApp webhook — Meta calls this. PUBLIC (no login).
 *
 *   GET  ?route=api/whatsapp/webhook   Meta's one-time verification handshake
 *   POST ?route=api/whatsapp/webhook   inbound messages + delivery statuses
 *
 * One Meta app serves every school: each event carries the phone_number_id
 * it arrived on, and that maps to a school through its saved wa_phone_id.
 * The parent assistant (includes/whatsapp-bot.php) does the talking.
 *
 * Meta must get a 200 quickly or it retries; we answer first and log the
 * rest. The signature check uses the app secret from the school's settings.
 */
require_once __DIR__ . '/../../includes/whatsapp.php';
require_once __DIR__ . '/../../includes/whatsapp-bot.php';

$sb = new Supabase();

// ── Verification handshake ────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $mode  = (string)($_GET['hub_mode'] ?? $_GET['hub.mode'] ?? '');
    $token = (string)($_GET['hub_verify_token'] ?? $_GET['hub.verify_token'] ?? '');
    $chal  = (string)($_GET['hub_challenge'] ?? $_GET['hub.challenge'] ?? '');
    $ok = false;
    if ($mode === 'subscribe' && $token !== '') {
        $hit = $sb->from('school_settings')->select('school_id')->eq('key', 'wa_verify_token')->eq('value', $token)->limit(1)->execute()['data'] ?? [];
        $ok = !empty($hit);
    }
    if ($ok) { http_response_code(200); header('Content-Type: text/plain'); echo $chal; }
    else     { http_response_code(403); echo 'Verification failed'; }
    exit;
}

// ── Events ────────────────────────────────────────────────────────
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
http_response_code(200);
header('Content-Type: application/json');
echo json_encode(['ok' => true]);
// Keep going after the response so Meta doesn't retry while we work.
if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
@ignore_user_abort(true);

if (!is_array($data) || ($data['object'] ?? '') !== 'whatsapp_business_account') exit;

$logDir = __DIR__ . '/../../logs';
if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
@file_put_contents($logDir . '/whatsapp_webhook_' . date('Y-m-d') . '.log', date('c') . ' | ' . mb_substr($raw, 0, 4000) . "\n", FILE_APPEND);

$sigHeader = (string)($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');

foreach (($data['entry'] ?? []) as $entry) {
    foreach (($entry['changes'] ?? []) as $change) {
        $value   = $change['value'] ?? [];
        $phoneId = (string)($value['metadata']['phone_number_id'] ?? '');
        if ($phoneId === '') continue;

        // Which school owns this number?
        $hit = $sb->from('school_settings')->select('school_id')->eq('key', 'wa_phone_id')->eq('value', $phoneId)->limit(1)->execute()['data'] ?? [];
        $schoolId = (string)($hit[0]['school_id'] ?? '');
        if ($schoolId === '') {
            @file_put_contents($logDir . '/whatsapp_unmatched_' . date('Y-m-d') . '.log', date('c') . " | phone_number_id=$phoneId\n", FILE_APPEND);
            continue;
        }
        whatsappSchoolContext($schoolId);

        // Authenticity: Meta signs the raw body with the app secret.
        $secret = trim((string)schoolSetting('wa_app_secret', ''));
        if (!whatsappVerifySignature($raw, $sigHeader, $secret)) {
            whatsappLogMessage('', 'in', 'error', ['bad_signature' => true, 'phone_number_id' => $phoneId]);
            continue;
        }
        if (schoolSetting('wa_bot_enabled', '1') !== '1') continue;

        // Delivery / read receipts — log, nothing to say back.
        foreach (($value['statuses'] ?? []) as $st) {
            whatsappLogMessage((string)($st['recipient_id'] ?? ''), 'in', 'status',
                ['status' => $st['status'] ?? '', 'errors' => $st['errors'] ?? null], (string)($st['id'] ?? ''));
        }

        // Messages from parents.
        foreach (($value['messages'] ?? []) as $msg) {
            try {
                whatsappBotHandle($msg, $schoolId);
            } catch (\Throwable $e) {
                whatsappLogMessage((string)($msg['from'] ?? ''), 'in', 'error', ['exception' => $e->getMessage()]);
                @file_put_contents($logDir . '/whatsapp_errors_' . date('Y-m-d') . '.log', date('c') . ' | ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine() . "\n", FILE_APPEND);
            }
        }
    }
}
