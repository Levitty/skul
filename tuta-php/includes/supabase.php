<?php
/**
 * Supabase REST API helper for PHP.
 * Uses cURL with persistent handle and session caching for speed.
 */
class Supabase
{
    private string $url;
    private string $key;
    private static $curlHandle = null; // Reuse connection across requests

    public function __construct(string $url = SUPABASE_URL, string $key = SUPABASE_SERVICE_KEY)
    {
        $this->url = rtrim($url, '/');
        $this->key = $key;
    }

    /**
     * Get or create a persistent cURL handle — reuses the TCP connection
     * to Supabase across all queries in a single page load.
     */
    private function getCurl(): \CurlHandle
    {
        if (self::$curlHandle === null) {
            self::$curlHandle = curl_init();
            curl_setopt_array(self::$curlHandle, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TCP_KEEPALIVE  => 1,
                CURLOPT_TCP_KEEPIDLE   => 60,
            ]);
        }
        return self::$curlHandle;
    }

    /* ── Core HTTP ─────────────────────────────────────── */

    private function request(string $method, string $endpoint, array $headers = [], $body = null, bool $captureHeaders = false): array
    {
        $ch = $this->getCurl();

        $defaultHeaders = [
            'apikey: ' . $this->key,
            'Authorization: Bearer ' . $this->key,
            'Content-Type: application/json',
        ];

        // Add the default `Prefer: return=representation` only when the caller
        // hasn't supplied its own Prefer header. Sending two separate Prefer
        // lines is ambiguous across HTTP stacks — callers that need extra
        // preferences (upsert, count) pass a single combined Prefer instead.
        $callerHasPrefer = false;
        foreach ($headers as $h) {
            if (stripos($h, 'Prefer:') === 0) { $callerHasPrefer = true; break; }
        }
        if (!$callerHasPrefer) {
            $defaultHeaders[] = 'Prefer: return=representation';
        }

        // Optional response-header capture (needed for Content-Range / count=exact)
        $responseHeaders = [];
        if ($captureHeaders) {
            curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($curl, $hdr) use (&$responseHeaders) {
                $len = strlen($hdr);
                $parts = explode(':', trim($hdr), 2);
                if (count($parts) === 2) {
                    $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                }
                return $len;
            });
        } else {
            // Reset the header function on the reused handle. PHP/cURL rejects
            // `null` here in some versions ("Invalid callback") — passing a
            // no-op closure that returns the header length is the portable way
            // to make subsequent requests ignore the previous request's hook.
            curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($curl, $hdr) {
                return strlen($hdr);
            });
        }

        curl_setopt_array($ch, [
            CURLOPT_URL            => $this->url . $endpoint,
            CURLOPT_HTTPHEADER     => array_merge($defaultHeaders, $headers),
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_POSTFIELDS     => ($body !== null) ? (is_string($body) ? $body : json_encode($body)) : '',
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);

        if ($error) {
            return ['error' => $error, 'status' => 0, 'data' => null];
        }

        $decoded = json_decode($response, true);

        $isError = ($httpCode >= 400);
        $result = [
            'status' => $httpCode,
            // On error, PostgREST/GoTrue return an error OBJECT, not rows. Returning
            // that object as `data` defeats every `($res['data'] ?? [])` guard in the
            // app — callers then iterate an error object (e.g. when a table/column is
            // missing) and can fatal. Force `data` to null on error so those guards
            // correctly fall back to an empty list. The human-readable reason is still
            // surfaced via `error` below.
            'data'   => $isError ? null : $decoded,
            // GoTrue (auth) errors use `msg`; PostgREST uses `message`/`hint`.
            // Include `msg` so login/invite see the real reason instead of "Unknown error".
            'error'  => $isError ? (($decoded['message'] ?? $decoded['error'] ?? $decoded['msg'] ?? $decoded['hint'] ?? null) ?: 'Unknown error') : null,
        ];
        if ($captureHeaders) {
            $result['headers'] = $responseHeaders;
        }
        return $result;
    }

    /**
     * GET with PostgREST's `Prefer: count=exact` header so we can paginate
     * with a real total. Returns ['data' => [...], 'count' => N, 'error' => ?].
     *
     * Count comes back in the Content-Range response header (format: "0-49/247").
     */
    public function getWithCount(string $endpoint, array $params = []): array
    {
        $qs     = $this->buildQueryString($params);
        $result = $this->request('GET', $endpoint . $qs, ['Prefer: count=exact'], null, true);

        $count = null;
        if (!empty($result['headers']['content-range'])) {
            // "0-49/247" → 247    or    "*/0" → 0
            if (preg_match('|/(\d+)$|', $result['headers']['content-range'], $m)) {
                $count = (int)$m[1];
            }
        }
        $result['count'] = $count;
        unset($result['headers']);
        return $result;
    }

    /**
     * Fetch rows by a large list of IDs (or any column), chunked to avoid
     * PostgREST's silent 1000-row IN truncation AND URL-length limits.
     *
     * Usage:
     *   $rows = Supabase::fetchByChunkedIn(
     *       fn($sb) => $sb->from('students')->select('id,first_name,last_name')->eq('school_id', $sid),
     *       'id',
     *       $studentIds
     *   );
     *
     * Default chunkSize=250 keeps URLs comfortably under ~10KB for UUIDs.
     */
    public static function fetchByChunkedIn(callable $queryBuilder, string $column, array $values, int $chunkSize = 250): array
    {
        if (empty($values)) return [];
        $sb  = new self();
        $all = [];
        foreach (array_chunk(array_values(array_unique($values)), $chunkSize) as $chunk) {
            $query = $queryBuilder($sb);
            $res   = $query->in($column, $chunk)->execute();
            if (!empty($res['data'])) {
                $all = array_merge($all, $res['data']);
            }
        }
        return $all;
    }

    /**
     * Walk every page of a query so stats can be computed over the full
     * filtered set without hitting PostgREST's 1000-row cap. Use sparingly —
     * a 5,000-row table still costs 5 round trips. For real aggregates,
     * write an RPC.
     *
     * The callable receives a fresh Supabase client and must return a
     * SupabaseQuery (without ->range / ->limit applied).
     *
     * Hard maximum of 20 pages (20,000 rows at pageSize=1000) so a bug
     * can't accidentally fetch the entire database.
     */
    /**
     * Run several READ queries CONCURRENTLY via curl_multi.
     *   $queries = ['key' => SupabaseQuery (built, not executed), ...]
     * Returns ['key' => rows array] — [] on any error.
     *
     * Why: every query is a full HTTPS round-trip to Supabase (~150–300ms
     * from the web host). Sequentially, a page with 8 queries spends ~2s
     * just waiting in line; in parallel they cost roughly ONE round-trip.
     * Use for independent fetches on hot pages (dashboard, reports).
     */
    public static function fetchParallel(array $queries): array
    {
        $self = new self();
        $mh   = curl_multi_init();
        $chs  = [];
        foreach ($queries as $k => $q) {
            $ch = curl_init($self->url . $q->url());
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 20,
                CURLOPT_HTTPHEADER     => [
                    'apikey: ' . $self->key,
                    'Authorization: Bearer ' . $self->key,
                    'Content-Type: application/json',
                ],
            ]);
            curl_multi_add_handle($mh, $ch);
            $chs[$k] = $ch;
        }
        do {
            $st = curl_multi_exec($mh, $running);
            if ($running) curl_multi_select($mh, 0.05);
        } while ($running && $st === CURLM_OK);

        $out = [];
        foreach ($chs as $k => $ch) {
            $dec = json_decode((string)curl_multi_getcontent($ch), true);
            // Only accept a LIST of rows — an error object decodes to an
            // assoc array and must not leak through as data.
            $isList = is_array($dec) && ($dec === [] || array_keys($dec) === range(0, count($dec) - 1));
            $out[$k] = $isList ? $dec : [];
            curl_multi_remove_handle($mh, $ch);
        }
        curl_multi_close($mh);
        return $out;
    }

    /** Public query-string builder (used by SupabaseQuery::url()). */
    public function qs(array $params): string
    {
        return $this->buildQueryString($params);
    }

    public static function fetchAllPaged(callable $queryBuilder, int $pageSize = 1000, int $maxPages = 20): array
    {
        $sb  = new self();
        $all = [];
        for ($i = 0; $i < $maxPages; $i++) {
            $query = $queryBuilder($sb);
            $res   = $query->range($i * $pageSize, $pageSize)->execute();
            $data  = $res['data'] ?? [];
            if (empty($data)) break;
            $all = array_merge($all, $data);
            if (count($data) < $pageSize) break; // partial page = last page
        }
        return $all;
    }

    /* ── Cache helpers ────────────────────────────────── */

    /**
     * Cache a query result in session. Good for data that rarely changes
     * (classes, fee heads, academic year, terms). TTL in seconds.
     */
    public static function cached(string $key, int $ttl, callable $fetcher): mixed
    {
        if (session_status() === PHP_SESSION_NONE) session_start();
        $cacheKey = 'sb_cache_' . $key;
        $timeKey  = 'sb_time_' . $key;

        if (isset($_SESSION[$cacheKey]) && isset($_SESSION[$timeKey])) {
            if ((time() - $_SESSION[$timeKey]) < $ttl) {
                return $_SESSION[$cacheKey];
            }
        }

        $result = $fetcher();
        $_SESSION[$cacheKey] = $result;
        $_SESSION[$timeKey]  = time();
        return $result;
    }

    /**
     * Clear all cached data (call after writes that affect cached tables).
     */
    public static function clearCache(?string $key = null): void
    {
        if (session_status() === PHP_SESSION_NONE) session_start();
        if ($key) {
            unset($_SESSION['sb_cache_' . $key], $_SESSION['sb_time_' . $key]);
        } else {
            foreach (array_keys($_SESSION) as $k) {
                if (str_starts_with($k, 'sb_cache_') || str_starts_with($k, 'sb_time_')) {
                    unset($_SESSION[$k]);
                }
            }
        }
    }

    /* ── Convenience Methods ───────────────────────────── */

    public function from(string $table): SupabaseQuery
    {
        return new SupabaseQuery($this, $table);
    }

    /**
     * Tenant-scoped query — automatically adds school_id filter.
     * Use this instead of from() for any table that has a school_id column.
     * This is the primary safety net against cross-tenant data leaks.
     */
    public function tenant(string $table): SupabaseQuery
    {
        $sid = schoolId();
        if (!$sid) {
            throw new \RuntimeException("tenant() called without an active school context");
        }
        return (new SupabaseQuery($this, $table))->eq('school_id', $sid);
    }

    /**
     * Build a query string that does NOT encode PostgREST operators.
     * Standard http_build_query encodes () and , which breaks PostgREST.
     */
    public function buildQueryString(array $params): string
    {
        if (empty($params)) return '';
        $parts = [];
        foreach ($params as $key => $value) {
            foreach ((array)$value as $v) {
                $parts[] = urlencode($key) . '=' . $v; // value NOT encoded — PostgREST expects raw operators
            }
        }
        return '?' . implode('&', $parts);
    }

    public function get(string $endpoint, array $params = []): array
    {
        $qs = $this->buildQueryString($params);
        return $this->request('GET', $endpoint . $qs);
    }

    public function post(string $endpoint, $body): array
    {
        return $this->request('POST', $endpoint, [], $body);
    }

    public function patch(string $endpoint, $body, array $params = []): array
    {
        $qs = $this->buildQueryString($params);
        return $this->request('PATCH', $endpoint . $qs, [], $body);
    }

    /**
     * Upsert (insert-or-update) using PostgREST's merge-duplicates resolution.
     *
     * $onConflict must name the columns of a unique constraint or index,
     * e.g. "exam_id,subject_id,student_id". On conflict, every column present
     * in the body is updated; columns omitted from the body are left untouched
     * (so e.g. a `status` column can be preserved by simply not sending it).
     *
     * $body may be a single row or a list of rows. When sending a list, every
     * row MUST have the same set of keys — PostgREST requires uniform columns.
     */
    public function upsert(string $endpoint, $body, string $onConflict = ''): array
    {
        $ep = $endpoint;
        if ($onConflict !== '') {
            $ep .= '?on_conflict=' . $onConflict;
        }
        return $this->request('POST', $ep, ['Prefer: return=representation,resolution=merge-duplicates'], $body);
    }

    public function delete(string $endpoint, array $params = []): array
    {
        $qs = $this->buildQueryString($params);
        return $this->request('DELETE', $endpoint . $qs);
    }

    /* ── Auth helpers ──────────────────────────────────── */

    public function signUp(string $email, string $password): array
    {
        return $this->request('POST', '/auth/v1/signup', [], [
            'email'    => $email,
            'password' => $password,
        ]);
    }

    public function signIn(string $email, string $password): array
    {
        return $this->request('POST', '/auth/v1/token?grant_type=password', [], [
            'email'    => $email,
            'password' => $password,
        ]);
    }

    /**
     * Admin: create an auth user that is already email-confirmed (needs the
     * service key, which is this client's default). Used by the invite flow:
     * the invitation token already proves the admin trusts this address, so we
     * skip the email-confirmation round-trip that otherwise blocks login with a
     * misleading "Invalid email or password". Returns the GoTrue user object in
     * ['data'] with a top-level ['id'].
     */
    public function adminCreateUser(string $email, string $password, bool $emailConfirm = true): array
    {
        return $this->request('POST', '/auth/v1/admin/users', [], [
            'email'         => $email,
            'password'      => $password,
            'email_confirm' => $emailConfirm,
        ]);
    }

    public function getUser(string $accessToken): array
    {
        return $this->request('GET', '/auth/v1/user', [
            'Authorization: Bearer ' . $accessToken,
        ]);
    }

    /**
     * Admin: fetch a single auth user by id (needs the service key, which is
     * the default key this client is constructed with). Returns the GoTrue
     * user object in ['data'] — notably ['data']['email']. Used to resolve a
     * parent's email for notifications, since user_profiles stores no email.
     */
    public function adminGetUser(string $userId): array
    {
        return $this->request('GET', '/auth/v1/admin/users/' . rawurlencode($userId));
    }

    /**
     * Admin: update an auth user's attributes by id (needs the service key,
     * which is this client's default). Pass e.g. ['password' => '...'] to set
     * a new password. Powers the in-app "Change Password" page: the user's
     * current password is verified first with signIn(), then this sets the new
     * one — no recovery email, so it never depends on the Auth Site URL.
     */
    public function adminUpdateUser(string $userId, array $attributes): array
    {
        return $this->request('PUT', '/auth/v1/admin/users/' . rawurlencode($userId), [], $attributes);
    }

    public function rpc(string $functionName, array $params = []): array
    {
        return $this->request('POST', '/rest/v1/rpc/' . $functionName, [], $params);
    }
}

