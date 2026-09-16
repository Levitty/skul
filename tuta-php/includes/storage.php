<?php
/**
 * Tuta School — File uploads via Supabase Storage.
 *
 * Uploads happen server-side using the service-role key. The user's browser
 * never talks to Supabase Storage directly. PHP validates the file (size,
 * real MIME type) and only then posts the bytes to Supabase.
 *
 * The "school-logos" bucket is created by migration 069 as a public bucket,
 * so the returned public URL is directly usable in <img src="...">.
 */

/**
 * Allowed image MIME types for logo uploads. SVG is intentionally excluded:
 * the bucket is PUBLIC, and an SVG can carry inline <script> that executes
 * when the file URL is opened directly (stored XSS on the storage origin).
 * Raster formats can't execute, and cover every real logo need.
 */
function allowedLogoMimeTypes(): array
{
    return ['image/png', 'image/jpeg', 'image/webp'];
}

/** Map a MIME type to a safe file extension. */
function extForMimeType(string $mime): string
{
    return [
        'image/png'     => 'png',
        'image/jpeg'    => 'jpg',
        'image/webp'    => 'webp',
    ][$mime] ?? 'bin';
}

/**
 * Raw upload to a Supabase Storage bucket using the service role key.
 * Returns ['ok' => bool, 'url' => ?string, 'error' => string].
 */
function uploadToSupabaseStorage(string $bucket, string $remotePath, string $localFile, string $contentType): array
{
    if (!defined('SUPABASE_URL') || !defined('SUPABASE_SERVICE_KEY') || SUPABASE_URL === '' || SUPABASE_SERVICE_KEY === '') {
        return ['ok' => false, 'url' => null, 'error' => 'storage is not configured'];
    }
    if (!is_readable($localFile)) {
        return ['ok' => false, 'url' => null, 'error' => 'the uploaded file is unreadable'];
    }

    $bytes = file_get_contents($localFile);
    if ($bytes === false) {
        return ['ok' => false, 'url' => null, 'error' => 'could not read the file'];
    }

    $base = rtrim(SUPABASE_URL, '/');
    $url  = $base . '/storage/v1/object/' . rawurlencode($bucket) . '/' . ltrim($remotePath, '/');

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS     => $bytes,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . SUPABASE_SERVICE_KEY,
            'Content-Type: ' . $contentType,
            'x-upsert: true',
        ],
        CURLOPT_TIMEOUT        => 30,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($code >= 200 && $code < 300) {
        // Public bucket — Supabase exposes the file at /object/public/...
        $publicUrl = $base . '/storage/v1/object/public/' . rawurlencode($bucket) . '/' . ltrim($remotePath, '/');
        // Cache-bust so the browser shows the new logo immediately.
        $publicUrl .= '?v=' . time();
        return ['ok' => true, 'url' => $publicUrl, 'error' => ''];
    }

    $detail = $err !== '' ? $err : substr((string)$resp, 0, 200);
    return ['ok' => false, 'url' => null, 'error' => 'storage upload failed (HTTP ' . $code . '): ' . $detail];
}

/**
 * Handle a school logo upload from a $_FILES entry.
 * Validates size (≤ 2 MB) and real MIME type (PNG / JPG / WEBP / SVG),
 * then uploads to the "school-logos" bucket under $schoolId/.
 *
 * Returns ['ok' => bool, 'url' => ?string, 'error' => string].
 */
function uploadSchoolLogo(string $schoolId, array $file): array
{
    if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'url' => null, 'error' => 'no file was uploaded'];
    }
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0) {
        return ['ok' => false, 'url' => null, 'error' => 'the file is empty'];
    }
    if ($size > 2 * 1024 * 1024) {
        return ['ok' => false, 'url' => null, 'error' => 'the logo must be 2 MB or smaller'];
    }

    // Trust file content for the type, not the client-supplied mime.
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = $finfo->file($file['tmp_name']);
    if ($mime === false) {
        return ['ok' => false, 'url' => null, 'error' => 'could not detect the file type'];
    }
    if (!in_array($mime, allowedLogoMimeTypes(), true)) {
        return ['ok' => false, 'url' => null, 'error' => 'unsupported image type — use PNG, JPG, WEBP, or SVG'];
    }

    $ext = extForMimeType($mime);
    // Per-school path; timestamp keeps each upload unique so browsers fetch fresh bytes.
    $remotePath = $schoolId . '/logo-' . time() . '.' . $ext;

    return uploadToSupabaseStorage('school-logos', $remotePath, $file['tmp_name'], $mime);
}

