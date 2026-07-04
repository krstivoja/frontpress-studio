<?php

declare(strict_types=1);

namespace FrontPress\Api;

defined('FRONTPRESS_BOOT') || exit;

use FrontPress\CacheService;
use FrontPress\Content;
use FrontPress\ContentRepository;
use FrontPress\Index;
use FrontPress\PathResolver;
use FrontPress\ThemeService;

class PagesController
{
    /**
     * @param string[] $pathParts
     * @param array<string, mixed> $config
     */
    public static function handle(array $pathParts, string $method, array $config): void
    {
        Router::requireAuth();

        $relPath = trim(implode('/', $pathParts), '/');
        $services = self::services($config);

        if ($method === 'GET' && $relPath === '') {
            self::list($services, $config);
            return;
        }
        if ($method === 'GET') {
            self::get($relPath, $services);
            return;
        }

        Router::requireCsrf();

        if ($method === 'POST' && $relPath === 'reorder') {
            self::reorder($services, $config);
            return;
        }
        if ($method === 'POST' && $relPath === '') {
            self::save(null, $services, $config);
            return;
        }
        if ($method === 'PUT' && $relPath !== '') {
            self::save($relPath, $services, $config);
            return;
        }
        if ($method === 'DELETE' && $relPath !== '') {
            self::delete($relPath, $services, $config);
            return;
        }

        \json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
    }

    /**
     * @param array<string, mixed> $config
     * @return array{paths: PathResolver, content: Content, cache: CacheService, repo: ContentRepository, index: Index}
     */
    private static function services(array $config): array
    {
        $paths   = ServiceFactory::paths($config);
        $content = ServiceFactory::content($config);
        $cache   = ServiceFactory::cache($config);
        $repo    = ServiceFactory::repository($config);
        $index   = ServiceFactory::index($config, $content);
        return compact('paths', 'content', 'cache', 'repo', 'index');
    }

    /**
     * @param array{paths: PathResolver, index: Index} $svc
     * @param array<string, mixed> $config
     */
    private static function list(array $svc, array $config): void
    {
        $folders = [];
        if (is_dir($config['contentDir'])) {
            foreach (array_diff(scandir($config['contentDir']), ['.', '..']) as $entry) {
                if (is_dir($config['contentDir'] . '/' . $entry)) {
                    $folders[] = $entry;
                }
            }
        }
        sort($folders);

        $pages = array_values($svc['index']->get(includeDrafts: true));

        // Lazy purge — every list request prunes trash entries older than
        // 24h. Cheap (a scandir + manifest read per entry) and means we
        // don't need cron / scheduled jobs.
        ServiceFactory::trash($config)->purgeStale();

        \json_response(['ok' => true, 'pages' => $pages, 'folders' => $folders]);
    }

    /** @param array{paths: PathResolver, repo: ContentRepository} $svc */
    private static function get(string $relPath, array $svc): void
    {
        $abs = $svc['paths']->contentFile($relPath);
        if (!$abs) {
            \json_response(['ok' => false, 'error' => 'Not found'], 404);
        }
        $parsed = $svc['repo']->parse($abs);
        \json_response([
            'ok'   => true,
            'path' => $relPath,
            'meta' => $parsed['meta'] ?? [],
            'body' => $parsed['body'] ?? '',
            'html' => $parsed['html'] ?? '',
        ]);
    }

