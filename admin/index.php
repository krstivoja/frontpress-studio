<?php

declare(strict_types=1);

define('FRONTPRESS_BOOT', true);

$appRoot = dirname(__DIR__);
$cmsRoot = $appRoot . '/cms';
require_once $cmsRoot . '/vendor/autoload.php';
require_once $cmsRoot . '/lib/template_helpers.php';

spl_autoload_register(function ($class) use ($cmsRoot) {
    if (str_starts_with($class, 'MD\\')) {
        $path = $cmsRoot . '/lib/' . str_replace('\\', '/', substr($class, 3)) . '.php';
        if (is_file($path)) {
            require $path;
        }
    }
});

FrontPress\Env::load($appRoot . '/config.php');

// First-run only: copy starter content / config / theme into /site if it's
// empty. /site is gitignored — the defaults a user sees on a fresh install
// live under cms/starters/ and are seeded here. Idempotent on subsequent
// requests (a few stat() calls when nothing's missing).
FrontPress\Bootstrap::ensureSiteDefaults($appRoot);

session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// Idle-timeout: log the user out if there's been no admin activity for
// `session_idle_seconds` (default: 2 hours). Refreshed on every request below.
$idleLimit = (int)(FrontPress\Env::get('SESSION_IDLE_SECONDS', '7200'));
if (!empty($_SESSION['admin_user']) && $idleLimit > 0) {
    $last = (int)($_SESSION['last_activity'] ?? 0);
    if ($last > 0 && (time() - $last) > $idleLimit) {
        $_SESSION = [];
        session_destroy();
        session_start();
    }
}
$_SESSION['last_activity'] = time();

// Baseline security headers for every admin response (HTML and JSON alike).
// HSTS is intentionally omitted here — set it at the web-server level once
// HTTPS is confirmed for the host so we don't lock users out of plain-HTTP
// dev environments by accident.
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

$ADMIN_USER      = FrontPress\Env::get('ADMIN_USER', 'fpsadmin');
$ADMIN_PASS_HASH = FrontPress\Env::get('ADMIN_PASS_HASH', '');

// First-run convenience: if the operator drops a plaintext FPS_ADMIN_PASS
// (or legacy MD_ADMIN_PASS) line into config.php instead of the shipped
// pre-hashed default, hash it now and rewrite config.php so subsequent
// requests see only the hash. Plaintext is removed from disk in a single
// atomic write.
if ($ADMIN_PASS_HASH === '') {
    $plain = (string)FrontPress\Env::get('ADMIN_PASS', '');
    if ($plain !== '') {
        $ADMIN_PASS_HASH = password_hash($plain, PASSWORD_BCRYPT);
        if (!FrontPress\Env::upgradePlaintextPassword($appRoot . '/config.php', $ADMIN_PASS_HASH)) {
            // Couldn't write — the in-memory hash still works for this
            // request, but next request will re-hash the same plaintext.
            // Surface in the error log so a permissions issue is visible.
            error_log('admin: failed to rewrite config.php with hashed password — check file permissions');
        }
    }
}

$CONTENT_DIR     = $appRoot . '/site/content';
$UPLOADS_DIR     = $appRoot . '/site/uploads';
$TEMPLATE_DIR    = $cmsRoot . '/templates';
$CACHE_DIR       = $appRoot . '/site/cache';
$config          = new FrontPress\Config($appRoot . '/site/config.json');

// ── Helpers (used by API controllers via the global namespace) ───────────────

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function passwordCheck(string $input, string $hash): bool
{
    if ($hash === '') {
        return false;
    }
    return password_verify($input, $hash);
}

/** @param array<string, mixed> $data */
function json_response(array $data, int $code = 200): never
{
    http_response_code($code);
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    echo json_encode($data);
    exit;
}

// ── Setup gate: refuse if no credentials are configured ──────────────────────

if ($ADMIN_PASS_HASH === '') {
    http_response_code(503);
    $configFile = $appRoot . '/config.php';
    require $TEMPLATE_DIR . '/setup-required.php';
    exit;
}

// ── Routing ──────────────────────────────────────────────────────────────────

$uri    = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// JSON API
if (preg_match('#^/admin/api/(.*)$#', $uri, $apiMatch)) {
    FrontPress\Api\Router::dispatch($apiMatch[1], $method, [
        'appRoot'         => $appRoot,
        'cmsRoot'         => $cmsRoot,
        'contentDir'      => $CONTENT_DIR,
        'uploadsDir'      => $UPLOADS_DIR,
        'cacheDir'        => $CACHE_DIR,
        'themesDir'       => $appRoot . '/site/themes',
        'config'          => $config,
        'ADMIN_USER'      => $ADMIN_USER,
        'ADMIN_PASS_HASH' => $ADMIN_PASS_HASH,
        'ENV_FILE'        => $appRoot . '/config.php',
    ]);
    exit;
}

// Anything else under /admin/* renders the React SPA shell. React handles
// auth gating internally by calling /admin/api/me at boot.
require $TEMPLATE_DIR . '/spa.php';
