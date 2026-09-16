<?php
/**
 * Tuta School — Email sender (SMTP).
 *
 * A small, self-contained SMTP client — no third-party library — matching the
 * app's vanilla-PHP approach (the Supabase client is hand-rolled the same way).
 *
 * Switch email on by filling in the SMTP_* constants in config.php. While they
 * are blank, mailEnabled() is false and the app falls back to copyable
 * invitation links — nothing breaks.
 *
 * Email is always BEST-EFFORT. Every send is wrapped so a failure returns an
 * error string instead of breaking the page. Callers must still expose the
 * invitation link as a fallback.
 */

/** True only when SMTP credentials are filled in. */
function mailEnabled(): bool
{
    return defined('SMTP_HOST') && SMTP_HOST !== ''
        && defined('SMTP_USER') && SMTP_USER !== ''
        && defined('SMTP_PASS') && SMTP_PASS !== '';
}

/**
 * Absolute invitation URL — must be absolute so it works inside an email.
 * Pass $base to point the link at a specific school's own domain; otherwise it
 * falls back to the platform APP_URL.
 */
function inviteUrl(string $token, string $base = ''): string
{
    $base = $base !== '' ? rtrim($base, '/')
          : ((defined('APP_URL') && APP_URL !== '') ? rtrim(APP_URL, '/') : '');
    return $base . '/invite?token=' . rawurlencode($token);
}

/** RFC 2047 encode a header value if it contains non-ASCII characters. */
function mailEncodeHeader(string $value): string
{
    if (preg_match('/[^\x20-\x7E]/', $value)) {
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }
    return $value;
}

/**
 * Per-school sender name shown in the inbox (e.g. "Crown of Gold School").
 * Source of truth is the active school's stored name; we fall back to a name
 * derived from the app's own domain (school.tutagora.com -> "Tutagora"), and
 * finally to "Tuta School". Tenant-scoped via cachedSchool().
 */
function schoolFromName(): string
{
    $school = function_exists('cachedSchool') ? cachedSchool() : null;
    $name = trim((string)($school['name'] ?? ''));
    if ($name !== '') return $name;

    $host = parse_url(defined('APP_URL') ? APP_URL : '', PHP_URL_HOST) ?: '';
    $host = preg_replace('/^(www|mgt|app|portal|school)\./i', '', $host);
    $label = explode('.', $host)[0] ?? '';
    return $label !== '' ? ucfirst($label) : 'Tuta School';
}

/**
 * Active school's logo as an absolute URL, or '' if none. Only http(s) URLs
 * render in an email client, so a storage path that isn't absolute is dropped.
 */
function schoolLogoUrl(): string
{
    $school = function_exists('cachedSchool') ? cachedSchool() : null;
    $u = trim((string)($school['logo_url'] ?? ''));
    return preg_match('~^https?://~i', $u) ? $u : '';
}

/**
 * The emerald header band for branded emails. Shows the school logo on a white
 * chip when one is set; otherwise the school name in white text.
 */
function emailHeaderBand(string $schoolName, string $logoUrl = ''): string
{
    $s = htmlspecialchars($schoolName !== '' ? $schoolName : 'Tuta School', ENT_QUOTES);
    if ($logoUrl !== '') {
        $u = htmlspecialchars($logoUrl, ENT_QUOTES);
        $inner = '<span style="display:inline-block;background:#ffffff;border-radius:8px;padding:6px 12px;">'
            . '<img src="' . $u . '" alt="' . $s . '" height="34" '
            . 'style="height:34px;max-height:34px;display:block;border:0;outline:none;text-decoration:none;"></span>';
    } else {
        $inner = '<span style="color:#ffffff;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">' . $s . '</span>';
    }
    return '<tr><td style="background:#059669;padding:18px 28px;">' . $inner . '</td></tr>';
}

/**
 * Read a (possibly multi-line) SMTP reply. A reply line is "NNN-text" when
 * more lines follow, or "NNN text" on the final line.
 */
function smtpRead($conn): string
{
    $data = '';
    while (($line = fgets($conn, 515)) !== false) {
        $data .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') break;
    }
    return $data;
}

/** Send one SMTP command; return [statusCode, rawReply]. */
function smtpCmd($conn, string $cmd): array
{
    fwrite($conn, $cmd . "\r\n");
    $raw = smtpRead($conn);
    return [(int)substr($raw, 0, 3), $raw];
}

/**
 * Low-level SMTP send.
 * $opts: to, subject, html, text
 * Returns ['ok' => bool, 'error' => string].
 */
