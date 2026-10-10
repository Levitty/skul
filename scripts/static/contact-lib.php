<?php
// Shared by contact.php and enquiries.php. Defines things and prints nothing,
// so opening it in a browser shows a blank page.
//
// Every enquiry is written to a file outside the site folder first, so none is
// ever lost, and then emailed. Email goes through a real mailbox when one is
// set in tutagora-settings.php, otherwise through the server's own mail.

declare(strict_types=1);

const TUTA_TO = "__EMAIL__";
const TUTA_SITE = "__SITE__";
const TUTA_FALLBACK_FROM = "enquiries@__DOMAIN__";

// Where private files live: one level above the site folder, where the web
// cannot reach them, and where re-uploading the site does not touch them.
function tuta_private_dir(): string {
    $up = dirname(__DIR__);
    if (is_dir($up) && is_writable($up)) {
        return $up;
    }
    $own = __DIR__ . "/private";
    if (!is_dir($own)) {
        @mkdir($own, 0700);
    }
    if (!file_exists($own . "/.htaccess")) {
        @file_put_contents($own . "/.htaccess", "Require all denied\nDeny from all\n");
    }
    return $own;
}

function tuta_settings_file(): string {
    return tuta_private_dir() . "/tutagora-settings.php";
}

// Read the settings, creating the file with a fresh inbox password the first
// time. The person edits this file in Hostinger's File Manager.
function tuta_settings(): array {
    $file = tuta_settings_file();
    if (!file_exists($file)) {
        $pw = implode("-", str_split(bin2hex(random_bytes(6)), 4));
        $tpl = "<?php\n"
            . "// Tutagora website settings. Change only the values between the quotes.\n"
            . "return [\n"
            . "    // The password for " . TUTA_SITE . "/enquiries.php, where every enquiry is kept.\n"
            . "    \"inbox_password\" => \"" . $pw . "\",\n"
            . "\n"
            . "    // To have enquiries emailed reliably, send them through a real mailbox.\n"
            . "    // For a Hostinger mailbox: the full address and its password.\n"
            . "    // Left empty, the server's own mail is used, and it is not reliable.\n"
            . "    \"smtp_user\" => \"\",\n"
            . "    \"smtp_pass\" => \"\",\n"
            . "    \"smtp_host\" => \"smtp.hostinger.com\",\n"
            . "    \"smtp_port\" => 465,\n"
            . "    \"smtp_secure\" => \"ssl\",\n"
            . "];\n";
        @file_put_contents($file, $tpl, LOCK_EX);
        @chmod($file, 0600);
    }
    $s = @include $file;
    if (!is_array($s)) {
        $s = [];
    }
    return $s + [
        "inbox_password" => "",
        "smtp_user" => "",
        "smtp_pass" => "",
        "smtp_host" => "smtp.hostinger.com",
        "smtp_port" => 465,
        "smtp_secure" => "ssl",
    ];
}

function tuta_log_file(): string {
    return tuta_private_dir() . "/tutagora-enquiries.jsonl";
}

function tuta_append(array $rec): bool {
    $line = json_encode($rec, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    return @file_put_contents(tuta_log_file(), $line, FILE_APPEND | LOCK_EX) !== false;
}

// Every enquiry, newest first, with its delivery result folded in.
function tuta_records(): array {
    $file = tuta_log_file();
    if (!is_readable($file)) {
        return [];
    }
    $byId = [];
    $order = [];
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $r = json_decode($line, true);
        if (!is_array($r) || !isset($r["id"])) {
            continue;
        }
        $id = (string) $r["id"];
        if (!isset($byId[$id])) {
            $byId[$id] = [];
            $order[] = $id;
        }
        $byId[$id] = $r + $byId[$id];
        if (isset($r["delivery"])) {
            $byId[$id]["delivery"] = $r["delivery"];
        }
    }
    $out = [];
    foreach (array_reverse($order) as $id) {
        if (isset($byId[$id]["school"])) {
            $out[] = $byId[$id];
        }
    }
    return $out;
}

// A value safe to put in an email header: one line, no control characters.
function tuta_hdr(string $v): string {
    return trim(preg_replace("/[\\r\\n\\t\\x00-\\x1F\\x7F]+/", " ", $v) ?? "");
}

function tuta_wa_number(string $phone): string {
    $d = preg_replace("/\\D+/", "", $phone) ?? "";
    if (strpos($d, "0") === 0) {
        $d = "254" . substr($d, 1);
    } elseif (strlen($d) === 9 && ($d[0] === "7" || $d[0] === "1")) {
        $d = "254" . $d;
    }
    return $d;
}

