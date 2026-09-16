<?php
/**
 * SMS seam — provider-agnostic bulk SMS sending.
 *
 * Config lives in school_settings (Settings → SMS):
 *   sms_enabled     '1' to turn on
 *   sms_provider    'textsms' | 'africastalking' | 'generic'
 *   sms_api_key     provider API key
 *   sms_partner_id  TextSMS partner ID
 *   sms_username    Africa's Talking username (use 'sandbox' to test)
 *   sms_sender_id   branded sender name / short code (TextSMS: required)
 *   sms_generic_url generic mode: URL template with {to} {message} {apikey} {sender}
 *   sms_generic_method  'GET' | 'POST'
 *
 * TextSMS (textsms.co.ke) is the Kenyan default; Africa's Talking is the
 * regional alternative; 'generic' lets a school point at any other aggregator
 * by pasting a URL template.
 */

/** Normalise a Kenyan number to 2547XXXXXXXX / 2541XXXXXXXX. Returns '' if unusable. */
function smsNormalizePhone(string $raw): string
{
    $d = preg_replace('/[^0-9]/', '', $raw);
    if ($d === '') return '';
    if (strpos($d, '254') === 0 && strlen($d) === 12) return $d;          // 2547XXXXXXXX
    if ((strpos($d, '07') === 0 || strpos($d, '01') === 0) && strlen($d) === 10) return '254' . substr($d, 1);
    if ((strpos($d, '7') === 0 || strpos($d, '1') === 0) && strlen($d) === 9) return '254' . $d;
    if (strpos($d, '2540') === 0 && strlen($d) === 13) return '254' . substr($d, 4); // stray 0 after 254
    return '';
}

/** True if SMS is configured enough to send. */
function smsConfigured(): bool
{
    if (schoolSetting('sms_enabled', '0') !== '1') return false;
    if (trim((string)schoolSetting('sms_api_key', '')) === '') return false;
    $provider = schoolSetting('sms_provider', 'textsms');
    if ($provider === 'textsms') {
        return trim((string)schoolSetting('sms_partner_id', '')) !== ''
            && trim((string)schoolSetting('sms_sender_id', '')) !== '';
    }
    if ($provider === 'africastalking') return trim((string)schoolSetting('sms_username', '')) !== '';
    if ($provider === 'generic')        return trim((string)schoolSetting('sms_generic_url', '')) !== '';
    return false;
}

/**
 * Send one message to many numbers. Returns
 *   ['sent' => int, 'failed' => int, 'invalid' => int, 'error' => string|null]
 * Best-effort: normalises + de-dupes recipients first.
 */
