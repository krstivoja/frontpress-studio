<?php

declare(strict_types=1);

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

use ScssPhp\ScssPhp\Compiler;
use ScssPhp\ScssPhp\OutputStyle;

/**
 * Compiles a theme's SCSS into CSS, supporting two layout conventions:
 *
 *   1. **Flat** — `assets/style.scss` → `assets/style.css` (sibling).
 *      Easiest: drop `.scss` files straight into `assets/` and they compile
 *      to a `.css` next to them.
 *   2. **Nested** — `assets/scss/style.scss` → `assets/css/style.css`.
 *      Useful for larger themes where you want SCSS sources visually
 *      separated from compiled output.
 *
 * Either layout works in the same theme; both are scanned. Files whose
 * basename starts with `_` are treated as partials (imported by entries via
 * `@use` / `@import`) and produce no output. The whole `assets/` tree is
 * added to scssphp's import paths so partials resolve regardless of depth.
 *
 * Recompilation is mtime-driven — if the newest mtime anywhere under
 * `assets/` is older than the entry's `.css`, the entry is skipped. The
 * output dir is created if missing; nothing is ever deleted.
 *
 * Failures are logged with the entry-file label so admins can spot
 * malformed SCSS without crashing the request.
 */
class ScssCompiler
{
    private OutputStyle $style;

    public function __construct(?OutputStyle $style = null)
    {
        $this->style = $style ?? OutputStyle::COMPRESSED;
    }

    /**
     * Compile every entry SCSS in $themeDir/assets/scss/ that is newer than
     * its compiled output. Returns names of files that were (re)written.
     *
     * @return array{compiled: string[], errors: array<string, string>}
     */
    public function compileTheme(string $themeDir): array
    {
        $assetsDir = $themeDir . '/assets';
        if (!is_dir($assetsDir)) {
            return ['compiled' => [], 'errors' => []];
        }

        // Two layout conventions, both supported:
        //   - flat:   assets/style.scss        -> assets/style.css       (sibling)
        //   - nested: assets/scss/style.scss   -> assets/css/style.css   (separated)
        // Pair each entry with the dir it should write its compiled CSS into.
        $entries = [];
        foreach (glob($assetsDir . '/*.scss') ?: [] as $f) {
            if (str_starts_with(basename($f), '_')) continue;
            $entries[] = ['src' => $f, 'outDir' => $assetsDir];
        }
        $scssDir = $assetsDir . '/scss';
        if (is_dir($scssDir)) {
            $cssDir = $assetsDir . '/css';
            foreach (glob($scssDir . '/*.scss') ?: [] as $f) {
                if (str_starts_with(basename($f), '_')) continue;
                $entries[] = ['src' => $f, 'outDir' => $cssDir];
            }
        }

        if (!$entries) {
            return ['compiled' => [], 'errors' => []];
        }

        // Newest source mtime anywhere under assets/ — covers partials
        // imported across folders. Cheap: the tree is small per theme.
        $newestSource = $this->newestMtime($assetsDir);

        $compiler = new Compiler();
        $compiler->setOutputStyle($this->style);
        $compiler->setImportPaths([$assetsDir, $scssDir]);

        $compiled = [];
        $errors   = [];

        foreach ($entries as $entry) {
            $src    = $entry['src'];
            $outDir = $entry['outDir'];
            $name   = basename($src);
            $stem   = substr($name, 0, -5); // strip .scss
            $target = $outDir . '/' . $stem . '.css';

            if (!is_dir($outDir)) {
                mkdir($outDir, 0755, true);
            }

            $current = is_file($target) ? filemtime($target) : 0;
            if ($current >= $newestSource) {
                continue;
            }

            try {
                $css = $compiler->compileString(
                    (string)file_get_contents($src),
                    $src
                )->getCss();
                Fs::atomicWrite($target, $css);
                $compiled[] = $stem . '.css';
            } catch (\Throwable $e) {
                error_log("MD\\ScssCompiler: failed compiling {$src}: " . $e->getMessage());
                $errors[$name] = $e->getMessage();
            }
        }

        return ['compiled' => $compiled, 'errors' => $errors];
    }

    /**
     * Newest mtime anywhere under the theme's `assets/` tree. Used as an
     * opaque cache-bust token by the logged-in live-CSS-reload poller —
     * it bumps whenever any source or compiled asset changes, whether the
     * edit came from disk or an admin save. Returns 0 when there are no
     * assets.
     */
    public function assetsMtime(string $themeDir): int
    {
        $assetsDir = $themeDir . '/assets';
        return is_dir($assetsDir) ? $this->newestMtime($assetsDir) : 0;
    }

    /** Greatest mtime under $dir, recursively. Returns 0 if empty. */
    private function newestMtime(string $dir): int
    {
        $newest = 0;
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $file) {
            if ($file->isFile()) {
                $newest = max($newest, $file->getMTime());
            }
        }
        return $newest;
    }
}
