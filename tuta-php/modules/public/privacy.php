<?php
/**
 * Privacy policy — public, no login. Meta requires a reachable policy URL
 * before a WhatsApp app can be published; parents and staff deserve one anyway.
 */
$org = 'Whitestar Group of Schools';
http_response_code(200);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — <?= htmlspecialchars($org) ?></title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#111827;background:#f9fafb;margin:0;line-height:1.6}
main{max-width:720px;margin:0 auto;padding:40px 24px 64px}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.05rem;margin:28px 0 6px}
p,li{font-size:.95rem;color:#374151}.meta{color:#6b7280;font-size:.85rem}
</style>
</head>
<body>
<main>
<h1>Privacy Policy</h1>
<p class="meta"><?= htmlspecialchars($org) ?> · school management system ("Tuta") and WhatsApp parent assistant · last updated <?= date('j F Y') ?></p>

<h2>Who we are</h2>
<p><?= htmlspecialchars($org) ?> operates schools in Kenya. This system is used by our staff to run the schools and by parents and guardians to see their children's fee balances, statements, results and school notices — on the web and through our WhatsApp number.</p>

<h2>What we collect</h2>
<ul>
<li><strong>Learner records</strong>: name, class, admission number, date of birth, and academic and attendance records — provided at admission.</li>
<li><strong>Parent and guardian details</strong>: name, phone number, email and relationship to the learner — provided at admission or enquiry.</li>
<li><strong>Fee records</strong>: invoices, payments and balances, including M-Pesa transaction references.</li>
<li><strong>Messages</strong>: when you message our WhatsApp number, we keep the messages you send and our replies so we can answer you and resolve queries.</li>
</ul>

<h2>How we use it</h2>
<ul>
<li>To run the school: enrolment, fees, results, attendance, transport and communication with parents.</li>
<li>To reply when you message us on WhatsApp — for example to show a fee balance or send a statement — and to send fee reminders and school notices to the guardian numbers on record.</li>
<li>To process fee payments through M-Pesa.</li>
</ul>
<p>We do not sell personal information, and we do not use it for advertising.</p>

<h2>Who can see it</h2>
<p>School staff with a role that needs it. Information about a learner is only ever sent to the guardian phone numbers recorded for that learner. Our service providers — Meta (WhatsApp), Safaricom (M-Pesa), our SMS gateway and our hosting and database providers — process data on our behalf under their own terms.</p>

<h2>How long we keep it</h2>
<p>Learner and fee records are kept for as long as required for school administration and by Kenyan law. WhatsApp message logs are kept for support and audit and may be deleted on request where the law allows.</p>

<h2>Your rights</h2>
<p>Under the Kenya Data Protection Act, 2019 you may ask to see the personal information we hold about you or your child, ask for it to be corrected, or object to certain uses. Send a WhatsApp message to our number or contact the school office, and we will respond.</p>

<h2>Contact</h2>
<p>Any of our school offices, or the WhatsApp number this policy was linked from.</p>
</main>
</body>
</html>
