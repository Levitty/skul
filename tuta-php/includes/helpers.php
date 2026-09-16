<?php
/**
 * Utility helpers used across the app.
 */

function e(string $str): string
{
    return htmlspecialchars($str, ENT_QUOTES, 'UTF-8');
}

/**
 * Encode a PHP value as JSON for embedding inside an HTML <script> block or an
 * HTML attribute. PHP's plain json_encode does NOT escape <, >, &, ' or " — so
 * a stored value like `</script><script>…` (in a class/teacher/subject name)
 * would break out of the script element and execute. The JSON_HEX_* flags emit
 * those as \uXXXX, which JS still parses back to the identical string, while
 * JSON_UNESCAPED_SLASHES keeps output compact (safe, since < and > are hex-
 * escaped so `</script>` can never form). Use this anywhere data is echoed
 * into JS, never bare json_encode().
 */
function jsonHtml($value, int $flags = 0): string
{
    return json_encode(
        $value,
        $flags | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES
    );
}

/**
 * The real TCP peer IP, for SECURITY decisions (rate limiting, allowlists).
 * Deliberately ignores X-Forwarded-For — the client controls it and would
 * otherwise rotate it to dodge throttling. Use publicClientIp() (which honours
 * one XFF hop) only for best-effort display/logging, never for enforcement.
 */
function clientIpAddr(): string
{
    $ra = $_SERVER['REMOTE_ADDR'] ?? '';
    return filter_var($ra, FILTER_VALIDATE_IP) ? $ra : '0.0.0.0';
}

/**
 * Count rate-limit events for a bucket within the last $windowSeconds.
 * Fails OPEN (returns 0) if the store is unreachable — throttling must never
 * lock everyone out of login because of a transient DB hiccup.
 */
function rateCount(string $bucket, int $windowSeconds): int
{
    try {
        $since = gmdate('Y-m-d\TH:i:s\Z', time() - $windowSeconds);
        $res = (new Supabase())->from('rate_limit_events')->select('id')
            ->eq('bucket', $bucket)->gte('created_at', $since)->limit(500)->execute();
        return count($res['data'] ?? []);
    } catch (\Throwable $e) {
        return 0;
    }
}

/** Record one rate-limit event for a bucket. Best-effort. */
function rateRecord(string $bucket): void
{
    try {
        (new Supabase())->from('rate_limit_events')->insert(['bucket' => $bucket]);
    } catch (\Throwable $e) {
        // ignore — never break the request over a logging failure
    }
}

function money(float $amount): string
{
    $symbol = schoolSetting('currency_symbol', 'KES');
    return $symbol . ' ' . number_format($amount, 2);
}

/**
 * Get a single school setting value.
 */
function schoolSetting(string $key, string $default = ''): string
{
    $settings = cachedSchoolSettings();
    return $settings[$key] ?? $default;
}

/**
 * Whether a gated money action must go through System → Approvals.
 * School / platform admins always act immediately — a one-admin school
 * must not be locked out by maker-checker. Non-admins still need a
 * second person when the school setting is on.
 */
function approvalRequired(string $settingKey, string $default = 'false'): bool
{
    if (function_exists('isAdmin') && isAdmin()) {
        return false;
    }
    return schoolSetting($settingKey, $default) === 'true';
}

/**
 * Get all school settings as key => value map. Cached for 10 minutes.
 */
function cachedSchoolSettings(): array
{
    $sid = schoolId();
    if (!$sid) return [];
    return Supabase::cached("settings_$sid", 600, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('school_settings')->select('key,value')
            ->eq('school_id', $sid)->execute();
        $map = [];
        foreach (($r['data'] ?? []) as $row) {
            $map[$row['key']] = $row['value'] ?? '';
        }
        return $map;
    });
}

/**
 * Get active payment methods for current school. Cached for 10 minutes.
 */
function cachedPaymentMethods(): array
{
    $sid = schoolId();
    if (!$sid) return [];
    return Supabase::cached("payment_methods_$sid", 600, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('payment_methods')->select('id,name,code,is_active,sort_order')
            ->eq('school_id', $sid)->eq('is_active', 'true')
            ->order('sort_order')->execute();
        return $r['data'] ?? [];
    });
}

/**
 * Payment-method code => label map for DISPLAY. The school's configured methods
 * (Settings → Payment Methods) win; legacy/system codes fall back to a friendly
 * name so historical payments always read well (their stored code never changes).
 */
function methodLabelMap(): array
{
    $map = [];
    foreach (cachedPaymentMethods() as $m) $map[$m['code']] = $m['name'];
    return $map + [
        'cash'           => 'Cash',
        'mpesa'          => 'M-Pesa',
        'bank_transfer'  => 'Bank Transfer',
        'cheque'         => 'Cheque',
        'mobile_money'   => 'Mobile Money',
        'card'           => 'Card',
        'online'         => 'Online',
        'credit_balance' => 'Credit Balance',
        'other'          => 'Other',
    ];
}

/**
 * Render payment method <option> tags from DB.
 * Returns HTML string of options for a <select>.
 * If $selected is a legacy code not in the school list, include it so Edit still works.
 */
function paymentMethodOptions(string $selected = ''): string
{
    $methods = cachedPaymentMethods();
    if (empty($methods)) {
        $methods = [
            ['code' => 'cash', 'name' => 'Cash'],
            ['code' => 'mpesa', 'name' => 'M-Pesa'],
            ['code' => 'bank_transfer', 'name' => 'Bank Transfer'],
            ['code' => 'cheque', 'name' => 'Cheque'],
        ];
    }
    $codes = [];
    $html = '';
    foreach ($methods as $m) {
        $code = e($m['code']);
        $name = e($m['name']);
        $sel = ($selected === $m['code']) ? ' selected' : '';
        $html .= "<option value=\"{$code}\"{$sel}>{$name}</option>\n";
        $codes[$m['code']] = true;
    }
    if ($selected !== '' && !isset($codes[$selected])) {
        $labels = methodLabelMap();
        $name = e($labels[$selected] ?? ucfirst(str_replace('_', ' ', $selected)));
        $html .= '<option value="' . e($selected) . '" selected>' . $name . '</option>' . "\n";
    }
    return $html;
}

/**
 * Seed default settings for a school (called on first access or school creation).
 */