/**
 * Send one email — preferred entry point. On shared hosting, raw SMTP sockets
 * can stall and tie up the PHP worker (hanging the whole page). When the
 * provider is Resend and the password is an API key (re_…), we send over the
 * HTTPS API instead (port 443 is never blocked, and it's fast). Otherwise we
 * fall back to SMTP. Returns ['ok' => bool, 'error' => string]. Never throws.
 */
function mailSend(array $opts): array
{
    if (defined('SMTP_HOST') && SMTP_HOST === 'smtp.resend.com'
        && defined('SMTP_PASS') && strncmp((string)SMTP_PASS, 're_', 3) === 0) {
        return resendApiSend($opts);
    }
    return smtpSend($opts);
}

/**
 * Send via the Resend HTTPS API (https://api.resend.com/emails). Fast, and not
 * subject to SMTP port blocking. Short timeouts so it can never hang the page.
 */
function resendApiSend(array $opts): array
{
    $key = defined('SMTP_PASS') ? (string)SMTP_PASS : '';
    if ($key === '') return ['ok' => false, 'error' => 'email is not configured'];

    $fromEmail = (defined('SMTP_FROM_EMAIL') && SMTP_FROM_EMAIL !== '') ? SMTP_FROM_EMAIL : '';
    if ($fromEmail === '') return ['ok' => false, 'error' => 'no sender address configured'];
    $fromName = trim((string)($opts['from_name'] ?? ''));
    if ($fromName === '') {
        $fromName = (defined('SMTP_FROM_NAME') && SMTP_FROM_NAME !== '') ? SMTP_FROM_NAME : 'Tuta School';
    }

    $to = trim($opts['to'] ?? '');
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'error' => 'invalid recipient address'];
    }
    $html = (string)($opts['html'] ?? '');
    $payload = [
        'from'    => $fromName . ' <' . $fromEmail . '>',
        'to'      => [$to],
        'subject' => (string)($opts['subject'] ?? ''),
        'html'    => $html,
        'text'    => (string)($opts['text'] ?? trim(strip_tags($html))),
    ];

    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_TIMEOUT        => 12,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);

    if ($cerr !== '')          return ['ok' => false, 'error' => 'mail service unreachable (' . $cerr . ')'];
    if ($code >= 200 && $code < 300) return ['ok' => true, 'error' => ''];

    $msg = '';
    $d = json_decode((string)$resp, true);
    if (is_array($d)) $msg = $d['message'] ?? ($d['error']['message'] ?? '');
    return ['ok' => false, 'error' => 'mail service error ' . $code . ($msg ? ': ' . $msg : '')];
}

