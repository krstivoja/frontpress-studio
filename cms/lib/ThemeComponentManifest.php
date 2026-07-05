<?php

declare(strict_types=1);

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

/**
 * Pure normalize + validate for a single component sidecar manifest
 * (`button.json` next to `button.twig`). No filesystem access — the
 * registry owns I/O, path resolution and `template_exists`.
 *
 * The manifest is the typed contract the inserter (Phase 2) and inspector
 * (Phase 4) build on. Same mental model as WordPress `block.json`: code
 * owns the component, metadata declares its editable props, defaults,
 * slots and example data.
 *
 * Canonical shape (all fields optional except a valid id):
 *   {
 *     "id":          "hero",          // defaults to the filename stem
 *     "tag":         "Hero",          // JSX tag; defaults to PascalCase(id)
 *     "name":        "Hero",          // display label; defaults to id
 *     "description": "Full-width hero band.",
 *     "category":    "layout",
 *     "inputs": [
 *       { "name": "title", "type": "text", "default": "Headline", "bindable": true },
 *       { "name": "variant", "type": "enum", "options": ["centered", "split"] }
 *     ],
 *     "slots":    [ { "name": "actions", "allowed": ["button"], "default": [] } ],
 *     "examples": [ { "name": "Landing", "props": { "title": "Build faster" } } ]
 *   }
 */
final class ThemeComponentManifest
{
    /** Prop types the inserter + inspector understand. */
    public const PROP_TYPES = [
        'text', 'richtext', 'number', 'boolean', 'enum',
        'media', 'link', 'color', 'component', 'slot',
    ];

    public const CATEGORIES = ['layout', 'navigation', 'content', 'media', 'forms', 'utility'];

    /**
     * Normalize a raw sidecar array into the canonical API shape. Missing
     * optional fields are filled so the front-end can trust the shape.
     * Does NOT set `template` / `template_exists` — the registry adds those
     * once it has resolved the sibling template on disk.
     *
     * @param array<string, mixed> $raw
     * @param string $stemId  filename-derived default id (leading `_` stripped)
     * @return array<string, mixed>|null  null when no valid id can be derived
     */
    public static function normalize(array $raw, string $stemId): ?array
    {
        $id = self::cleanId((string)($raw['id'] ?? $stemId));
        if ($id === null) return null;

        $examples = self::normalizeExamples($raw['examples'] ?? null);
        // Back-compat: an old-style `sample` object becomes example #1.
        if ($examples === [] && is_array($raw['sample'] ?? null) && $raw['sample'] !== []) {
            $examples = [['name' => 'Default', 'props' => $raw['sample']]];
        }
        $sample = $examples[0]['props'] ?? [];

        $name = trim((string)($raw['name'] ?? ''));
        return [
            'id'          => $id,
            'name'        => $name !== '' ? $name : $id,
            'tag'         => self::normalizeTag((string)($raw['tag'] ?? ''), $id),
            'description' => trim((string)($raw['description'] ?? '')),
            'category'    => self::normalizeCategory((string)($raw['category'] ?? '')),
            'inputs'      => self::normalizeInputs($raw['inputs'] ?? null),
            'slots'       => self::normalizeSlots($raw['slots'] ?? null),
            'examples'    => $examples,
            'sample'      => is_array($sample) ? $sample : [],
        ];
    }

    /**
     * Validate + reduce an API write payload to the minimal array we persist
     * to a sidecar file (template stays implicit — it's the sibling file, so
     * it is never written into the JSON). Accepts either `examples` or a
     * legacy `sample` object. Throws RuntimeException with a user-facing
     * message on invalid id.
     *
     * @param array<string, mixed> $patch
     * @return array<string, mixed>
     */
    public static function forWrite(array $patch): array
    {
        $id = self::cleanId(strtolower(trim((string)($patch['id'] ?? ''))));
        if ($id === null) {
            throw new \RuntimeException('Id must be lowercase letters, digits, dashes or underscores (no spaces).');
        }

        $out = ['id' => $id];

        $name = trim((string)($patch['name'] ?? ''));
        if ($name !== '' && $name !== $id) $out['name'] = $name;

        $tag = trim((string)($patch['tag'] ?? ''));
        if ($tag !== '') $out['tag'] = $tag;

        $desc = trim((string)($patch['description'] ?? ''));
        if ($desc !== '') $out['description'] = $desc;

        $out['category'] = self::normalizeCategory((string)($patch['category'] ?? ''));

        $inputs = self::normalizeInputs($patch['inputs'] ?? null);
        if ($inputs !== []) $out['inputs'] = $inputs;

        $slots = self::normalizeSlots($patch['slots'] ?? null);
        if ($slots !== []) $out['slots'] = $slots;

        $examples = self::normalizeExamples($patch['examples'] ?? null);
        if ($examples === [] && is_array($patch['sample'] ?? null) && $patch['sample'] !== []) {
            $examples = [['name' => 'Default', 'props' => $patch['sample']]];
        }
        if ($examples !== []) $out['examples'] = $examples;

        return $out;
    }