/**
 * Fluent query builder that mirrors Supabase JS syntax.
 */
class SupabaseQuery
{
    private Supabase $client;
    private string $table;
    private array $params  = [];
    private array $filters = [];
    private ?string $selectCols = null;

    public function __construct(Supabase $client, string $table)
    {
        $this->client = $client;
        $this->table  = $table;
    }

    public function select(string $columns = '*'): self
    {
        $this->selectCols = $columns;
        return $this;
    }

    /**
     * Percent-encode a user-supplied filter value. buildQueryString() emits
     * params raw (PostgREST needs literal operators like `eq.`, `in.(...)`),
     * so the VALUE must be encoded here — otherwise characters like `&`, `(`,
     * `)`, `,` let a caller-controlled value inject extra query params or break
     * out of the filter. The operator prefix is added by each method and is
     * never encoded. rawurlencode leaves [A-Za-z0-9-_.~] intact, so
     * UUIDs/slugs/dates are unchanged; it also correctly escapes `+`/`:`/space
     * in timestamps (a raw `+` in a query string would mean space).
     */
    private static function encVal(string $value): string
    {
        return rawurlencode($value);
    }

    public function eq(string $column, string $value): self
    {
        $this->filters[$column] = 'eq.' . self::encVal($value);
        return $this;
    }

