<?php
/**
 * Router for PHP's built-in server — stands in for .htaccess locally.
 *   php -S localhost:8080 -t tuta-php tuta-php/tools/dev-router.php
 * Real files (css, js, images) are served as is; everything else becomes
 * index.php?route=… exactly as the live rewrite rule does.
 */
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }
$path = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$file = __DIR__ . '/..' . $path;
if ($path !== '/' && is_file($file)) return false;            // static asset
$_GET['route'] = trim($path, '/');
$_SERVER['SCRIPT_NAME'] = '/index.php';
require __DIR__ . '/../index.php';
