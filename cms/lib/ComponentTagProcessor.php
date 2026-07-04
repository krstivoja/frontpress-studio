<?php

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

/**
 * Converts JSX-like component tags in template source to component() calls.
 *
 * Matches self-closing PascalCase tags with two attribute forms:
 *   - String literal:  title="Welcome"        (quotes → a literal string)
 *   - Expression:      label={cta_label}       (braces → an engine expression)
 *
 * Twig:  <Hero title="Welcome" image={meta.image} />
 *        → {{ component('hero', { title: 'Welcome', image: (meta.image) }) }}
 * PHP:   <Hero title="Welcome" image={$meta['image']} />
 *        → <?php component('hero', ['title' => 'Welcome', 'image' => ($meta['image'])]); ?>
 *
 * The `{ … }` contents are inserted verbatim, so they're written in the
 * template's own engine — Twig syntax in .twig, PHP syntax in .php.
 *
 * Rules:
 *   - PascalCase tag names only ([A-Z][a-zA-Z0-9]*) — lowercase and kebab tags pass through untouched
 *   - Self-closing only (<Hero /> not <Hero>...</Hero>)
 *   - String values are double-quoted; expression values are wrapped in `{ }`
 *     and are engine-specific (Twig syntax in .twig, PHP syntax in .php). An
 *     expression must not contain a literal `}`.
 *   - Component name is lowercased: <Hero /> → component('hero', ...)
 */
final class ComponentTagProcessor
{
    // Attribute is `name="string"` or `name={expression}` (no `}` inside).
    private const PATTERN = '/<([A-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_]\w*=(?:"[^"]*"|\{[^}]*\}))*)\s*\/>/';

    /**
     * Replace JSX-like tags in markdown with rendered component HTML.
     *
     * Markdown has no template scope, so expression attributes can't be
     * evaluated — their inner text is passed through as a plain string.
     * Content authors should use string attributes.
     *
     * @param callable(string, array<string,string>): string $render
     */
    public static function processMarkdown(string $source, callable $render): string
    {
        return preg_replace_callback(self::PATTERN, static function (array $m) use ($render): string {
            $name  = self::toKebab($m[1]);
            $attrs = [];
            foreach (self::tokenize($m[2]) as $t) {
                $attrs[$t['key']] = $t['value'];
            }
            return $render($name, $attrs);
        }, $source);
    }

    public static function processTwig(string $source): string
    {
        return preg_replace_callback(self::PATTERN, static function (array $m): string {
            $name  = self::toKebab($m[1]);
            $parts = [];
            foreach (self::tokenize($m[2]) as $t) {
                if ($t['expr']) {
                    if ($t['value'] === '') continue;      // skip empty {} expressions
                    $parts[] = "'{$t['key']}': ({$t['value']})";
                } else {
                    $parts[] = "'{$t['key']}': '" . addslashes($t['value']) . "'";
                }
            }
            $attrs = implode(', ', $parts);
            return "{{ component('{$name}', {{$attrs}}) }}";
        }, $source);
    }

    public static function processPhp(string $source): string
    {
        return preg_replace_callback(self::PATTERN, static function (array $m): string {
            $name  = self::toKebab($m[1]);
            $parts = [];
            foreach (self::tokenize($m[2]) as $t) {
                if ($t['expr']) {
                    if ($t['value'] === '') continue;      // skip empty {} expressions
                    $parts[] = "'{$t['key']}' => ({$t['value']})";
                } else {
                    $parts[] = "'{$t['key']}' => '" . addslashes($t['value']) . "'";
                }
            }
            $attrs = implode(', ', $parts);
            return "<?php component('{$name}', [{$attrs}]); ?>";
        }, $source);
    }

    /** PascalCase → kebab-case: CtaBar → cta-bar, Hero → hero */
    private static function toKebab(string $name): string
    {
        return strtolower(preg_replace('/(?<!^)[A-Z]/', '-$0', $name));
    }

    /**
     * Split an attribute string into typed tokens.
     *
     * @return list<array{key: string, value: string, expr: bool}>
     */
    private static function tokenize(string $attrStr): array
    {
        preg_match_all('/([a-zA-Z_]\w*)=(?:"([^"]*)"|\{([^}]*)\})/', $attrStr, $m, PREG_SET_ORDER);
        $out = [];
        foreach ($m as $t) {
            // The character right after `key=` is the delimiter: `"` or `{`.
            $isExpr = ($t[0][strlen($t[1]) + 1] ?? '"') === '{';
            $value  = $isExpr ? ($t[3] ?? '') : ($t[2] ?? '');
            $out[]  = ['key' => $t[1], 'value' => trim($value), 'expr' => $isExpr];
        }
        return $out;
    }
}