function seedSchoolDefaults(string $schoolId): void
{
    $sb = new Supabase();

    // Default settings
    $defaults = [
        'currency_symbol' => 'KES',
        'currency_code' => 'KES',
        'invoice_prefix' => 'INV',
        'default_due_days' => '30',
        'auto_invoice_on_enroll' => 'true',
        'mpesa_environment' => 'sandbox',
        'mpesa_shortcode' => '',
        'mpesa_passkey' => '',
        'mpesa_consumer_key' => '',
        'mpesa_consumer_secret' => '',
        'mpesa_callback_url' => '',
    ];

    foreach ($defaults as $key => $value) {
        $sb->from('school_settings')->insert([
            'school_id' => $schoolId,
            'key' => $key,
            'value' => $value,
        ]);
    }

    // Default payment methods
    $methods = [
        ['name' => 'Cash', 'code' => 'cash', 'sort_order' => 1],
        ['name' => 'M-Pesa', 'code' => 'mpesa', 'sort_order' => 2],
        ['name' => 'Bank Transfer', 'code' => 'bank_transfer', 'sort_order' => 3],
        ['name' => 'Cheque', 'code' => 'cheque', 'sort_order' => 4],
    ];

    foreach ($methods as $m) {
        $sb->from('payment_methods')->insert(array_merge($m, ['school_id' => $schoolId]));
    }
}

function flash(string $type, string $message): void
{
    initSession();
    $_SESSION['flash'][] = ['type' => $type, 'message' => $message];
}

/**
 * Flash with a clickable link button — used when an action succeeded AND there's
 * a follow-up the user might want (e.g. "Payment recorded — View receipt").
 * The link opens in a new tab so the user stays on their current page.
 */
function flashLink(string $type, string $message, string $linkUrl, string $linkText): void
{
    initSession();
    $_SESSION['flash'][] = [
        'type'      => $type,
        'message'   => $message,
        'link_url'  => $linkUrl,
        'link_text' => $linkText,
    ];
}

function getFlash(): array
{
    initSession();
    $msgs = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $msgs;
}

