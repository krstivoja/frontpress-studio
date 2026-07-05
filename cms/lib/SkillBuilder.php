<?php

declare(strict_types=1);

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

/**
 * Reads the bundled Claude skills under `<install-root>/.claude/skills/` and
 * composes a token-tailored `SKILL.md` on demand.
 *
 * A skill body may mark optional regions with HTML-comment fences so the admin
 * Skills tab can strip context the user doesn't want (e.g. a Twig-only theme
 * author drops the PHP-engine section rather than shipping it to their agent):
 *
 *   <!-- fp-skill:php -->        …PHP-engine section…       <!-- fp-skill:/php -->
 *   <!-- fp-skill:components --> …component system…         <!-- fp-skill:/components -->
 *
 * Fences are plain HTML comments, so an unfiltered file (what we commit and
 * ship) renders identically with every region included — the markers are inert
 * until the builder filters them out. Unfenced text is always kept, so the core
 * theme/content/fields material ships in every build.
 */
class SkillBuilder
{
    /** Optional regions a caller may include or drop, in checkbox order. */
    public const AXES = ['twig', 'php', 'components'];

    private string $skillsDir;

    public function __construct(string $installRoot)
    {
        $this->skillsDir = rtrim($installRoot, '/') . '/.claude/skills';
    }

    /**
     * List installed skills with the metadata the admin needs to render cards.
     *
     * @return list<array{id: string, name: string, description: string, bytes: int, axes: list<string>}>
     */
    public function list(): array
    {
        if (!is_dir($this->skillsDir)) {
            return [];
        }
        $out = [];
        foreach (glob($this->skillsDir . '/*/SKILL.md') ?: [] as $file) {
            $id  = basename(dirname($file));
            $raw = (string)file_get_contents($file);
            [$name, $description] = self::frontmatter($raw);
            $out[] = [
                'id'          => $id,
                'name'        => $name !== '' ? $name : $id,
                'description' => $description,
                'bytes'       => strlen($raw),
                'axes'        => self::presentAxes($raw),
            ];
        }
        usort($out, static fn ($a, $b) => strcmp($a['id'], $b['id']));
        return $out;
    }

    /**
     * Compose one skill's SKILL.md, keeping only the selected optional regions.
     *
     * @param array<string, bool> $include e.g. ['php' => false, 'components' => true]
     * @return string|null Composed markdown, or null if the skill doesn't exist.
     */
    public function build(string $id, array $include): ?string
    {
        $file = $this->skillsDir . '/' . self::safeId($id) . '/SKILL.md';
        if (!is_file($file)) {
            return null;
        }
        return self::filter((string)file_get_contents($file), $include);
    }

    /**
     * Strip fenced regions whose axis isn't selected. Nesting is supported;
     * fence lines are always removed. Unknown axes are treated as always-on.
     *
     * @param array<string, bool> $include
     */
    public static function filter(string $raw, array $include): string
    {
        $lines = preg_split('/\R/', $raw) ?: [];
        $out   = [];
        $stack = [];   // axes of currently-open fences
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if (preg_match('/^<!--\s*fp-skill:(\/?)([a-z0-9_-]+)\s*-->$/', $trimmed, $m)) {
                if ($m[1] === '') {
                    $stack[] = $m[2];            // open
                } else {
                    array_pop($stack);           // close (matched by nesting order)
                }
                continue;                        // never emit the fence itself
            }
            // Emit only when every open fence's axis is selected.
            $suppressed = false;
            foreach ($stack as $axis) {
                if (($include[$axis] ?? true) === false) {
                    $suppressed = true;
                    break;
                }
            }
            if (!$suppressed) {
                $out[] = $line;
            }
        }
        // Collapse the blank-line runs left where a region was removed.
        $text = implode("\n", $out);
        $text = preg_replace("/\n{3,}/", "\n\n", $text) ?? $text;
        return rtrim($text) . "\n";
    }

    /**
     * Which optional axes actually appear in this skill body.
     *
     * @return list<string>
     */
    private static function presentAxes(string $raw): array
    {
        $present = [];
        foreach (self::AXES as $axis) {
            if (str_contains($raw, 'fp-skill:' . $axis)) {
                $present[] = $axis;
            }
        }
        return $present;
    }

    /** @return array{0: string, 1: string} [name, description] from YAML front matter. */
    private static function frontmatter(string $raw): array
    {
        if (!preg_match('/^---\R(.*?)\R---/s', $raw, $m)) {
            return ['', ''];
        }
        $name = $desc = '';
        if (preg_match('/^name:\s*(.+)$/mi', $m[1], $n)) {
            $name = trim($n[1], " \"'");
        }
        if (preg_match('/^description:\s*(.+)$/mi', $m[1], $d)) {
            $desc = trim($d[1], " \"'");
        }
        return [$name, $desc];
    }

    private static function safeId(string $id): string
    {
        return preg_replace('/[^a-z0-9_-]/i', '', $id) ?? '';
    }
}
