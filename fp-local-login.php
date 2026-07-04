<?php
/**
 * FrontPress Local — one-shot auto-login bridge.
 *
 * Added by the FrontPress Local desktop app (NOT part of FrontPress Studio).
 * The app writes a single-use token to site/.fp-local-login, then opens this
 * URL with ?token=<token>. We validate the token, establish an authenticated
 * admin session on this exact origin (localhost:<port>) so the browser keeps
 * the cookie, and redirect into the admin SPA.
 *
 * Safe by construction: the token is random, single-use (deleted on first
 * hit), and only ever reachable on the local loopback server the app starts.
 */

declare(strict_types=1);

$appRoot   = __DIR__;
$tokenFile = $appRoot . '/site/.fp-local-login';

$want = isset($_GET['token']) ? (string) $_GET['token'] : '';
$have = is_file($tokenFile) ? trim((string) file_get_contents($tokenFile)) : '';

// Consume the token regardless of outcome — strictly one-shot.
if (is_file($tokenFile)) {
    @unlink($tokenFile);
}

if ($want === '' || $have === '' || !hash_equals($have, $want)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Invalid or expired login token.";
    exit;
}

// Read the configured admin username without booting the whole framework.
// config.php is guarded by FRONTPRESS_BOOT; if it doesn't exist yet the site
// runs on sample.config.php's shipped defaults, so fall back to that.
define('FRONTPRESS_BOOT', true);
if (is_file($appRoot . '/config.php')) {
    require $appRoot . '/config.php';
} elseif (is_file($appRoot . '/sample.config.php')) {
    require $appRoot . '/sample.config.php';
}
$user = defined('FPS_ADMIN_USER') ? (string) FPS_ADMIN_USER : 'fpsadmin';

// Mirror the cookie params the admin entry point uses so the browser keeps
// sending PHPSESSID to /admin on the same origin.
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => false,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
session_regenerate_id(true);

// The admin app (admin/index.php + AuthController) authenticates on the
// presence of $_SESSION['admin_user']. Set it and the activity timestamp.
$_SESSION['admin_user']    = $user;
$_SESSION['last_activity'] = time();

header('Location: /admin/');
echo "Signing in…";