function tuta_smtp_ready(array $s): bool {
    return (string) $s["smtp_user"] !== "" && (string) $s["smtp_pass"] !== "";
}

// Send one plain-text email through an authenticated mailbox.
function tuta_smtp(array $s, string $to, string $subject, string $body, string $replyTo): array {
    $host = (string) $s["smtp_host"];
    $port = (int) $s["smtp_port"];
    $sec = strtolower((string) $s["smtp_secure"]);
    $remote = ($sec === "ssl" ? "ssl://" : "tcp://") . $host . ":" . $port;
    $ctx = stream_context_create(["ssl" => ["verify_peer" => true, "verify_peer_name" => true]]);
    $errno = 0;
    $errstr = "";
    $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        return [false, "could not reach " . $host . ":" . $port . " (" . $errstr . ")"];
    }
    stream_set_timeout($fp, 15);
    $read = function () use ($fp): string {
        $out = "";
        while (($line = fgets($fp, 2048)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] === " ") {
                break;
            }
        }
        return $out;
    };
    $step = function (string $cmd, array $ok, string $what) use ($fp, $read): string {
        if ($cmd !== "") {
            fwrite($fp, $cmd . "\r\n");
        }
        $r = $read();
        if (!in_array((int) substr($r, 0, 3), $ok, true)) {
            throw new RuntimeException($what . ": " . ($r === "" ? "no answer" : trim($r)));
        }
        return $r;
    };
    try {
        $hostname = parse_url(TUTA_SITE, PHP_URL_HOST) ?: "localhost";
        $step("", [220], "greeting");
        $step("EHLO " . $hostname, [250], "hello");
        if ($sec === "tls") {
            $step("STARTTLS", [220], "starttls");
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException("could not start TLS");
            }
            $step("EHLO " . $hostname, [250], "hello after TLS");
        }
        $step("AUTH LOGIN", [334], "sign-in");
        $step(base64_encode((string) $s["smtp_user"]), [334], "sign-in address");
        $step(base64_encode((string) $s["smtp_pass"]), [235], "sign-in password");
        $from = tuta_hdr((string) $s["smtp_user"]);
        $step("MAIL FROM:<" . $from . ">", [250], "sender");
        $step("RCPT TO:<" . tuta_hdr($to) . ">", [250, 251], "recipient");
        $step("DATA", [354], "message start");
        $headers = [
            "Date: " . date("r"),
            "From: Tutagora website <" . $from . ">",
            "To: <" . tuta_hdr($to) . ">",
            "Subject: " . $subject,
            "Message-ID: <" . bin2hex(random_bytes(8)) . "@" . $hostname . ">",
            "MIME-Version: 1.0",
            "Content-Type: text/plain; charset=UTF-8",
            "Content-Transfer-Encoding: 8bit",
        ];
        if ($replyTo !== "") {
            $headers[] = "Reply-To: " . $replyTo;
        }
        $lines = preg_split("/\\r\\n|\\n|\\r/", $body) ?: [];
        foreach ($lines as $i => $l) {
            if ($l !== "" && $l[0] === ".") {
                $lines[$i] = "." . $l;
            }
        }
        $step(implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $lines) . "\r\n.", [250], "message");
        @fwrite($fp, "QUIT\r\n");
        fclose($fp);
        return [true, "emailed through " . $from];
    } catch (RuntimeException $e) {
        @fwrite($fp, "QUIT\r\n");
        @fclose($fp);
        return [false, $e->getMessage()];
    }
}

// Email an enquiry: through the mailbox when one is set, else the server's mail.
function tuta_deliver(array $s, string $subject, string $body, string $replyName, string $replyEmail): array {
    $enc = "=?UTF-8?B?" . base64_encode(tuta_hdr($subject)) . "?=";
    $replyTo = "";
    if ($replyEmail !== "" && filter_var($replyEmail, FILTER_VALIDATE_EMAIL)) {
        $replyTo = "=?UTF-8?B?" . base64_encode(tuta_hdr($replyName)) . "?= <" . tuta_hdr($replyEmail) . ">";
    }
    if (tuta_smtp_ready($s)) {
        return tuta_smtp($s, TUTA_TO, $enc, $body, $replyTo);
    }
    $headers = "From: Tutagora website <" . TUTA_FALLBACK_FROM . ">\r\n"
        . ($replyTo !== "" ? "Reply-To: " . $replyTo . "\r\n" : "")
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n";
    $ok = @mail(TUTA_TO, $enc, $body, $headers);
    return [$ok, $ok ? "handed to the server's own mail, not confirmed" : "the server's own mail refused it"];
}
