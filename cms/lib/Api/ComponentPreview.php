<?php

declare(strict_types=1);

namespace FrontPress\Api;

defined('FRONTPRESS_BOOT') || exit;

use FrontPress\ThemeComponentRegistry;

/**
 * Renders a single registered theme component in isolation, with the
 * theme's CSS attached, so the Pattern Library can iframe each card.
 *
 * Why this is a browser-facing endpoint (not JSON): we need to return
 * actual HTML so an `<iframe src=…>` can load it. The renderer reuses
 * the same Twig environment the public site uses, so partials/extends
 * resolve identically.
 *
 * Sample data: comes from the registry's `sample` field. Merged into a
 * neutral baseline context (meta/page/posts stubs) so templates that
 * read `meta.title` or iterate `posts` get something rather than an
 * empty-variable error.
 *
 * Security: admin-gated. Path-traversal already blocked by the registry
 * (id slug + relative template guard) and by Twig's loader sandboxing
 * to the theme directory.
 */
class ComponentPreview
{
    /** @param array<string, mixed> $config */
    public static function handle(array $config): void
    {
        if (empty($_SESSION['admin_user'])) {
            http_response_code(401);
            echo 'Unauthorized';
            exit;
        }

        $theme = (string)($_GET['theme'] ?? '');
        $id    = (string)($_GET['id']    ?? '');
        if ($theme === '' || $id === '') {
            http_response_code(400);
            echo 'Missing theme or id';
            exit;
        }

        $registry = new ThemeComponentRegistry((string)$config['themesDir']);
        $comp     = $registry->find($theme, $id);
        if ($comp === null || !$comp['template_exists']) {
            http_response_code(404);
            echo 'Component not registered';
            exit;
        }

        // Resolve the theme dir + activate the renderer against it.
        // Reuses the same singleton path as the public site, so partials
        // (`{% include '_header.twig' %}`) and extends resolve normally.
        $themeDir = (string)$config['themesDir'] . '/' . $theme;
        $GLOBALS['fp_template_dir'] = $themeDir . '/templates';
        $GLOBALS['fp_cache_dir']    = (string)$config['cacheDir'];
        // bootstrap.php sets this globally for public requests; admin
        // doesn't, but templates routinely read `config.site.name` etc.
        $GLOBALS['fp_config']       = $config['config'];

        $renderer = \FrontPress\TemplateRenderer::instance();

        // Neutral baseline context — themes commonly read these globals.
        // The manifest's first example (falling back to a legacy `sample`)
        // overrides whatever the registry declares.
        $baseline = [
            'meta'  => ['title' => $comp['name'], 'date' => date('Y-m-d')],
            'html'  => '<p>Sample body content.</p>',
            'posts' => [],
            'pagination' => ['current' => 1, 'total' => 1, 'prev_url' => null, 'next_url' => null],
        ];
        $props = $comp['examples'][0]['props'] ?? ($comp['sample'] ?? []);
        $vars  = array_replace_recursive($baseline, is_array($props) ? $props : []);

        // Strip the `templates/` prefix — Twig loader is rooted there.
        $tpl = preg_replace('#^templates/#', '', $comp['template']);

        try {
            ob_start();
            $renderer->render((string)$tpl, $vars);
            $body = (string)ob_get_clean();
        } catch (\Throwable $e) {
            ob_end_clean();
            http_response_code(500);
            header('Content-Type: text/html; charset=utf-8');
            echo self::errorShell($comp['name'], (string)$e->getMessage());
            exit;
        }

        header('Content-Type: text/html; charset=utf-8');
        // Don't let iframes get embedded outside the admin.
        header('X-Frame-Options: SAMEORIGIN');
        echo self::wrap($body, $themeDir, $comp['name']);
        exit;
    }

    /**
     * If the template rendered a full HTML document (extends _layout),
     * return it as-is. Otherwise wrap the fragment with a minimal scaffold
     * that links the theme's CSS so styles still apply.
     */
    private static function wrap(string $body, string $themeDir, string $title): string
    {
        if (stripos($body, '<html') !== false) return $body;

        // The active theme's assets are symlinked into the webroot at
        // `/assets/`, the same path `asset_url()` uses in real templates.
        // List every .css in the theme's assets dir and link by basename.
        // Note: this only works for the active theme; previewing a
        // non-active theme would need per-theme asset routing.
        $cssLinks = '';
        $assetsDir = $themeDir . '/assets';
        if (is_dir($assetsDir)) {
            foreach (glob($assetsDir . '/*.css') ?: [] as $css) {
                $href = '/assets/' . basename($css);
                $cssLinks .= '<link rel="stylesheet" href="' . htmlspecialchars($href, ENT_QUOTES) . '">';
            }
        }

        $titleEsc = htmlspecialchars($title, ENT_QUOTES);
        return <<<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{$titleEsc} — preview</title>
{$cssLinks}
<style>html,body{margin:0;padding:0}body{padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}</style>
</head>
<body>
{$body}
</body>
</html>
HTML;
    }

    private static function errorShell(string $title, string $message): string
    {
        $titleEsc = htmlspecialchars($title, ENT_QUOTES);
        $msgEsc   = htmlspecialchars($message, ENT_QUOTES);
        return <<<HTML
<!doctype html>
<html><head><title>{$titleEsc} — error</title></head>
<body style="font:13px/1.5 -apple-system,sans-serif;color:#7f1d1d;background:#fef2f2;padding:16px;margin:0">
<strong>Render failed</strong><br><br><code style="white-space:pre-wrap">{$msgEsc}</code>
</body></html>
HTML;
    }
}
