<?php

declare(strict_types=1);

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

/**
 * Per-component registry for a theme. The typed contract behind the Pattern
 * Library, the component inserter and (later) the Inspector's "what did I
 * just click on" lookup.
 *
 * Source of truth = **colocated sidecar JSON**: a component's metadata lives
 * next to its template, mirroring WordPress `block.json`:
 *
 *   templates/components/button.twig
 *   templates/components/button.json   ← manifest for button
 *   templates/_header.twig
 *   templates/_header.json
 *
 * A `.json` under `templates/` is treated as a manifest only when a sibling
 * `.twig`/`.php` with the same stem exists. `id` defaults to the filename
 * stem (leading `_` stripped); the template is implicit (the sibling), so it
 * is never stored in the JSON. See {@see ThemeComponentManifest} for the
 * schema and normalization.
 *
 * Legacy fallback: a theme that still ships a central
 * `theme.components.json` keeps working — its entries surface for any id a
 * sidecar hasn't already claimed (sidecars win). Editing/deleting such an
 * entry migrates it to a sidecar (and prunes the central file), so the old
 * format quietly drains away.
 */
class ThemeComponentRegistry
{
    private ThemeComponentScanner $scanner;

    public function __construct(private string $themesDir)
    {
        $this->scanner = new ThemeComponentScanner();
    }

    /**
     * List components for a theme, normalized + deterministically ordered
     * (by category, then name).
     *
     * @return list<array<string, mixed>>
     */
    public function list(string $theme): array
    {
        $themeDir = $this->themesDir . '/' . $theme;
        $out      = [];
        $seen     = [];

        foreach ($this->scanner->sidecars($themeDir) as [$jsonPath, $tplRel, $stemId]) {
            $raw = json_decode((string)@file_get_contents($jsonPath), true);
            if (!is_array($raw)) continue;
            $norm = ThemeComponentManifest::normalize($raw, $stemId);
            if ($norm === null || isset($seen[$norm['id']])) continue;
            $seen[$norm['id']] = true;
            $norm['template']        = $tplRel;
            $norm['template_exists'] = true; // sibling existence is how we found it
            $norm['has_manifest']    = true;
            $out[] = $norm;
        }

        foreach ($this->readLegacy($theme) as $entry) {
            if (isset($seen[$entry['id']])) continue;
            $seen[$entry['id']] = true;
            $entry['has_manifest'] = true;
            $out[] = $entry;
        }

        // Bare component templates: any `templates/components/*.twig|php` with
        // no manifest is still a usable `<Tag/>`, so surface it as a component
        // (empty inputs, `has_manifest: false`) rather than hiding it.
        foreach ($this->scanner->bareComponents($themeDir) as [$tplRel, $stemId]) {
            $norm = ThemeComponentManifest::normalize([], $stemId);
            if ($norm === null || isset($seen[$norm['id']])) continue;
            $seen[$norm['id']] = true;
            $norm['template']        = $tplRel;
            $norm['template_exists'] = true;
            $norm['has_manifest']    = false;
            $out[] = $norm;
        }

        usort($out, static function (array $a, array $b): int {
            $ca = array_search($a['category'], ThemeComponentManifest::CATEGORIES, true);
            $cb = array_search($b['category'], ThemeComponentManifest::CATEGORIES, true);
            return $ca <=> $cb ?: strcasecmp($a['name'], $b['name']);
        });
        return $out;
    }

    /** Find a single component by id, or null if not registered. */
    public function find(string $theme, string $id): ?array
    {
        foreach ($this->list($theme) as $c) {
            if ($c['id'] === $id) return $c;
        }
        return null;
    }

    /**
     * Register a new component by writing its sidecar. Throws if the id is
     * taken, the template is missing, or a manifest already exists there.
     *
     * @param array<string, mixed> $patch
     * @return array<string, mixed>
     */
    public function add(string $theme, array $patch): array
    {
        $clean    = ThemeComponentManifest::forWrite($patch);
        $template = $this->validateTemplatePath($theme, (string)($patch['template'] ?? ''));

        // A bare component template (no manifest yet) is not a real
        // collision — writing this sidecar is exactly how you register it.
        // Only a manifest-backed entry with the same id blocks.
        $existing = $this->find($theme, $clean['id']);
        if ($existing !== null && ($existing['has_manifest'] ?? true)) {
            throw new \RuntimeException("A component with id `{$clean['id']}` already exists.");
        }
        $sidecar = $this->sidecarPath($theme, $template);
        if (is_file($sidecar)) {
            throw new \RuntimeException('A manifest already exists for that template.');
        }
        $this->writeSidecar($sidecar, $clean);
        return $this->find($theme, $clean['id']) ?? $clean;
    }

