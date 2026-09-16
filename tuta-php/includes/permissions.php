<?php
/**
 * Capability-based permissions.
 *
 * Replaces scattered hasRole(['bursar', …]) checks with a fixed set of named
 * capabilities a role holds. Roles → capabilities are seeded in role_defaults
 * and overridable per school in school_roles (migration 099).
 *
 * userCan('fees.manage') is the single check used by guards, nav, and the
 * dashboard. Admins (school_admin / platform_admin) pass everything.
 *
 * Transition-safe: if the session hasn't been filled with the user's resolved
 * capabilities yet, userCan() falls back to the seed map by role — so guards
 * can be converted incrementally, even before login loads capabilities.
 */

/** The full capability catalogue (label = what an admin sees in the UI). */
const CAPABILITIES = [
    'dashboard.finance'   => 'See money totals on the dashboard',
    'students.manage'     => 'Students, classes, sections, promotion',
    'admissions.manage'   => 'Admissions & enquiries',
    'fees.manage'         => 'Billing, invoices, payments, discounts, fee reports',
    'finance.books'       => 'Ledger, chart of accounts, expenses, statement import',
    'results.enter'       => 'Enter grades & remarks',
    'results.manage'      => 'Exam setup, report cards, analysis',
    'teaching.own'        => "A teacher's own tools",
    'academics.oversight' => 'Lesson-plan oversight, timetable builder',
    'services.manage'     => 'Transport & activities',
    'comms.send'          => 'Send SMS / WhatsApp',
    'approvals.manage'    => 'Approvals inbox',
    'settings.manage'     => 'School settings',
];

/**
 * Role key → label for a school: the built-in roles plus any custom/overridden
 * roles defined in school_roles. Used by the staff role dropdown + validation
 * so custom roles are assignable.
 */
function schoolRoleLabels(?string $schoolId = null): array
{
    $labels   = roleLabels();
    $schoolId = $schoolId ?? schoolId();
    if ($schoolId !== '' && $schoolId !== null) {
        $sb   = new Supabase();
        $rows = $sb->from('school_roles')->select('role_key,label')
            ->eq('school_id', $schoolId)->execute()['data'] ?? [];
        foreach ($rows as $r) {
            if (!empty($r['role_key'])) $labels[$r['role_key']] = $r['label'] ?? $r['role_key'];
        }
    }
    return $labels;
}

/** Seed defaults — mirrors role_defaults in migration 099. */
function roleDefaultCapabilities(string $role): array
{
    static $map = [
        'head_teacher'  => ['students.manage', 'admissions.manage', 'results.enter', 'results.manage', 'teaching.own', 'academics.oversight', 'services.manage', 'dashboard.finance'],
        'teacher'       => ['teaching.own', 'results.enter'],
        'bursar'        => ['fees.manage', 'finance.books', 'comms.send', 'dashboard.finance'],
        'front_office'  => ['fees.manage', 'admissions.manage', 'students.manage', 'services.manage', 'dashboard.finance'],
        'exams_officer' => ['results.enter', 'results.manage'],
        'parent'        => [],
    ];
    return $map[$role] ?? [];
}

/** Capabilities the current user holds in the active school. Admins → all. */
function currentCapabilities(): array
{
    if (isAdmin()) return array_keys(CAPABILITIES);
    if (isset($_SESSION['capabilities']) && is_array($_SESSION['capabilities'])) {
        return $_SESSION['capabilities'];
    }
    return roleDefaultCapabilities(userRole()); // transition fallback
}

/** True if the current user holds the given capability. Admins always pass. */
function userCan(string $capability): bool
{
    if (isAdmin()) return true;
    return in_array($capability, currentCapabilities(), true);
}

/**
 * Resolve a role's effective capabilities for a school: school_roles override
 * if present, else role_defaults, else the seed map. Called at login / school
 * switch to fill $_SESSION['capabilities'].
 */
function resolveCapabilities(string $schoolId, string $role): array
{
    if ($role === '') return [];
    $decode = function ($caps): array {
        if (is_array($caps)) return $caps;
        $j = json_decode((string)$caps, true);
        return is_array($j) ? $j : [];
    };
    $sb = new Supabase();
    if ($schoolId !== '') {
        $r = $sb->from('school_roles')->select('capabilities')
            ->eq('school_id', $schoolId)->eq('role_key', $role)->limit(1)->execute();
        if (!empty($r['data'][0])) return $decode($r['data'][0]['capabilities'] ?? []);
    }
    $d = $sb->from('role_defaults')->select('capabilities')
        ->eq('role_key', $role)->limit(1)->execute();
    if (!empty($d['data'][0])) return $decode($d['data'][0]['capabilities'] ?? []);
    return roleDefaultCapabilities($role);
}
