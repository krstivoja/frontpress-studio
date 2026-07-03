<?php

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

/**
 * Converts JSX-like component tags in template source to component() calls.
 *
 * Matches self-closing PascalCase tags with double-quoted attributes:
 *   <Hero title="Welcome" image="/uploads/hero.jpg" />
 *
 * Twig output:  {{ component('hero', { title: 'Welcome', image: '/uploads/hero.jpg' }) }}
 * PHP output:   <?php component('hero', ['title' => 'Welcome', 'image' => '/uploads/hero.jpg']); ?>
 *
 * Rules:
 *   - PascalCase tag names only ([A-Z][a-zA-Z0-9]*) — lowercase and kebab tags pass through untouched
 *   - Self-closing only (<Hero /> not <Hero>...</Hero>)
 *   - Double-quoted attribute values only; single-quoted tags are not matched (safe fallback)
 *   - Component name is lowercased: <Hero /> → component('hero', ...)
 */
final class ComponentTagProcessor
{
    private const PATTERN = '/<([A-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_]\w*="[^"]*")*)\s*\/>/';

    /**
     * Replace JSX-like tags in markdown with rendered component HTML.
     *
     * @param callable(string, array<string,string>): string $render
     */
    public static function processMarkdown(string $source, callable $render): string
    {
        return preg_replace_callback(self::PATTERN, static function (array $m) use ($render): string {
            $name  = self::toKebab($m[1]);
            $attrs = self::parseAttrs($m[2]);
            return $render($name, $attrs);
        }, $source);
    }

    public static function processTwig(string $source): string
    {
        return preg_replace_callback(self::PATTERN, static function (array $m): string {
            $name  = self::toKebab($m[1]);
            $attrs = self::attrsToTwig($m[2]);
            return "{{ component('{$name}', {{$attrs}}) }}";
        }, $source);
    }

    public static function processPhp(string $source): string
    {
        return preg_replace_callback(self::PATTERN, static function (array $m): string {
            $name  = self::toKebab($m[1]);
            $attrs = self::attrsToPhp($m[2]);
            return "<?php component('{$name}', [{$attrs}]); ?>";
        }, $source);
    }

    /** PascalCase → kebab-case: CtaBar → cta-bar, Hero → hero */
    private static function toKebab(string $name): string
    {
        return strtolower(preg_replace('/(?<!^)[A-Z]/', '-$0', $name));
    }

    /** @return array<string, string> */
    private static function parseAttrs(string $attrStr): array
    {
        preg_match_all('/([a-zA-Z_]\w*)="([^"]*)"/', $attrStr, $m, PREG_SET_ORDER);
        $out = [];
        foreach ($m as [, $key, $val]) {
            $out[$key] = $val;
        }
        return $out;
    }

    private static function attrsToTwig(string $attrStr): string
    {
        $parts = [];
        foreach (self::parseAttrs($attrStr) as $key => $val) {
            $parts[] = "'{$key}': '" . addslashes($val) . "'";
        }
        return implode(', ', $parts);
    }

    private static function attrsToPhp(string $attrStr): string
    {
        $parts = [];
        foreach (self::parseAttrs($attrStr) as $key => $val) {
            $parts[] = "'{$key}' => '" . addslashes($val) . "'";
        }
        return implode(', ', $parts);
    }
}
