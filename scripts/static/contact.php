<?php
// Receives the enquiry form from the exported site and emails it.
// Lives at the document root next to index.html. Hostinger's PHP mail()
// delivers for addresses on the hosted domain, so the From must be one.

declare(strict_types=1);

const TO = "__EMAIL__";
const FROM = "enquiries@__DOMAIN__";
const SITE = "__SITE__";

function clean(string $key, int $max = 500): string {
    $v = isset($_POST[$key]) ? (string) $_POST[$key] : "";
    $v = trim(str_replace(["\r", "\0"], "", $v));
    return mb_substr($v, 0, $max);
}

function wants_json(): bool {
    $accept = $_SERVER["HTTP_ACCEPT"] ?? "";
    return strpos($accept, "application/json") !== false;
}

function respond(bool $ok, string $why = ""): void {
    if (wants_json()) {
        header("Content-Type: application/json; charset=utf-8");
        echo json_encode(["ok" => $ok, "why" => $why]);
    } else {
        header("Location: " . SITE . "/?" . ($ok ? "sent=1" : "sent=0") . "#contact", true, 303);
    }
    exit;
}

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    header("Location: " . SITE . "/#contact", true, 303);
    exit;
}

// The honeypot: a real person never sees this field.
if (clean("website") !== "") {
    respond(true);
}

$name = clean("name", 120);
$role = clean("role", 60);
$school = clean("school", 160);
$learners = clean("learners", 20);
$phone = clean("phone", 40);
$email = clean("email", 160);
$want = clean("want", 120);
$message = clean("message", 2000);
$source = clean("source", 60);

if ($name === "" || $school === "" || $phone === "") {
    respond(false, "missing");
}
if ($email !== "" && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $email = "";
}

$subject = "Enquiry: " . $school . ($learners !== "" ? " (" . $learners . " learners)" : "") . " · " . $name . ($source !== "" ? " · via " . $source : "");
$body = "New enquiry from " . SITE . "\n\n"
    . "Name:      " . $name . ($role !== "" ? " (" . $role . ")" : "") . "\n"
    . "School:    " . $school . "\n"
    . "Learners:  " . ($learners !== "" ? $learners : "not given") . "\n"
    . "Phone:     " . $phone . "\n"
    . "Email:     " . ($email !== "" ? $email : "not given") . "\n"
    . "Wants:     " . $want . "\n"
    . "Via:       " . ($source !== "" ? $source : "direct") . "\n\n"
    . ($message !== "" ? $message . "\n\n" : "")
    . "Reply on WhatsApp: https://wa.me/" . preg_replace("/\D+/", "", preg_replace("/^0/", "254", $phone)) . "\n"
    . "Received " . date("D j M Y H:i") . " from " . ($_SERVER["REMOTE_ADDR"] ?? "?") . "\n";

$headers = "From: Tutagora website <" . FROM . ">\r\n"
    . ($email !== "" ? "Reply-To: " . $name . " <" . $email . ">\r\n" : "")
    . "Content-Type: text/plain; charset=UTF-8\r\n"
    . "X-Mailer: PHP/" . PHP_VERSION;

$subject = "=?UTF-8?B?" . base64_encode($subject) . "?=";
$sent = @mail(TO, $subject, $body, $headers);

// Keep a copy on the server too, so nothing is lost if mail is slow. It is
// written one level above the site folder, where the web cannot reach it.
@file_put_contents(
    dirname(__DIR__) . "/tutagora-enquiries.log",
    "----- " . date("c") . "\n" . $body . "\n",
    FILE_APPEND | LOCK_EX
);

respond((bool) $sent, $sent ? "" : "mail");
