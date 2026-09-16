<?php
/**
 * Tell the front office the moment an enquiry arrives.
 *
 * A new family is hottest in the first hour. This sends a short SMS to the
 * numbers in enquiry_notify_phones and an email to enquiry_notify_emails
 * (both comma-separated, set on the Enquiries page), with the parent's name,
 * phone, child and grade, and a link to the enquiry. Spam-scored enquiries
 * are not announced. Never throws — a failed notification must not fail
 * the enquiry itself.
 */

require_once __DIR__ . '/sms.php';
require_once __DIR__ . '/mailer.php';

function enquiryNotifyNew(Supabase $sb, string $schoolId, array $enq, ?string $enquiryId = null): void
{
    try {
        if (($enq['status'] ?? 'new') !== 'new') return;

        // schoolSetting()/smsSend() read the school from the session; public
        // endpoints have none, so set it for the length of this call.
        initSession();
        $prev = $_SESSION['school_id'] ?? null;
        $_SESSION['school_id'] = $schoolId;

        $phones = array_values(array_filter(array_map('trim', explode(',', (string)schoolSetting('enquiry_notify_phones', '')))));
        $emails = array_values(array_filter(array_map('trim', explode(',', (string)schoolSetting('enquiry_notify_emails', ''))), fn($e) => filter_var($e, FILTER_VALIDATE_EMAIL)));
        if (!$phones && !$emails) { $_SESSION['school_id'] = $prev; return; }

        $school = schoolSetting('school_name', '') ?: ($sb->from('schools')->select('name')->eq('id', $schoolId)->single()->execute()['data'][0]['name'] ?? 'the school');
        $name   = trim((string)($enq['name'] ?? '')) ?: 'A parent';
        $phone  = trim((string)($enq['phone'] ?? ''));
        $child  = trim((string)($enq['child_name'] ?? ''));
        $grade  = trim((string)($enq['grade_interest'] ?? ''));
        $msg    = trim((string)($enq['message'] ?? ''));
        $base   = rtrim((string)(defined('APP_URL') ? APP_URL : ''), '/');
        $link   = $base !== '' ? $base . '/enquiries' . ($enquiryId ? '?id=' . $enquiryId : '') : '';

        $sms = "New enquiry: " . $name . ($phone !== '' ? ", " . $phone : '')
             . ($child !== '' ? ". Child: " . $child : '') . ($grade !== '' ? " (" . $grade . ")" : '')
             . ". Call them back today." . ($link !== '' ? " " . $link : '');
        if ($phones && function_exists('smsConfigured') && smsConfigured()) {
            smsSend($phones, mb_substr($sms, 0, 300));
        }

        if ($emails && function_exists('mailEnabled') && mailEnabled()) {
            $rows = [['Parent', $name], ['Phone', $phone ?: '—'], ['Email', trim((string)($enq['email'] ?? '')) ?: '—'],
                     ['Child', $child ?: '—'], ['Grade', $grade ?: '—'], ['Message', $msg ?: '—'], ['Came via', trim((string)($enq['source'] ?? 'form')) ?: 'form']];
            $tbl = '';
            foreach ($rows as [$k, $v]) $tbl .= '<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">' . htmlspecialchars($k) . '</td><td style="padding:6px 0">' . nl2br(htmlspecialchars($v)) . '</td></tr>';
            $html = '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#111827;max-width:560px">'
                  . '<p style="font-size:17px;font-weight:600;margin:0 0 12px">New enquiry at ' . htmlspecialchars($school) . '</p>'
                  . '<table style="border-collapse:collapse">' . $tbl . '</table>'
                  . ($link !== '' ? '<p style="margin-top:16px"><a href="' . htmlspecialchars($link) . '" style="background:#059669;color:#fff;padding:9px 14px;border-radius:8px;text-decoration:none;font-weight:600">Open in Tuta</a></p>' : '')
                  . '<p style="color:#6b7280;font-size:13px;margin-top:16px">Families that hear back within the hour enrol. Please call them today.</p></div>';
            foreach ($emails as $to) {
                mailSend(['to' => $to, 'subject' => 'New enquiry — ' . $name . ($child !== '' ? ' for ' . $child : ''), 'html' => $html]);
            }
        }
        $_SESSION['school_id'] = $prev;
    } catch (\Throwable $e) {
        @file_put_contents(__DIR__ . '/../logs/enquiry_notify_' . date('Y-m-d') . '.log', date('c') . ' | ' . $e->getMessage() . "\n", FILE_APPEND);
    }
}
