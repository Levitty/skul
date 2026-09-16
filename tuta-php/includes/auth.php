<?php
/**
 * Authentication & session helpers.
 * Supports multi-school SaaS: users can belong to multiple schools,
 * platform admins can manage all schools.
 */

function initSession(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        // Harden the session cookie before the session starts:
        //  - httponly: JS can't read it (mitigates XSS cookie theft)
        //  - secure: only sent over HTTPS (when the request is HTTPS)
        //  - samesite=Lax: blocks cross-site cookie send (CSRF defence in depth)
        //  - use_strict_mode: PHP rejects attacker-supplied session ids
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        @ini_set('session.use_strict_mode', '1');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'httponly' => true,
            'secure'   => $secure,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function isLoggedIn(): bool
{
    initSession();
    return !empty($_SESSION['user_id']) && !empty($_SESSION['school_id']);
}

function requireLogin(): void
{
    if (!isLoggedIn()) {
        // Allow platform admins (no school picked yet) and group super-admins
        // (a group but no school of their own) through — their pages re-verify
        // access server-side.
        initSession();
        if (!empty($_SESSION['user_id']) && (!empty($_SESSION['is_platform_admin']) || !empty($_SESSION['group_id']))) {
            return;
        }
        header('Location: ' . baseUrl('login'));
        exit;
    }
}

function currentUser(): array
{
    initSession();
    return [
        'id'                => $_SESSION['user_id']           ?? null,
        'email'             => $_SESSION['user_email']        ?? null,
        'name'              => $_SESSION['user_name']         ?? null,
        'role'              => $_SESSION['user_role']         ?? null,
        'school_id'         => $_SESSION['school_id']         ?? null,
        'school_name'       => $_SESSION['school_name']       ?? null,
        'is_platform_admin' => $_SESSION['is_platform_admin'] ?? false,
        'schools'           => $_SESSION['user_schools']      ?? [],
    ];
}

function schoolId(): string
{
    return $_SESSION['school_id'] ?? '';
}

function isPlatformAdmin(): bool
{
    initSession();
    return !empty($_SESSION['is_platform_admin']);
}

function hasMultipleSchools(): bool
{
    initSession();
    if (count($_SESSION['user_schools'] ?? []) > 1) return true;
    // Resilience: the session snapshot can predate a membership change (e.g. the
    // account was added to a second school after it last logged in, or the login
    // happened on a strict per-tenant host that only loaded one school). Confirm
    // against the live memberships. Cached per-request so it costs one query.
    static $cached = null;
    if ($cached !== null) return $cached;
    $uid = $_SESSION['user_id'] ?? '';
    if ($uid === '') { $cached = false; return false; }
    try {
        $r = (new Supabase())->from('user_schools')->select('school_id')->eq('user_id', $uid)->execute();
        $cached = count($r['data'] ?? []) > 1;
    } catch (\Throwable $e) { $cached = false; }
    return $cached;
}

/* ── Roles ─────────────────────────────────────────────
 * The product ships a FIXED set of roles; schools assign their people to
 * them. The granular RBAC tables in migration 007 are intentionally unused —
 * fixed roles keep the UX simple. Access is driven by user_schools.role.
 */

/**
 * The canonical roles and their display labels.
 */
function roleLabels(): array
{
    return [
        'platform_admin' => 'Platform Admin',
        'school_admin'   => 'Administrator',
        'group_admin'    => 'Group Administrator', // school-group super admin (consolidated view)
        'head_teacher'   => 'Head Teacher',
        'teacher'        => 'Teacher',
        'bursar'         => 'Bursar',
        'front_office'   => 'Front Office', // reception: admissions + fees + transport/activities, no settings/books/approvals
        'exams_officer'  => 'Exams Officer', // results only: exams + grades + report cards, NO finance/fees/students-admin/settings
        'parent'         => 'Parent',
    ];
}

/**
 * Normalise a stored role string to a canonical role.
 * Legacy data uses 'admin'/'owner'/'' for what is now 'school_admin', so those
 * KNOWN aliases still map to admin (preserves access for schools' original
 * admin rows). But an arbitrary/garbage/typo'd role (e.g. 'teachr', 'viewer')
 * now fails CLOSED to the least-privileged role rather than silently becoming
 * an administrator — a mis-stored role must never be a privilege escalation.
 * Roles are assigned cleanly via Settings → Staff.
 */
function normalizeRole(?string $role): string
{
    $role = strtolower(trim((string)$role));
    $aliases = [
        ''              => 'school_admin',
        'admin'         => 'school_admin',
        'administrator' => 'school_admin',
        'owner'         => 'school_admin',
        'superadmin'    => 'platform_admin',
        'super_admin'   => 'platform_admin',
    ];
    if (isset($aliases[$role])) $role = $aliases[$role];
    if (array_key_exists($role, roleLabels())) return $role;
    // Custom roles (defined per school in school_roles) pass through as-is.
    // Access is governed by capabilities (userCan), which DEFAULT-DENY for an
    // unknown key — so a mis-stored role can only under-grant, never escalate.
    return $role !== '' ? $role : 'parent';
}

/**
 * The current user's role in the active school (normalised).
 */
function userRole(): string
{
    initSession();
    if (!empty($_SESSION['is_platform_admin'])) return 'platform_admin';
    return normalizeRole($_SESSION['user_role'] ?? '');
}

/**
 * Human-readable label for a role.
 */
function roleLabel(string $role): string
{
    return roleLabels()[normalizeRole($role)] ?? ucfirst($role);
}

/**
 * True if the current user is an administrator (or platform admin) — the
 * tiers that may do anything within a school.
 */
function isAdmin(): bool
{
    return in_array(userRole(), ['platform_admin', 'school_admin'], true);
}

/**
 * True if the current user holds one of the given roles. Administrators
 * always pass — "an admin can do everything". Pass a string or an array.
 */
function hasRole($roles): bool
{
    if (isAdmin()) return true;
    return in_array(userRole(), (array)$roles, true);
}

/**
 * Guard a page: bounce non-permitted users back to the dashboard.
 * Call at the very top of a module, before any output.
 */
function requireRole($roles): void
{
    if (!hasRole($roles)) {
        flash('error', 'You do not have permission to open that page.');
        header('Location: ' . baseUrl('dashboard'));
        exit;
    }
}

function loginUser(array $userData, string $schoolId, string $role, array $allSchools = [], bool $isPlatformAdmin = false, string $schoolName = ''): void
{
    initSession();
    // Defeat session fixation: issue a fresh session id at the privilege
    // boundary so any id an attacker may have planted pre-login is discarded.
    session_regenerate_id(true);
    $_SESSION['user_id']           = $userData['id'];
    $_SESSION['user_email']        = $userData['email'];
    // Prefer the auth metadata name; invited users have none, so fall back to
    // their user_profiles.full_name before resorting to the email address.
    $resolvedName = trim((string)($userData['user_metadata']['full_name'] ?? ''));
    if ($resolvedName === '' && !empty($userData['id'])) {
        try {
            $pr = (new Supabase())->from('user_profiles')->select('full_name')->eq('id', $userData['id'])->single()->execute();
            $resolvedName = trim((string)($pr['data'][0]['full_name'] ?? ''));
        } catch (\Throwable $e) { $resolvedName = ''; }
    }
    $_SESSION['user_name']         = $resolvedName !== '' ? $resolvedName : ($userData['email'] ?? '');
    $_SESSION['user_role']         = $role;
    $_SESSION['school_id']         = $schoolId;
    $_SESSION['school_name']       = $schoolName;
    $_SESSION['is_platform_admin'] = $isPlatformAdmin;
    $_SESSION['user_schools']      = $allSchools;
    $_SESSION['logged_in_at']      = time();
    // Resolve this role's capabilities for the active school (school_roles
    // override → role_defaults → seed fallback) so userCan() reads live edits.
    $_SESSION['capabilities']      = function_exists('resolveCapabilities') ? resolveCapabilities($schoolId, $role) : [];
}

function switchSchool(string $schoolId, string $role, string $schoolName): void
{
    initSession();
    // Active-school / role change is a privilege change — rotate the id.
    session_regenerate_id(true);
    $_SESSION['school_id']   = $schoolId;
    $_SESSION['user_role']   = $role;
    $_SESSION['school_name'] = $schoolName;
    $_SESSION['capabilities'] = function_exists('resolveCapabilities') ? resolveCapabilities($schoolId, $role) : [];
}

function logout(): void
{
    initSession();
    session_destroy();
    header('Location: ' . baseUrl('login'));
    exit;
}

function baseUrl(string $path = ''): string
{
    // Auto-detect base path from the script
    $base = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
    return $base . '/' . ltrim($path, '/');
}