    /**
     * Update an existing component. The id may change (must stay unique). If
     * the template moves, the sidecar moves with it; a legacy central entry
     * is migrated to a sidecar and pruned.
     *
     * @param array<string, mixed> $patch
     * @return array<string, mixed>
     */
    public function update(string $theme, string $existingId, array $patch): array
    {
        $existing = $this->find($theme, $existingId);
        if ($existing === null) {
            throw new \RuntimeException("No component with id `{$existingId}` to update.");
        }

        $clean    = ThemeComponentManifest::forWrite($patch);
        $template  = $this->validateTemplatePath(
            $theme,
            (string)($patch['template'] ?? $existing['template']),
        );

        if ($clean['id'] !== $existingId && $this->find($theme, $clean['id']) !== null) {
            throw new \RuntimeException("Another component already uses id `{$clean['id']}`.");
        }

        $newSidecar = $this->sidecarPath($theme, $template);
        $oldSidecar = $this->sidecarPath($theme, (string)$existing['template']);
        if ($oldSidecar !== $newSidecar && is_file($oldSidecar)) {
            @unlink($oldSidecar);
        }
        $this->removeLegacy($theme, $existingId);
        $this->writeSidecar($newSidecar, $clean);
        return $this->find($theme, $clean['id']) ?? $clean;
    }

    public function delete(string $theme, string $id): bool
    {
        $comp = $this->find($theme, $id);
        if ($comp === null) return false;

        $removed = false;
        $sidecar = $this->sidecarPath($theme, (string)$comp['template']);
        if (is_file($sidecar)) {
            @unlink($sidecar);
            $removed = true;
        }
        if ($this->removeLegacy($theme, $id)) $removed = true;
        return $removed;
    }

    // ── Sidecar discovery + I/O ───────────────────────────────────────────

    /**
     * Walk `templates/` for `*.json` files that have a sibling template.
     *
     * @return list<array{0: string, 1: string, 2: string}>
     *         [absolute json path, template path relative to theme, stem id]
     */
    /** Resolve where a template's sidecar lives (sibling `<stem>.json`). */
    private function sidecarPath(string $theme, string $templateRel): string
    {
        $abs  = $this->themesDir . '/' . $theme . '/' . $templateRel;
        $dir  = dirname($abs);
        $stem = pathinfo($abs, PATHINFO_FILENAME);
        return $dir . '/' . $stem . '.json';
    }

    /** @param array<string, mixed> $manifest */
    private function writeSidecar(string $path, array $manifest): void
    {
        $json = json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false || !Fs::atomicWrite($path, (string)$json . "\n")) {
            throw new \RuntimeException('Could not write component manifest.');
        }
    }

    /**
     * A template path must be relative, inside the theme, no `..`, and point
     * at a real file. Returns the clean relative path.
     */
    private function validateTemplatePath(string $theme, string $template): string
    {
        $template = trim($template);
        if ($template === '' || str_contains($template, '..') || $template[0] === '/') {
            throw new \RuntimeException('Template path must be relative to the theme (e.g. `templates/_hero.twig`).');
        }
        if (!is_file($this->themesDir . '/' . $theme . '/' . $template)) {
            throw new \RuntimeException("Template file not found: {$template}");
        }
        return $template;
    }

    // ── Legacy central theme.components.json (read-only fallback + prune) ──

    private function centralFile(string $theme): string
    {
        return $this->themesDir . '/' . $theme . '/theme.components.json';
    }

    /**
     * Normalized entries from a legacy central registry. Each carries an
     * explicit `template`, validated the same way as a write path.
     *
     * @return list<array<string, mixed>>
     */
    private function readLegacy(string $theme): array
    {
        $themeDir = $this->themesDir . '/' . $theme;
        $out      = [];
        foreach ($this->readCentralRaw($theme) as $c) {
            if (!is_array($c)) continue;
            $norm = ThemeComponentManifest::normalize($c, (string)($c['id'] ?? ''));
            if ($norm === null) continue;

            $template = trim((string)($c['template'] ?? ''));
            if ($template === '' || str_contains($template, '..') || $template[0] === '/') continue;
            $norm['template']        = $template;
            $norm['template_exists'] = is_file($themeDir . '/' . $template);
            $out[] = $norm;
        }
        return $out;
    }

    /** @return list<mixed> raw component entries from the central file */
    private function readCentralRaw(string $theme): array
    {
        $file = $this->centralFile($theme);
        if (!is_file($file)) return [];
        $data = json_decode((string)@file_get_contents($file), true);
        if (!is_array($data) || !is_array($data['components'] ?? null)) return [];
        return array_values($data['components']);
    }

    /** Drop an id from the central file. Returns true if anything changed. */
    private function removeLegacy(string $theme, string $id): bool
    {
        $current = $this->readCentralRaw($theme);
        if ($current === []) return false;
        $next = array_values(array_filter(
            $current,
            fn ($c) => !is_array($c) || (string)($c['id'] ?? '') !== $id,
        ));
        if (count($next) === count($current)) return false;

        $file = $this->centralFile($theme);
        if ($next === []) {
            @unlink($file);
            return true;
        }
        $json = json_encode(['components' => $next], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false || !Fs::atomicWrite($file, (string)$json)) {
            throw new \RuntimeException('Could not update theme.components.json');
        }
        return true;
    }
}
