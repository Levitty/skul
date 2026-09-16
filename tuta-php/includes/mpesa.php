<?php
/**
 * M-Pesa Daraja API Integration — STK Push (Lipa Na M-Pesa Online).
 * Works with Safaricom's Daraja 2.0 API.
 *
 * Flow:
 * 1. Admin clicks "Send M-Pesa Prompt" with parent phone + amount
 * 2. STK Push sends PIN prompt to parent's phone
 * 3. Parent enters PIN → Safaricom calls our callback URL
 * 4. Callback auto-records payment against the invoice
 */

class MpesaApi
{
    private string $environment;
    private string $consumerKey;
    private string $consumerSecret;
    private string $shortcode;
    private string $passkey;
    private string $callbackUrl;

    // API base URLs
    private const SANDBOX_URL    = 'https://sandbox.safaricom.co.ke';
    private const PRODUCTION_URL = 'https://api.safaricom.co.ke';

    public function __construct()
    {
        $this->environment    = schoolSetting('mpesa_environment', 'sandbox');
        $this->consumerKey    = schoolSetting('mpesa_consumer_key');
        $this->consumerSecret = schoolSetting('mpesa_consumer_secret');
        $this->shortcode      = schoolSetting('mpesa_shortcode');
        $this->passkey        = schoolSetting('mpesa_passkey');
        $this->callbackUrl    = schoolSetting('mpesa_callback_url');
    }

    /**
     * Check if M-Pesa is configured (credentials present).
     */
    public function isConfigured(): bool
    {
        return !empty($this->consumerKey)
            && !empty($this->consumerSecret)
            && !empty($this->shortcode)
            && !empty($this->passkey)
            && !empty($this->callbackUrl);
    }

    /**
     * Get the API base URL.
     */
    private function baseUrl(): string
    {
        return $this->environment === 'production' ? self::PRODUCTION_URL : self::SANDBOX_URL;
    }

    /**
     * Generate OAuth access token.
     */
    public function getAccessToken(): ?string
    {
        $url = $this->baseUrl() . '/oauth/v1/generate?grant_type=client_credentials';
        $credentials = base64_encode($this->consumerKey . ':' . $this->consumerSecret);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER     => ["Authorization: Basic $credentials"],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) return null;

