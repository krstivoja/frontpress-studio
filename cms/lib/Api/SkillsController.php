<?php

declare(strict_types=1);

namespace FrontPress\Api;

defined('FRONTPRESS_BOOT') || exit;

use FrontPress\SkillBuilder;

/**
 * Serves the bundled Claude skills to the admin Skills tab: lists what's
 * installed, previews a token-tailored build, and streams a downloadable zip
 * with the user's chosen sections (Twig core is always in; PHP-engine and
 * component sections are opt-in). See {@see SkillBuilder}.
 */
class SkillsController
{
    /**
     * @param string[] $pathParts
     * @param array<string, mixed> $config
     */
    public static function handle(array $pathParts, string $method, array $config): void
    {
        $builder = new SkillBuilder(dirname((string)$config['cmsRoot']));
        $action  = $pathParts[0] ?? '';

        if ($method === 'GET' && $action === '') {
            \json_response(['ok' => true, 'skills' => $builder->list()]);
        }

        Router::requireCsrf();

        if ($method === 'POST' && $action === 'preview') {
            $body     = Router::jsonBody();
            $id       = (string)($body['skill'] ?? '');
            $markdown = $builder->build($id, self::include($body));
            if ($markdown === null) {
                \json_response(['ok' => false, 'error' => 'Skill not found'], 404);
            }
            \json_response(['ok' => true, 'markdown' => $markdown, 'bytes' => strlen($markdown)]);
        }

        if ($method === 'POST' && $action === 'download') {
            self::download($builder, Router::jsonBody());
            return;
        }

        \json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
    }

    /**
     * Stream a zip of the selected skills, each as `<id>/SKILL.md`, with the
     * theme skill filtered to the chosen sections.
     *
     * @param array<string, mixed> $body
     */
    private static function download(SkillBuilder $builder, array $body): void
    {
        $ids     = array_values(array_filter((array)($body['skills'] ?? []), 'is_string'));
        $include = self::include($body);
        $built   = [];
        foreach ($ids as $id) {
            $md = $builder->build($id, $include);
            if ($md !== null) {
                $built[$id] = $md;
            }
        }
        if ($built === []) {
            \json_response(['ok' => false, 'error' => 'No skills selected'], 400);
        }

        $tmp = tempnam(sys_get_temp_dir(), 'fpskill_');
        $zip = new \ZipArchive();
        if ($tmp === false || $zip->open($tmp, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            if ($tmp) {
                @unlink($tmp);
            }
            \json_response(['ok' => false, 'error' => 'Failed to build download'], 500);
        }
        foreach ($built as $id => $md) {
            $zip->addFromString($id . '/SKILL.md', $md);
        }
        $zip->close();

        header_remove('Content-Type');
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="frontpress-skills-' . date('Y-m-d') . '.zip"');
        header('Content-Length: ' . (string)filesize($tmp));
        readfile($tmp);
        @unlink($tmp);
        exit;
    }

    /**
     * Normalize the section toggles from a request body into builder flags.
     *
     * @param array<string, mixed> $body
     * @return array<string, bool>
     */
    private static function include(array $body): array
    {
        $raw = (array)($body['include'] ?? []);
        $out = [];
        foreach (SkillBuilder::AXES as $axis) {
            $out[$axis] = (bool)($raw[$axis] ?? true);
        }
        return $out;
    }
}
