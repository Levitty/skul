<?php
// Receives the enquiry form. Saves the enquiry first, so it is never lost,
// then emails it. The form counts it as received once it is saved.

declare(strict_types=1);

require __DIR__ . "/contact-lib.php";

function clean(string $key, int $max = 500, bool $multiline = false): string {
    $v = isset($_POST[$key]) ? (string) $_POST[$key] : "";
    $v = str_replace(["\r", "\0"], "", $v);
    if (!$multiline) {
        $v = str_replace(["\n", "\t"], " ", $v);
    }
    return mb_substr(trim($v), 0, $max);
}

function wants_json(): bool {
    return strpos($_SERVER["HTTP_ACCEPT"] ?? "", "application/json") !== false;
}

function respond(bool $ok, string $why = ""): void {
    if (wants_json()) {
        header("Content-Type: application/json; charset=utf-8");
        echo json_encode(["ok" => $ok, "why" => $why]);
    } else {
        $back = strpos($_SERVER["HTTP_REFERER"] ?? "", "/contact") !== false ? "/contact/" : "/";
        header("Location: " . TUTA_SITE . $back . "?sent=" . ($ok ? "1" : "0") . "#contact", true, 303);
    }
    exit;
}

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    header("Location: " . TUTA_SITE . "/contact/", true, 303);
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
$message = clean("message", 2000, true);
$source = clean("source", 60);

if ($name === "" || $school === "" || $phone === "") {
    respond(false, "missing");
}
if ($email !== "" && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $email = "";
}

$id = date("YmdHis") . "-" . bin2hex(random_bytes(3));
$saved = tuta_append([
    "id" => $id,
    "at" => date("c"),
    "name" => $name,
    "role" => $role,
    "school" => $school,
    "learners" => $learners,
    "phone" => $phone,
    "email" => $email,
    "want" => $want,
    "message" => $message,
    "source" => $source,
    "ip" => $_SERVER["REMOTE_ADDR"] ?? "",
    "delivery" => "sending",
]);

$subject = "Enquiry: " . $school . ($learners !== "" ? " (" . $learners . " learners)" : "") . " · " . $name . ($source !== "" ? " · via " . $source : "");
$body = "New enquiry from " . TUTA_SITE . "\n\n"
    . "Name:      " . $name . ($role !== "" ? " (" . $role . ")" : "") . "\n"
    . "School:    " . $school . "\n"
    . "Learners:  " . ($learners !== "" ? $learners : "not given") . "\n"
    . "Phone:     " . $phone . "\n"
    . "Email:     " . ($email !== "" ? $email : "not given") . "\n"
    . "Wants:     " . $want . "\n"
    . "Via:       " . ($source !== "" ? $source : "direct") . "\n\n"
    . ($message !== "" ? $message . "\n\n" : "")
    . "Reply on WhatsApp: https://wa.me/" . tuta_wa_number($phone) . "\n"
    . "All enquiries: " . TUTA_SITE . "/enquiries.php\n"
    . "Received " . date("D j M Y H:i") . "\n";

[$sent, $how] = tuta_deliver(tuta_settings(), $subject, $body, $name, $email);
tuta_append(["id" => $id, "delivery" => ($sent ? "" : "FAILED: ") . $how]);

respond($saved || $sent, $saved ? "" : ($sent ? "" : "mail"));
