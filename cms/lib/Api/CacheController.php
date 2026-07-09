<?php

declare(strict_types=1);

namespace FrontPress\Api;

defined('FRONTPRESS_BOOT') || exit;

use FrontPress\CacheService;
use FrontPress\Content;
use FrontPress\PathResolver;
use FrontPress\ScssCompiler;
use FrontPress\ThemeService;

/**
 * Cache management for the admin UI. Lets the user wipe rendered HTML, the
 * content index, and the compiled Twig cache without shelling into the server.
 *
 * Endpoints (all require auth + CSRF):
 *   - POST /admin/api/cache/clear   — drop every cached artefact
 *   - POST /admin/api/cache/rebuild — clear, then warm the index + HTML cache
 *
 * The rebuild path is convenient after a theme switch or a bulk content edit;
 * a plain clear is enough when the user just wants the next request to render
 * fresh.
 */
class CacheController
{
    /**
     * @param string[] $pathParts
     * @param array<string, mixed> $config
     */
    public static function handle(array $pathParts, string $method, array $config): void
    {
        Router::requireAuth();
        Router::requireCsrf();

        if ($method !== 'POST') {
            \json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
        }

        $action = $pathParts[0] ?? '';
        $cache  = self::cache($config);

        if ($action === 'clear') {
            $cache->clearAllHtml();
            $cache->clearIndex();
            $cache->clearTwig();
            \json_response(['ok' => true]);
        }

        if ($action === 'rebuild') {
            // `?warm=1` opts into the synchronous re-parse of every page;
            // without it we just rebuild the index and let the HTML cache
            // refill lazily as pages are visited.
            $warm   = (string)($_GET['warm'] ?? '') === '1';
            $result = $cache->rebuild($warm);
            \json_response($result);
        }

        if ($action === 'rebuild-assets') {
            // Force-recompile the active theme's SCSS bundle, ignoring
            // mtime — useful after editing a partial that the watcher
            // didn't pick up, or after switching theme without restarting.
            $themes   = new ThemeService($config['appRoot'], $config['config']);
            $themeDir = $config['themesDir'] . '/' . $themes->active();
            $result   = (new ScssCompiler())->compileTheme($themeDir);
            \json_response(['ok' => true] + $result);
        }

        \json_response(['ok' => false, 'error' => 'Unknown cache action'], 404);
    }

    /**
     * Polling endpoint for the front-end live-CSS-reload script that
     * `admin_edit_button()` injects for logged-in admins. Recompiles the
     * active theme's SCSS (mtime-driven — a no-op when nothing changed) so
     * both disk edits and admin saves get picked up, then returns the
     * newest asset mtime as an opaque version token. The browser swaps its
     * stylesheet <link> hrefs whenever the token changes.
     *
     * Auth-only, no CSRF: it's an idempotent read gated on the admin
     * session (a visitor can't reach it), and the public page that polls
     * it carries no CSRF token to send.
     *
     * @param array<string, mixed> $config
     */
    public static function cssState(array $config): void
    {
        Router::requireAuth();

        $themes   = new ThemeService($config['appRoot'], $config['config']);
        $themeDir = $config['themesDir'] . '/' . $themes->active();
        $compiler = new ScssCompiler();
        $result   = $compiler->compileTheme($themeDir);

        \json_response([
            'ok'       => true,
            'v'        => $compiler->assetsMtime($themeDir),
            'compiled' => $result['compiled'],
            'errors'   => $result['errors'],
        ]);
    }

    /** @param array<string, mixed> $config */
    private static function cache(array $config): CacheService
    {
        return ServiceFactory::cache($config);
    }
}
