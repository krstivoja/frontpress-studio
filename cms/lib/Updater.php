<?php

declare(strict_types=1);

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

class Updater
{
    private string $appRoot;
    private string $versionFile;
    /** @var array<string, mixed> */
    private array $manifest;

    public function __construct(string $appRoot)
    {
        $this->appRoot     = rtrim($appRoot, '/');
        $this->versionFile = $this->appRoot . '/cms/VERSION';
        $manifestFile      = $this->appRoot . '/cms/manifest.json';
        $this->manifest    = is_file($manifestFile)
            ? (json_decode(file_get_contents($manifestFile), true) ?? [])
            : [];
    }

    public function currentVersion(): string
    {
        return is_file($this->versionFile) ? trim(file_get_contents($this->versionFile)) : '0.0.0';
    }

    public function repo(): string
    {
        return $this->manifest['repo'] ?? '';
    }

    /** @return array<string, string>|null */
    public function checkLatest(): ?array
    {
        $repo = $this->repo();
        if (!$repo || str_starts_with($repo, 'your-')) {
            return null;
        }

        $ctx = stream_context_create(['http' => [
            'header'  => "User-Agent: FrontPressStudio\r\n",
            'timeout' => 6,
        ]]);
        $json = @file_get_contents("https://api.github.com/repos/{$repo}/releases/latest", false, $ctx);
        if (!$json) {
            return null;
        }

        $data = json_decode($json, true);
        if (empty($data['tag_name'])) {
            return null;
        }

        return [
            'version'   => ltrim($data['tag_name'], 'v'),
            'tag'       => $data['tag_name'],
            'notes'     => $data['body']         ?? '',
            'zip_url'   => $data['zipball_url']  ?? '',
            'published' => $data['published_at'] ?? '',
        ];
    }

    public function isUpdateAvailable(): bool
    {
        $latest = $this->checkLatest();
        if (!$latest) {
            return false;
        }
        return version_compare($latest['version'], $this->currentVersion(), '>');
    }

    /**
     * Cached version of `checkLatest()` — disk-backed at
     * `site/cache/update-check.json`, refreshed at most once every
     * `$ttlSeconds` (default 6 hours). Lets us surface "update available"
     * info on every authenticated `/me` call without hammering GitHub's
     * unauthenticated API rate limit (60 req/hour/IP).
     *
     * Cache structure: `{ "checked_at": <epoch>, "result": <checkLatest()-shape>|null }`.
     * A `null` result is also cached so a failed GitHub call doesn't get
     * retried on every page load.
     *
     * @return array<string, string>|null
     */
    public function cachedCheckLatest(int $ttlSeconds = 21600): ?array
    {
        $cacheFile = $this->appRoot . '/site/cache/update-check.json';
        $now       = time();

        if (is_file($cacheFile)) {
            $raw    = (string)@file_get_contents($cacheFile);
            $cached = $raw ? json_decode($raw, true) : null;
            if (is_array($cached)
                && isset($cached['checked_at'])
                && ($now - (int)$cached['checked_at']) < $ttlSeconds
            ) {
                $result = $cached['result'] ?? null;
                return is_array($result) ? $result : null;
            }
        }

        $fresh = $this->checkLatest();

        // Best-effort write. Cache failures are not fatal — we'll just
        // re-check on the next request.
        $dir = dirname($cacheFile);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        @file_put_contents(
            $cacheFile,
            (string)json_encode(['checked_at' => $now, 'result' => $fresh], JSON_UNESCAPED_SLASHES),
        );

        return $fresh;
    }

    /**
     * Force-discard the cached check. Called after a successful apply()
     * so the post-update version comparison doesn't keep advertising the
     * just-installed release as "available".
     */
    public function clearUpdateCheckCache(): void
    {
        $cacheFile = $this->appRoot . '/site/cache/update-check.json';
        if (is_file($cacheFile)) {
            @unlink($cacheFile);
        }
    }

    /**
     * Hosts allowed for update ZIP downloads. GitHub redirects releases through
     * codeload.github.com; api.github.com is the metadata host.
     */
    private const ALLOWED_HOSTS = ['codeload.github.com', 'api.github.com', 'github.com'];

    public static function isAllowedZipUrl(string $url): bool
    {
        if (!str_starts_with($url, 'https://')) {
            return false;
        }
        $host = parse_url($url, PHP_URL_HOST);
        return is_string($host) && in_array(strtolower($host), self::ALLOWED_HOSTS, true);
    }

    /** @return array<string, mixed> */
    public function apply(string $zipUrl, string $backupDir): array
    {
        if (!static::isAllowedZipUrl($zipUrl)) {
            return ['ok' => false, 'error' => 'ZIP URL host not allowed'];
        }

        // Download ZIP to temp file
        $tmpZip = tempnam(sys_get_temp_dir(), 'fp_') . '.zip';
        $ctx    = stream_context_create(['http' => [
            'header'          => "User-Agent: FrontPressStudio\r\n",
            'timeout'         => 60,
            'follow_location' => true,
        ]]);
        $data = @file_get_contents($zipUrl, false, $ctx);
        if (!$data) {
            return ['ok' => false, 'error' => 'Download failed'];
        }
        file_put_contents($tmpZip, $data);

        $zip = new \ZipArchive();
        if ($zip->open($tmpZip) !== true) {
            unlink($tmpZip);
            return ['ok' => false, 'error' => 'Invalid ZIP'];
        }

        // GitHub ZIPs wrap everything in a top-level folder — find it
        $prefix = '';
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if (str_ends_with($name, '/') && substr_count(rtrim($name, '/'), '/') === 0) {
                $prefix = $name;
                break;
            }
        }