function smtpSend(array $opts): array
{
    if (!mailEnabled()) {
        return ['ok' => false, 'error' => 'email is not configured'];
    }

    $host      = SMTP_HOST;
    $port      = (int)(defined('SMTP_PORT') ? SMTP_PORT : 465);
    $secure    = defined('SMTP_SECURE') ? strtolower(SMTP_SECURE) : 'ssl';
    $user      = SMTP_USER;
    $pass      = SMTP_PASS;
    $fromEmail = (defined('SMTP_FROM_EMAIL') && SMTP_FROM_EMAIL !== '') ? SMTP_FROM_EMAIL : $user;
    // Per-send override (set per-school by the caller); else the config default.
    $fromName  = trim((string)($opts['from_name'] ?? ''));
    if ($fromName === '') {
        $fromName = (defined('SMTP_FROM_NAME') && SMTP_FROM_NAME !== '') ? SMTP_FROM_NAME : 'Tuta School';
    }

    $to = trim($opts['to'] ?? '');
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'error' => 'invalid recipient address'];
    }
    $subject = (string)($opts['subject'] ?? '');
    $html    = (string)($opts['html'] ?? '');
    $text    = (string)($opts['text'] ?? trim(strip_tags($html)));

    $ehloHost = parse_url(defined('APP_URL') ? APP_URL : '', PHP_URL_HOST) ?: 'localhost';
    $remote   = ($secure === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;

    $errno = 0; $errstr = '';
    // Short connect timeout: on shared hosting a blocked SMTP port must fail
    // fast, never hold the PHP worker (which would hang the whole page).
    $conn = @stream_socket_client($remote, $errno, $errstr, 8,
        STREAM_CLIENT_CONNECT, stream_context_create());
    if (!$conn) {
        return ['ok' => false, 'error' => 'could not reach the mail server (' . ($errstr ?: 'timeout') . ')'];
    }
    stream_set_timeout($conn, 8);

    try {
        if ((int)substr(smtpRead($conn), 0, 3) !== 220) {
            throw new RuntimeException('the mail server refused the connection');
        }

        [$code] = smtpCmd($conn, 'EHLO ' . $ehloHost);
        if ($code !== 250) throw new RuntimeException('the mail server rejected EHLO');

        // STARTTLS upgrade for the plain (usually port 587) path.
        if ($secure === 'tls') {
            [$code] = smtpCmd($conn, 'STARTTLS');
            if ($code !== 220) throw new RuntimeException('the mail server rejected STARTTLS');
            if (!stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('TLS negotiation failed');
            }
            [$code] = smtpCmd($conn, 'EHLO ' . $ehloHost);
            if ($code !== 250) throw new RuntimeException('the mail server rejected EHLO after TLS');
        }

        // AUTH LOGIN.
        [$code] = smtpCmd($conn, 'AUTH LOGIN');
        if ($code !== 334) throw new RuntimeException('the mail server does not accept AUTH LOGIN');
        [$code] = smtpCmd($conn, base64_encode($user));
        if ($code !== 334) throw new RuntimeException('the mail server rejected the username');
        [$code] = smtpCmd($conn, base64_encode($pass));
        if ($code !== 235) throw new RuntimeException('login failed — check the email address and password');

        // Envelope.
        [$code] = smtpCmd($conn, 'MAIL FROM:<' . $fromEmail . '>');
        if ($code !== 250) throw new RuntimeException('the sender address was rejected');
        [$code] = smtpCmd($conn, 'RCPT TO:<' . $to . '>');
        if ($code !== 250 && $code !== 251) throw new RuntimeException('the recipient address was rejected');
        [$code] = smtpCmd($conn, 'DATA');
        if ($code !== 354) throw new RuntimeException('the mail server refused the message');

        // Build a multipart/alternative MIME message (plain text + HTML).
        $boundary = 'tuta_' . bin2hex(random_bytes(10));
        $headers  = [
            'Date: ' . date('r'),
            'From: ' . mailEncodeHeader($fromName) . ' <' . $fromEmail . '>',
            'To: <' . $to . '>',
            'Subject: ' . mailEncodeHeader($subject),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $ehloHost . '>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];

        $body  = '--' . $boundary . "\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($text)) . "\r\n";
        $body .= '--' . $boundary . "\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($html)) . "\r\n";
        $body .= '--' . $boundary . "--\r\n";

        $message = implode("\r\n", $headers) . "\r\n\r\n" . $body;
        // Normalise line endings, then dot-stuff (a line of just "." would end DATA early).
        $message = preg_replace('/\r\n|\r|\n/', "\r\n", $message);
        $message = preg_replace('/^\./m', '..', $message);

        fwrite($conn, $message . "\r\n.\r\n");
        if ((int)substr(smtpRead($conn), 0, 3) !== 250) {
            throw new RuntimeException('the mail server did not accept the message');
        }

        smtpCmd($conn, 'QUIT');
        @fclose($conn);
        return ['ok' => true, 'error' => ''];

    } catch (Throwable $e) {
        if (is_resource($conn)) { @fclose($conn); }
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

/** Branded HTML body for an invitation email. */
function invitationEmailHtml(string $schoolName, string $roleLabel, string $url, string $expiresAt = '', string $logoUrl = ''): string
{
    $s = htmlspecialchars($schoolName, ENT_QUOTES);
    $r = htmlspecialchars($roleLabel, ENT_QUOTES);
    $u = htmlspecialchars($url, ENT_QUOTES);

    $expiryLine = '';
    if ($expiresAt !== '' && ($ts = strtotime($expiresAt))) {
        $expiryLine = '<p style="margin:18px 0 0;font-size:12px;color:#9ca3af;">'
            . 'This invitation expires on ' . htmlspecialchars(date('j M Y', $ts), ENT_QUOTES) . '.</p>';
    }

    return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;">'
        . '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px;">'
        . '<tr><td align="center">'
        . '<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;'
        . 'border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">'
        . emailHeaderBand($schoolName, $logoUrl)
        . '<tr><td style="padding:28px;font-family:Arial,sans-serif;color:#374151;">'
        . '<p style="margin:0 0 14px;font-size:16px;color:#111827;font-weight:bold;">You have been invited to join ' . $s . '</p>'
        . '<p style="margin:0 0 8px;font-size:14px;line-height:1.6;">You have been invited to join '
        . '<strong>' . $s . '</strong> as <strong>' . $r . '</strong>.</p>'
        . '<p style="margin:0 0 22px;font-size:14px;line-height:1.6;">Click the button below to set up '
        . 'your account and choose a password.</p>'
        . '<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#059669;">'
        . '<a href="' . $u . '" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;'
        . 'font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Set up my account</a>'
        . '</td></tr></table>'
        . '<p style="margin:22px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">If the button does not '
        . 'work, copy and paste this link into your browser:<br>'
        . '<span style="color:#059669;word-break:break-all;">' . $u . '</span></p>'
        . $expiryLine
        . '</td></tr>'
        . '<tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;'
        . 'font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;">'
        . 'Sent by ' . $s . ' via Tuta School. If you were not expecting this, you can ignore it.'
        . '</td></tr>'
        . '</table></td></tr></table></body></html>';
}

/** Plain-text body for an invitation email. */
function invitationEmailText(string $schoolName, string $roleLabel, string $url, string $expiresAt = ''): string
{
    $t = "You have been invited to join {$schoolName} as {$roleLabel}.\r\n\r\n"
       . "Set up your account here:\r\n{$url}\r\n";
    if ($expiresAt !== '' && ($ts = strtotime($expiresAt))) {
        $t .= "\r\nThis invitation expires on " . date('j M Y', $ts) . ".\r\n";
    }
    $t .= "\r\nIf you were not expecting this email, you can ignore it.";
    return $t;
}

/**
 * Compose and send an invitation email.
 * Returns ['ok' => bool, 'error' => string]. Never throws.
 */
function sendInvitationEmail(string $toEmail, string $schoolName, string $role, string $url, string $expiresAt = '', string $logoUrl = ''): array
{
    $schoolName = ($schoolName !== '') ? $schoolName : 'the school';
    $roleLabel  = function_exists('roleLabel') ? roleLabel($role) : ucfirst($role ?: 'member');
    // Prefer the explicit logo/name passed by the caller (correct even when the
    // sender is a platform admin who isn't "inside" the school). Fall back to
    // the active school only when nothing was supplied.
    if ($logoUrl === '') $logoUrl = schoolLogoUrl();
    $fromName = ($schoolName !== 'the school') ? $schoolName : schoolFromName();

    return mailSend([
        'to'        => $toEmail,
        'from_name' => $fromName,
        'subject'   => 'You are invited to join ' . $schoolName . ' as ' . $roleLabel,
        'html'      => invitationEmailHtml($schoolName, $roleLabel, $url, $expiresAt, $logoUrl),
        'text'      => invitationEmailText($schoolName, $roleLabel, $url, $expiresAt),
    ]);
}

/** Branded HTML body for a "report card published" notification. */
function resultPublishedEmailHtml(string $schoolName, string $studentName, string $termName, string $portalUrl, string $logoUrl = ''): string
{
    $s = htmlspecialchars($schoolName, ENT_QUOTES);
    $n = htmlspecialchars($studentName, ENT_QUOTES);
    $t = htmlspecialchars($termName, ENT_QUOTES);
    $u = htmlspecialchars($portalUrl, ENT_QUOTES);

    $button = '';
    if ($portalUrl !== '') {
        $button = '<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#059669;">'
            . '<a href="' . $u . '" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;'
            . 'font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">View the report card</a>'
            . '</td></tr></table>'
            . '<p style="margin:22px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">If the button does not '
            . 'work, copy and paste this link into your browser:<br>'
            . '<span style="color:#059669;word-break:break-all;">' . $u . '</span></p>';
    }

    return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;">'
        . '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px;">'
        . '<tr><td align="center">'
        . '<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;'
        . 'border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">'
        . emailHeaderBand($schoolName, $logoUrl)
        . '<tr><td style="padding:28px;font-family:Arial,sans-serif;color:#374151;">'
        . '<p style="margin:0 0 14px;font-size:16px;color:#111827;font-weight:bold;">Report card published</p>'
        . '<p style="margin:0 0 8px;font-size:14px;line-height:1.6;">The <strong>' . $t . '</strong> report card for '
        . '<strong>' . $n . '</strong> has been published and is now available in the parent portal.</p>'
        . '<p style="margin:0 0 22px;font-size:14px;line-height:1.6;">Log in to view and download it.</p>'
        . $button
        . '</td></tr>'
        . '<tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;'
        . 'font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;">'
        . 'Sent by ' . $s . ' via Tuta School.'
        . '</td></tr>'
        . '</table></td></tr></table></body></html>';
}

/** Plain-text body for a "report card published" notification. */
function resultPublishedEmailText(string $schoolName, string $studentName, string $termName, string $portalUrl): string
{
    $t = "The {$termName} report card for {$studentName} has been published and is now "
       . "available in the {$schoolName} parent portal.\r\n";
    if ($portalUrl !== '') {
        $t .= "\r\nLog in to view it:\r\n{$portalUrl}\r\n";
    }
    return $t;
}

/**
 * Compose and send a "report card published" email to one parent.
 * Returns ['ok' => bool, 'error' => string]. Never throws.
 */
function sendResultPublishedEmail(string $toEmail, string $schoolName, string $studentName, string $termName, string $portalUrl): array
{
    $schoolName  = ($schoolName  !== '') ? $schoolName  : 'the school';
    $studentName = ($studentName !== '') ? $studentName : 'your child';
    $termName    = ($termName    !== '') ? $termName    : 'the latest term';
    $logoUrl     = schoolLogoUrl();

    return mailSend([
        'to'        => $toEmail,
        'from_name' => schoolFromName(),
        'subject'   => $studentName . "'s " . $termName . ' report card is ready',
        'html'      => resultPublishedEmailHtml($schoolName, $studentName, $termName, $portalUrl, $logoUrl),
        'text'      => resultPublishedEmailText($schoolName, $studentName, $termName, $portalUrl),
    ]);
}

/**
 * Notify the linked parents of each freshly-published report card.
 *
 * Best-effort and self-contained: never throws, returns the number of emails
 * actually sent. Pass the report_cards rows that were JUST published (each
 * needs at least student_id + term_id). Re-publishing already-published cards
 * should pass an empty set so parents are not re-notified.
 *
 * MULTI-TENANT: every lookup is scoped to the active school via schoolId().
 * Only parents linked to the student *within this school* are emailed, and
 * student/term names are read only from this school's rows.
 */
function notifyResultsPublished(array $cards): int
{
    if (empty($cards) || !mailEnabled()) return 0;

    $sid = function_exists('schoolId') ? schoolId() : '';
    if (!$sid) return 0;

    // Unique students in this batch.
    $studentIds = array_values(array_unique(array_filter(array_map(
        fn($c) => $c['student_id'] ?? '', $cards))));
    if (empty($studentIds)) return 0;

    $sb = new Supabase();

    // Student display names (tenant-scoped).
    $nameById = [];
    $stuRes = $sb->from('students')->select('id,first_name,last_name')
        ->in('id', $studentIds)->eq('school_id', $sid)->execute();
    foreach (($stuRes['data'] ?? []) as $s) {
        $nameById[$s['id']] = trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? ''));
    }

    // Term names.
    $termById = [];
    if (function_exists('cachedTerms')) {
        foreach (cachedTerms() as $t) $termById[$t['id']] = $t['name'] ?? 'Term';
    }

    // Parent links for these students (tenant-scoped).
    $parentsByStudent = [];
    $linkRes = $sb->from('student_parents')->select('student_id,parent_user_id')
        ->in('student_id', $studentIds)->eq('school_id', $sid)->execute();
    foreach (($linkRes['data'] ?? []) as $l) {
        if (!empty($l['student_id']) && !empty($l['parent_user_id'])) {
            $parentsByStudent[$l['student_id']][] = $l['parent_user_id'];
        }
    }
    if (empty($parentsByStudent)) return 0;

    $school     = function_exists('cachedSchool') ? cachedSchool() : null;
    $schoolName = $school['name'] ?? 'the school';
    // Use the school's own domain (e.g. crownofgold.tutagora.com) when set so the
    // portal link matches where the parent signed up; else the platform host.
    $portalBase = (function_exists('schoolBaseUrl') && $school) ? schoolBaseUrl($school) : '';
    if ($portalBase === '') $portalBase = (defined('APP_URL') && APP_URL !== '') ? rtrim(APP_URL, '/') : '';
    $portalUrl  = $portalBase !== '' ? $portalBase . '/portal' : '';

    // Resolving emails + sending is synchronous; a large class can take a while.
    @set_time_limit(0);

    $emailById = []; // parent_user_id => email (cache shared parents)
    $sent = 0;
    foreach ($cards as $c) {
        $stu = $c['student_id'] ?? '';
        if ($stu === '' || empty($parentsByStudent[$stu])) continue;
        $studentName = $nameById[$stu] ?? 'your child';
        $termName    = $termById[$c['term_id'] ?? ''] ?? 'the latest term';

        foreach (array_unique($parentsByStudent[$stu]) as $pid) {
            if (!array_key_exists($pid, $emailById)) {
                $u = $sb->adminGetUser($pid);
                $emailById[$pid] = $u['data']['email'] ?? '';
            }
            $email = $emailById[$pid];
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
            $res = sendResultPublishedEmail($email, $schoolName, $studentName, $termName, $portalUrl);
            if (!empty($res['ok'])) $sent++;
        }
    }
    return $sent;
}