    public function neq(string $column, string $value): self
    {
        $this->filters[$column] = 'neq.' . self::encVal($value);
        return $this;
    }

    public function is(string $column, string $value): self
    {
        $this->filters[$column] = 'is.' . self::encVal($value);
        return $this;
    }

    /**
     * A bound on a column. Unlike eq()/in(), a second bound on the same column
     * must NOT replace the first — gte + lte is how a date range is expressed,
     * and PostgREST accepts the column repeated (paid_at=gte.a&paid_at=lte.b).
     * Until this existed, every range in the app kept only its last bound.
     */
    private function addRange(string $column, string $expr): void
    {
        if (!isset($this->filters[$column])) {
            $this->filters[$column] = $expr;
        } elseif (is_array($this->filters[$column])) {
            $this->filters[$column][] = $expr;
        } else {
            $this->filters[$column] = [$this->filters[$column], $expr];
        }
    }

    public function gt(string $column, string $value): self
    {
        $this->addRange($column, 'gt.' . self::encVal($value));
        return $this;
    }

    public function gte(string $column, string $value): self
    {
        $this->addRange($column, 'gte.' . self::encVal($value));
        return $this;
    }

    public function lt(string $column, string $value): self
    {
        $this->addRange($column, 'lt.' . self::encVal($value));
        return $this;
    }