        // Read manifest from the incoming ZIP (may list new core files)
        $newManifestRaw = $zip->getFromName($prefix . 'cms/manifest.json');
        $newManifest    = $newManifestRaw ? (json_decode($newManifestRaw, true) ?? []) : [];
        $coreFiles      = $newManifest['core'] ?? $this->manifest['core'] ?? [];
        $newVersion     = '';
        $versionRaw     = $zip->getFromName($prefix . 'cms/VERSION');
        if ($versionRaw) {
            $newVersion = trim($versionRaw);
        }

        // Back up current core before overwriting
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }
        $backupFile = $backupDir . '/pre-update-v' . $this->currentVersion() . '-' . date('YmdHis') . '.zip';
        $bak        = new \ZipArchive();
        if ($bak->open($backupFile, \ZipArchive::CREATE) === true) {
            foreach ($coreFiles as $rel) {
                if (str_ends_with($rel, '/')) {
                    foreach ($this->localFilesUnder($rel) as $absPath => $entryRel) {
                        $bak->addFile($absPath, $entryRel);
                    }
                } else {
                    $full = $this->appRoot . '/' . $rel;
                    if (is_file($full)) {
                        $bak->addFile($full, $rel);
                    }
                }
            }
            $bak->close();
        }

        // Extract whitelisted core files + directory prefixes.
        //
        // Manifest entries ending in `/` are recursive prefixes — every file
        // inside the ZIP that starts with the prefix is extracted. Lets us
        // ship multi-file payloads like `cms/starters/blank-twig/` without
        // enumerating every template by name in the manifest.
        foreach ($coreFiles as $rel) {
            if (str_ends_with($rel, '/')) {
                $this->extractZipPrefix($zip, $prefix, $rel);
            } else {
                $entry   = $prefix . $rel;
                $content = $zip->getFromName($entry);
                if ($content === false) {
                    continue;
                }
                $dest = $this->appRoot . '/' . $rel;
                $dir  = dirname($dest);
                if (!is_dir($dir)) {
                    mkdir($dir, 0755, true);
                }
                file_put_contents($dest, $content);
            }
        }

        $zip->close();
        unlink($tmpZip);

        // Invalidate the cached check so the sidebar banner disappears on
        // the next /me round-trip instead of waiting out the TTL while
        // still pointing at the version we just installed.
        $this->clearUpdateCheckCache();

        // Migrations are NOT auto-run. The admin must invoke them explicitly via
        // runMigrations() (e.g. through the dedicated update/migrate endpoint).
        $pending = $this->pendingMigrations();

        return [
            'ok'                  => true,
            'version'             => $newVersion,
            'backup'              => basename($backupFile),
            'pending_migrations'  => array_map('basename', $pending),
        ];
    }

    /**
     * Walk a directory under appRoot and return [absPath => relEntry] pairs
     * for every file. Used by the backup pass for directory-prefix entries.
     *
     * @return iterable<string, string>
     */
    private function localFilesUnder(string $relDir): iterable
    {
        $base = rtrim($this->appRoot . '/' . rtrim($relDir, '/'), '/');
        if (!is_dir($base)) {
            return;
        }
        $iter = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($base, \FilesystemIterator::SKIP_DOTS),
        );
        $rootLen = strlen($this->appRoot) + 1;
        foreach ($iter as $file) {
            if (!$file->isFile()) continue;
            $abs = $file->getPathname();
            yield $abs => substr($abs, $rootLen);
        }
    }

    /**
     * Extract every ZIP entry under `$prefix . $relDir`. Mirrors the
     * single-file write path: creates parent directories, overwrites in
     * place. Skips directory entries (ZIP includes them as empty `…/`).
     */
    private function extractZipPrefix(\ZipArchive $zip, string $zipPrefix, string $relDir): void
    {
        $needle = $zipPrefix . $relDir;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entry = $zip->getNameIndex($i);
            if ($entry === false || !str_starts_with($entry, $needle) || str_ends_with($entry, '/')) {
                continue;
            }
            $rel     = substr($entry, strlen($zipPrefix));
            $content = $zip->getFromName($entry);
            if ($content === false) continue;
            $dest = $this->appRoot . '/' . $rel;
            $dir  = dirname($dest);
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }
            file_put_contents($dest, $content);
        }
    }

    /** @return list<string> */
    public function pendingMigrations(): array
    {
        $dir     = $this->appRoot . '/cms/migrations';
        $applied = $dir . '/.applied';
        if (!is_dir($dir)) {
            return [];
        }
        $done    = is_file($applied) ? array_filter(explode("\n", file_get_contents($applied))) : [];
        $scripts = glob($dir . '/*.php') ?: [];
        sort($scripts);
        return array_values(array_filter($scripts, fn ($s) => !in_array(basename($s), $done, true)));
    }

    public function runMigrations(): void
    {
        $dir     = $this->appRoot . '/cms/migrations';
        $applied = $dir . '/.applied';
        if (!is_dir($dir)) {
            return;
        }

        $done    = is_file($applied) ? array_filter(explode("\n", file_get_contents($applied))) : [];
        $scripts = glob($dir . '/*.php') ?: [];
        sort($scripts);

        foreach ($scripts as $script) {
            $name = basename($script);
            if (in_array($name, $done, true)) {
                continue;
            }
            require $script;
            $done[] = $name;
        }
        file_put_contents($applied, implode("\n", array_filter($done)));
    }
}