function csrf(): string
{
    initSession();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrfField(): string
{
    return '<input type="hidden" name="_token" value="' . csrf() . '">';
}

function verifyCsrf(): bool
{
    // Must resume the session before reading the stored token. On public
    // routes (login, invite) index.php never calls requireLogin(), so the
    // session is not open yet on POST — without this, $_SESSION is empty and
    // every submit looks like an expired session.
    initSession();
    return isset($_POST['_token']) && hash_equals($_SESSION['csrf_token'] ?? '', $_POST['_token']);
}

function redirect(string $path): void
{
    header('Location: ' . baseUrl($path));
    exit;
}

function isPost(): bool
{
    return $_SERVER['REQUEST_METHOD'] === 'POST';
}

function input(string $key, $default = ''): string
{
    return trim($_POST[$key] ?? $_GET[$key] ?? $default);
}

function selectedIf($value, $compare): string
{
    return ($value == $compare) ? ' selected' : '';
}

function checkedIf(bool $condition): string
{
    return $condition ? ' checked' : '';
}

function activeIf(string $current, string $match): string
{
    return (strpos($current, $match) === 0) ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-600 hover:bg-gray-50';
}

function formatDate(?string $date): string
{
    if (!$date) return '—';
    return date('M j, Y', strtotime($date));
}

/* ── Academics: configurable grading schemes ───────── */

/**
 * Load the school's grading schemes (each with its bands attached) and work
 * out which one is the default. Cached for 5 minutes.
 *
 * Returns ['schemes' => [...], 'default' => scheme|null].
 * Each scheme has a 'bands' key — the list of grading_bands rows.
 */
function cachedGradingData(): array
{
    $sid = schoolId();
    if (!$sid) return ['schemes' => [], 'default' => null];

    return Supabase::cached("grading_$sid", 300, function () use ($sid) {
        $sb = new Supabase();

        $schemes = $sb->from('grading_schemes')->select('*')
            ->eq('school_id', $sid)->order('created_at')->execute()['data'] ?? [];
        $bands = $sb->from('grading_bands')->select('*')
            ->eq('school_id', $sid)->order('sort_order')->execute()['data'] ?? [];

        $bandsByScheme = [];
        foreach ($bands as $b) {
            $bandsByScheme[$b['scheme_id']][] = $b;
        }
        foreach ($schemes as &$s) {
            $s['bands'] = $bandsByScheme[$s['id']] ?? [];
        }
        unset($s);

        $default = null;
        foreach ($schemes as $s) {
            if (!empty($s['is_default'])) { $default = $s; break; }
        }
        if (!$default && !empty($schemes)) $default = $schemes[0];

        return ['schemes' => $schemes, 'default' => $default];
    });
}

/**
 * The school's default grading scheme (with bands), or null if none set up.
 */
function cachedDefaultGradingScheme(): ?array
{
    return cachedGradingData()['default'] ?? null;
}

/**
 * Find the grading band a percentage score falls into, using the school's
 * default scheme. Returns the full band row (code, label, color, points…)
 * or null if no scheme is configured.
 *
 * Matching is by min_percent only — bands are tried highest-first, so there
 * are never gaps even if a school's ranges don't line up perfectly.
 */
function gradeBandFor(float $pct): ?array
{
    $scheme = cachedDefaultGradingScheme();
    if (!$scheme || empty($scheme['bands'])) return null;

    $bands = $scheme['bands'];
    usort($bands, fn($a, $b) => (float)$b['min_percent'] <=> (float)$a['min_percent']);

    foreach ($bands as $b) {
        if ($pct >= (float)$b['min_percent']) return $b;
    }
    return end($bands) ?: null; // below every band → lowest band
}

/**
 * Map a percentage score (0–100) to a grade code.
 *
 * Single source of truth for grading — Grade Entry and Report Cards both call
 * it. It reads the school's configured default scheme; if none is set up yet
 * it falls back to a basic A–F scale so nothing breaks before the school
 * visits Settings → Grading.
 */
function gradeFromPercentage(float $pct): string
{
    $band = gradeBandFor($pct);
    if ($band) return $band['code'] ?? $band['label'] ?? '';

    // Fallback — only used before any grading scheme exists.
    if ($pct >= 80) return 'A';
    if ($pct >= 70) return 'B';
    if ($pct >= 60) return 'C';
    if ($pct >= 50) return 'D';
    if ($pct >= 40) return 'E';
    return 'F';
}

/**
 * Seed a school's starter grading schemes — a CBC competency scheme (set as
 * default) and a marks-based letter-grade scheme. Call once when a school has
 * no schemes yet; the school can then edit them freely.
 */
function seedGradingSchemes(string $sid): void
{
    $sb = new Supabase();

    $seed = function (array $scheme, array $bands) use ($sb, $sid) {
        $res = $sb->from('grading_schemes')->insert(array_merge($scheme, ['school_id' => $sid]));
        $schemeId = $res['data'][0]['id'] ?? null;
        if (!$schemeId) return;
        $rows = [];
        $order = 0;
        foreach ($bands as $b) {
            $rows[] = [
                'school_id'   => $sid,
                'scheme_id'   => $schemeId,
                'code'        => $b[0],
                'label'       => $b[1],
                'min_percent' => $b[2],
                'max_percent' => $b[3],
                'points'      => $b[4],
                'color'       => $b[5],
                'sort_order'  => $order++,
            ];
        }
        $sb->from('grading_bands')->insert($rows);
    };

    // CBC competency levels — the default for this school.
    $seed(
        ['name' => 'CBC Competency Levels', 'scheme_type' => 'competency', 'is_default' => true],
        [
            ['EE', 'Exceeding Expectations',   76, 100, 4, '#059669'],
            ['ME', 'Meeting Expectations',     51,  75, 3, '#0891b2'],
            ['AE', 'Approaching Expectations', 26,  50, 2, '#d97706'],
            ['BE', 'Below Expectations',        0,  25, 1, '#dc2626'],
        ]
    );

    // Marks-based letter grades — available to switch to.
    $seed(
        ['name' => 'Letter Grades (A–F)', 'scheme_type' => 'marks', 'is_default' => false],
        [
            ['A', 'Excellent',     80, 100, 5, '#059669'],
            ['B', 'Good',          70,  79, 4, '#0891b2'],
            ['C', 'Average',       60,  69, 3, '#ca8a04'],
            ['D', 'Below Average', 50,  59, 2, '#d97706'],
            ['E', 'Weak',          40,  49, 1, '#ea580c'],
            ['F', 'Fail',           0,  39, 0, '#dc2626'],
        ]
    );

    Supabase::clearCache('grading_' . $sid);
}

/* ── Pagination ────────────────────────────────────── */

/**
 * Get the current page number from the query string.
 */
function currentPage(): int
{
    return max(1, (int)(input('page') ?: 1));
}

/**
 * Render pagination controls. Call after the table.
 * $currentPage: 1-based page number
 * $totalItems: total count of items
 * $perPage: items per page
 * $baseUrl: URL without page param (e.g. baseUrl('students') . '?class_id=xxx')
 */
function paginationControls(int $currentPage, int $totalItems, int $perPage, string $baseUrl): string
{
    $totalPages = max(1, (int)ceil($totalItems / $perPage));
    if ($totalPages <= 1) return '';

    // Ensure baseUrl has correct separator
    $sep = (strpos($baseUrl, '?') !== false) ? '&' : '?';

    $html = '<div class="flex items-center justify-between px-4 py-3 mt-4">';
    $html .= '<p class="text-sm text-gray-500">Showing ' . number_format(($currentPage - 1) * $perPage + 1) . '–' . number_format(min($currentPage * $perPage, $totalItems)) . ' of ' . number_format($totalItems) . '</p>';
    $html .= '<div class="flex gap-1">';

    // Previous
    if ($currentPage > 1) {
        $html .= '<a href="' . e($baseUrl . $sep . 'page=' . ($currentPage - 1)) . '" class="px-3 py-1 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Previous</a>';
    }

    // Page numbers (show max 5 around current)
    $start = max(1, $currentPage - 2);
    $end = min($totalPages, $currentPage + 2);
    for ($i = $start; $i <= $end; $i++) {
        if ($i === $currentPage) {
            $html .= '<span class="px-3 py-1 text-sm rounded-lg bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">' . $i . '</span>';
        } else {
            $html .= '<a href="' . e($baseUrl . $sep . 'page=' . $i) . '" class="px-3 py-1 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">' . $i . '</a>';
        }
    }

    // Next
    if ($currentPage < $totalPages) {
        $html .= '<a href="' . e($baseUrl . $sep . 'page=' . ($currentPage + 1)) . '" class="px-3 py-1 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Next</a>';
    }

    $html .= '</div></div>';
    return $html;
}

/* ── Audit logging ──────────────────────────────────── */

/**
 * Write an audit log entry. Call for every sensitive mutation.
 * Non-blocking: errors silently ignored so auditing never breaks the app.
 *
 * NOTE: For payment-related events, prefer recordInvoicePayment() — it writes
 * an audit row inside the same DB transaction (guaranteed, not best-effort).
 */
function auditLog(string $action, string $entityType, ?string $entityId = null, ?array $payload = null): void
{
    try {
        $sb = new Supabase();
        $user = currentUser();
        $sb->from('audit_logs')->insert([
            'school_id'   => schoolId() ?: null,
            'user_id'     => $user['id'] ?? null,
            'user_email'  => $user['email'] ?? null,
            'action'      => $action,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'payload'     => $payload ? json_encode($payload) : null,
            'ip_address'  => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    } catch (\Throwable $e) {
        // Never let audit logging break the app
    }
}

/* ── Payments ─────────────────────────────────────────── */

/**
 * Record an invoice payment via the atomic record_payment RPC (migration 058).
 *
 * This is the ONLY safe way to record a payment in this app. The RPC:
 *   • Locks the invoice row (FOR UPDATE) — kills lost-update races
 *   • Validates the invoice is payable (rejects draft/cancelled/paid/carried_forward)
 *   • Inserts the payment row, updates invoice paid_amount + status
 *   • Adds any overpayment to students.credit_balance
 *   • Writes a guaranteed audit_logs row — all in one transaction
 *
 * Never write payment-recording code inline; always call this helper.
 *
 * @return array On success:
 *   ['success' => true, 'payment_id' => '...', 'invoice_status' => 'paid|partial',
 *    'paid_amount' => float, 'balance' => float, 'overpayment' => float]
 * On failure:
 *   ['success' => false, 'error' => 'Human-readable error message']
 */
function recordInvoicePayment(
    string  $invoiceId,
    float   $amount,
    string  $method = 'cash',
    ?string $transactionRef = null,
    ?string $paymentDate = null
): array {
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();

    if (!$sid) {
        return ['success' => false, 'error' => 'No active school context.'];
    }

    $cleanRef = $transactionRef !== null ? trim($transactionRef) : '';
    if ($cleanRef === '') $cleanRef = null;

    $result = $sb->rpc('record_payment', [
        'p_invoice_id'      => $invoiceId,
        'p_school_id'       => $sid,
        'p_amount'          => $amount,
        'p_method'          => $method,
        'p_transaction_ref' => $cleanRef,
        'p_payment_date'    => $paymentDate ?: date('Y-m-d'),
        'p_user_id'         => $user['id']    ?? null,
        'p_user_email'      => $user['email'] ?? null,
    ]);

    // PostgREST surfaces RAISE EXCEPTION as HTTP 4xx with a message in 'error'
    if (!empty($result['error'])) {
        return ['success' => false, 'error' => $result['error']];
    }

    // The RPC returns a JSONB object; PostgREST returns it directly as `data`.
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => 'Unexpected response from payment service.'];
    }

    return [
        'success'        => true,
        'payment_id'     => $payload['payment_id']     ?? null,
        'invoice_status' => $payload['invoice_status'] ?? null,
        'paid_amount'    => (float)($payload['paid_amount'] ?? 0),
        'balance'        => (float)($payload['balance']     ?? 0),
        'overpayment'    => (float)($payload['overpayment'] ?? 0),
    ];
}

/**
 * Void a completed payment via void_payment RPC (migrations 111/112).
 * Reverses paid_amount; does not change the invoice billed total.
 */
function voidInvoicePayment(string $paymentId, string $reason, ?bool $sameDayOnly = null): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();

    if (!$sid) {
        return ['success' => false, 'error' => 'No active school context.'];
    }
    $reason = trim($reason);
    if ($reason === '') {
        return ['success' => false, 'error' => 'A void reason is required.'];
    }

    if ($sameDayOnly === null) {
        $sameDayOnly = schoolSetting('payment_void_same_day_only', 'false') === 'true';
    }

    $result = $sb->rpc('void_payment', [
        'p_payment_id'    => $paymentId,
        'p_school_id'     => $sid,
        'p_reason'        => $reason,
        'p_user_id'       => $user['id']    ?? null,
        'p_user_email'    => $user['email'] ?? null,
        'p_same_day_only' => $sameDayOnly,
    ]);

    if (!empty($result['error'])) {
        return ['success' => false, 'error' => $result['error']];
    }
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not void payment.'];
    }
    return [
        'success'        => true,
        'payment_id'     => $payload['payment_id']     ?? $paymentId,
        'invoice_id'     => $payload['invoice_id']     ?? null,
        'invoice_status' => $payload['invoice_status'] ?? null,
        'paid_amount'    => (float)($payload['paid_amount'] ?? 0),
        'balance'        => (float)($payload['balance'] ?? 0),
    ];
}