    public function lte(string $column, string $value): self
    {
        $this->addRange($column, 'lte.' . self::encVal($value));
        return $this;
    }

    /**
     * IN filter — quotes each value for UUID/text compatibility with PostgREST.
     * PostgREST format: column=in.("val1","val2","val3")
     *
     * GUARDRAIL: throws if values count exceeds 1000. PostgREST silently
     * truncates IN lists past 1000 (and URLs get huge), causing invisible
     * data loss. For legitimate large lookups, use Supabase::fetchByChunkedIn().
     */
    public function in(string $column, array $values): self
    {
        if (empty($values)) {
            // PostgREST doesn't support empty in() — use an impossible filter
            $this->filters[$column] = 'eq.IMPOSSIBLE_MATCH_EMPTY_IN';
            return $this;
        }
        if (count($values) > 1000) {
            throw new \RuntimeException(sprintf(
                'Supabase ->in("%s", ...) called with %d values — PostgREST silently truncates IN lists past 1000 and URLs exceed safe length. Use Supabase::fetchByChunkedIn() instead.',
                $column, count($values)
            ));
        }
        // Encode each value (handles embedded quotes, commas, parens). The
        // quote wrapper + comma separators are structural and stay literal.
        $quoted = array_map(fn($v) => '"' . self::encVal((string)$v) . '"', $values);
        $this->filters[$column] = 'in.(' . implode(',', $quoted) . ')';
        return $this;
    }

