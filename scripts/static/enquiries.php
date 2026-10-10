<?php
// The private inbox: every enquiry the form has received, newest first, with
// a WhatsApp link to reply. Behind the password in tutagora-settings.php.
// Also shows the enquiries saved before this page existed, and lets you send
// a test email to check delivery.

declare(strict_types=1);

require __DIR__ . "/contact-lib.php";

header("X-Robots-Tag: noindex, nofollow");
header("Cache-Control: no-store");
header("X-Frame-Options: DENY");
session_set_cookie_params(["lifetime" => 0, "path" => "/", "secure" => true, "httponly" => true, "samesite" => "Strict"]);
session_name("tuta_inbox");
session_start();

function h(string $v): string {
    return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8");
}

$s = tuta_settings();
$pw = (string) $s["inbox_password"];
$note = "";

if (($_GET["out"] ?? "") === "1") {
    $_SESSION = [];
    session_destroy();
    header("Location: enquiries.php", true, 303);
    exit;
}

if (($_POST["action"] ?? "") === "login") {
    if ($pw !== "" && hash_equals($pw, trim((string) ($_POST["password"] ?? "")))) {
        session_regenerate_id(true);
        $_SESSION["tuta_in"] = true;
        header("Location: enquiries.php", true, 303);
        exit;
    }
    sleep(2);
    $note = "That password is not right.";
}

$in = !empty($_SESSION["tuta_in"]);

if ($in && ($_POST["action"] ?? "") === "test") {
    [$ok, $how] = tuta_deliver(
        $s,
        "Test from your website inbox",
        "This is a test from " . TUTA_SITE . "/enquiries.php.\n\nIf you are reading this, enquiries will reach this inbox.\n",
        "",
        ""
    );
    $_SESSION["flash"] = ($ok ? "Test sent: " : "Test failed: ") . $how;
    header("Location: enquiries.php", true, 303);
    exit;
}

$records = $in ? tuta_records() : [];

if ($in && ($_GET["csv"] ?? "") === "1") {
    header("Content-Type: text/csv; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"tutagora-enquiries-" . date("Y-m-d") . ".csv\"");
    $out = fopen("php://output", "w");
    fputcsv($out, ["Received", "Name", "Role", "School", "Learners", "Phone", "Email", "Wants", "Message", "Via", "Email delivery"]);
    foreach ($records as $r) {
        fputcsv($out, [
            (string) ($r["at"] ?? ""), (string) ($r["name"] ?? ""), (string) ($r["role"] ?? ""), (string) ($r["school"] ?? ""),
            (string) ($r["learners"] ?? ""), (string) ($r["phone"] ?? ""), (string) ($r["email"] ?? ""), (string) ($r["want"] ?? ""),
            (string) ($r["message"] ?? ""), (string) ($r["source"] ?? ""), (string) ($r["delivery"] ?? ""),
        ]);
    }
    fclose($out);
    exit;
}

// Enquiries saved before this page existed, as plain text.
$earlier = "";
$earlierCount = 0;
if ($in) {
    foreach (array_unique([dirname(__DIR__) . "/tutagora-enquiries.log", tuta_private_dir() . "/tutagora-enquiries.log"]) as $f) {
        if (is_readable($f)) {
            $earlier = (string) file_get_contents($f);
            $earlierCount = substr_count($earlier, "New enquiry from");
            break;
        }
    }
}

$flash = "";
if ($in && isset($_SESSION["flash"])) {
    $flash = (string) $_SESSION["flash"];
    unset($_SESSION["flash"]);
}

$canWrite = is_writable(tuta_private_dir());
$smtp = tuta_smtp_ready($s);
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Enquiries · Tutagora</title>
<style>
@font-face{font-family:"Geist";font-weight:300 700;font-display:swap;src:url(/assets/fonts/Geist-Variable.woff2) format("woff2")}
:root{color-scheme:dark;--ink:#0b0b0b;--card:#121212;--white:#f2f2f0;--mute:rgba(242,242,240,.58);--line:rgba(242,242,240,.13);--green:#25d366;--red:#ff6b6b;--amber:#f4a21d}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--white);font:15px/1.5 "Geist","Helvetica Neue",Arial,sans-serif;padding:0 16px 64px}
.wrap{max-width:880px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:22px 0;border-bottom:1px solid var(--line);margin-bottom:28px}
header b{font-weight:600;letter-spacing:-.01em}
a{color:var(--white)}
.mute{color:var(--mute)}
h1{font-size:clamp(28px,5vw,40px);font-weight:500;letter-spacing:-.03em;margin:0 0 6px}
.bar{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin:14px 0 26px}
.btn{appearance:none;border:1px solid var(--line);background:transparent;color:var(--white);font:inherit;padding:9px 16px;border-radius:999px;cursor:pointer;text-decoration:none;display:inline-block}
.btn:hover{border-color:var(--mute)}
.btn.wa{background:var(--green);color:#062b12;border-color:var(--green);font-weight:600}
.flash{border:1px solid var(--line);padding:12px 16px;margin:0 0 20px}
.status{display:grid;gap:6px;border:1px solid var(--line);padding:14px 16px;margin-bottom:28px;font-size:14px}
.ok{color:var(--green)}.bad{color:var(--red)}.warn{color:var(--amber)}
.card{border:1px solid var(--line);background:var(--card);padding:18px 18px 16px;margin-bottom:14px}
.card .top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline}
.card h2{font-size:19px;font-weight:600;margin:0;letter-spacing:-.01em}
.card dl{display:grid;grid-template-columns:110px 1fr;gap:4px 12px;margin:12px 0}
.card dt{color:var(--mute)}.card dd{margin:0;word-break:break-word}
.card .msg{white-space:pre-wrap;border-left:2px solid var(--line);padding-left:12px;margin:8px 0 12px}
.card .acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.small{font-size:13px}
details{border:1px solid var(--line);padding:12px 16px;margin-top:28px}
summary{cursor:pointer}
pre{white-space:pre-wrap;word-break:break-word;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--white)}
form.login{max-width:360px;display:grid;gap:12px;margin-top:20px}
input[type=password]{width:100%;background:transparent;border:0;border-bottom:1px solid var(--line);color:var(--white);font:inherit;font-size:18px;padding:8px 0;outline:none}
input[type=password]:focus{border-bottom-color:var(--amber)}
@media(max-width:560px){.card dl{grid-template-columns:1fr}.card dt{margin-top:6px}}
</style>
</head>
<body>
<div class="wrap">
<header><b>Tutagora · Enquiries</b><?php if ($in): ?><a class="mute" href="enquiries.php?out=1">Sign out</a><?php endif; ?></header>

