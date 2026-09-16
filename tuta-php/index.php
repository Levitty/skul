<?php
/**
 * Tuta School — Single entry-point router.
 * All requests come through here via .htaccess rewrite.
 */

require_once __DIR__ . '/config.php';

// Production error posture: never render stack traces to the browser (they
// leak absolute paths and query fragments). Log them instead. To debug a live
// issue temporarily, add `define('APP_DEBUG', true);` to config.php.
if (!defined('APP_DEBUG') || APP_DEBUG !== true) {
    @ini_set('display_errors', '0');
    @ini_set('log_errors', '1');
    error_reporting(E_ALL);
} else {
    @ini_set('display_errors', '1');
    error_reporting(E_ALL);
}

// Safety net: an uncaught exception (e.g. a too-large Supabase ->in() on a big
// school) would otherwise surface as a bare "page cannot handle request" 500.
// Log it and show a friendly page instead — never a stack trace.
if (!defined('APP_DEBUG') || APP_DEBUG !== true) {
    set_exception_handler(function ($e) {
        error_log('Uncaught: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        // TEMPORARY DIAGNOSTIC — remove after debugging. Reveals the real error
        // only when the secret param is present, so normal users never see it.
        if (($_GET['__diag'] ?? '') === 'tuta-9f3a') {
            http_response_code(500);
            header('Content-Type: text/plain');
            echo "DIAG\n" . $e->getMessage() . "\n@ " . $e->getFile() . ':' . $e->getLine() . "\n\n" . $e->getTraceAsString();
            exit;
        }
        http_response_code(500);
        echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Something went wrong</title>'
           . '<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;color:#374151;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}'
           . '.b{max-width:28rem;text-align:center;padding:2rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#6b7280;font-size:.9rem;line-height:1.6}a{color:#059669;text-decoration:none;font-weight:500}</style></head>'
           . '<body><div class="b"><h1>Something went wrong on this page</h1>'
           . '<p>We hit a snag loading this. Please try again, or narrow your selection (e.g. pick a specific class or term). '
           . 'If it keeps happening, let us know.</p><p style="margin-top:1rem"><a href="javascript:history.back()">&larr; Go back</a></p></div></body></html>';
        exit;
    });
}

require_once __DIR__ . '/includes/supabase.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/mailer.php';
require_once __DIR__ . '/includes/storage.php';
require_once __DIR__ . '/includes/sms.php';
require_once __DIR__ . '/includes/permissions.php';
require_once __DIR__ . '/includes/whatsapp.php';

$route = trim($_GET['route'] ?? '', '/');
if ($route === '') $route = 'dashboard';

// Public routes (no login required)
$publicRoutes = ['login', 'logout', 'invite', 'switch-school', 'enquire', 'admit', 'register', 'privacy', 'api/mpesa/callback', 'api/whatsapp/webhook', 'api/enquiry', 'api/mpesa/c2b-validation', 'api/mpesa/c2b-confirmation'];

if (!in_array($route, $publicRoutes)) {
    requireLogin();

    // Parents belong in the parent portal, never the staff app. Without this,
    // un-guarded staff routes (e.g. admissions, enquiries) fall through to the
    // "open to any signed-in staff" default and a logged-in parent could reach
    // them. Keep them on portal routes (+ logout / school switch).
    if (isParent() && !str_starts_with($route, 'portal') && !in_array($route, ['logout', 'switch-school', 'account'], true)) {
        redirect('portal');
    }

    // ── Role-based route guard ─────────────────────────────
    // Defence in depth: even if a sidebar link is hidden, typing the URL
    // is blocked. Admins pass every hasRole() check, so existing
    // administrators are unaffected until real roles are assigned.
    // Capability-driven (migration 099 / includes/permissions.php). Each route
    // maps to a named capability a role holds; admins pass everything. Roles →
    // capabilities are editable per school, so access changes without code edits.
    $deny = false;
    if ($route === 'admin' || str_starts_with($route, 'admin/')) {
        $deny = !isPlatformAdmin();                    // structural — platform only
    } elseif ($route === 'settings' || str_starts_with($route, 'settings')) {
        $deny = !userCan('settings.manage');
    } elseif ($route === 'students/promote') {
        $deny = !isAdmin();                            // high-impact — admin only
    } elseif ($route === 'parents') {
        $deny = !userCan('students.manage');
    } elseif (str_starts_with($route, 'fees')) {
        $deny = !userCan('fees.manage');
    } elseif (str_starts_with($route, 'finance')) {
        $deny = !userCan('finance.books');             // the accounting books
    } elseif (str_starts_with($route, 'exams') || str_starts_with($route, 'grades')) {
        if (in_array($route, ['grades/entry', 'grades/class-remarks', 'grades/subject-remarks'], true)) {
            $deny = !userCan('results.enter');         // enter marks + remarks
        } else {
            $deny = !userCan('results.manage');        // exam setup, report cards, analysis
        }
    } elseif (str_starts_with($route, 'students') || $route === 'classes' || $route === 'sections') {
        $deny = !userCan('students.manage');
    } elseif ($route === 'transport' || $route === 'activities') {
        $deny = !userCan('services.manage');
    } elseif ($route === 'admissions' || $route === 'enquiries') {
        $deny = !userCan('admissions.manage');
    } elseif ($route === 'activity') {
        $deny = !userCan('settings.manage');           // audit log — admin oversight
    }
    // dashboard and anything else: open to any signed-in staff member.

    if ($deny) {
        flash('error', 'You do not have permission to open that page.');
        redirect('dashboard');
    }
}

// Route map
switch ($route) {
    /* ── Auth ──────────────────────────────────────────── */
    case 'login':
        require __DIR__ . '/modules/auth/login.php';
        break;
    case 'enquire':
        require __DIR__ . '/modules/public/enquire.php';
        break;
    case 'admit':
        require __DIR__ . '/modules/public/admit.php';
        break;
    case 'privacy':
        require __DIR__ . '/modules/public/privacy.php';
        break;

    case 'register':
        // No-login class attendance register (token-gated, migration 108).
        require __DIR__ . '/modules/public/register.php';
        break;
    case 'invite':
        require __DIR__ . '/modules/auth/invite.php';
        break;
    case 'switch-school':
        require __DIR__ . '/modules/auth/switch-school.php';
        break;
    case 'account':
        require __DIR__ . '/modules/account/security.php';
        break;
    case 'logout':
        logout();
        break;

    /* ── Platform Admin ───────────────────────────────── */
    case 'admin':
        require __DIR__ . '/modules/admin/dashboard.php';
        break;
    case 'admin/school':
    case 'admin/manage-school':
        require __DIR__ . '/modules/admin/manage-school.php';
        break;
    case 'admin/platform-admins':
        require __DIR__ . '/modules/admin/platform-admins.php';
        break;

    /* ── Dashboard ─────────────────────────────────────── */
    case 'teacher/subject':
        require __DIR__ . '/modules/teacher/subject.php';
        break;
    case 'teacher/student':
        require __DIR__ . '/modules/teacher/student.php';
        break;
    case 'teacher/homework':
        require __DIR__ . '/modules/teacher/homework.php';
        break;
    case 'teacher/lessons':
        require __DIR__ . '/modules/teacher/lessons.php';
        break;
    case 'teacher/questions':
        require __DIR__ . '/modules/teacher/questions.php';
        break;
    case 'lesson-plans':
        require __DIR__ . '/modules/lesson-plans.php';
        break;
    case 'timetable':
        require __DIR__ . '/modules/timetable.php';
        break;
    case 'teacher/timetable':
        require __DIR__ . '/modules/teacher/timetable.php';
        break;
    case 'ask':
        require __DIR__ . '/modules/ask.php';
        break;
    case 'dashboard':
        require __DIR__ . '/modules/dashboard.php';
        break;
    case 'communications/sms':
        require __DIR__ . '/modules/communications/sms.php';
        break;
    case 'staff-room':
        require __DIR__ . '/modules/staff-room.php';
        break;
    case 'group':
        require __DIR__ . '/modules/group.php';
        break;

    /* ── Students & Classes ────────────────────────────── */
    case 'students/streams':
        require __DIR__ . '/modules/students/streams.php';
        break;
    case 'students/attendance':
        require __DIR__ . '/modules/students/attendance.php';
        break;

    case 'students':
        require __DIR__ . '/modules/students/list.php';
        break;
    case 'students/add':
        require __DIR__ . '/modules/students/add.php';
        break;
    case 'students/view':
        require __DIR__ . '/modules/students/view.php';
        break;
    case 'students/edit':
        require __DIR__ . '/modules/students/edit.php';
        break;
    case 'students/import':
        require __DIR__ . '/modules/students/import.php';
        break;
    case 'classes':
        require __DIR__ . '/modules/students/classes.php';
        break;
    case 'sections':   // one page for streams now
        redirect('students/streams');
    case 'students/promote':
        require __DIR__ . '/modules/students/promote.php';
        break;
    case 'enquiries':
        require __DIR__ . '/modules/enquiries.php';
        break;
    case 'admissions':
        require __DIR__ . '/modules/admissions.php';
        break;
    case 'parents':
        require __DIR__ . '/modules/parents.php';
        break;

    /* ── Fees & Payments ───────────────────────────────── */
    case 'fees':
    case 'fees/dashboard':
        require __DIR__ . '/modules/fees/dashboard.php';
        break;
    case 'fees/heads':
        require __DIR__ . '/modules/fees/heads.php';
        break;
    case 'fees/groups':
        // Legacy route — redirect to new Schedules UI
        redirect('fees/schedules');
        break;
    case 'fees/schedules':
        require __DIR__ . '/modules/fees/schedules.php';
        break;
    case 'fees/schedules/edit':
        require __DIR__ . '/modules/fees/schedule-edit.php';
        break;
    case 'fees/invoices':
        require __DIR__ . '/modules/fees/invoices.php';
        break;
    case 'fees/invoices/generate':
        require __DIR__ . '/modules/fees/generate.php';
        break;
    case 'group/reports':
        require __DIR__ . '/modules/group-reports.php';
        break;
    case 'fees/charge':
        // Folded into Generate Invoices as a third mode. Kept so older
        // links and bookmarks still land in the right place.
        redirect('fees/invoices/generate?mode=charge');
        break;
    case 'fees/reconcile':
        require __DIR__ . '/modules/fees/reconcile.php';
        break;
    case 'fees/payments':
        require __DIR__ . '/modules/fees/payments.php';
        break;
    case 'fees/credits':
        require __DIR__ . '/modules/fees/credits.php';
        break;
    case 'fees/reminders':
        require __DIR__ . '/modules/fees/reminders.php';
        break;
    case 'fees/receipt':
        require __DIR__ . '/modules/fees/receipt.php';
        break;
    case 'fees/invoice-print':
        require __DIR__ . '/modules/fees/invoice-print.php';
        break;
    case 'fees/bulk-print':
        require __DIR__ . '/modules/fees/bulk-print.php';
        break;
    case 'fees/report':
        require __DIR__ . '/modules/fees/report.php';
        break;
    case 'fees/aging':
        require __DIR__ . '/modules/fees/aging.php';
        break;
    case 'fees/concessions':
        require __DIR__ . '/modules/fees/concessions.php';
        break;
    case 'fees/trend':
        require __DIR__ . '/modules/fees/trend.php';
        break;
    case 'fees/discounts':
        require __DIR__ . '/modules/fees/discounts.php';
        break;
    case 'fees/penalties':
        require __DIR__ . '/modules/fees/penalties.php';
        break;
    case 'fees/family':
        require __DIR__ . '/modules/fees/family.php';
        break;

    /* ── Grades & Exams ────────────────────────────────── */
    case 'exams':
        require __DIR__ . '/modules/grades/exams.php';
        break;
    case 'exams/add':
        require __DIR__ . '/modules/grades/exam-add.php';
        break;
    case 'grades':
    case 'grades/entry':
        require __DIR__ . '/modules/grades/entry.php';
        break;
    case 'grades/reports':
        require __DIR__ . '/modules/grades/reports.php';
        break;
    case 'grades/report-card':
        require __DIR__ . '/modules/grades/report-card.php';
        break;
    case 'grades/class-remarks':
        require __DIR__ . '/modules/grades/class-remarks.php';
        break;
    case 'grades/subject-remarks':
        require __DIR__ . '/modules/grades/subject-remarks.php';
        break;
    case 'grades/analysis':
        require __DIR__ . '/modules/grades/analysis.php';
        break;
    case 'grades/import':
        require __DIR__ . '/modules/grades/import.php';
        break;

    /* ── Parent Portal ────────────────────────────────── */
    case 'portal':
    case 'portal/home':
        require __DIR__ . '/modules/portal/home.php';
        break;
    case 'portal/child':
        require __DIR__ . '/modules/portal/child.php';
        break;
    case 'portal/report-card':
        require __DIR__ . '/modules/portal/report-card.php';
        break;
    case 'portal/statement':
        require __DIR__ . '/modules/portal/statement.php';
        break;
    case 'portal/receipt':
        require __DIR__ . '/modules/portal/receipt.php';
        break;

    /* ── Finance ──────────────────────────────────────── */
    case 'finance':
    case 'finance/overview':
        require __DIR__ . '/modules/finance/overview.php';
        break;
    case 'finance/fee-analysis':
        require __DIR__ . '/modules/finance/fee-analysis.php';
        break;
    case 'finance/fee-simulator':
        require __DIR__ . '/modules/finance/fee-simulator.php';
        break;
    case 'finance/accountant-pack':
        require __DIR__ . '/modules/finance/accountant-pack.php';
        break;
    case 'finance/payroll':
        require __DIR__ . '/modules/finance/payroll.php';
        break;

    case 'finance/petty-cash':
        require __DIR__ . '/modules/finance/petty-cash.php';
        break;
    case 'finance/cost-centres':
        require __DIR__ . '/modules/finance/cost-centres.php';
        break;
    case 'finance/expenses':
        require __DIR__ . '/modules/finance/expenses.php';
        break;
    case 'finance/income':
        require __DIR__ . '/modules/finance/income.php';
        break;
    case 'finance/uniform':
        require __DIR__ . '/modules/finance/uniform.php';
        break;
    case 'finance/expense-report':
        require __DIR__ . '/modules/finance/expense-report.php';
        break;
    case 'finance/uniform-receipt':
        require __DIR__ . '/modules/finance/uniform-receipt.php';
        break;
    case 'finance/uniform-catalogue':
        // Folded into the Uniform page as its Stock tab.
        redirect('finance/uniform?tab=stock');
        break;
    case 'finance/uniform-transfers':
        // Folded into the Uniform page as its Transfers tab.
        redirect('finance/uniform?tab=transfers');
        break;
    case 'finance/chart-of-accounts':
        require __DIR__ . '/modules/finance/chart-of-accounts.php';
        break;
    case 'finance/expense-import':
        require __DIR__ . '/modules/finance/expense-import.php';
        break;
    case 'finance/statement-import':
        require __DIR__ . '/modules/finance/statement-import.php';
        break;
    case 'finance/briefing':
        require __DIR__ . '/modules/finance/briefing.php';
        break;
    case 'finance/ledger':
        require __DIR__ . '/modules/finance/ledger.php';
        break;
    case 'finance/trial-balance':
        require __DIR__ . '/modules/finance/trial-balance.php';
        break;
    case 'finance/income-statement':
        require __DIR__ . '/modules/finance/income-statement.php';
        break;
    case 'finance/balance-sheet':
        require __DIR__ . '/modules/finance/balance-sheet.php';
        break;

    /* ── Services (Transport & Activities) ───────────── */
    case 'transport/buses':
        require __DIR__ . '/modules/transport/buses.php';
        break;
    case 'transport/roster':
        require __DIR__ . '/modules/transport/roster.php';
        break;
    case 'transport':
        require __DIR__ . '/modules/transport/routes.php';
        break;
    case 'activities':
        require __DIR__ . '/modules/transport/activities.php';
        break;

    /* ── Settings ──────────────────────────────────────── */
    case 'activity':
        require __DIR__ . '/modules/activity.php';
        break;
    case 'approvals':
        require __DIR__ . '/modules/approvals.php';
        break;
    case 'settings':
        require __DIR__ . '/modules/settings.php';
        break;

    /* ── API Endpoints ────────────────────────────────── */
    case 'api/mpesa/callback':
        require __DIR__ . '/modules/api/mpesa-callback.php';
        break;
    case 'api/enquiry':
        require __DIR__ . '/modules/api/enquiry.php';
        break;
    case 'api/whatsapp/webhook':
        require __DIR__ . '/modules/api/whatsapp-webhook.php';
        break;
    case 'api/mpesa/stk-push':
        require __DIR__ . '/modules/api/mpesa-stk-push.php';
        break;
    case 'api/mpesa/c2b-validation':
        require __DIR__ . '/modules/api/mpesa-c2b-validation.php';
        break;
    case 'api/mpesa/c2b-confirmation':
        require __DIR__ . '/modules/api/mpesa-c2b-confirmation.php';
        break;

    /* ── 404 ───────────────────────────────────────────── */
    default:
        http_response_code(404);
        require __DIR__ . '/includes/layout-top.php';
        echo '<div class="flex items-center justify-center h-96"><div class="text-center"><h1 class="text-4xl font-bold text-gray-400 mb-2">404</h1><p class="text-gray-500">Page not found</p><a href="' . baseUrl('dashboard') . '" class="mt-4 inline-block text-emerald-600 hover:underline">Back to Dashboard</a></div></div>';
        require __DIR__ . '/includes/layout-bottom.php';
        break;
}