    public function ilike(string $column, string $pattern): self
    {
        // Encode the pattern but keep `%` wildcards working (callers pass
        // "%term%"). Everything else dangerous (`&`, `(`, `)`, `,`) is escaped.
        $this->filters[$column] = 'ilike.' . str_replace('%25', '%', self::encVal($pattern));
        return $this;
    }

    /**
     * Search-box helper: every whitespace-separated token in $term must match
     * (case-insensitively, as a substring) at least ONE of $columns. Tokens are
     * AND-ed together, columns are OR-ed — so "ann kim" matches a row where one
     * column contains "ann" and another contains "kim". The term is sanitised to
     * letters, digits, spaces, hyphens and underscores so it can never break
     * PostgREST's boolean grammar (which is delimited by (), , and .).
     */
    public function searchTokens(array $columns, string $term): self
    {
        $clean  = preg_replace('/[^\p{L}\p{N}\s\-_]/u', ' ', $term);
        $tokens = preg_split('/\s+/', trim((string)$clean), -1, PREG_SPLIT_NO_EMPTY);
        if (empty($tokens) || empty($columns)) return $this;
        $groups = [];
        foreach ($tokens as $tok) {
            $enc = rawurlencode($tok); // structural chars stay literal below
            $ors = [];
            foreach ($columns as $col) $ors[] = $col . '.ilike.*' . $enc . '*';
            $groups[] = 'or(' . implode(',', $ors) . ')';
        }
        // Top-level AND param; composes with existing eq() filters (also AND-ed).
        $this->filters['and'] = '(' . implode(',', $groups) . ')';
        return $this;
    }