        $data = json_decode($response, true);
        return $data['access_token'] ?? null;
    }

    /**
     * Generate the STK Push password.
     * Password = Base64(Shortcode + Passkey + Timestamp)
     */
    private function generatePassword(string $timestamp): string
    {
        return base64_encode($this->shortcode . $this->passkey . $timestamp);
    }

    /**
     * Send STK Push (Lipa Na M-Pesa Online) request.
     *
     * @param string $phone Phone number (254XXXXXXXXX format)
     * @param float  $amount Amount to charge
     * @param string $accountRef Account reference (e.g. invoice number)
     * @param string $description Transaction description
     * @return array ['success' => bool, 'data' => array, 'error' => string|null]
     */
    public function stkPush(string $phone, float $amount, string $accountRef, string $description = 'School Fee Payment'): array
    {
        if (!$this->isConfigured()) {
            return ['success' => false, 'data' => [], 'error' => 'M-Pesa is not configured. Go to Settings → M-Pesa to add your Daraja credentials.'];
        }

        $token = $this->getAccessToken();
        if (!$token) {
            return ['success' => false, 'data' => [], 'error' => 'Failed to authenticate with M-Pesa. Check your consumer key and secret.'];
        }

        // Format phone: remove leading 0 or +, ensure 254 prefix
        $phone = preg_replace('/[^0-9]/', '', $phone);
        if (str_starts_with($phone, '0')) {
            $phone = '254' . substr($phone, 1);
        } elseif (str_starts_with($phone, '+')) {
            $phone = substr($phone, 1);
        }
        if (!str_starts_with($phone, '254')) {
            $phone = '254' . $phone;
        }

        $timestamp = date('YmdHis');
        $password  = $this->generatePassword($timestamp);

        $payload = [
            'BusinessShortCode' => $this->shortcode,
            'Password'          => $password,
            'Timestamp'         => $timestamp,
            'TransactionType'   => 'CustomerPayBillOnline',
            'Amount'            => (int)ceil($amount), // M-Pesa only accepts whole numbers
            'PartyA'            => $phone,
            'PartyB'            => $this->shortcode,
            'PhoneNumber'       => $phone,
            'CallBackURL'       => $this->callbackUrl,
            'AccountReference'  => substr($accountRef, 0, 12), // Max 12 chars
            'TransactionDesc'   => substr($description, 0, 13), // Max 13 chars
        ];

        $url = $this->baseUrl() . '/mpesa/stkpush/v1/processrequest';

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER     => [
                "Authorization: Bearer $token",
                'Content-Type: application/json',
            ],
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return ['success' => false, 'data' => [], 'error' => 'Connection error: ' . $error];
        }

        $data = json_decode($response, true) ?? [];

        if (($data['ResponseCode'] ?? '') === '0') {
            return [
                'success'          => true,
                'data'             => $data,
                'error'            => null,
                'checkout_id'      => $data['CheckoutRequestID'] ?? '',
                'merchant_request' => $data['MerchantRequestID'] ?? '',
            ];
        }

        return [
            'success' => false,
            'data'    => $data,
            'error'   => $data['errorMessage'] ?? $data['ResponseDescription'] ?? 'STK Push failed. Please try again.',
        ];
    }

    /**
     * Parse the STK Push callback payload from Safaricom.
     * Returns normalized data or null on failure/cancellation.
     *
     * @param string $jsonBody Raw POST body from Safaricom
     * @return array|null ['amount', 'receipt', 'phone', 'checkout_id', 'transaction_date']
     */
    public static function parseCallback(string $jsonBody): ?array
    {
        $data = json_decode($jsonBody, true);
        $body = $data['Body']['stkCallback'] ?? null;
        if (!$body) return null;

        $resultCode = $body['ResultCode'] ?? -1;
        if ($resultCode !== 0) return null; // User cancelled or failed

        $checkoutId = $body['CheckoutRequestID'] ?? '';
        $items = $body['CallbackMetadata']['Item'] ?? [];

        $parsed = ['checkout_id' => $checkoutId];
        foreach ($items as $item) {
            $name  = $item['Name'] ?? '';
            $value = $item['Value'] ?? '';
            switch ($name) {
                case 'Amount':            $parsed['amount']           = (float)$value; break;
                case 'MpesaReceiptNumber': $parsed['receipt']         = $value; break;
                case 'PhoneNumber':       $parsed['phone']            = $value; break;
                case 'TransactionDate':   $parsed['transaction_date'] = $value; break;
            }
        }

        return isset($parsed['receipt']) ? $parsed : null;
    }

    // ═══════════════════════════════════════════════════════
    // C2B — Customer to Business (parent pays directly to Till/Paybill)
    // ═══════════════════════════════════════════════════════

    /**
     * Register C2B validation and confirmation URLs with Safaricom.
     * This is a ONE-TIME setup. After this, every payment to your
     * Paybill/Till triggers a POST to your confirmation URL.
     *
     * @param string $validationUrl   URL Safaricom calls to validate (can accept all)
     * @param string $confirmationUrl URL Safaricom calls to confirm payment
     * @return array ['success' => bool, 'error' => string|null]
     */
    public function registerC2BUrls(string $validationUrl, string $confirmationUrl): array
    {
        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'M-Pesa is not configured.'];
        }

        $token = $this->getAccessToken();
        if (!$token) {
            return ['success' => false, 'error' => 'Failed to get access token.'];
        }

        $payload = [
            'ShortCode'       => $this->shortcode,
            'ResponseType'    => 'Completed', // or 'Cancelled' to reject by default
            'ConfirmationURL' => $confirmationUrl,
            'ValidationURL'   => $validationUrl,
        ];

        $url = $this->baseUrl() . '/mpesa/c2b/v1/registerurl';

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER     => [
                "Authorization: Bearer $token",
                'Content-Type: application/json',
            ],
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return ['success' => false, 'error' => 'Connection error: ' . $error];
        }

        $data = json_decode($response, true) ?? [];

        if (($data['ResponseDescription'] ?? '') === 'success'
            || ($data['ResponseCode'] ?? '') === '0') {
            return ['success' => true, 'error' => null];
        }

        return [
            'success' => false,
            'error'   => $data['errorMessage'] ?? $data['ResponseDescription'] ?? 'Registration failed.',
        ];
    }

    /**
     * Parse C2B confirmation payload from Safaricom.
     * This is what arrives when a parent pays to your Paybill/Till.
     *
     * @param string $jsonBody Raw POST body
     * @return array|null Normalized: ['transaction_type', 'trans_id', 'trans_time',
     *                    'amount', 'bill_ref', 'phone', 'first_name', 'last_name']
     */
    public static function parseC2BConfirmation(string $jsonBody): ?array
    {
        $data = json_decode($jsonBody, true);
        if (!$data || empty($data['TransID'])) return null;

        return [
            'transaction_type' => $data['TransactionType'] ?? '',
            'trans_id'         => $data['TransID'] ?? '',
            'trans_time'       => $data['TransTime'] ?? '',
            'amount'           => (float)($data['TransAmount'] ?? 0),
            'bill_ref'         => strtoupper(trim($data['BillRefNumber'] ?? '')), // Account reference parent entered
            'shortcode'        => trim((string)($data['BusinessShortCode'] ?? '')), // Which till/paybill was paid — identifies the school
            'phone'            => $data['MSISDN'] ?? '',
            'first_name'       => $data['FirstName'] ?? '',
            'middle_name'      => $data['MiddleName'] ?? '',
            'last_name'        => $data['LastName'] ?? '',
            'org_balance'      => $data['OrgAccountBalance'] ?? '',
        ];
    }

    // ═══════════════════════════════════════════════════════
    // Callback source verification (R2) — only Safaricom should be
    // able to POST payment confirmations to our public endpoints.
    // ═══════════════════════════════════════════════════════

    /**
     * Safaricom production egress ranges for Daraja result/confirmation
     * callbacks. Sandbox traffic does NOT originate from these, so keep
     * enforcement OFF until the school is live on production M-Pesa.
     */
    private const SAFARICOM_CIDRS = [
        '196.201.214.0/24',
        '196.201.213.0/24',
        '196.201.212.0/24',
        '196.201.211.0/24',
    ];

    /**
     * Best-effort client IP. On Hostinger shared hosting the request may
     * arrive via a proxy, so honour the first X-Forwarded-For hop, then
     * fall back to REMOTE_ADDR.
     */
    public static function clientIp(): string
    {
        $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($xff !== '') {
            $first = trim(explode(',', $xff)[0]);
            if (filter_var($first, FILTER_VALIDATE_IP)) return $first;
        }
        $ra = $_SERVER['REMOTE_ADDR'] ?? '';
        return filter_var($ra, FILTER_VALIDATE_IP) ? $ra : '';
    }

    /**
     * Is this request's source IP within one of Safaricom's documented
     * production ranges? IPv4 only (Daraja posts from IPv4).
     */
    public static function sourceAllowed(?string $ip = null): bool
    {
        // SECURITY: check the real TCP peer (REMOTE_ADDR), NOT X-Forwarded-For.
        // XFF is supplied by the caller and can be forged to a Safaricom IP, so
        // using clientIp() here would make the allowlist trivially bypassable.
        // If this host ever sits behind a trusted reverse proxy, resolve the
        // real client from XFF *only* for that proxy's known address.
        if ($ip === null) {
            $ra = $_SERVER['REMOTE_ADDR'] ?? '';
            $ip = filter_var($ra, FILTER_VALIDATE_IP) ? $ra : '';
        }
        if ($ip === '' || strpos($ip, '.') === false) return false;
        $ipLong = ip2long($ip);
        if ($ipLong === false) return false;
        foreach (self::SAFARICOM_CIDRS as $cidr) {
            [$net, $bits] = explode('/', $cidr);
            $netLong = ip2long($net);
            if ($netLong === false) continue;
            $mask = -1 << (32 - (int)$bits);
            if (($ipLong & $mask) === ($netLong & $mask)) return true;
        }
        return false;
    }

    /**
     * Guard a public M-Pesa callback. Logs every request whose source isn't
     * a known Safaricom IP. In LOG-ONLY mode (the default) it returns and
     * lets processing continue — so you can confirm real callbacks pass
     * before turning enforcement on. Add `define('MPESA_IP_ENFORCE', true);`
     * to config.php to have it silently acknowledge (200) and drop anything
     * off the allowlist.
     */
    public static function guardCallbackSource(string $logDir, string $endpoint): void
    {
        if (self::sourceAllowed()) return;

        $ip      = self::clientIp() ?: 'unknown';
        $enforce = defined('MPESA_IP_ENFORCE') && MPESA_IP_ENFORCE === true;
        if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
        @file_put_contents(
            $logDir . '/mpesa_ipblock_' . date('Y-m-d') . '.log',
            date('c') . " | endpoint=$endpoint | ip=$ip | mode=" . ($enforce ? 'ENFORCE' : 'log-only')
                . " | xff=" . ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '') . "\n",
            FILE_APPEND
        );

        if ($enforce) {
            // Acknowledge so Safaricom won't retry, but do NOT process.
            echo json_encode(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
            exit;
        }
    }
}