    /**
     * @param array{paths: PathResolver, repo: ContentRepository} $svc
     * @param array<string, mixed> $config
     */
    private static function save(?string $existingPath, array $svc, array $config): void
    {
        $input   = Router::jsonBody();
        $isNew   = $existingPath === null;
        // For an update, the URL path identifies the file; the optional
        // top-level `path` in the body is the *target* path for a rename.
        // For a create, the body's `path` is the only source.
        $relPath = $isNew
            ? trim((string)($input['path'] ?? ''), '/')
            : ($existingPath ?? '');
        $newRelPath = $isNew
            ? null
            : trim((string)($input['path'] ?? $existingPath), '/');
        $title   = trim((string)($input['title'] ?? ''));
        $body    = (string)($input['body'] ?? '');

        if (!$svc['paths']->isValidRelPath($relPath)) {
            \json_response(['ok' => false, 'error' => 'Invalid path'], 400);
        }
        if (!$isNew && $newRelPath !== null && !$svc['paths']->isValidRelPath($newRelPath)) {
            \json_response(['ok' => false, 'error' => 'Invalid new path'], 400);
        }
        if ($title === '') {
            \json_response(['ok' => false, 'error' => 'Title is required'], 400);
        }

        $existing = [];
        if ($isNew) {
            if ($svc['paths']->resolveNewContentFile($relPath) === null) {
                \json_response(['ok' => false, 'error' => 'Cannot create at this path'], 400);
            }
        } else {
            $abs = $svc['paths']->contentFile($relPath);
            if (!$abs) {
                \json_response(['ok' => false, 'error' => 'Not found'], 404);
            }
            $existing = $svc['repo']->parseMeta($abs);

            // Rename happens before the write so we serialise the new content
            // straight to the destination — avoids a momentary state where
            // the old file still holds the previous body after a rename.
            if ($newRelPath !== null && $newRelPath !== $relPath) {
                if ($svc['paths']->resolveNewContentFile($newRelPath) === null) {
                    \json_response(['ok' => false, 'error' => 'Cannot move to this path'], 400);
                }
                $renamed = $svc['repo']->rename($relPath, $newRelPath);
                if (!$renamed['ok']) {
                    \json_response(['ok' => false, 'error' => $renamed['error']], 400);
                }
                ServiceFactory::audit($config)->record('page.rename', $relPath, ['to' => $newRelPath]);
                $relPath = $newRelPath;
            }
        }

        $incomingMeta = is_array($input['meta'] ?? null) ? $input['meta'] : [];
        $meta         = array_merge($existing, $incomingMeta, ['title' => $title]);

        // `date` is the index sort key — stamp today on new posts so null-date entries don't sort last.
        if ($isNew && empty($meta['date'])) $meta['date'] = date('Y-m-d');
        $d = array_key_exists('date', $input) ? trim((string)$input['date']) : null;
        if ($d === '') unset($meta['date']); elseif ($d !== null) $meta['date'] = $d;

        $status = (string)($input['status'] ?? 'published');
        if ($status === 'draft') {
            $meta['draft'] = true;
        } else {
            unset($meta['draft']);
        }

        // Per-post template override — empty string clears the key so the
        // public renderer falls back to the route-type default (post / page).
        // The submitted name must match a real, user-selectable template in the
        // active theme; otherwise we reject the save instead of silently
        // dropping the field, so the caller knows the value was invalid.
        if (array_key_exists('template', $input)) {
            $tpl = preg_replace('/[^a-z0-9_-]/', '', strtolower(trim((string)$input['template'])));
            if ($tpl === '') {
                unset($meta['template']);
            } else {
                $themes = ServiceFactory::themes($config);
                if (!in_array($tpl, $themes->listTemplates(), true)) {
                    \json_response(['ok' => false, 'error' => "Unknown template: $tpl"], 400);
                }
                $meta['template'] = $tpl;
            }
        }

        // Taxonomies — pass-through, repo persists everything in $meta.
        //
        // Skip keys that are owned by other top-level inputs (`title`, `draft`,
        // `template`, `path`). The editor seeds `taxValues` from the loaded
        // meta, which means a reserved key like `draft: true` would otherwise
        // come back through this loop and clobber the change the dedicated
        // `status` / `template` blocks above just made.
        $reserved = ['title', 'draft', 'template', 'path', 'date'];
        if (is_array($input['taxonomies'] ?? null)) {
            foreach ($input['taxonomies'] as $taxSlug => $value) {
                $taxSlug = (string)$taxSlug;
                if (in_array($taxSlug, $reserved, true)) continue;
                if (is_array($value)) {
                    $items = array_values(array_filter(array_map(
                        fn ($v) => trim((string)$v),
                        $value
                    ), fn ($v) => $v !== ''));
                    if ($items) {
                        $meta[$taxSlug] = $items;
                    } else {
                        unset($meta[$taxSlug]);
                    }
                } else {
                    $v = trim((string)$value);
                    if ($v !== '') {
                        $meta[$taxSlug] = $v;
                    } else {
                        unset($meta[$taxSlug]);
                    }
                }
            }
        }

        $svc['repo']->save($relPath, $meta, $body);
        ServiceFactory::audit($config)->record(
            $isNew ? 'page.create' : 'page.update',
            $relPath,
            ['title' => $title, 'draft' => !empty($meta['draft'])],
        );
        \json_response(['ok' => true, 'path' => $relPath]);
    }