<?php if (!$in): ?>
  <h1>Your enquiries</h1>
  <p class="mute">Every enquiry from the website form is kept here, even when an email does not arrive.</p>
  <form class="login" method="post" action="enquiries.php">
    <input type="hidden" name="action" value="login">
    <label class="mute small" for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
    <button class="btn wa" type="submit">Open</button>
    <?php if ($note !== ""): ?><p class="bad"><?= h($note) ?></p><?php endif; ?>
  </form>
  <p class="mute small" style="margin-top:28px">The password is in the file <b>tutagora-settings.php</b>. In Hostinger&rsquo;s File Manager, go up one level from your site folder to find it.</p>
<?php else: ?>
  <h1><?= count($records) ?> enquir<?= count($records) === 1 ? "y" : "ies" ?></h1>
  <?php if ($earlierCount > 0): ?><p class="mute">Plus <?= $earlierCount ?> saved before this page existed, at the bottom.</p><?php endif; ?>
  <div class="bar">
    <a class="btn" href="enquiries.php?csv=1">Download as a spreadsheet</a>
    <form method="post" action="enquiries.php" style="display:inline"><input type="hidden" name="action" value="test"><button class="btn" type="submit">Send a test email</button></form>
  </div>
  <?php if ($flash !== ""): ?><div class="flash <?= strpos($flash, "failed") !== false ? "bad" : "ok" ?>"><?= h($flash) ?></div><?php endif; ?>
  <div class="status">
    <div>Saving enquiries: <?= $canWrite ? '<span class="ok">working</span>' : '<span class="bad">the folder cannot be written to</span>' ?></div>
    <div>Email: <?= $smtp
        ? '<span class="ok">through the mailbox ' . h((string) $s["smtp_user"]) . '</span>'
        : '<span class="warn">through the server&rsquo;s own mail, which is not reliable.</span> Put a mailbox address and its password in tutagora-settings.php to fix this.' ?></div>
    <div class="mute small">Settings file: <?= h(tuta_settings_file()) ?></div>
  </div>

  <?php foreach ($records as $r):
      $wa = tuta_wa_number((string) ($r["phone"] ?? ""));
      $when = isset($r["at"]) ? date("D j M Y, H:i", (int) strtotime((string) $r["at"])) : "";
      $d = (string) ($r["delivery"] ?? "");
      $dClass = strpos($d, "FAILED") === 0 ? "bad" : (strpos($d, "emailed") === 0 ? "ok" : "warn");
  ?>
  <div class="card">
    <div class="top">
      <h2><?= h((string) $r["school"]) ?><?= ($r["learners"] ?? "") !== "" ? ' <span class="mute">· ' . h((string) $r["learners"]) . ' learners</span>' : "" ?></h2>
      <span class="mute small"><?= h($when) ?></span>
    </div>
    <dl>
      <dt>Name</dt><dd><?= h((string) ($r["name"] ?? "")) ?><?= ($r["role"] ?? "") !== "" ? " (" . h((string) $r["role"]) . ")" : "" ?></dd>
      <dt>Phone</dt><dd><?= h((string) ($r["phone"] ?? "")) ?></dd>
      <?php if (($r["email"] ?? "") !== ""): ?><dt>Email</dt><dd><a href="mailto:<?= h((string) $r["email"]) ?>"><?= h((string) $r["email"]) ?></a></dd><?php endif; ?>
      <dt>Wants</dt><dd><?= h((string) ($r["want"] ?? "")) ?></dd>
      <dt>Via</dt><dd><?= h(($r["source"] ?? "") !== "" ? (string) $r["source"] : "direct") ?></dd>
    </dl>
    <?php if (($r["message"] ?? "") !== ""): ?><div class="msg"><?= h((string) $r["message"]) ?></div><?php endif; ?>
    <div class="acts">
      <?php if ($wa !== ""): ?><a class="btn wa" href="https://wa.me/<?= h($wa) ?>?text=<?= rawurlencode("Hello " . (string) ($r["name"] ?? "") . ", this is Tutagora. Thank you for your enquiry about " . (string) ($r["school"] ?? "") . ".") ?>" target="_blank" rel="noopener">Reply on WhatsApp</a><?php endif; ?>
      <span class="small <?= $dClass ?>">Email: <?= h($d === "" ? "unknown" : $d) ?></span>
    </div>
  </div>
  <?php endforeach; ?>

  <?php if (!$records && $earlierCount === 0): ?><p class="mute">No enquiries yet.</p><?php endif; ?>

  <?php if ($earlierCount > 0): ?>
  <details open>
    <summary>Saved before this page existed (<?= $earlierCount ?>)</summary>
    <pre><?= h($earlier) ?></pre>
  </details>
  <?php endif; ?>
<?php endif; ?>
</div>
</body>
</html>
