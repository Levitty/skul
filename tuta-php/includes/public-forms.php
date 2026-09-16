<?php
/**
 * Shared helpers for PUBLIC, unauthenticated forms (enquiry, admission).
 *
 * These pages run with no logged-in user, so they can't use schoolId() or
 * schoolSetting() (both depend on the session). Instead the school is passed
 * explicitly in the URL (?school=<uuid>) and validated here.
 *
 * Spam strategy is layered and intentionally invisible to real users:
 *   1. Honeypot   — a hidden field bots fill; humans never see it.
 *   2. Time-trap  — submissions faster than a few seconds are bots.
 *   3. Turnstile  — optional; only enforced if the school configured keys.
 *   4. Content    — links in a message bump the spam score (stored, not shown).
 */

/**
 * Read a setting for a specific school WITHOUT a session (public context).
 */
function publicSchoolSetting(Supabase $sb, string $schoolId, string $key, $default = null)
{
    $res = $sb->from('school_settings')->select('value')
        ->eq('school_id', $schoolId)->eq('key', $key)->single()->execute();
    $val = $res['data'][0]['value'] ?? null;
    return ($val === null || $val === '') ? $default : $val;
}

/**
 * Resolve + validate the school from ?school=<uuid>. Returns the school row
 * (id, name, logo_url) or null if missing / unknown / inactive.
 */
function publicResolveSchool(Supabase $sb): ?array
{
    $id = trim((string)($_GET['school'] ?? $_POST['school'] ?? ''));
    if ($id === '') return null;
    // Basic UUID shape guard before hitting the DB.
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) return null;

    $res = $sb->from('schools')->select('id,name,logo_url,is_active')->eq('id', $id)->single()->execute();
    $school = $res['data'][0] ?? null;
    if (!$school || !($school['is_active'] ?? false)) return null;
    return $school;
}

/**
 * Best-effort client IP (honours a single proxy hop).
 */
function publicClientIp(): string
{
    $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($xff !== '') {
        $first = trim(explode(',', $xff)[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) return $first;
    }
    $ra = $_SERVER['REMOTE_ADDR'] ?? '';
    return filter_var($ra, FILTER_VALIDATE_IP) ? $ra : '';
}

/**
 * Verify a Cloudflare Turnstile token. Returns true if Turnstile isn't
 * configured (so the feature works without it) OR the token is valid.
 */
/**
 * Verify a Cloudflare Turnstile token against a given secret. Returns true if
 * no secret is configured (feature off) OR the token is valid.
 */
function turnstileVerify(string $secret, string $token): bool
{
    if ($secret === '') return true; // not configured → don't block

    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'secret'   => $secret,
            'response' => $token,
            'remoteip' => publicClientIp(),
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    curl_close($ch);
    $data = json_decode($resp ?: '', true);
    return !empty($data['success']);
}

function publicTurnstilePass(Supabase $sb, string $schoolId, string $token): bool
{
    return turnstileVerify((string)publicSchoolSetting($sb, $schoolId, 'turnstile_secret', ''), $token);
}

/**
 * A signed hidden time-trap field. The timestamp is HMAC'd with a server-only
 * secret so a bot can't just echo a stale plausible timestamp — without a
 * valid signature the submission is treated as a bot. Render this in place of
 * a bare `<input name="form_ts">`.
 */
function publicFormTsField(): string
{
    $ts  = time();
    $sig = substr(hash_hmac('sha256', (string)$ts, SUPABASE_SERVICE_KEY), 0, 32);
    return '<input type="hidden" name="form_ts" value="' . $ts . '.' . $sig . '">';
}

/** Validate the signed time-trap value: signature matches AND age is sane. */
function publicFormTsValid($value, int $minSeconds = 3, int $maxSeconds = 7200): bool
{
    $parts = explode('.', (string)$value, 2);
    if (count($parts) !== 2) return false;
    [$ts, $sig] = $parts;
    if (!ctype_digit($ts)) return false;
    $expected = substr(hash_hmac('sha256', $ts, SUPABASE_SERVICE_KEY), 0, 32);
    if (!hash_equals($expected, $sig)) return false;            // forged/absent sig = bot
    $age = time() - (int)$ts;
    return $age >= $minSeconds && $age <= $maxSeconds;          // too fast / too old = bot
}

/**
 * Honeypot + signed time-trap. Returns true if the submission is a bot and
 * should be dropped outright (no DB write, no error shown — bots get a generic
 * "thanks"). $renderedTs must be the value produced by publicFormTsField().
 */
function publicIsBot(string $honeypotField, $renderedTs, int $minSeconds = 3): bool
{
    if (trim($honeypotField) !== '') return true;               // filled trap = bot
    if (!publicFormTsValid($renderedTs, $minSeconds)) return true;
    return false;
}

/**
 * Content heuristic → spam score. Links in a free-text message are the single
 * strongest signal of marketing spam on a school enquiry form.
 */
function publicSpamScore(string $message): int
{
    $score = 0;
    $links = preg_match_all('~https?://|www\.~i', $message);
    if ($links >= 1) $score += 50;
    if ($links >= 3) $score += 50;
    if (preg_match('~\b(seo|backlink|marketing|crypto|loan|casino|viagra)\b~i', $message)) $score += 50;
    return min(100, $score);
}