    public function order(string $column, bool $ascending = true): self
    {
        $dir = $ascending ? 'asc' : 'desc';
        $existing = $this->params['order'] ?? '';
        $this->params['order'] = $existing ? "$existing,$column.$dir" : "$column.$dir";
        return $this;
    }

    public function limit(int $count): self
    {
        $this->params['limit'] = (string)$count;
        return $this;
    }

    public function single(): self
    {
        $this->params['limit'] = '1';
        return $this;
    }

    /**
     * Pagination — offset + limit.
     * PostgREST uses Range header, but offset/limit params also work.
     */
    public function range(int $offset, int $limit): self
    {
        $this->params['offset'] = (string)$offset;
        $this->params['limit']  = (string)$limit;
        return $this;
    }

    /* ── Execute ───────────────────────────────────────── */

    /** The GET path+query this query would hit — for Supabase::fetchParallel(). */
    public function url(): string
    {
        $params = array_merge($this->params, $this->filters);
        if ($this->selectCols) {
            $params['select'] = $this->selectCols;
        }
        return '/rest/v1/' . $this->table . $this->client->qs($params);
    }

    public function execute(): array
    {
        $params = array_merge($this->params, $this->filters);
        if ($this->selectCols) {
            $params['select'] = $this->selectCols;
        }
        return $this->client->get('/rest/v1/' . $this->table, $params);
    }

    /**
     * Like execute() but also returns the total row count (ignoring limit/offset).
     * Use for paginated lists where you need "showing 21-40 of 247".
     *
     * Returns ['data' => [...], 'count' => 247, 'error' => null].
     */
    public function executeWithCount(): array
    {
        $params = array_merge($this->params, $this->filters);
        if ($this->selectCols) {
            $params['select'] = $this->selectCols;
        }
        return $this->client->getWithCount('/rest/v1/' . $this->table, $params);
    }

    public function insert(array $data): array
    {
        return $this->client->post('/rest/v1/' . $this->table, $data);
    }

    /**
     * Insert with automatic school_id injection.
     * Use when inserting into tenant-scoped tables.
     */
    public function insertTenant(array $data): array
    {
        $sid = schoolId();
        if (!$sid) {
            return ['error' => 'No active school context', 'status' => 0, 'data' => null];
        }
        $data['school_id'] = $sid;
        return $this->client->post('/rest/v1/' . $this->table, $data);
    }

    /**
     * Upsert one row or a batch of rows in a single request.
     *
     * $onConflict lists the unique-constraint columns to match on, e.g.
     * "exam_id,subject_id,student_id". This collapses what would otherwise be
     * a SELECT + INSERT/UPDATE per row into one round trip.
     *
     * When passing a batch, every row must have the same keys.
     */
    public function upsert(array $rows, string $onConflict = ''): array
    {
        return $this->client->upsert('/rest/v1/' . $this->table, $rows, $onConflict);
    }

    public function update(array $data): array
    {
        if (empty($this->filters)) {
            return ['error' => 'Cannot update without filters — would affect all rows', 'status' => 0, 'data' => null];
        }
        $params = array_merge($this->params, $this->filters);
        return $this->client->patch('/rest/v1/' . $this->table, $data, $params);
    }

    public function delete(): array
    {
        if (empty($this->filters)) {
            return ['error' => 'Cannot delete without filters — would delete all rows', 'status' => 0, 'data' => null];
        }
        $params = array_merge($this->params, $this->filters);
        return $this->client->delete('/rest/v1/' . $this->table, $params);
    }
}
