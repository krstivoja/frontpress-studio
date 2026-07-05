<?php
/**
 * Router for `php -S`.
 *
 * The built-in PHP dev server doesn't read .htaccess, so this file mirrors
 * the rewrite rules: real files are served as-is, /admin/* dispatches to
 * admin.php, everything else to index.php.
 *
 * Usage: php -S 127.0.0.1:8080 router.php
 *
 * Production deployments use Apache + .htaccess (or an equivalent rewrite
 * config) and ignore this file.
 */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';

// Serve real files ONLY from public asset roots. Everything else falls
// through to the front controllers: index.php handles /uploads/* (image-only
// serve) and 404s anything sensitive. Without this allow-list the built-in
// server would hand out config.json, markdown sources, cms/*, dotfiles, etc.
// as raw files — the .htaccess deployment never does that.
if ($uri !== '/'
    && preg_match('#^/(admin/assets/|assets/|site/themes/[^/]+/assets/)#', $uri)
    && file_exists(__DIR__ . $uri)
    && !is_dir(__DIR__ . $uri)
) {
    return false;
}

// FrontPress Local auto-login bridge. Dropped at the webroot by the desktop
// app (gitignored, not part of Studio); it's a self-guarding one-shot login
// entrypoint, so let the built-in server execute it directly when present.
if ($uri === '/fp-local-login.php' && is_file(__DIR__ . '/fp-local-login.php')) {
    return false;
}

// /admin and /admin/* → admin SPA shell
if (preg_match('#^/admin(/|$)#', $uri)) {
    require __DIR__ . '/admin/index.php';
    return;
}

// Everything else → public front controller
require __DIR__ . '/index.php';