/**
 * Create a draft credit note via create_credit_note RPC (migration 111).
 */
function createCreditNote(
    string $studentId,
    string $invoiceId,
    float $amount,
    string $reason,
    string $reasonCode = 'billing_error',
    ?string $description = null,
    ?string $invoiceItemId = null
): array {
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();

    if (!$sid) {
        return ['success' => false, 'error' => 'No active school context.'];
    }

    $result = $sb->rpc('create_credit_note', [
        'p_school_id'       => $sid,
        'p_student_id'      => $studentId,
        'p_invoice_id'      => $invoiceId,
        'p_amount'          => $amount,
        'p_reason'          => $reason,
        'p_reason_code'     => $reasonCode,
        'p_description'     => $description,
        'p_invoice_item_id' => $invoiceItemId,
        'p_user_id'         => $user['id']    ?? null,
        'p_user_email'      => $user['email'] ?? null,
    ]);

    if (!empty($result['error'])) {
        return ['success' => false, 'error' => $result['error']];
    }
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not create credit note.'];
    }
    return [
        'success'        => true,
        'credit_note_id' => $payload['credit_note_id'] ?? null,
        'credit_number'  => $payload['credit_number']  ?? null,
        'status'         => $payload['status']         ?? 'draft',
    ];
}

/**
 * Apply a draft/approved credit note via apply_credit_note RPC (migration 111).
 */
function applyCreditNote(string $creditNoteId): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();

    if (!$sid) {
        return ['success' => false, 'error' => 'No active school context.'];
    }

    $result = $sb->rpc('apply_credit_note', [
        'p_credit_note_id' => $creditNoteId,
        'p_school_id'      => $sid,
        'p_user_id'        => $user['id']    ?? null,
        'p_user_email'     => $user['email'] ?? null,
    ]);

    if (!empty($result['error'])) {
        return ['success' => false, 'error' => $result['error']];
    }
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not apply credit note.'];
    }
    return array_merge(['success' => true], $payload);
}

/**
 * Void a draft credit note (not yet applied).
 */
function voidCreditNoteDraft(string $creditNoteId): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();

    if (!$sid) {
        return ['success' => false, 'error' => 'No active school context.'];
    }

    $result = $sb->rpc('void_credit_note_draft', [
        'p_credit_note_id' => $creditNoteId,
        'p_school_id'      => $sid,
        'p_user_id'        => $user['id']    ?? null,
        'p_user_email'     => $user['email'] ?? null,
    ]);

    if (!empty($result['error'])) {
        return ['success' => false, 'error' => $result['error']];
    }
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not void credit note.'];
    }
    return ['success' => true, 'credit_note_id' => $payload['credit_note_id'] ?? $creditNoteId];
}

/**
 * Reverse an applied credit note via reverse_applied_credit_note RPC (migration 113).
 */
function reverseAppliedCreditNote(string $creditNoteId, string $reason): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();

    if (!$sid) {
        return ['success' => false, 'error' => 'No active school context.'];
    }

    $reason = trim($reason);
    if ($reason === '') {
        return ['success' => false, 'error' => 'A reason is required.'];
    }

    $result = $sb->rpc('reverse_applied_credit_note', [
        'p_credit_note_id' => $creditNoteId,
        'p_school_id'      => $sid,
        'p_reason'         => $reason,
        'p_user_id'        => $user['id']    ?? null,
        'p_user_email'     => $user['email'] ?? null,
    ]);

    if (!empty($result['error'])) {
        return ['success' => false, 'error' => $result['error']];
    }
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not reverse credit note.'];
    }
    return array_merge(['success' => true], $payload);
}

/**
 * True when a completed payment is eligible for same-day void (Africa/Nairobi).
 */
function paymentIsVoidableSameDay(array $payment): bool
{
    if (($payment['status'] ?? 'completed') !== 'completed') return false;
    $dateStr = $payment['payment_date']
        ?? (isset($payment['paid_at']) ? substr((string)$payment['paid_at'], 0, 10) : null)
        ?? (isset($payment['created_at']) ? substr((string)$payment['created_at'], 0, 10) : null);
    if (!$dateStr) return false;
    try {
        $tz = new DateTimeZone('Africa/Nairobi');
        $today = (new DateTime('now', $tz))->format('Y-m-d');
    } catch (Throwable $e) {
        $today = date('Y-m-d');
    }
    return substr($dateStr, 0, 10) === $today;
}

/* ── Cached data loaders (avoid repeated API calls) ──── */

/**
 * Get classes for current school. Cached for 5 minutes.
 */
