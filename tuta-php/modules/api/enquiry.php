<?php
/**
 * Enquiry intake — PUBLIC endpoint the school's own website posts to.
 *
 *   POST ?route=api/enquiry   (JSON or form-encoded)
 *     school   school id            key      the school's enquiry public key
 *     name     parent's name        phone / email (at least one)
 *     child_name, child_dob, grade_interest, message
 *     source   website (default) | whatsapp | walk_in | phone | referral
 *     page     which web page it came from
 *     website  honeypot — must be empty
 *
 * Same defences as Tuta's own form: honeypot, per-IP rate limit, link-spam
 * scoring. The key is a public identifier, not a secret — it stops random
 * posts landing in the wrong school, nothing more. CORS is open because the
 * form lives on another domain.
 *
 * On success: the enquiry is filed, assigned to the front office, an
 * acknowledgement goes to the parent by email if they gave one, and the
 * office sees it on the dashboard within the minute.
 */
require_once __DIR__ . '/../../includes/public-forms.php';
require_once __DIR__ . '/../../includes/mailer.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (!isPost()) { http_response_code(405); echo json_encode(['ok' => false, 'error' => 'POST only']); exit; }

// Accept JSON bodies as well as classic form posts.
$in = $_POST;
if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== false) {
    $in = json_decode((string)file_get_contents('php://input'), true) ?: [];
}
$g = fn(string $k) => trim((string)($in[$k] ?? ''));

$sb = new Supabase();
$schoolId = $g('school');
$key      = $g('key');
if (!preg_match('/^[0-9a-f-]{36}$/i', $schoolId) || $key === '') {
    http_response_code(400); echo json_encode(['ok' => false, 'error' => 'Missing school or key.']); exit;
}
$school = $sb->from('schools')->select('id,name,is_active')->eq('id', $schoolId)->single()->execute()['data'][0] ?? null;
if (!$school || empty($school['is_active'])) { http_response_code(404); echo json_encode(['ok' => false, 'error' => 'Unknown school.']); exit; }
$expected = (string)publicSchoolSetting($sb, $schoolId, 'enquiry_public_key', '');
if ($expected === '' || !hash_equals($expected, $key)) {
    http_response_code(403); echo json_encode(['ok' => false, 'error' => 'This form is not connected to the school. Ask the office for the current key.']); exit;
}

// Bots fill the hidden field; humans don't.
if ($g('website') !== '') { echo json_encode(['ok' => true]); exit; }

$ipBucket = 'enquire:ip:' . clientIpAddr();
if (rateCount($ipBucket, 3600) >= 15) {
    http_response_code(429); echo json_encode(['ok' => false, 'error' => 'Too many submissions. Please try again later.']); exit;
}

$name  = $g('name');
if ($name === '') $name = trim($g('first_name') . ' ' . $g('last_name'));
$phone = $g('phone'); $email = $g('email');
$child = $g('child_name'); $grade = $g('grade_interest'); $msg = $g('message');
$dob   = $g('child_dob'); if ($dob !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dob)) $dob = '';
$source = in_array($g('source'), ['website', 'whatsapp', 'walk_in', 'phone', 'referral', 'other'], true) ? $g('source') : 'website';

if ($name === '' || ($phone === '' && $email === '')) {
    http_response_code(422); echo json_encode(['ok' => false, 'error' => 'Please give your name and a phone number or email.']); exit;
}
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422); echo json_encode(['ok' => false, 'error' => 'That email address does not look right.']); exit;
}

$clip  = fn($s, $n) => mb_substr((string)$s, 0, $n);
$score = publicSpamScore($msg . ' ' . $name);
$status = $score >= 50 ? 'spam' : 'new';

// Auto-assign to the front office (first front-office member of the school).
$assignId = null; $assignEmail = null;
$fo = $sb->from('user_schools')->select('user_id')->eq('school_id', $schoolId)->eq('role', 'front_office')->limit(1)->execute()['data'][0] ?? null;
if ($fo) {
    $assignId = $fo['user_id'];
    $up = $sb->from('user_profiles')->select('email')->eq('id', $assignId)->single()->execute()['data'][0] ?? null;
    $assignEmail = $up['email'] ?? null;
}

$ins = $sb->from('enquiries')->insert([
    'school_id'      => $schoolId,
    'name'           => $clip($name, 120),
    'phone'          => $phone !== '' ? $clip($phone, 30) : null,
    'email'          => $email !== '' ? $clip($email, 160) : null,
    'child_name'     => $child !== '' ? $clip($child, 120) : null,
    'child_dob'      => $dob !== '' ? $dob : null,
    'grade_interest' => $grade !== '' ? $clip($grade, 60) : null,
    'message'        => $msg !== '' ? $clip($msg, 2000) : null,
    'status'         => $status,
    'spam_score'     => $score,
    'source'         => $source,
    'source_page'    => $clip($g('page'), 200) ?: null,
    'source_ip'      => publicClientIp() ?: null,
    'assigned_to'    => $assignId,
    'assigned_email' => $assignEmail,
    'last_activity_at' => date('c'),
]);
rateRecord($ipBucket);
if (!empty($ins['error'])) {
    http_response_code(500); echo json_encode(['ok' => false, 'error' => 'Could not save the enquiry. Please call the school.']); exit;
}
$enquiryId = $ins['data'][0]['id'] ?? null;

// The office hears about it now, not when someone next opens the page.
require_once __DIR__ . '/../../includes/enquiry-notify.php';
enquiryNotifyNew($sb, $schoolId, ['status' => $status, 'name' => $name, 'phone' => $phone, 'email' => $email, 'child_name' => $child,
                                  'grade_interest' => $grade, 'message' => $msg, 'source' => $source], $enquiryId);

// Acknowledge by email — the school's own words if set, a sensible default otherwise.
if ($status === 'new' && $email !== '' && function_exists('mailEnabled') && mailEnabled()
    && publicSchoolSetting($sb, $schoolId, 'enquiry_ack_enabled', '1') === '1') {
    $schoolName = $school['name'];
    $admitUrl = (string)publicSchoolSetting($sb, $schoolId, 'admission_public_url', '');
    $custom = trim((string)publicSchoolSetting($sb, $schoolId, 'enquiry_ack_text', ''));
    $body = $custom !== '' ? nl2br(e($custom)) :
        '<p>Dear ' . e($name) . ',</p><p>Thank you for your enquiry about ' . e($schoolName) . ($grade !== '' ? ' (' . e($grade) . ')' : '') . '. Our front office has received it and will be in touch shortly.</p>'
        . ($admitUrl !== '' ? '<p>If you are ready to apply, you can complete the admission form online: <a href="' . e($admitUrl) . '">' . e($admitUrl) . '</a></p>' : '')
        . '<p>Warm regards,<br>' . e($schoolName) . '</p>';
    try {
        mailSend(['to' => $email, 'subject' => 'Thank you for your enquiry — ' . $schoolName,
                  'html' => $body, 'from_name' => $schoolName]);
    } catch (\Throwable $t) {}
}

echo json_encode(['ok' => true, 'id' => $enquiryId, 'message' => 'Thank you — ' . $school['name'] . ' will be in touch shortly.']);
