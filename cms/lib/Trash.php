<?php

declare(strict_types=1);

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

/**
 * Soft-delete store for content. Instead of `unlink()`ing pages outright,
 * callers move them here and get back a token; a follow-up request with the
 * same token restores the original location.
 *
 * Layout per entry:
 *
 *   site/cache/trash/<token>/
 *     manifest.json     { "deleted_at": 1700000000, "rel_path": "blog/hello" }
 *     <slug>.md
 *     <slug>/           (per-post upload sibling dir, if it existed)
 *
 * Tokens are time-prefixed for purge ordering plus 8 random hex chars so two
 * concurrent deletes never collide. Entries older than `MAX_AGE_SECONDS`
 * are purged on each `purgeStale()` call; PagesController calls that on
 * every list request, so no cron is required.
 */
class Trash
{
    public const MAX_AGE_SECONDS = 86400; // 24h

    private string $trashDir;
    private string $contentDir;

    public function __construct(string $cacheDir, string $contentDir)
    {
        $this->trashDir   = rtrim($cacheDir, '/') . '/trash';
        $this->contentDir = rtrim($contentDir, '/');
    }

    /**
     * Move a page (and its sibling assets dir, if any) into trash.
     * Returns the token on success, null if the source is missing or any
     * filesystem step fails (caller surfaces a 500 / 404).
     */
    public function move(string $relPath): ?string
    {
        $srcFile = $this->contentDir . '/' . $relPath . '.md';
        if (!is_file($srcFile)) {
            return null;
        }

        $token   = $this->mintToken();
        $entryDir = $this->trashDir . '/' . $token;
        if (!@mkdir($entryDir, 0755, true) && !is_dir($entryDir)) {
            return null;
        }

        $slug    = basename($relPath);
        $destMd  = $entryDir . '/' . $slug . '.md';
        if (!@rename($srcFile, $destMd)) {
            @rmdir($entryDir);
            return null;
        }

        // Move sibling per-post uploads dir if present. Guard against a
        // directory that actually holds pages (a content folder, e.g. after a
        // bad empty-slug save left `pages.md` beside `pages/`): moving it would
        // silently trash every child page. Only sweep dirs with no markdown
        // children — a genuine uploads dir holds images, not `.md` files.
        $srcAssets = $this->contentDir . '/' . $relPath;
        if (is_dir($srcAssets) && !self::hasMarkdown($srcAssets)) {
            @rename($srcAssets, $entryDir . '/' . $slug);
        }

        Fs::atomicWrite($entryDir . '/manifest.json', (string)json_encode([
            'deleted_at' => time(),
            'rel_path'   => $relPath,
        ]));

        return $token;
    }

    /** True if $dir contains any `.md` file at any depth — i.e. it's a content
     *  folder, not a page's uploads dir. Bails on the first match. */
    private static function hasMarkdown(string $dir): bool
    {
        foreach (scandir($dir) ?: [] as $name) {
            if ($name === '.' || $name === '..') continue;
            $path = $dir . '/' . $name;
            if (is_dir($path)) {
                if (self::hasMarkdown($path)) return true;
            } elseif (str_ends_with($name, '.md')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Restore the file (and any sibling assets dir) recorded in the entry.
     * Returns the restored rel_path on success, or null on failure
     * (token unknown, manifest unreadable, destination already occupied).
     */
    public function restore(string $token): ?string
    {
        $entryDir = $this->resolveEntryDir($token);
        if ($entryDir === null) {
            return null;
        }

        $manifestPath = $entryDir . '/manifest.json';
        if (!is_file($manifestPath)) {
            return null;
        }
        $manifest = json_decode((string)file_get_contents($manifestPath), true);
        if (!is_array($manifest) || !isset($manifest['rel_path'])) {
            return null;
        }
        $relPath = (string)$manifest['rel_path'];

        $slug    = basename($relPath);
        $srcMd   = $entryDir . '/' . $slug . '.md';
        $destMd  = $this->contentDir . '/' . $relPath . '.md';
        if (!is_file($srcMd) || file_exists($destMd)) {
            return null;
        }

        $destDir = dirname($destMd);
        if (!is_dir($destDir) && !@mkdir($destDir, 0755, true)) {
            return null;
        }
        if (!@rename($srcMd, $destMd)) {
            return null;
        }

        $srcAssets  = $entryDir . '/' . $slug;
        $destAssets = $this->contentDir . '/' . $relPath;
        if (is_dir($srcAssets) && !is_dir($destAssets)) {
            @rename($srcAssets, $destAssets);
        }

        $this->removeEntry($entryDir);
        return $relPath;
    }

    /**
     * Drop trash entries older than MAX_AGE_SECONDS. Returns the count
     * removed. Called opportunistically from PagesController::list — no
     * cron required.
     */
    public function purgeStale(): int
    {
        if (!is_dir($this->trashDir)) {
            return 0;
        }
        $cutoff = time() - self::MAX_AGE_SECONDS;
        $count  = 0;
        foreach (array_diff(scandir($this->trashDir) ?: [], ['.', '..']) as $entry) {
            $entryDir = $this->trashDir . '/' . $entry;
            if (!is_dir($entryDir)) continue;

            $manifest = $entryDir . '/manifest.json';
            $deletedAt = 0;
            if (is_file($manifest)) {
                $data = json_decode((string)file_get_contents($manifest), true);
                if (is_array($data) && isset($data['deleted_at'])) {
                    $deletedAt = (int)$data['deleted_at'];
                }
            }
            // Fall back to directory mtime if the manifest is missing/corrupt.
            if ($deletedAt === 0) {
                $deletedAt = (int)@filemtime($entryDir);
            }
            if ($deletedAt > 0 && $deletedAt < $cutoff) {
                if ($this->removeEntry($entryDir)) {
                    $count++;
                }
            }
        }
        return $count;
    }

    private function mintToken(): string
    {
        return sprintf('%d-%s', time(), bin2hex(random_bytes(4)));
    }

    /** Realpath-guarded resolve — `token` must be a direct child of `trashDir`. */
    private function resolveEntryDir(string $token): ?string
    {
        if (!preg_match('/^[0-9a-f-]+$/', $token)) {
            return null;
        }
        $entryDir = $this->trashDir . '/' . $token;
        $real     = realpath($entryDir);
        $base     = realpath($this->trashDir);
        if (!$real || !$base || !str_starts_with($real . '/', $base . '/')) {
            return null;
        }
        return $real;
    }

    private function removeEntry(string $entryDir): bool
    {
        $iter = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($entryDir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($iter as $file) {
            if ($file->isDir()) {
                @rmdir($file->getPathname());
            } else {
                @unlink($file->getPathname());
            }
        }
        return @rmdir($entryDir);
    }
}