function cachedClasses(): array
{
    $sid = schoolId();
    if (!$sid) return [];
    return Supabase::cached("classes_$sid", 300, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('classes')->select('id,name,level')->eq('school_id', $sid)->order('level')->execute();
        return $r['data'] ?? [];
    });
}

/**
 * Get class name map (id => name). Cached for 5 minutes.
 */
function cachedClassMap(): array
{
    $map = [];
    foreach (cachedClasses() as $c) $map[$c['id']] = $c['name'];
    return $map;
}

/**
 * Get school profile. Cached for 10 minutes.
 */
function cachedSchool(): ?array
{
    $sid = schoolId();
    if (!$sid) return null;
    return Supabase::cached("school_$sid", 600, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('schools')->select('id,name,code,address,phone,email,logo_url,domain')
            ->eq('id', $sid)->single()->execute();
        return ($r['data'] ?? [])[0] ?? null;
    });
}

/* ── Per-tenant domains ─────────────────────────────────────────
 * The app runs at one platform/admin host (APP_URL → school.tutagora.com) but
 * each school can also have its OWN login hostname (schools.domain). All hosts
 * point at this same app; these helpers map an incoming hostname to a tenant.
 * Everything degrades safely if the `domain` column hasn't been added yet
 * (the query errors → request() returns data=null → treated as "no tenant").
 */

/** Current request host, lowercased, without port. */
function currentHost(): string
{
    $h = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? '')));
    if (($p = strpos($h, ':')) !== false) $h = substr($h, 0, $p);
    return $h;
}

/** The platform/admin host, derived from APP_URL. */
function platformHost(): string
{
    return strtolower((string)(parse_url(defined('APP_URL') ? APP_URL : '', PHP_URL_HOST) ?: ''));
}

/** True when the request is on the platform/admin host (or host is unknown). */
function isPlatformHost(): bool
{
    $h = currentHost();
    return $h === '' || $h === platformHost();
}

/** A school's own login hostname, if set (tolerant of a missing column). */
function schoolDomain(string $schoolId): string
{
    if ($schoolId === '') return '';
    $sb = new Supabase();
    $r  = $sb->from('schools')->select('domain')->eq('id', $schoolId)->limit(1)->execute();
    return trim((string)($r['data'][0]['domain'] ?? ''));
}

/**
 * Schools a user can administer by virtue of being a GROUP admin — every
 * active school in any group they administer, as role 'school_admin'.
 * A group admin shouldn't need a separate per-school membership for each
 * branch; membership in the group is enough. Returns
 *   [['school_id'=>, 'role'=>'school_admin', 'name'=>], ...]
 */
function groupAdminSchools(string $userId): array
{
    if ($userId === '') return [];
    $sb = new Supabase();
    $ga = $sb->from('school_group_admins')->select('group_id')->eq('user_id', $userId)->execute();
    $groupIds = array_values(array_unique(array_column($ga['data'] ?? [], 'group_id')));
    if (empty($groupIds)) return [];
    $scids = [];
    foreach ($groupIds as $gid) {
        $mem = $sb->from('school_group_members')->select('school_id')->eq('group_id', $gid)->execute();
        foreach (($mem['data'] ?? []) as $m) $scids[$m['school_id']] = true;
    }
    if (empty($scids)) return [];
    $rows = $sb->from('schools')->select('id,name,is_active')->in('id', array_keys($scids))->execute();
    $out = [];
    foreach (($rows['data'] ?? []) as $s) {
        if (!empty($s['is_active'])) {
            $out[] = ['school_id' => $s['id'], 'role' => 'school_admin', 'name' => $s['name']];
        }
    }
    return $out;
}

/** The group_id that owns a school (via school_group_members), or null. */
function groupIdForSchool(string $schoolId): ?string
{
    if ($schoolId === '') return null;
    $sb = new Supabase();
    $r = $sb->from('school_group_members')->select('group_id')
        ->eq('school_id', $schoolId)->limit(1)->execute();
    return $r['data'][0]['group_id'] ?? null;
}

/** True if the given school belongs to the given group (school_group_members). */
function groupOwnsSchool(string $groupId, string $schoolId): bool
{
    if ($groupId === '' || $schoolId === '') return false;
    $sb = new Supabase();
    $r = $sb->from('school_group_members')->select('school_id')
        ->eq('group_id', $groupId)->eq('school_id', $schoolId)->limit(1)->execute();
    return !empty($r['data']);
}

/**
 * Sibling schools in the same school_group as $schoolId (excludes itself).
 * Returns [['id'=>, 'name'=>], ...].
 */
function siblingSchoolsInGroup(?string $schoolId = null): array
{
    $schoolId = $schoolId ?: (string)schoolId();
    if ($schoolId === '') return [];
    $gid = groupIdForSchool($schoolId);
    if (!$gid) return [];
    $sb = new Supabase();
    $mem = $sb->from('school_group_members')->select('school_id')->eq('group_id', $gid)->execute();
    $ids = [];
    foreach (($mem['data'] ?? []) as $m) {
        $id = $m['school_id'] ?? '';
        if ($id !== '' && $id !== $schoolId) $ids[$id] = true;
    }
    if (empty($ids)) return [];
    $rows = $sb->from('schools')->select('id,name,is_active')->in('id', array_keys($ids))->order('name')->execute();
    $out = [];
    foreach (($rows['data'] ?? []) as $s) {
        if (!empty($s['is_active'])) {
            $out[] = ['id' => $s['id'], 'name' => $s['name'] ?? 'School'];
        }
    }
    return $out;
}

