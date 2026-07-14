<?php

declare(strict_types=1);

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

/**
 * Filesystem scanning for {@see ThemeComponentRegistry}. Split out so the
 * registry stays under the file-size budget and the "what's on disk" logic
 * lives in one place.
 *
 * Two passes:
 *   - {@see sidecars()} finds `<stem>.json` manifests anywhere under
 *     `templates/` that have a sibling `<stem>.twig|php`.
 *   - {@see bareComponents()} finds `templates/components/*.twig|php` files —
 *     the component *is* the template, so these are usable via `<Tag/>`
 *     whether or not anyone wrote a manifest for them.
 */
class ThemeComponentScanner
{
    /**
     * @return list<array{0: string, 1: string, 2: string}>  [jsonPath, tplRel, stemId]
     */
    public function sidecars(string $themeDir): array
    {
        $tplDir = $themeDir . '/templates';
        if (!is_dir($tplDir)) return [];

        $out = [];
        foreach ($this->walk($tplDir) as $file) {
            if (strtolower($file->getExtension()) !== 'json') continue;
            $dir  = $file->getPath();
            $stem = $file->getBasename('.json');
            $tpl  = $this->siblingTemplate($dir, $stem);
            if ($tpl === null) continue;
            $out[] = [$file->getPathname(), $this->rel($themeDir, $tpl), ltrim($stem, '_')];
        }
        return $out;
    }

    /**
     * Every component template under `templates/components/`, sidecar or not.
     *
     * @return list<array{0: string, 1: string}>  [tplRel, stemId]
     */
    public function bareComponents(string $themeDir): array
    {
        $dir = $themeDir . '/templates/components';
        if (!is_dir($dir)) return [];

        $out = [];
        foreach ($this->walk($dir) as $file) {
            $ext = strtolower($file->getExtension());
            if ($ext !== 'twig' && $ext !== 'php') continue;
            $stem = $file->getBasename('.' . $ext);
            $out[] = [$this->rel($themeDir, $file->getPathname()), ltrim($stem, '_')];
        }
        return $out;
    }

    /** @return iterable<\SplFileInfo> */
    private function walk(string $dir): iterable
    {
        $iter = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
        );
        foreach ($iter as $file) {
            if ($file->isFile()) yield $file;
        }
    }

    private function siblingTemplate(string $dir, string $stem): ?string
    {
        foreach (['twig', 'php'] as $ext) {
            $tpl = $dir . '/' . $stem . '.' . $ext;
            if (is_file($tpl)) return $tpl;
        }
        return null;
    }

    private function rel(string $themeDir, string $absPath): string
    {
        return ltrim(str_replace($themeDir, '', $absPath), '/');
    }
}
