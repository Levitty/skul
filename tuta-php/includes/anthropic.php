<?php
/**
 * Minimal Claude (Anthropic Messages API) client — raw cURL, matching the
 * app's existing style (see includes/mpesa.php). Powers the AI School Briefing.
 *
 * Requires ANTHROPIC_API_KEY in config.php:
 *     define('ANTHROPIC_API_KEY', 'sk-ant-...');
 *
 * Model: claude-opus-4-8 (Anthropic's most capable model). The briefing sends
 * ONLY pre-computed, verified numbers and asks the model to prioritise and
 * phrase them — it never does the arithmetic, so figures can't be hallucinated.
 */

function claudeConfigured(): bool
{
    return defined('ANTHROPIC_API_KEY') && ANTHROPIC_API_KEY !== '';
}

/**
 * Call Claude with a system prompt + user text.
 * If $schema is given, the reply is constrained to that JSON schema and the
 * decoded array is returned. Otherwise the raw text is returned.
 *
 * @return array ['ok'=>bool, 'data'=>array|string, 'error'=>?string]
 */
function claudeMessage(string $system, string $userText, ?array $schema = null, string $model = 'claude-opus-4-8', int $maxTokens = 3000): array
{
    if (!claudeConfigured()) {
        return ['ok' => false, 'error' => 'AI is not configured. Add ANTHROPIC_API_KEY to config.php.'];
    }

    $body = [
        'model'      => $model,
        'max_tokens' => $maxTokens,
        'system'     => $system,
        'messages'   => [['role' => 'user', 'content' => $userText]],
        // effort medium is a good cost/quality balance; thinking omitted for speed
        // (structured output keeps the reply tight, so no rambling).
        'output_config' => ['effort' => 'medium'],
    ];
    if ($schema !== null) {
        $body['output_config']['format'] = ['type' => 'json_schema', 'schema' => $schema];
    }

    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => [
            'x-api-key: ' . ANTHROPIC_API_KEY,
            'anthropic-version: 2023-06-01',
            'content-type: application/json',
        ],
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($body),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 90,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);

    if ($err) return ['ok' => false, 'error' => 'Connection error: ' . $err];

    $data = json_decode($resp, true);
    if ($code !== 200) {
        return ['ok' => false, 'error' => $data['error']['message'] ?? ('HTTP ' . $code)];
    }
    if (($data['stop_reason'] ?? '') === 'refusal') {
        return ['ok' => false, 'error' => 'The model declined to generate this briefing.'];
    }

    $text = '';
    foreach ($data['content'] ?? [] as $blk) {
        if (($blk['type'] ?? '') === 'text') $text .= $blk['text'];
    }
    if ($schema !== null) {
        $parsed = json_decode($text, true);
        if (!is_array($parsed)) return ['ok' => false, 'error' => 'AI returned an unreadable response.'];
        return ['ok' => true, 'data' => $parsed];
    }
    return ['ok' => true, 'data' => $text];
}