/** Record a uniform sale (variant + qty) via record_uniform_sale RPC (migration 114). */
function recordUniformSale(
    string $variantId,
    int $quantity,
    string $paymentMethod = 'cash',
    ?string $saleDate = null,
    ?string $studentId = null,
    ?string $customerName = null,
    ?string $notes = null
): array {
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $result = $sb->rpc('record_uniform_sale', [
        'p_school_id'      => $sid,
        'p_variant_id'     => $variantId,
        'p_quantity'       => max(1, $quantity),
        'p_payment_method' => $paymentMethod ?: 'cash',
        'p_sale_date'      => $saleDate ?: date('Y-m-d'),
        'p_student_id'     => $studentId ?: null,
        'p_customer_name'  => $customerName,
        'p_notes'          => $notes,
        'p_user_id'        => $user['id']    ?? null,
        'p_user_email'     => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not record sale.'];
    }
    return array_merge(['success' => true], $payload);
}

/**
 * One sale, many lines, via record_uniform_sale_basket RPC (migration 121).
 * $lines = [['variant_id' => …, 'quantity' => 2], …]. All-or-nothing.
 */
function recordUniformSaleBasket(
    array $lines,
    string $paymentMethod = 'cash',
    ?string $saleDate = null,
    ?string $studentId = null,
    ?string $customerName = null,
    ?string $notes = null,
    ?string $transactionRef = null
): array {
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $result = $sb->rpc('record_uniform_sale_basket', [
        'p_school_id'       => $sid,
        'p_lines'           => array_values($lines),
        'p_payment_method'  => $paymentMethod ?: 'cash',
        'p_sale_date'       => $saleDate ?: date('Y-m-d'),
        'p_student_id'      => $studentId ?: null,
        'p_customer_name'   => $customerName,
        'p_notes'           => $notes,
        'p_transaction_ref' => $transactionRef,
        'p_user_id'         => $user['id']    ?? null,
        'p_user_email'      => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not record sale.'];
    }
    return array_merge(['success' => true], $payload);
}

/**
 * Upsert a size on a product via upsert_uniform_variant RPC (migration 120).
 * Carries selling price, purchase price and reorder level. Stock is only
 * passed for NEW rows (opening stock); existing rows change stock through
 * receiveUniformStock() / adjustUniformStock() so every movement is logged.
 */
function upsertUniformVariant(
    string $productId,
    string $size,
    float $price,
    ?int $stockQuantity = null,
    bool $isActive = true,
    ?string $variantId = null,
    ?float $costPrice = null,
    ?int $reorderLevel = null
): array {
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $params = [
        'p_school_id'  => $sid,
        'p_product_id' => $productId,
        'p_size'       => $size,
        'p_price'      => $price,
        'p_is_active'  => $isActive,
        'p_user_id'    => $user['id']    ?? null,
        'p_user_email' => $user['email'] ?? null,
        'p_variant_id' => $variantId,
    ];
    if ($stockQuantity !== null) $params['p_stock_quantity'] = max(0, $stockQuantity);
    if ($costPrice !== null)     $params['p_cost_price']     = max(0, $costPrice);
    if ($reorderLevel !== null)  $params['p_reorder_level']  = max(0, $reorderLevel);

    $result = $sb->rpc('upsert_uniform_variant', $params);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not save size.'];
    }
    return array_merge(['success' => true], $payload);
}

function deleteUniformProduct(string $productId): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $result = $sb->rpc('delete_uniform_product', [
        'p_school_id'  => $sid,
        'p_product_id' => $productId,
        'p_user_id'    => $user['id']    ?? null,
        'p_user_email' => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not delete item.'];
    }
    return array_merge(['success' => true], $payload);
}

function deleteUniformVariant(string $variantId): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $result = $sb->rpc('delete_uniform_variant', [
        'p_school_id'  => $sid,
        'p_variant_id' => $variantId,
        'p_user_id'    => $user['id']    ?? null,
        'p_user_email' => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not delete size.'];
    }
    return array_merge(['success' => true], $payload);
}

/**
 * Receive a delivery onto a size via receive_uniform_stock RPC (migration 120).
 * Adds to stock, records a 'purchase' movement with the unit cost, and makes
 * that cost the size's current purchase price.
 */
function receiveUniformStock(string $variantId, int $quantity, ?float $unitCost = null, ?string $note = null): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $params = [
        'p_school_id'  => $sid,
        'p_variant_id' => $variantId,
        'p_quantity'   => max(1, $quantity),
        'p_note'       => $note,
        'p_user_id'    => $user['id']    ?? null,
        'p_user_email' => $user['email'] ?? null,
    ];
    if ($unitCost !== null) $params['p_unit_cost'] = max(0, $unitCost);

    $result = $sb->rpc('receive_uniform_stock', $params);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not receive stock.'];
    }
    return array_merge(['success' => true], $payload);
}

/**
 * Create an item with its sizes and opening stock in one atomic call via
 * create_uniform_item RPC (migration 120). $sizes = [['size'=>'28','quantity'=>12], …];
 * an empty list yields a single "One size" row.
 */
function createUniformItem(string $name, float $costPrice, float $price, int $reorderLevel, array $sizes): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $result = $sb->rpc('create_uniform_item', [
        'p_school_id'     => $sid,
        'p_name'          => $name,
        'p_cost_price'    => max(0, $costPrice),
        'p_price'         => $price,
        'p_reorder_level' => max(0, $reorderLevel),
        'p_sizes'         => array_values($sizes),
        'p_user_id'       => $user['id']    ?? null,
        'p_user_email'    => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not create item.'];
    }
    return array_merge(['success' => true], $payload);
}

/**
 * Void an expense via void_expense RPC (migration 122): records the reason,
 * removes the line, and the ledger trigger (mig. 104) reverses the posting.
 */
function voidExpense(string $expenseId, string $reason): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $result = $sb->rpc('void_expense', [
        'p_school_id'  => $sid,
        'p_expense_id' => $expenseId,
        'p_reason'     => $reason,
        'p_user_id'    => $user['id']    ?? null,
        'p_user_email' => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not void the expense.'];
    }
    return array_merge(['success' => true], $payload);
}

/** Set absolute stock on a variant via adjust_uniform_stock RPC. */
function adjustUniformStock(string $variantId, int $newQuantity, string $reason = 'Stock count'): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $result = $sb->rpc('adjust_uniform_stock', [
        'p_school_id'    => $sid,
        'p_variant_id'   => $variantId,
        'p_new_quantity' => max(0, $newQuantity),
        'p_reason'       => $reason,
        'p_user_id'      => $user['id']    ?? null,
        'p_user_email'   => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not update stock.'];
    }
    return array_merge(['success' => true], $payload);
}

/** Send stock to a sibling school (group transfer). */
function sendStockTransfer(string $toSchoolId, array $lines, ?string $notes = null): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $payloadLines = [];
    foreach ($lines as $line) {
        $vid = $line['variant_id'] ?? '';
        $qty = (int)($line['quantity'] ?? 0);
        if ($vid && $qty > 0) {
            $payloadLines[] = ['variant_id' => $vid, 'quantity' => $qty];
        }
    }
    if (empty($payloadLines)) {
        return ['success' => false, 'error' => 'Add at least one line with quantity.'];
    }

    $result = $sb->rpc('send_stock_transfer', [
        'p_from_school_id' => $sid,
        'p_to_school_id'   => $toSchoolId,
        'p_lines'          => $payloadLines,
        'p_notes'          => $notes,
        'p_user_id'        => $user['id']    ?? null,
        'p_user_email'     => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not send transfer.'];
    }
    return array_merge(['success' => true], $payload);
}

