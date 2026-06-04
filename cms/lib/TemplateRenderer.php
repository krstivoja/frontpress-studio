<?php

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

use Twig\Environment;
use Twig\Loader\FilesystemLoader;
use Twig\TwigFunction;
use FrontPress\Twig\PreviewMarkerNodeVisitor;

/**
 * Twig wrapper for the theme layer. Singleton that lazily binds to the active
 * theme's `templates/` directory and registers the global PHP helpers as Twig
 * functions of the same name.
 *
 * Resolution rule lives in `bootstrap.php::render()`: PHP wins if both files
 * exist; this renderer is only invoked when the active theme ships a `.twig`
 * file with no PHP sibling.
 */
final class TemplateRenderer
{
    private static ?self $instance = null;
    private Environment $twig;

    private function __construct(string $templateDir, string $cacheDir)
    {
        $loader = new FilesystemLoader($templateDir);
        $this->twig = new Environment($loader, [
            'cache'       => $cacheDir,
            'auto_reload' => true,
            'autoescape'  => 'html',
            'strict_variables' => false,
        ]);

        // Instrument `{% include %}` so themes composed with native Twig
        // includes (not just the partial() helper) become inspectable in the
        // Theme Builder preview. Markers are emitted only in preview mode at
        // runtime, so public output is unchanged.
        $this->twig->addNodeVisitor(new PreviewMarkerNodeVisitor());

        // Expose config as a plain array — Twig's `config.site.name` resolves
        // through array access, not the FrontPress\Config class's get()/all() methods.
        $cfg = $GLOBALS['fp_config'] ?? null;
        $this->twig->addGlobal('config', $cfg && method_exists($cfg, 'all') ? $cfg->all() : []);

        // Query-string globals so themes can render "?sent=1" success banners
        // without a JS round-trip. `query` mirrors `$_GET` as a plain array.
        $this->twig->addGlobal('query', $_GET);

        // Register helpers — names match the global PHP functions so a theme
        // author writes `{{ e(x) }}` / `{{ slug_url(cat) }}` exactly as in PHP.
        $isSafe = ['is_safe' => ['html']];
        foreach (['e', 'asset_url', 'slug_url'] as $fn) {
            $this->twig->addFunction(new TwigFunction($fn, $fn));
        }
        $this->twig->addFunction(new TwigFunction('paginate', 'paginate', $isSafe));
        $this->twig->addFunction(new TwigFunction('inspect', 'inspect', $isSafe));
        $this->twig->addFunction(new TwigFunction('seo_head', 'seo_head', $isSafe));
        $this->twig->addFunction(new TwigFunction('contact_form', 'contact_form', $isSafe));
        $this->twig->addFunction(new TwigFunction('partial', function (string $name, array $vars = []): string {
            ob_start();
            partial($name, $vars);
            return (string)ob_get_clean();
        }, $isSafe));
    }

    public static function instance(): self
    {
        if (self::$instance === null) {
            $templateDir = $GLOBALS['fp_template_dir'];
            $cacheDir    = ($GLOBALS['fp_cache_dir'] ?? dirname($templateDir, 3) . '/cache') . '/twig';
            self::$instance = new self($templateDir, $cacheDir);
        }
        return self::$instance;
    }

    /** @param array<string, mixed> $vars */
    public function render(string $template, array $vars = []): void
    {
        echo $this->twig->render($template, $vars);
    }
}
