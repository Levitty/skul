<?php
$user = currentUser();
$currentRoute = trim($_GET['route'] ?? '', '/');

// Role-based sidebar visibility — admins pass every hasRole() check.
// Plain classroom teachers don't get the all-students / all-classes sections
// or the broad academics menu — they work from their "My Teaching" home, which
// links straight to their own classes' mark entry and remarks.
// Capability-driven sidebar visibility (includes/permissions.php). Admins hold
// every capability, so they see everything.
$navStudents  = userCan('students.manage');
$navFees      = userCan('fees.manage');
$navFinance   = userCan('finance.books');       // accounting books
$navAcademics = userCan('academics.oversight'); // lesson-plan oversight, timetable
$navResults   = userCan('results.manage');      // exams, report cards, analysis
$navServices  = userCan('services.manage');     // transport & activities
$navSettings  = userCan('settings.manage');
$navTeaching  = userCan('teaching.own');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e($pageTitle ?? 'Dashboard') ?> — <?= APP_NAME ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link rel="stylesheet" href="/assets/tuta-extra.css?v=1">
    <script>
        // (Tailwind is pre-compiled to /assets/tuta.css — no runtime config needed.)
        window.BASE_URL = <?= json_encode(rtrim(baseUrl(''), '/') . '/') ?>;
        window.CSRF_TOKEN = <?= json_encode(function_exists('csrf') ? csrf() : '') ?>;

        // ── Global modal helpers (hoisted into <head> on purpose) ──
        // Defined here so every button on every page can call openModal /
        // closeModal — even if a later <script> in the body fails to run for
        // any reason (PJAX swap quirks, browser extensions, etc.). Also
        // delegates clicks on [data-modal-open] / [data-modal-close].
        window.openModal = function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('hidden');
            el.style.display = '';
        };
        window.closeModal = function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        };

        // ── Mobile sidebar (off-canvas) ──
        window.openSidebar = function () {
            var s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay');
            if (s) s.classList.remove('-translate-x-full');
            if (o) o.classList.remove('hidden');
        };
        window.closeSidebar = function () {
            var s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay');
            if (s) s.classList.add('-translate-x-full');
            if (o) o.classList.add('hidden');
        };
        window.toggleSidebar = function () {
            var s = document.getElementById('sidebar');
            if (s && s.classList.contains('-translate-x-full')) window.openSidebar();
            else window.closeSidebar();
        };
        // Tapping a nav link closes the drawer on mobile.
        document.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('#sidebar a');
            if (a) window.closeSidebar();
        });
        document.addEventListener('click', function (e) {
            var opener = e.target.closest && e.target.closest('[data-modal-open]');
            if (opener) {
                e.preventDefault();
                window.openModal(opener.getAttribute('data-modal-open'));
                return;
            }
            var closer = e.target.closest && e.target.closest('[data-modal-close]');
            if (closer) {
                e.preventDefault();
                window.closeModal(closer.getAttribute('data-modal-close'));
            }
        });

        // ── Edit-modal populators (hoisted so they always exist on call) ──
        // These reference IDs that live on /finance/expenses; on other pages
        // they no-op because the elements aren't present. Lives here because
        // page-bottom <script> tags weren't executing reliably under PJAX.
        var _setVal = function (id, val) {
            var el = document.getElementById(id);
            if (el) el.value = (val == null ? '' : val);
        };
        window.editCategory = function (id, name, desc, parent) {
            if (!document.getElementById('editCatModal')) return;
            _setVal('editCatId', id);
            _setVal('editCatName', name);
            _setVal('editCatDesc', desc);
            _setVal('editCatParent', parent);
            window.openModal('editCatModal');
        };
        window.editExpense = function (exp) {
            if (!document.getElementById('editExpenseModal')) return;
            exp = exp || {};
            _setVal('editExpId',       exp.id);
            _setVal('editExpDesc',     exp.description);
            _setVal('editExpAmount',   exp.amount);
            _setVal('editExpDate',     exp.expense_date);
            _setVal('editExpCat',      exp.category_id);
            // Ensure current method is selectable even if it is a legacy code
            // no longer in Settings → Payment Methods.
            var methodSel = document.getElementById('editExpMethod');
            var methodVal = exp.payment_method || 'cash';
            if (methodSel && methodVal) {
                var found = false;
                for (var i = 0; i < methodSel.options.length; i++) {
                    if (methodSel.options[i].value === methodVal) { found = true; break; }
                }
                if (!found) {
                    var opt = document.createElement('option');
                    opt.value = methodVal;
                    opt.textContent = methodVal.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
                    methodSel.appendChild(opt);
                }
                methodSel.value = methodVal;
            }
            _setVal('editExpSupplier', exp.vendor_name);
            _setVal('editExpRef',      exp.invoice_number);
            _setVal('editExpCC',       exp.cost_centre_id);
            _setVal('editExpLitres',   exp.litres);
            _setVal('editExpOdo',      exp.odometer_km);
            if (window.xpFuelFields) window.xpFuelFields('editExpenseModal');
            window.openModal('editExpenseModal');
        };
        // Add-fee-to-draft opener (fees/invoices). Hoisted here for the same
        // reason as the editors above — the page-bottom <script> that would
        // otherwise define it doesn't re-run reliably under PJAX (a top-level
        // const in that block throws on the 2nd visit and kills the whole
        // script). No-ops on pages without the modal.
        window.openAddFee = function (invoiceId, ref, student, isDraft, hasPaid) {
            if (!document.getElementById('addFeeModal')) return;
            _setVal('addFeeInvId', invoiceId);
            var info = document.getElementById('addFeeInfo');
            if (info) {
                info.textContent = (ref || 'Invoice') + ' — ' + (student || 'Student')
                    + (isDraft === false ? '  ·  already issued — changes affect the balance the parent owes' : '');
            }
            // Render the invoice's current lines. Remove is offered ONLY when no
            // payment has been made — once money is in, lines are frozen (fraud
            // control: you can't shrink an invoice a parent has started paying).
            var box = document.getElementById('addFeeLines');
            if (box) {
                var items = (window.INVOICE_ITEMS || {})[invoiceId] || [];
                if (!items.length) {
                    box.innerHTML = '<p style="font-size:12px;color:#9ca3af;padding:8px 12px">No lines yet.</p>';
                } else {
                    box.innerHTML = items.map(function (it) {
                        var amt = Number(it.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                        var neg = Number(it.amount) < 0;
                        var control = hasPaid
                          ? '<a href="' + (window.BASE_URL || '') + 'fees/credits?invoice_id=' + encodeURIComponent(invoiceId)
                            + '&amount=' + encodeURIComponent(Math.abs(Number(it.amount) || 0))
                            + '&reason_code=' + (String(it.description || '').toLowerCase().indexOf('transport') >= 0 ? 'transport_withdrawn' : 'billing_error')
                            + '&description=' + encodeURIComponent('Credit — ' + (it.description || 'fee'))
                            + '&item_id=' + encodeURIComponent(it.id || '')
                            + '" style="color:#d97706;font-size:11px;font-weight:500;text-decoration:none" title="Lines locked after payment — issue a credit instead">Issue credit</a>'
                          : '<form method="POST" style="display:inline;margin:0" onsubmit="return confirm(\'Remove this line from the invoice?\')">'
                            + '<input type="hidden" name="_token" value="' + (window.CSRF_TOKEN || '') + '">'
                            + '<input type="hidden" name="action" value="remove_item">'
                            + '<input type="hidden" name="invoice_id" value="' + invoiceId + '">'
                            + '<input type="hidden" name="item_id" value="' + it.id + '">'
                            + '<button type="submit" style="color:#ef4444;font-size:12px;font-weight:500;background:none;border:none;cursor:pointer">Remove</button>'
                            + '</form>';
                        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;font-size:13px">'
                          + '<span style="color:#374151;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (it.description || 'Fee') + '</span>'
                          + '<span style="color:' + (neg ? '#059669' : '#374151') + ';white-space:nowrap">' + amt + '</span>'
                          + control + '</div>';
                    }).join('');
                }
            }
            _setVal('addFeeDesc', 'Balance brought forward');
            _setVal('addFeeAmount', '');
            window.openModal('addFeeModal');
            var amt = document.getElementById('addFeeAmount');
            if (amt) amt.focus();
        };
    </script>
    <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        .sidebar-link { display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.75rem; border-radius:0.5rem; font-size:0.875rem; transition:all 0.15s; }
        .sidebar-link svg { width:18px; height:18px; flex-shrink:0; }

        /* Collapsible nav groups (retractable sidebar sections) */
        .nav-group-toggle { display:flex; align-items:center; gap:0.5rem; width:100%; padding:0.5rem 0.75rem; margin-top:0.5rem; border-radius:0.5rem; font-size:0.7rem; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#9ca3af; background:none; border:none; cursor:pointer; transition:background 0.15s, color 0.15s; }
        .nav-group-toggle:hover { background:#f9fafb; color:#6b7280; }
        .nav-chevron { margin-left:auto; width:14px; height:14px; flex-shrink:0; transition:transform 0.2s ease; }
        .nav-group.open > .nav-group-toggle { color:#10b981; }
        .nav-group.open > .nav-group-toggle .nav-chevron { transform:rotate(90deg); }
        .nav-group-body { overflow:hidden; max-height:0; transition:max-height 0.25s ease; }
        .nav-group.open > .nav-group-body { max-height:640px; }

        /* PJAX loading bar */
        #pjax-bar {
            position:fixed; top:0; left:0; height:3px; z-index:9999;
            background: linear-gradient(90deg, #10b981, #14b8a6, #10b981);
            background-size: 200% 100%;
            width:0; opacity:0;
            transition: width 0.3s ease, opacity 0.15s ease;
            pointer-events:none;
        }
        #pjax-bar.loading { opacity:1; animation: pjax-shimmer 1s linear infinite; }
        @keyframes pjax-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        /* Content fade */
        #pjax-content { transition: opacity 0.1s ease; }
        #pjax-content.loading { opacity:0.45; pointer-events:none; }
    </style>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body class="bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 min-h-screen">

<!-- PJAX loading bar -->
<div id="pjax-bar"></div>

<div class="flex min-h-screen">
    <!-- Sidebar (off-canvas on mobile, fixed on desktop) -->
    <aside id="sidebar" class="w-60 bg-white border-r border-gray-100 flex flex-col fixed h-full z-40 transform -translate-x-full transition-transform duration-200 md:translate-x-0">
        <!-- School identity (replaces product name in the brand slot) -->
        <?php
        $sidebarSchool   = cachedSchool() ?? [];
        $sidebarName     = $sidebarSchool['name']     ?? APP_NAME;
        $sidebarLogo     = $sidebarSchool['logo_url'] ?? '';
        $sidebarInitials = strtoupper(substr($sidebarName ?: 'S', 0, 2));
        ?>
        <div class="p-5 border-b border-gray-100">
            <div class="flex items-center gap-2.5 min-w-0">
                <?php if ($sidebarLogo): ?>
                    <img src="<?= e($sidebarLogo) ?>" alt="<?= e($sidebarName) ?>" class="w-9 h-9 rounded-lg object-contain border border-gray-100 bg-white flex-shrink-0">
                <?php else: ?>
                    <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                        <span class="text-white text-xs font-bold tracking-wider"><?= e($sidebarInitials) ?></span>
                    </div>
                <?php endif; ?>
                <div class="min-w-0">
                    <p class="font-bold text-sm text-gray-900 truncate leading-tight" title="<?= e($sidebarName) ?>"><?= e($sidebarName) ?></p>
                    <p class="text-[10px] text-gray-400 leading-tight">Powered by <?= APP_NAME ?></p>
                </div>
            </div>
        </div>

        <!-- Nav -->
        <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
            <a href="<?= baseUrl('dashboard') ?>" class="sidebar-link <?= activeIf($currentRoute, 'dashboard') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                Dashboard
            </a>
            <?php if (userCan('dashboard.finance') || isAdmin() || (schoolId() === '' && !empty($_SESSION['group_id']))): ?>
            <a href="<?= baseUrl('ask') ?>" class="sidebar-link <?= activeIf($currentRoute, 'ask') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                Ask
            </a>
            <?php endif; ?>

            <?php if (!empty($_SESSION['group_id'])): ?>
            <a href="<?= baseUrl('group') ?>" class="sidebar-link <?= activeIf($currentRoute, 'group') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                Group Dashboard
            </a>
            <?php endif; ?>

            <a href="<?= baseUrl('staff-room') ?>" class="sidebar-link <?= activeIf($currentRoute, 'staff-room') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                Staff Room
            </a>
            <?php if (hasRole(['bursar', 'head_teacher', 'front_office']) || isAdmin()): ?>
            <a href="<?= baseUrl('communications/sms') ?>" class="sidebar-link <?= activeIf($currentRoute, 'communications/sms') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                Send SMS
            </a>
            <?php endif; ?>

            <?php if ($navStudents): ?>
            <div class="nav-group" data-group="students">
            <button type="button" class="nav-group-toggle" onclick="toggleNavGroup(this)">
                <span class="flex-1 text-left">Students</span>
                <svg class="nav-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
            <div class="nav-group-body space-y-1">
            <a href="<?= baseUrl('students') ?>" class="sidebar-link <?= activeIf($currentRoute, 'students') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/></svg>
                All Students
            </a>
            <a href="<?= baseUrl('students/attendance') ?>" class="sidebar-link <?= activeIf($currentRoute, 'students/attendance') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                Attendance
            </a>
            <a href="<?= baseUrl('classes') ?>" class="sidebar-link <?= activeIf($currentRoute, 'classes') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                Classes
            </a>
            <a href="<?= baseUrl('students/streams') ?>" class="sidebar-link <?= activeIf($currentRoute, 'students/streams') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                Streams
            </a>
            <?php if (isAdmin()): ?>
            <a href="<?= baseUrl('students/promote') ?>" class="sidebar-link <?= activeIf($currentRoute, 'students/promote') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                Promotion
            </a>
            <?php endif; ?>
            <a href="<?= baseUrl('admissions') ?>" class="sidebar-link <?= activeIf($currentRoute, 'admissions') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7zM20 8v6m3-3h-6"/></svg>
                Admissions
            </a>
            <a href="<?= baseUrl('enquiries') ?>" class="sidebar-link <?= activeIf($currentRoute, 'enquiries') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                Enquiries
            </a>
            </div>
            </div>

            <?php endif; ?>
            <?php if ($navFees): ?>
            <div class="nav-group" data-group="fees">
            <button type="button" class="nav-group-toggle" onclick="toggleNavGroup(this)">
                <span class="flex-1 text-left">Fees</span>
                <svg class="nav-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
            <div class="nav-group-body space-y-1">
            <a href="<?= baseUrl('fees') ?>" class="sidebar-link <?= ($currentRoute === 'fees' || $currentRoute === 'fees/dashboard') ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-600 hover:bg-gray-50' ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                Fees Dashboard
            </a>
            <a href="<?= baseUrl('fees/heads') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/heads') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                Fee Heads
            </a>
            <a href="<?= baseUrl('fees/schedules') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/schedules') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                Schedules
            </a>
            <a href="<?= baseUrl('fees/invoices') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/invoices') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Invoices
            </a>
            <a href="<?= baseUrl('fees/credits') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/credits') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/></svg>
                Credit Notes
            </a>
            <a href="<?= baseUrl('fees/payments') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/payments') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                Payments
            </a>
            <a href="<?= baseUrl('fees/reminders') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/reminders') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                Fee Reminders
            </a>
            <a href="<?= baseUrl('fees/reconcile') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/reconcile') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m4 6H4m0 0l4 4m-4-4l4-4"/></svg>
                Reconcile
            </a>
            <a href="<?= baseUrl('fees/discounts') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/discounts') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                Discounts
            </a>
            <a href="<?= baseUrl('fees/penalties') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/penalties') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Penalties
            </a>
            <a href="<?= baseUrl('fees/family') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/family') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                Family Billing
            </a>
            <a href="<?= baseUrl('fees/report') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/report') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Fee Report
            </a>
            <a href="<?= baseUrl('fees/aging') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/aging') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Aged Receivables
            </a>
            <a href="<?= baseUrl('fees/trend') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/trend') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                Collection Trend
            </a>
            <a href="<?= baseUrl('fees/concessions') ?>" class="sidebar-link <?= activeIf($currentRoute, 'fees/concessions') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                Concessions Report
            </a>
            </div>
            </div>

            <?php endif; ?>
            <?php if ($navFinance): ?>
            <div class="nav-group" data-group="finance">
            <button type="button" class="nav-group-toggle" onclick="toggleNavGroup(this)">
                <span class="flex-1 text-left">Finance</span>
                <svg class="nav-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
            <div class="nav-group-body space-y-1">
            <a href="<?= baseUrl('finance/overview') ?>" class="sidebar-link <?= ($currentRoute === 'finance' || $currentRoute === 'finance/overview') ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-600 hover:bg-gray-50' ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Overview
            </a>
            <a href="<?= baseUrl('finance/fee-analysis') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/fee-analysis') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Fee Analysis
            </a>
            <a href="<?= baseUrl('finance/fee-simulator') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/fee-simulator') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m8-4a8 8 0 11-16 0 8 8 0 0116 0z"/></svg>
                Fee Planner
            </a>
            <a href="<?= baseUrl('finance/briefing') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/briefing') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
                School Briefing
            </a>
            <a href="<?= baseUrl('finance/accountant-pack') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/accountant-pack') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Accountant Pack
            </a>
            <a href="<?= baseUrl('finance/expenses') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/expenses') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"/></svg>
                Expenses
            </a>
            <a href="<?= baseUrl('finance/petty-cash') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/petty-cash') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                Petty Cash
            </a>
            <a href="<?= baseUrl('finance/cost-centres') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/cost-centres') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                Cost Centres
            </a>
            <a href="<?= baseUrl('finance/payroll') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/payroll') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                Payroll
            </a>
            <a href="<?= baseUrl('finance/income') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/income') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                Income
            </a>
            <a href="<?= baseUrl('finance/statement-import') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/statement-import') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L7 8m4-4v12"/></svg>
                Import Statement
            </a>
            <a href="<?= baseUrl('finance/expense-import') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/expense-import') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L7 8m4-4v12"/></svg>
                Import Expenses
            </a>
            <a href="<?= baseUrl('finance/uniform') ?>" class="sidebar-link <?= $currentRoute === 'finance/uniform' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-600 hover:bg-gray-50' ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                Uniform
            </a>
            <p class="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Accounting</p>
            <a href="<?= baseUrl('finance/trial-balance') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/trial-balance') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>
                Trial Balance
            </a>
            <a href="<?= baseUrl('finance/income-statement') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/income-statement') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
                Income &amp; Expenditure
            </a>
            <a href="<?= baseUrl('finance/balance-sheet') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/balance-sheet') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6zM3 10h18M12 4v16"/></svg>
                Balance Sheet
            </a>
            <a href="<?= baseUrl('finance/ledger') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/ledger') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                General Ledger
            </a>
            <a href="<?= baseUrl('finance/chart-of-accounts') ?>" class="sidebar-link <?= activeIf($currentRoute, 'finance/chart-of-accounts') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                Chart of Accounts
            </a>
            </div>
            </div>

            <?php endif; ?>
            <?php if ($navTeaching || $navResults): ?>
            <div class="nav-group" data-group="academics">
            <button type="button" class="nav-group-toggle" onclick="toggleNavGroup(this)">
                <span class="flex-1 text-left">Academics</span>
                <svg class="nav-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
            <div class="nav-group-body space-y-1">
            <?php if ($navTeaching): ?>
            <!-- Teacher's own tools (teacher / head teacher / admin) — not the Exams Officer -->
            <a href="<?= baseUrl('teacher/lessons') ?>" class="sidebar-link <?= activeIf($currentRoute, 'teacher/lessons') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                Lesson Plans
            </a>
            <a href="<?= baseUrl('teacher/homework') ?>" class="sidebar-link <?= activeIf($currentRoute, 'teacher/homework') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                Homework
            </a>
            <a href="<?= baseUrl('teacher/questions') ?>" class="sidebar-link <?= activeIf($currentRoute, 'teacher/questions') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Question Bank
            </a>
            <a href="<?= baseUrl('teacher/timetable') ?>" class="sidebar-link <?= activeIf($currentRoute, 'teacher/timetable') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                My Timetable
            </a>
            <?php endif; ?>
            <?php if ($navResults): ?>
            <!-- Results: Exams Officer + head teacher / admin -->
            <a href="<?= baseUrl('exams') ?>" class="sidebar-link <?= activeIf($currentRoute, 'exams') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                Exams
            </a>
            <a href="<?= baseUrl('grades/entry') ?>" class="sidebar-link <?= activeIf($currentRoute, 'grades') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                Grade Entry
            </a>
            <a href="<?= baseUrl('grades/reports') ?>" class="sidebar-link <?= activeIf($currentRoute, 'grades/reports') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Report Cards
            </a>
            <a href="<?= baseUrl('grades/analysis') ?>" class="sidebar-link <?= activeIf($currentRoute, 'grades/analysis') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Analysis
            </a>
            <?php endif; ?>
            <?php if ($navAcademics): ?>
            <!-- Lesson-plan oversight + timetable — head teacher / admin only -->
            <a href="<?= baseUrl('lesson-plans') ?>" class="sidebar-link <?= activeIf($currentRoute, 'lesson-plans') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                All Lesson Plans
            </a>
            <a href="<?= baseUrl('timetable') ?>" class="sidebar-link <?= activeIf($currentRoute, 'timetable') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                Timetable
            </a>
            <?php endif; ?>
            </div>
            </div>

            <?php endif; ?>
            <?php if ($navServices): ?>
            <div class="nav-group" data-group="services">
            <button type="button" class="nav-group-toggle" onclick="toggleNavGroup(this)">
                <span class="flex-1 text-left">Services</span>
                <svg class="nav-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
            <div class="nav-group-body space-y-1">
            <a href="<?= baseUrl('transport') ?>" class="sidebar-link <?= activeIf($currentRoute, 'transport') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                Transport
            </a>
            <a href="<?= baseUrl('transport/roster') ?>" class="sidebar-link <?= activeIf($currentRoute, 'transport/roster') ?><?= activeIf($currentRoute, 'transport/buses') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"/></svg>
                Bus roster
            </a>
            <a href="<?= baseUrl('activities') ?>" class="sidebar-link <?= activeIf($currentRoute, 'activities') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Activities
            </a>
            </div>
            </div>

            <?php endif; ?>
            <?php if ($navSettings): ?>
            <div class="nav-group" data-group="system">
            <button type="button" class="nav-group-toggle" onclick="toggleNavGroup(this)">
                <span class="flex-1 text-left">System</span>
                <svg class="nav-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
            <div class="nav-group-body space-y-1">
            <a href="<?= baseUrl('settings') ?>" class="sidebar-link <?= activeIf($currentRoute, 'settings') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Settings
            </a>
            <a href="<?= baseUrl('activity') ?>" class="sidebar-link <?= activeIf($currentRoute, 'activity') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                Activity Log
            </a>
            <a href="<?= baseUrl('approvals') ?>" class="sidebar-link <?= activeIf($currentRoute, 'approvals') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Approvals
            </a>
            <a href="<?= baseUrl('parents') ?>" class="sidebar-link <?= activeIf($currentRoute, 'parents') ?>">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2-5.24"/></svg>
                Parent Accounts
            </a>
            <?php if (isPlatformAdmin()): ?>
                <a href="<?= baseUrl('admin') ?>" class="sidebar-link <?= activeIf($currentRoute, 'admin') ?>">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    Platform Admin
                </a>
            <?php endif; ?>
            </div>
            </div>
            <?php endif; ?>
        </nav>

        <!-- School-switch link (only when the user belongs to multiple schools) -->
        <div class="border-t border-gray-100">
            <?php if (hasMultipleSchools()): ?>
                <div class="px-4 py-2 bg-emerald-50/50">
                    <a href="<?= baseUrl('switch-school') ?>" class="text-[11px] font-medium text-emerald-600 hover:underline">Switch school &rarr;</a>
                </div>
            <?php endif; ?>
            <div class="p-3">
                <div class="flex items-center justify-between px-3 py-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <div class="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-xs flex-shrink-0">
                            <?= strtoupper(substr($user['name'] ?? 'U', 0, 1)) ?>
                        </div>
                        <span class="text-sm text-gray-700 truncate"><?= e($user['name'] ?? 'User') ?></span>
                    </div>
                    <div class="flex items-center gap-1">
                        <a href="<?= baseUrl('account') ?>" class="text-gray-400 hover:text-emerald-600" title="Change password">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                        </a>
                        <a href="<?= baseUrl('logout') ?>" class="text-gray-400 hover:text-red-500" title="Logout">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </aside>

    <!-- Mobile overlay (tap to close the sidebar) -->
    <div id="sidebarOverlay" onclick="closeSidebar()" class="fixed inset-0 bg-black/40 z-30 hidden md:hidden"></div>

    <!-- Main content -->
    <main class="flex-1 md:ml-60 p-4 md:p-6 min-w-0">
        <!-- Mobile top bar with hamburger (hidden on desktop) -->
        <div class="md:hidden -mx-4 -mt-4 mb-4 sticky top-0 z-20 flex items-center gap-3 bg-white border-b border-gray-100 px-4 py-3">
            <button type="button" onclick="toggleSidebar()" aria-label="Open menu" class="p-1.5 -ml-1 rounded-lg text-gray-700 hover:bg-gray-100">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <span class="font-semibold text-sm text-gray-900 truncate"><?= e($sidebarName) ?></span>
        </div>
        <div id="pjax-content">
        <?php foreach (getFlash() as $msg): ?>
            <div class="mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3 flex-wrap <?= $msg['type'] === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200' ?>">
                <span><?= e($msg['message']) ?></span>
                <?php if (!empty($msg['link_url'])): ?>
                    <a href="<?= e($msg['link_url']) ?>" target="_blank" rel="noopener"
                       class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold <?= $msg['type'] === 'success' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-600 text-white hover:bg-red-700' ?> transition whitespace-nowrap">
                        <?= e($msg['link_text'] ?? 'Open') ?>
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    </a>
                <?php endif; ?>
            </div>
        <?php endforeach; ?>