/** Destination school receives an in-transit transfer. */
function receiveStockTransfer(string $transferId): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $result = $sb->rpc('receive_stock_transfer', [
        'p_transfer_id' => $transferId,
        'p_school_id'   => $sid,
        'p_user_id'     => $user['id']    ?? null,
        'p_user_email'  => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not receive transfer.'];
    }
    return array_merge(['success' => true], $payload);
}

/** Sending school cancels an in-transit transfer (stock restored). */
function cancelStockTransfer(string $transferId, string $reason = ''): array
{
    $sb   = new Supabase();
    $sid  = schoolId();
    $user = currentUser();
    if (!$sid) return ['success' => false, 'error' => 'No active school context.'];

    $result = $sb->rpc('cancel_stock_transfer', [
        'p_transfer_id' => $transferId,
        'p_school_id'   => $sid,
        'p_reason'      => $reason,
        'p_user_id'     => $user['id']    ?? null,
        'p_user_email'  => $user['email'] ?? null,
    ]);
    if (!empty($result['error'])) return ['success' => false, 'error' => $result['error']];
    $payload = $result['data'] ?? null;
    if (!is_array($payload) || empty($payload['success'])) {
        return ['success' => false, 'error' => $payload['error'] ?? 'Could not cancel transfer.'];
    }
    return array_merge(['success' => true], $payload);
}

/** Resolve the tenant (school row) that owns a hostname, or null for the platform host. */
function tenantFromHost(?string $host = null): ?array
{
    $host = $host ?? currentHost();
    if ($host === '' || $host === platformHost()) return null;

    // Session-cached: this resolves on EVERY request (routing + branding),
    // and a fresh lookup costs a full Supabase round-trip (~250ms) before
    // any page work begins. Custom domains change essentially never —
    // 10-minute TTL, with "no school" cached too (false) so unknown hosts
    // don't re-query either.
    if (session_status() === PHP_SESSION_NONE) @session_start();
    $ck = 'tenant_host_' . md5($host);
    if (isset($_SESSION[$ck], $_SESSION[$ck . '_t']) && (time() - $_SESSION[$ck . '_t']) < 600) {
        return $_SESSION[$ck] ?: null;
    }

    $sb = new Supabase();
    $r  = $sb->from('schools')->select('id,name,logo_url,domain,is_active')
        ->eq('domain', $host)->limit(1)->execute();
    $row = $r['data'][0] ?? null;
    $_SESSION[$ck]        = $row ?: false;
    $_SESSION[$ck . '_t'] = time();
    return $row;
}

/** Absolute base URL for a school: its own domain if set, else the platform APP_URL. */
function schoolBaseUrl(?array $school): string
{
    $d = trim((string)($school['domain'] ?? ''));
    if ($d !== '') return 'https://' . $d;
    return defined('APP_URL') ? rtrim(APP_URL, '/') : '';
}

/** Base URL for the currently-active school (for invite links sent from inside it). */
function currentTenantBaseUrl(): string
{
    $d = schoolDomain(schoolId());
    if ($d !== '') return 'https://' . $d;
    return defined('APP_URL') ? rtrim(APP_URL, '/') : '';
}

/**
 * Get current academic year. Cached for 10 minutes.
 */
function cachedCurrentYear(): ?array
{
    $sid = schoolId();
    if (!$sid) return null;
    return Supabase::cached("year_$sid", 600, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('academic_years')->select('id,name,start_date,end_date')
            ->eq('school_id', $sid)->eq('is_current', 'true')->single()->execute();
        return ($r['data'] ?? [])[0] ?? null;
    });
}

/**
 * Get all academic years. Cached for 10 minutes.
 */
function cachedYears(): array
{
    $sid = schoolId();
    if (!$sid) return [];
    return Supabase::cached("years_$sid", 600, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('academic_years')->select('id,name,start_date,end_date,is_current')
            ->eq('school_id', $sid)->order('start_date', false)->execute();
        return $r['data'] ?? [];
    });
}

/**
 * Get current term. Cached for 10 minutes.
 */
function cachedCurrentTerm(): ?array
{
    $sid = schoolId();
    if (!$sid) return null;
    return Supabase::cached("term_$sid", 600, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('terms')->select('id,name,start_date,end_date,due_date')
            ->eq('school_id', $sid)->eq('is_current', 'true')->single()->execute();
        return ($r['data'] ?? [])[0] ?? null;
    });
}

/**
 * Get all terms. Cached for 10 minutes.
 */
function cachedTerms(): array
{
    $sid = schoolId();
    if (!$sid) return [];
    return Supabase::cached("terms_$sid", 600, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('terms')->select('id,name,academic_year_id,start_date,end_date,is_current')
            ->eq('school_id', $sid)->order('start_date')->execute();
        return $r['data'] ?? [];
    });
}

/**
 * Get all subjects. Cached for 5 minutes.
 */
function cachedSubjects(): array
{
    $sid = schoolId();
    if (!$sid) return [];
    return Supabase::cached("subjects_$sid", 300, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('subjects')->select('id,name,code')
            ->eq('school_id', $sid)->order('name')->execute();
        return $r['data'] ?? [];
    });
}

/**
 * Subjects taught in a specific class — reads the class_subjects join table
 * (migration 071). Returns the same row shape as cachedSubjects() so callers
 * can swap one for the other without touching their loops.
 */
function cachedClassSubjects(string $classId): array
{
    if ($classId === '') return [];
    $sid = schoolId();
    if (!$sid) return [];
    return Supabase::cached("class_subjects_{$sid}_{$classId}", 300, function () use ($sid, $classId) {
        $sb  = new Supabase();
        $link = $sb->from('class_subjects')->select('subject_id')
            ->eq('school_id', $sid)->eq('class_id', $classId)->execute();
        $ids  = array_values(array_filter(array_column($link['data'] ?? [], 'subject_id')));
        if (empty($ids)) return [];
        $r = $sb->from('subjects')->select('id,name,code')
            ->eq('school_id', $sid)->in('id', $ids)->order('name')->execute();
        return $r['data'] ?? [];
    });
}

/**
 * All staff who can be assigned as a class or subject teacher.
 * Includes anyone in this school whose role is NOT bursar/parent — admins and
 * head teachers can also teach. Returns [{user_id, name, role}, ...].
 */
