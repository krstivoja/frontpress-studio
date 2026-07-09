<?php

declare(strict_types=1);

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

/**
 * Converts JSX-like component tags in template source to component() calls.
 *
 * Matches PascalCase tags in two shapes, with two attribute forms each:
 *   - String literal:  title="Welcome"        (quotes → a literal string)
 *   - Expression:      label={cta_label}       (braces → an engine expression)
 *
 * Self-closing (no children):
 *   Twig:  <Hero title="Welcome" image={meta.image} />
 *          → {{ component('hero', { title: 'Welcome', image: (meta.image) }) }}
 *   PHP:   <Hero title="Welcome" image={$meta['image']} />
 *          → <?php component('hero', ['title' => 'Welcome', 'image' => ($meta['image'])]); ?>
 *
 * Paired (with children — anything between the open and close tag is captured
 * and passed as the reserved `children` var, so a component can wrap content):
 *   Twig:  <Button variant="primary"><Icon name="star" /> Save</Button>
 *          → {% set _fpc0 %}{{ component('icon', {name: 'star'}) }} Save{% endset %}
 *            {{ component('button', { variant: 'primary', children: _fpc0 }) }}
 *   PHP:   <Button variant="primary"><Icon name="star" /> Save</Button>
 *          → <?php ob_start(); ?><?php component('icon', ['name' => 'star']); ?> Save
 *            <?php $__fpc0 = ob_get_clean(); component('button', ['variant' => 'primary', 'children' => $__fpc0]); ?>
 *   The template then renders it with `{{ children|raw }}` / `<?= $children ?>`.
 *
 * The `{ … }` contents are inserted verbatim, so they're written in the
 * template's own engine — Twig syntax in .twig, PHP syntax in .php.
 *
 * Rules:
 *   - PascalCase tag names only ([A-Z][a-zA-Z0-9]*) — lowercase and kebab tags pass through untouched
 *   - Self-closing tags are converted first; paired tags are then converted
 *     innermost-first, so nested components (of any depth, including the same
 *     tag name) resolve correctly.
 *   - `children` is a reserved var name for the captured inner content; passing
 *     a `children=` attribute alongside child content is undefined.
 *   - String values are double-quoted; expression values are wrapped in `{ }`
 *     and are engine-specific (Twig syntax in .twig, PHP syntax in .php). An
 *     expression must not contain a literal `}`.
 *   - Component name is kebab-cased: <CtaBar /> → component('cta-bar', ...)
 */
final class ComponentTagProcessor
{
    // Self-closing: `<Name attrs />`. Attribute is `name="string"` or `name={expr}` (no `}` inside).
    private const PATTERN = '/<([A-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_]\w*=(?:"[^"]*"|\{[^}]*\}))*)\s*\/>/';

    // Paired: `<Name attrs> inner </Name>`. The inner group forbids any nested
    // `<Tag` / `</Tag` so only the *innermost* pair matches on each pass; outer
    // pairs are picked up on subsequent passes once their inner has no component
    // tags left. `s` flag lets inner span newlines.
    private const PAIRED = '/<([A-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_]\w*=(?:"[^"]*"|\{[^}]*\}))*)\s*>((?:(?!<\/?[A-Z]).)*?)<\/\1\s*>/s';

    /**
     * Replace JSX-like tags in markdown with rendered component HTML.
     *
     * Markdown has no template scope, so expression attributes can't be
     * evaluated — their inner text is passed through as a plain string.
     * Content authors should use string attributes. Paired tags capture their
     * (already-rendered) inner HTML into the `children` attribute.
     *
     * @param callable(string, array<string,string>): string $render
     */
    public static function processMarkdown(string $source, callable $render): string
    {
        $renderTag = static function (array $m, ?string $inner = null) use ($render): string {
            $name  = self::toKebab($m[1]);
            $attrs = [];
            foreach (self::tokenize($m[2]) as $t) {
                $attrs[$t['key']] = $t['value'];
            }
            if ($inner !== null) {
                $attrs['children'] = $inner;
            }
            return $render($name, $attrs);
        };

        // Self-closing first, so nested self-closing tags inside a pair render
        // before the pair captures its inner HTML.
        $source = preg_replace_callback(self::PATTERN, static fn(array $m): string => $renderTag($m), $source);

        // Paired, innermost-first, until none remain.
        do {
            $source = preg_replace_callback(
                self::PAIRED,
                static fn(array $m): string => $renderTag($m, $m[3]),
                $source,
                -1,
                $count
            );
        } while ($count > 0);

        return $source;
    }

    public static function processTwig(string $source): string
    {
        $source = preg_replace_callback(self::PATTERN, static function (array $m): string {
            $attrs = implode(', ', self::twigParts(self::tokenize($m[2])));
            return "{{ component('" . self::toKebab($m[1]) . "', {{$attrs}}) }}";
        }, $source);

        $n = 0;
        do {
            $source = preg_replace_callback(self::PAIRED, static function (array $m) use (&$n): string {
                $var   = '_fpc' . $n++;
                $parts = self::twigParts(self::tokenize($m[2]));
                $parts[] = "'children': {$var}";
                $attrs = implode(', ', $parts);
                return "{% set {$var} %}{$m[3]}{% endset %}"
                     . "{{ component('" . self::toKebab($m[1]) . "', {{$attrs}}) }}";
            }, $source, -1, $count);
        } while ($count > 0);

        return $source;
    }

    public static function processPhp(string $source): string
    {
        $source = preg_replace_callback(self::PATTERN, static function (array $m): string {
            $attrs = implode(', ', self::phpParts(self::tokenize($m[2])));
            return "<?php component('" . self::toKebab($m[1]) . "', [{$attrs}]); ?>";
        }, $source);

        $n = 0;
        do {
            $source = preg_replace_callback(self::PAIRED, static function (array $m) use (&$n): string {
                $var   = '$__fpc' . $n++;
                $parts = self::phpParts(self::tokenize($m[2]));
                $parts[] = "'children' => {$var}";
                $attrs = implode(', ', $parts);
                return "<?php ob_start(); ?>{$m[3]}"
                     . "<?php {$var} = ob_get_clean(); "
                     . "component('" . self::toKebab($m[1]) . "', [{$attrs}]); ?>";
            }, $source, -1, $count);
        } while ($count > 0);

        return $source;
    }

    /**
     * Build Twig `'key': value` map entries from attribute tokens.
     *
     * @param list<array{key: string, value: string, expr: bool}> $tokens
     * @return list<string>
     */
    private static function twigParts(array $tokens): array
    {
        $parts = [];
        foreach ($tokens as $t) {
            if ($t['expr']) {
                if ($t['value'] === '') {
                    continue;
                }      // skip empty {} expressions
                $parts[] = "'{$t['key']}': ({$t['value']})";
            } else {
                $parts[] = "'{$t['key']}': '" . addslashes($t['value']) . "'";
            }
        }
        return $parts;
    }

    /**
     * Build PHP `'key' => value` array entries from attribute tokens.
     *
     * @param list<array{key: string, value: string, expr: bool}> $tokens
     * @return list<string>
     */
    private static function phpParts(array $tokens): array
    {
        $parts = [];
        foreach ($tokens as $t) {
            if ($t['expr']) {
                if ($t['value'] === '') {
                    continue;
                }      // skip empty {} expressions
                $parts[] = "'{$t['key']}' => ({$t['value']})";
            } else {
                $parts[] = "'{$t['key']}' => '" . addslashes($t['value']) . "'";
            }
        }
        return $parts;
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