    /**
     * @param array{paths: PathResolver, repo: ContentRepository, cache: CacheService} $svc
     * @param array<string, mixed>                                                     $config
     */
    private static function delete(string $relPath, array $svc, array $config): void
    {
        $abs = $svc['paths']->contentFile($relPath);
        if (!$abs) {
            \json_response(['ok' => false, 'error' => 'Not found'], 404);
        }
        $token = ServiceFactory::trash($config)->move($relPath);
        if ($token === null) {
            \json_response(['ok' => false, 'error' => "Couldn't move the page to trash."], 500);
        }
        // The trash move took the file off disk; the cache+index still
        // think it's there, so wipe the same entries the repo would have.
        $svc['cache']->clearPage($relPath);
        $svc['cache']->clearIndex();
        ServiceFactory::audit($config)->record('page.delete', $relPath, ['token' => $token]);
        \json_response(['ok' => true, 'token' => $token]);
    }

    /**
     * Bulk-update the `order` front-matter field for a set of posts. Called
     * after a drag-and-drop reorder in the post list. Accepts:
     *   { items: [{ path: "docs/foo", order: 1 }, ...] }
     *
     * @param array{paths: PathResolver, repo: ContentRepository, cache: CacheService} $svc
     * @param array<string, mixed> $config
     */
    private static function reorder(array $svc, array $config): void
    {
        $body  = Router::jsonBody();
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];
        if (empty($items)) {
            \json_response(['ok' => false, 'error' => 'No items provided'], 400);
        }

        $updated = [];
        foreach ($items as $item) {
            $relPath = trim((string)($item['path'] ?? ''), '/');
            $order   = (int)($item['order'] ?? 0);
            if (!$svc['paths']->isValidRelPath($relPath)) continue;

            $abs = $svc['paths']->contentFile($relPath);
            if (!$abs) continue;

            $parsed = $svc['repo']->parse($abs);
            $meta   = $parsed['meta'];
            $body2  = $parsed['body'];
            $meta['order'] = $order;
            $svc['repo']->save($relPath, $meta, $body2);
            $svc['cache']->clearPage($relPath);
            $updated[] = $relPath;
        }

        $svc['cache']->clearIndex();
        ServiceFactory::audit($config)->record('pages.reorder', '', ['count' => count($updated)]);
        \json_response(['ok' => true, 'updated' => count($updated)]);
    }

    /**
     * Restore a previously-trashed page by token. Returns the rel_path so
     * the client can refresh navigation / scroll to it.
     *
     * @param array<string, mixed> $config
     */
    public static function restore(string $method, array $config): void
    {
        if ($method !== 'POST') {
            \json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
        }
        Router::requireAuth();
        Router::requireCsrf();

        $body  = Router::jsonBody();
        $token = trim((string)($body['token'] ?? ''));
        if ($token === '') {
            \json_response(['ok' => false, 'error' => 'Missing token'], 400);
        }

        $relPath = ServiceFactory::trash($config)->restore($token);
        if ($relPath === null) {
            \json_response(['ok' => false, 'error' => "Couldn't restore from this token. It may have already been purged or restored."], 404);
        }

        $cache = ServiceFactory::cache($config);
        $cache->clearPage($relPath);
        $cache->clearIndex();
        ServiceFactory::audit($config)->record('page.restore', $relPath, ['token' => $token]);

        \json_response(['ok' => true, 'path' => $relPath]);
    }
}