function cachedTeachingStaff(): array
{
    $sid = schoolId();
    if (!$sid) return [];
    return Supabase::cached("teaching_staff_$sid", 300, function () use ($sid) {
        $sb  = new Supabase();
        $us  = $sb->from('user_schools')->select('user_id,role')
            ->eq('school_id', $sid)->execute();
        $rows = $us['data'] ?? [];
        $rows = array_filter($rows, function ($r) {
            $role = strtolower($r['role'] ?? '');
            return $role !== 'bursar' && $role !== 'parent' && $role !== 'platform_admin';
        });
        $rows = array_values($rows);
        if (empty($rows)) return [];

        $uids = array_values(array_filter(array_column($rows, 'user_id')));
        $names = [];
        if (!empty($uids)) {
            $p = $sb->from('user_profiles')->select('id,full_name')
                ->in('id', $uids)->execute();
            foreach (($p['data'] ?? []) as $pr) $names[$pr['id']] = $pr['full_name'] ?? '';
        }
        foreach ($rows as &$r) {
            $r['name'] = $names[$r['user_id']] ?? 'Staff member';
        }
        unset($r);
        usort($rows, fn ($a, $b) => strcasecmp($a['name'], $b['name']));
        return $rows;
    });
}

/** Subject-teacher assignments for one teacher: [{id, class_id, subject_id}, ...]. */
function teacherSubjectAssignments(string $userId): array
{
    $sid = schoolId();
    if (!$sid || $userId === '') return [];
    $sb = new Supabase();
    $r  = $sb->from('subject_teachers')->select('id,class_id,subject_id')
        ->eq('school_id', $sid)->eq('user_id', $userId)->execute();
    return $r['data'] ?? [];
}

/** Classes where this user is the class teacher: [{id, name, level}, ...]. */
function teacherClassAssignments(string $userId): array
{
    $sid = schoolId();
    if (!$sid || $userId === '') return [];
    $sb = new Supabase();
    $r  = $sb->from('classes')->select('id,name,level')
        ->eq('school_id', $sid)->eq('class_teacher_id', $userId)->order('level')->execute();
    return $r['data'] ?? [];
}

/** Assign or move the teacher for one (class, subject). Returns true on success. */
function assignSubjectTeacher(string $userId, string $classId, string $subjectId): bool
{
    $sid = schoolId();
    if (!$sid || $userId === '' || $classId === '' || $subjectId === '') return false;
    $sb  = new Supabase();
    $res = $sb->from('subject_teachers')->upsert([[
        'school_id'  => $sid,
        'user_id'    => $userId,
        'class_id'   => $classId,
        'subject_id' => $subjectId,
    ]], 'school_id,class_id,subject_id');
    if (empty($res['error'])) {
        Supabase::clearCache("teaching_staff_$sid");
        return true;
    }
    return false;
}

/** Remove one assignment row. */
function unassignSubjectTeacher(string $assignmentId): bool
{
    $sid = schoolId();
    if (!$sid || $assignmentId === '') return false;
    $sb = new Supabase();
    $r  = $sb->from('subject_teachers')->eq('id', $assignmentId)->eq('school_id', $sid)->delete();
    return empty($r['error']);
}

/**
 * Set the subjects taught in a class — overwrites the class_subjects rows
 * to match exactly $subjectIds. Returns ['added' => int, 'removed' => int].
 */
function setClassSubjects(string $classId, array $subjectIds): array
{
    $sid = schoolId();
    if (!$sid || $classId === '') return ['added' => 0, 'removed' => 0];

    $sb = new Supabase();

    // Current set
    $cur = $sb->from('class_subjects')->select('id,subject_id')
        ->eq('school_id', $sid)->eq('class_id', $classId)->execute();
    $existing = [];
    foreach (($cur['data'] ?? []) as $row) {
        $existing[$row['subject_id']] = $row['id'];
    }

    // Normalise the target set.
    $target = array_values(array_unique(array_filter($subjectIds)));

    // Add missing.
    $added = 0;
    $rowsToInsert = [];
    foreach ($target as $subId) {
        if (!isset($existing[$subId])) {
            $rowsToInsert[] = [
                'school_id'  => $sid,
                'class_id'   => $classId,
                'subject_id' => $subId,
            ];
            $added++;
        }
    }
    if (!empty($rowsToInsert)) {
        $sb->from('class_subjects')->insert($rowsToInsert);
    }

    // Remove ones no longer wanted.
    $removed = 0;
    foreach ($existing as $subId => $rowId) {
        if (!in_array($subId, $target, true)) {
            $sb->from('class_subjects')->eq('id', $rowId)->eq('school_id', $sid)->delete();
            $removed++;
        }
    }

    Supabase::clearCache("class_subjects_{$sid}_{$classId}");

    return ['added' => $added, 'removed' => $removed];
}

/**
 * Get all fee heads. Cached for 5 minutes.
 */
function cachedFeeHeads(): array
{
    $sid = schoolId();
    if (!$sid) return [];
    return Supabase::cached("feeheads_$sid", 300, function() use ($sid) {
        $sb = new Supabase();
        $r = $sb->from('fee_heads')->select('id,name,amount,class_id,billing_period,is_mandatory')
            ->eq('school_id', $sid)->order('name')->execute();
        return $r['data'] ?? [];
    });
}

/* ── Parent portal ─────────────────────────────────── */

/**
 * True if the logged-in user is a parent (and therefore belongs in the
 * parent portal, not the staff app).
 */
function isParent(): bool
{
    return userRole() === 'parent';
}

/**
 * The students linked to the logged-in parent, in the active school.
 * Cached for the request. Returns [] for non-parents or parents with no
 * linked children. This is the single source of "which children are mine".
 */
function parentChildren(): array
{
    static $cache = null;
    if ($cache !== null) return $cache;
    $cache = [];

    $user = currentUser();
    $uid  = $user['id'] ?? '';
    $sid  = schoolId();
    if (!$uid || !$sid || !isParent()) return $cache;

    $sb = new Supabase();
    $links = $sb->from('student_parents')->select('student_id')
        ->eq('parent_user_id', $uid)->eq('school_id', $sid)->execute();
    $studentIds = array_column($links['data'] ?? [], 'student_id');
    if (empty($studentIds)) return $cache;

    $stuRes = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,current_class_id,status')
        ->in('id', $studentIds)->eq('school_id', $sid)->order('first_name')->execute();
    $cache = $stuRes['data'] ?? [];
    return $cache;
}

/**
 * Guard a parent-portal page. Non-parents are sent away.
 */
function requireParent(): void
{
    if (!isParent()) {
        header('Location: ' . baseUrl(isLoggedIn() ? 'dashboard' : 'login'));
        exit;
    }
}

/**
 * The core isolation check: return a student row ONLY if it belongs to the
 * logged-in parent, otherwise null. Every per-child portal page must call
 * this before showing anything.
 */
function parentStudent(string $studentId): ?array
{
    foreach (parentChildren() as $child) {
        if (($child['id'] ?? '') === $studentId) return $child;
    }
    return null;
}