function smsSend(array $phones, string $message): array
{
    $out = ['sent' => 0, 'failed' => 0, 'invalid' => 0, 'error' => null];
    if (trim($message) === '') { $out['error'] = 'Empty message'; return $out; }
    if (!smsConfigured())      { $out['error'] = 'SMS is not configured. Set it up in Settings → SMS.'; return $out; }

    $norm = [];
    foreach ($phones as $p) {
        $n = smsNormalizePhone((string)$p);
        if ($n === '') { $out['invalid']++; continue; }
        $norm[$n] = true;  // de-dupe
    }
    $recipients = array_keys($norm);
    if (empty($recipients)) { $out['error'] = 'No valid phone numbers.'; return $out; }

    $provider = schoolSetting('sms_provider', 'textsms');
    $apiKey   = trim((string)schoolSetting('sms_api_key', ''));
    $sender   = trim((string)schoolSetting('sms_sender_id', ''));

    if ($provider === 'textsms') {
        // textsms.co.ke — JSON bulk endpoint, max 20 messages per call.
        // Their bulk endpoint sometimes 500s ("Trying to access array offset on
        // value of type bool") when it can't resolve the account/sender; in that
        // case we fall back to their single-send endpoint, which is more robust
        // and returns a usable error code.
        $partnerId = trim((string)schoolSetting('sms_partner_id', ''));
        $errors    = [];
        foreach (array_chunk($recipients, 20) as $chunk) {
            $list = [];
            foreach ($chunk as $i => $n) {
                $list[] = [
                    'partnerID'   => $partnerId,
                    'apikey'      => $apiKey,
                    'pass_type'   => 'plain',
                    'clientsmsid' => (int)(time() . '') + $i,   // our reference per message
                    'mobile'      => $n,
                    'message'     => $message,
                    'shortcode'   => $sender,
                ];
            }
            [$code, $resp] = smsHttp('POST', 'https://sms.textsms.co.ke/api/services/sendbulk/',
                json_encode(['count' => count($list), 'smslist' => $list]),
                ['Content-Type: application/json', 'Accept: application/json']);

            $json = json_decode($resp, true);
            $rows = $json['responses'] ?? null;

            if ($code >= 200 && $code < 300 && is_array($rows)) {
                foreach ($rows as $r) {
                    // Their API spells the key 'respose-code' (sic) — accept both.
                    $rc = (int)($r['respose-code'] ?? $r['response-code'] ?? 0);
                    if ($rc === 200) {
                        $out['sent']++;
                    } else {
                        $out['failed']++;
                        $errors[smsTextsmsError($rc, (string)($r['response-description'] ?? ''))] = true;
                    }
                }
                continue;
            }

            // Bulk failed — retry this chunk one-by-one on the single endpoint.
            foreach ($chunk as $n) {
                [$c2, $r2] = smsHttp('POST', 'https://sms.textsms.co.ke/api/services/sendsms/',
                    json_encode([
                        'apikey'    => $apiKey,
                        'partnerID' => $partnerId,
                        'message'   => $message,
                        'shortcode' => $sender,
                        'mobile'    => $n,
                    ]),
                    ['Content-Type: application/json', 'Accept: application/json']);
                $j2 = json_decode($r2, true);
                $one = $j2['responses'][0] ?? $j2;
                $rc2 = (int)($one['respose-code'] ?? $one['response-code'] ?? 0);
                if ($c2 >= 200 && $c2 < 300 && $rc2 === 200) {
                    $out['sent']++;
                } else {
                    $out['failed']++;
                    if ($rc2 > 0) {
                        $errors[smsTextsmsError($rc2, (string)($one['response-description'] ?? ''))] = true;
                    } else {
                        $errors['Provider error (HTTP ' . $c2 . '): ' . substr(strip_tags((string)$r2), 0, 140)] = true;
                    }
                }
            }
        }
        if ($errors) $out['error'] = implode(' · ', array_slice(array_keys($errors), 0, 3));
        return $out;
    }

    if ($provider === 'africastalking') {
        $username = trim((string)schoolSetting('sms_username', ''));
        $base = ($username === 'sandbox')
            ? 'https://api.sandbox.africastalking.com/version1/messaging'
            : 'https://api.africastalking.com/version1/messaging';
        // AT wants +2547... format.
        $to = implode(',', array_map(fn($n) => '+' . $n, $recipients));
        $body = ['username' => $username, 'to' => $to, 'message' => $message];
        if ($sender !== '') $body['from'] = $sender;
        [$code, $resp] = smsHttp('POST', $base, http_build_query($body), [
            'apiKey: ' . $apiKey,
            'Content-Type: application/x-www-form-urlencoded',
            'Accept: application/json',
        ]);
        $json = json_decode($resp, true);
        $recs = $json['SMSMessageData']['Recipients'] ?? null;
        if ($code >= 200 && $code < 300 && is_array($recs)) {
            foreach ($recs as $r) {
                if (($r['status'] ?? '') === 'Success') $out['sent']++; else $out['failed']++;
            }
        } else {
            $out['failed'] += count($recipients);
            $out['error'] = 'Provider error (HTTP ' . $code . '): ' . substr((string)$resp, 0, 200);
        }
        return $out;
    }

    // Generic: one request per recipient, substituting placeholders.
    $tpl    = trim((string)schoolSetting('sms_generic_url', ''));
    $method = strtoupper(schoolSetting('sms_generic_method', 'GET')) === 'POST' ? 'POST' : 'GET';
    foreach ($recipients as $n) {
        $url = strtr($tpl, [
            '{to}'      => rawurlencode($n),
            '{message}' => rawurlencode($message),
            '{apikey}'  => rawurlencode($apiKey),
            '{sender}'  => rawurlencode($sender),
        ]);
        if ($method === 'POST') {
            $q = parse_url($url, PHP_URL_QUERY) ?: '';
            $u = strtok($url, '?');
            [$code] = smsHttp('POST', $u, $q, ['Content-Type: application/x-www-form-urlencoded']);
        } else {
            [$code] = smsHttp('GET', $url, null, []);
        }
        if ($code >= 200 && $code < 300) $out['sent']++; else $out['failed']++;
    }
    return $out;
}

/**
 * Send personalised messages — a different body per recipient.
 * $items = [['phone' => '07…', 'message' => '…'], …]
 * Groups identical messages so recipients who share wording still go out in
 * one bulk call. Returns the same shape as smsSend().
 */
function smsSendEach(array $items): array
{
    $out = ['sent' => 0, 'failed' => 0, 'invalid' => 0, 'error' => null];
    $byMessage = [];
    foreach ($items as $it) {
        $msg = trim((string)($it['message'] ?? ''));
        $ph  = trim((string)($it['phone'] ?? ''));
        if ($msg === '' || $ph === '') continue;
        $byMessage[$msg][] = $ph;
    }
    if (!$byMessage) { $out['error'] = 'Nothing to send.'; return $out; }

    $errors = [];
    foreach ($byMessage as $msg => $phones) {
        $r = smsSend($phones, $msg);
        $out['sent']    += $r['sent'];
        $out['failed']  += $r['failed'];
        $out['invalid'] += $r['invalid'];
        if (!empty($r['error'])) $errors[$r['error']] = true;
    }
    if ($errors) $out['error'] = implode(' · ', array_slice(array_keys($errors), 0, 3));
    return $out;
}

/** Turn a TextSMS response code into something a bursar can act on. */
function smsTextsmsError(int $code, string $desc): string
{
    $known = [
        1001 => 'Invalid sender ID — it must be approved by TextSMS for this account',
        1002 => 'Network not allowed',
        1003 => 'Invalid mobile number',
        1004 => 'Low bulk credits — top up the TextSMS account',
        1005 => 'Provider system error, try again',
        1006 => 'Invalid credentials — check the API key and Partner ID',
        1007 => 'Failed to send, try again later',
        1008 => 'No delivery report',
        1009 => 'Unsupported data type',
        1010 => 'Unsupported message type',
        4090 => 'Internal error, try again later',
        4091 => 'No Partner ID set',
        4092 => 'No API key provided',
    ];
    if (isset($known[$code])) return $code . ': ' . $known[$code];
    return $code . ': ' . ($desc !== '' ? $desc : 'Unknown provider error');
}

/** Minimal cURL wrapper. Returns [httpCode, responseBody]. */
function smsHttp(string $method, string $url, ?string $body, array $headers): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, (string)$resp];
}