    /** Slug-safe id, or null if it can't be one. */
    public static function cleanId(string $id): ?string
    {
        $id = strtolower(trim($id));
        return preg_match('/^[a-z0-9][a-z0-9_-]{0,63}$/', $id) ? $id : null;
    }

    /** `hero` → `Hero`, `cta-band` → `CtaBand`. Explicit tag wins. */
    public static function normalizeTag(string $tag, string $id): string
    {
        $tag = trim($tag);
        if ($tag !== '') return $tag;
        $parts = preg_split('/[-_]/', $id) ?: [];
        return implode('', array_map('ucfirst', $parts));
    }

    public static function normalizeCategory(string $raw): string
    {
        $raw = strtolower(trim($raw));
        return in_array($raw, self::CATEGORIES, true) ? $raw : 'utility';
    }

    /**
     * @param mixed $raw
     * @return list<array<string, mixed>>
     */
    private static function normalizeInputs($raw): array
    {
        if (!is_array($raw)) return [];
        $out  = [];
        $seen = [];
        foreach ($raw as $in) {
            if (!is_array($in)) continue;
            $name = (string)($in['name'] ?? '');
            if (!preg_match('/^[a-zA-Z_]\w*$/', $name) || isset($seen[$name])) continue;
            $seen[$name] = true;

            $type = (string)($in['type'] ?? 'text');
            if (!in_array($type, self::PROP_TYPES, true)) $type = 'text';

            $row = ['name' => $name, 'type' => $type];
            if (array_key_exists('default', $in) && is_scalar($in['default'])) {
                $row['default'] = $in['default'];
            }
            if ($type === 'enum' && is_array($in['options'] ?? null)) {
                $opts = array_values(array_filter(
                    array_map(fn ($o) => is_scalar($o) ? (string)$o : null, $in['options']),
                    fn ($o) => $o !== null && $o !== '',
                ));
                if ($opts !== []) $row['options'] = $opts;
            }
            if (!empty($in['bindable'])) $row['bindable'] = true;
            foreach (['label', 'placeholder', 'hint'] as $meta) {
                $val = trim((string)($in[$meta] ?? ''));
                if ($val !== '') $row[$meta] = $val;
            }
            $out[] = $row;
        }
        return $out;
    }

    /**
     * @param mixed $raw
     * @return list<array<string, mixed>>
     */
    private static function normalizeSlots($raw): array
    {
        if (!is_array($raw)) return [];
        $out  = [];
        $seen = [];
        foreach ($raw as $slot) {
            if (!is_array($slot)) continue;
            $name = (string)($slot['name'] ?? '');
            if (!preg_match('/^[a-zA-Z_]\w*$/', $name) || isset($seen[$name])) continue;
            $seen[$name] = true;

            $row = ['name' => $name];
            if (is_array($slot['allowed'] ?? null)) {
                $allowed = array_values(array_filter(
                    array_map(fn ($a) => self::cleanId((string)$a), $slot['allowed']),
                    fn ($a) => $a !== null,
                ));
                if ($allowed !== []) $row['allowed'] = $allowed;
            }
            $row['default'] = is_array($slot['default'] ?? null) ? array_values($slot['default']) : [];
            $out[] = $row;
        }
        return $out;
    }

    /**
     * @param mixed $raw
     * @return list<array{name: string, props: array<string, mixed>}>
     */
    private static function normalizeExamples($raw): array
    {
        if (!is_array($raw)) return [];
        $out = [];
        foreach ($raw as $ex) {
            if (!is_array($ex) || !is_array($ex['props'] ?? null)) continue;
            $name  = trim((string)($ex['name'] ?? ''));
            $out[] = ['name' => $name !== '' ? $name : 'Example', 'props' => $ex['props']];
        }
        return $out;
    }
}