/**
 * Handle an admission rules document upload (PDF / Word) from a $_FILES entry.
 * Validates size (≤ 10 MB) and type, then uploads to the "admission-docs"
 * bucket under $schoolId/. Returns ['ok' => bool, 'url' => ?string, 'error' => string].
 *
 * Note: .docx is a zip and .doc is OLE storage, so finfo often reports them as
 * application/zip / application/octet-stream. We fall back to the file
 * extension in those cases and send the correct (bucket-allowed) Content-Type.
 */
function uploadAdmissionRulesDoc(string $schoolId, array $file): array
{
    if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'url' => null, 'error' => 'no file was uploaded'];
    }
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0) {
        return ['ok' => false, 'url' => null, 'error' => 'the file is empty'];
    }
    if ($size > 10 * 1024 * 1024) {
        return ['ok' => false, 'url' => null, 'error' => 'the document must be 10 MB or smaller'];
    }

    $extToMime = [
        'pdf'  => 'application/pdf',
        'doc'  => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    $finfo    = new finfo(FILEINFO_MIME_TYPE);
    $detected = $finfo->file($file['tmp_name']);
    $clientExt = strtolower(pathinfo($file['name'] ?? '', PATHINFO_EXTENSION));

    if ($detected === 'application/pdf') {
        $ext = 'pdf';
    } elseif ($detected === 'application/msword') {
        $ext = 'doc';
    } elseif ($detected === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        $ext = 'docx';
    } elseif (in_array($clientExt, ['pdf', 'doc', 'docx'], true)
              && ($detected === false || in_array($detected, ['application/zip', 'application/octet-stream', 'application/x-ole-storage'], true))) {
        // docx-as-zip / doc-as-ole — trust the extension.
        $ext = $clientExt;
    } else {
        return ['ok' => false, 'url' => null, 'error' => 'unsupported file — upload a PDF or Word document'];
    }

    $contentType = $extToMime[$ext];
    $remotePath  = $schoolId . '/admission-rules-' . time() . '.' . $ext;
    return uploadToSupabaseStorage('admission-docs', $remotePath, $file['tmp_name'], $contentType);
}

/**
 * Teacher document upload (homework worksheets, etc.) — PDF / Word, ≤ 10 MB,
 * into the public "teacher-docs" bucket under $schoolId/$prefix-<time>.ext.
 * Same validation as the admission-rules uploader.
 */
function uploadTeacherDoc(string $schoolId, array $file, string $prefix = 'hw'): array
{
    if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'url' => null, 'error' => 'no file was uploaded'];
    }
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0)               return ['ok' => false, 'url' => null, 'error' => 'the file is empty'];
    if ($size > 10 * 1024 * 1024) return ['ok' => false, 'url' => null, 'error' => 'the file must be 10 MB or smaller'];

    $extToMime = [
        'pdf'  => 'application/pdf',
        'doc'  => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    $finfo     = new finfo(FILEINFO_MIME_TYPE);
    $detected  = $finfo->file($file['tmp_name']);
    $clientExt = strtolower(pathinfo($file['name'] ?? '', PATHINFO_EXTENSION));

    if ($detected === 'application/pdf')                                                                  $ext = 'pdf';
    elseif ($detected === 'application/msword')                                                           $ext = 'doc';
    elseif ($detected === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')      $ext = 'docx';
    elseif (in_array($clientExt, ['pdf', 'doc', 'docx'], true)
            && ($detected === false || in_array($detected, ['application/zip', 'application/octet-stream', 'application/x-ole-storage'], true))) {
        $ext = $clientExt;
    } else {
        return ['ok' => false, 'url' => null, 'error' => 'unsupported file — upload a PDF or Word document'];
    }

    $remotePath = $schoolId . '/' . $prefix . '-' . time() . '-' . bin2hex(random_bytes(3)) . '.' . $ext;
    return uploadToSupabaseStorage('teacher-docs', $remotePath, $file['tmp_name'], $extToMime[$ext]);
}
