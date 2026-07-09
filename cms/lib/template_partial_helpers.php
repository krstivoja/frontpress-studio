<?php

defined('FRONTPRESS_BOOT') || exit;

if (!function_exists('partial')) {
    /**
     * Render a partial from the active theme.
     *
     * @param array<string, mixed> $vars
     */
    function partial(string $name, array $vars = []): void
    {
        if (!preg_match('#^[a-z0-9][a-z0-9_/-]*$#i', $name) || str_contains($name, '..')) {
            throw new RuntimeException("Invalid partial name: $name");
        }
        $dir = $GLOBALS['fp_template_dir'];
        $candidates = [
            ["components/{$name}.php",  'php'],
            ["components/{$name}.twig", 'twig'],
            ["components/{$name}.html", 'html'],
            ["_{$name}.php",            'php'],
            ["{$name}.php",             'php'],
            ["_{$name}.twig",           'twig'],
            ["{$name}.twig",            'twig'],
            ["_{$name}.html",           'html'],
            ["{$name}.html",            'html'],
        ];
        foreach ($candidates as [$rel, $kind]) {
            $path = "$dir/$rel";
            if (!is_file($path)) continue;
            $preview = !empty($GLOBALS['fp_template_preview']);
            if ($preview) {
                $tplPath = "templates/" . htmlspecialchars($rel, ENT_QUOTES);
                echo "<!--fp:src:{$tplPath}:start-->";
            }
            if ($kind === 'twig') {
                FrontPress\TemplateRenderer::instance()->render($rel, $vars);
            } elseif ($kind === 'html') {
                readfile($path);
            } else {
                $cacheDir  = ($GLOBALS['fp_cache_dir'] ?? sys_get_temp_dir()) . '/components';
                $cacheFile = $cacheDir . '/' . md5($path) . '.php';
                if (!is_file($cacheFile) || filemtime($path) > filemtime($cacheFile)) {
                    @mkdir($cacheDir, 0755, true);
                    file_put_contents($cacheFile, \FrontPress\ComponentTagProcessor::processPhp(file_get_contents($path)));
                }
                extract($vars, EXTR_SKIP);
                extract(['config' => $GLOBALS['fp_config'] ?? null, 'query' => $_GET], EXTR_SKIP);
                require $cacheFile;
            }
            if ($preview) {
                $tplPath = "templates/" . htmlspecialchars($rel, ENT_QUOTES);
                echo "<!--fp:src:{$tplPath}:end-->";
            }
            return;
        }
        throw new RuntimeException("Partial not found: $name");
    }
}

if (!function_exists('component')) {
    /** @param array<string, mixed> $vars */
    function component(string $name, array $vars = []): void
    {
        try {
            partial($name, $vars);
        } catch (RuntimeException $e) {
            if ($e->getMessage() !== "Partial not found: $name") throw $e;
            fp_render_missing_component($name);
        }
    }
}

if (!function_exists('fp_render_missing_component')) {
    function fp_render_missing_component(string $name): void
    {
        if (!fp_show_template_warnings()) return;
        $label = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $style = 'display:inline-block;border:1px dashed #dc2626;border-radius:4px;'
               . 'padding:2px 6px;background:#fef2f2;color:#991b1b;'
               . 'font:12px/1.4 system-ui,sans-serif;';
        echo '<span class="fp-missing-component" style="' . $style . '">'
           . 'Missing component: ' . $label . '</span>';
    }
}

if (!function_exists('fp_show_template_warnings')) {
    function fp_show_template_warnings(): bool
    {
        if (!empty($GLOBALS['fp_template_preview'])) return true;
        if (!class_exists('FrontPress\\Env')) return false;
        return FrontPress\Env::get('APP_ENV', 'prod') === 'dev'
            || FrontPress\Env::get('APP_DEBUG', '') === '1';
    }
}
