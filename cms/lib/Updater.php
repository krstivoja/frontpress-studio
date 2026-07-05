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

        $url  = "https://api.github.com/repos/{$repo}/releases/latest";
        $json = $this->httpGet($url);
        if (!$json) {
            return null;
        }

        $data = json_decode($json, true);
        if (empty($data['tag_name'])) {
            error_log("Updater::checkLatest: GitHub returned no tag_name (got: " . substr((string)$json, 0, 200) . ')');
            return null;
        }

        return [
            'version'   => ltrim($data['tag_name'], 'v'),
            'tag'       => $data['tag_name'],
            'notes'     => $data['body']         ?? '',
            'zip_url'   => self::releaseZipUrl($data),
            'published' => $data['published_at'] ?? '',
        ];
    }

    /**
     * Pick the download URL for an update.
     *
     * Prefer the built **release-asset** zip (`frontpress-studio-<v>.zip`
     * attached to the release by CI). GitHub's auto-generated `zipball_url`
     * is a `git archive` of the tag — it OMITS every gitignored path, which
     * includes the compiled admin SPA (`admin/assets/`) and `cms/vendor/`.
     * Downloading the zipball updates tracked PHP but silently leaves the
     * admin UI (and Composer deps) frozen, so new front-end features never
     * appear after an in-app update. The release asset carries both.
     *
     * The asset `browser_download_url` is on `github.com` (redirects to
     * objects.githubusercontent.com, which cURL follows), so it passes
     * {@see isAllowedZipUrl}. Fall back to the zipball only if a release
     * has no attached `.zip` asset.
     *
     * @param array<string, mixed> $data releases/latest payload
     */
    private static function releaseZipUrl(array $data): string
    {
        foreach ($data['assets'] ?? [] as $asset) {
            $u = $asset['browser_download_url'] ?? '';
            if (is_string($u) && str_ends_with($u, '.zip')) {
                return $u;
            }
        }
        return $data['zipball_url'] ?? '';
    }

    /**
     * Locate a CA bundle file that actually exists on this host. PHP
     * exposes the openssl-configured paths via `openssl_get_cert_locations()`,
     * but those paths frequently point at files that don't exist (Local
     * Sites is the canonical offender — it sets `default_cert_file` to a
     * WordPress-internal path). Walk the configured locations first, then
     * fall through to common system locations on macOS / Debian / RHEL.
     *
     * Returns the first readable PEM bundle found, or null if none exists.
     * Cached statically per request so the stat calls aren't repeated.
     */
    private static ?string $cachedCaBundle = null;
    private static bool $caBundleSearched = false;

    private static function findCaBundle(): ?string
    {
        if (self::$caBundleSearched) {
            return self::$cachedCaBundle;
        }
        self::$caBundleSearched = true;

        $candidates = [];

        if (function_exists('openssl_get_cert_locations')) {
            $loc = openssl_get_cert_locations();
            if (!empty($loc['default_cert_file'])) {
                $candidates[] = $loc['default_cert_file'];
            }
            if (!empty($loc['default_cert_dir'])) {
                $candidates[] = rtrim($loc['default_cert_dir'], '/') . '/cert.pem';
            }
        }

        // Common system locations. Ordered roughly by "most likely to be
        // present on a given OS" — macOS, Debian/Ubuntu, RHEL/Fedora,
        // Alpine, FreeBSD, Homebrew.
        $candidates = array_merge($candidates, [
            '/etc/ssl/cert.pem',
            '/etc/ssl/certs/ca-certificates.crt',
            '/etc/pki/tls/certs/ca-bundle.crt',
            '/etc/ssl/ca-bundle.pem',
            '/usr/local/share/certs/ca-root-nss.crt',
            '/usr/local/etc/openssl@3/cert.pem',
            '/usr/local/etc/openssl/cert.pem',
            '/opt/homebrew/etc/openssl@3/cert.pem',
        ]);

        foreach ($candidates as $path) {
            if (is_string($path) && $path !== '' && is_file($path) && is_readable($path)) {
                self::$cachedCaBundle = $path;
                return $path;
            }
        }
        return null;
    }

    /**
     * GET a URL with sensible defaults. Prefers curl (more reliable
     * over HTTPS across PHP-FPM ini configs and far better error reporting)
     * and falls back to `file_get_contents` when the curl extension isn't
     * available. Either path logs the failure cause via `error_log()` so a
     * silent `null` return is debuggable from the webserver log.
     *
     * `$accept` controls the Accept header; defaults to `application/json`
     * for API calls. Binary downloads (e.g. the release zip) pass `*\/*`
     * (or any non-JSON value) so the server returns the binary payload.
     *
     * `$timeout` is used for both connect and total transfer. The default
     * is comfortable for an API call but a multi-MB release-zip download
     * needs a larger window — callers pass an override.
     *
     * Returns the response body on HTTP 2xx, null otherwise.
     */
    private function httpGet(string $url, string $accept = 'application/json', int $timeout = 10): ?string
    {
        $ua = 'FrontPressStudio';

        // file:// fast-path. Used by the test suite to load a fixture
        // ZIP without spinning up an HTTP server; curl rejects file://
        // by default for safety, and a network round-trip for what's
        // really a local read would be wasteful anyway. Production
        // `isAllowedZipUrl()` keeps real callers on https://.
        if (str_starts_with($url, 'file://')) {
            $body = @file_get_contents($url);
            if ($body === false) {
                $msg = error_get_last()['message'] ?? 'unknown error';
                error_log("Updater::httpGet file: {$url} -> {$msg}");
                return null;
            }
            return $body;
        }

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            $opts = [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_CONNECTTIMEOUT => $timeout,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_USERAGENT      => $ua,
                CURLOPT_HTTPHEADER     => ["Accept: {$accept}"],
            ];

            // Many shared hosts (and Local Sites, which targets WordPress)
            // ship a php.ini that points `openssl.cafile` at a non-existent
            // path — `wp-includes/certificates/ca-bundle.crt` in Local's
            // case. Curl then aborts the TLS handshake before any HTTP
            // round-trip happens. Find a working CA bundle here so the
            // updater is portable across hosts without users having to
            // touch php.ini.
            $cafile = self::findCaBundle();
            if ($cafile !== null) {
                $opts[CURLOPT_CAINFO] = $cafile;
            } elseif (defined('CURLSSLOPT_NATIVE_CA')) {
                // CURL 7.71+ on macOS/Windows can use the OS trust store
                // directly — last-resort fallback when we couldn't find a
                // PEM bundle on disk.
                $opts[CURLOPT_SSL_OPTIONS] = CURLSSLOPT_NATIVE_CA;
            }

            curl_setopt_array($ch, $opts);
            $body = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err  = curl_error($ch);
            curl_close($ch);

            if ($body === false || $code < 200 || $code >= 300) {
                error_log("Updater::httpGet curl: {$url} -> HTTP {$code}" . ($err !== '' ? " ({$err})" : ''));
                return null;
            }
            return (string)$body;
        }

        // file_get_contents fallback. Captures `$http_response_header`
        // (populated by PHP on stream open) so we can log the status line
        // alongside the body — without it a null return tells you nothing.
        $ctx = stream_context_create(['http' => [
            'header'        => "User-Agent: {$ua}\r\nAccept: {$accept}\r\n",
            'timeout'       => $timeout,
            'ignore_errors' => true,
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) {
            $msg = error_get_last()['message'] ?? 'unknown error';
            error_log("Updater::httpGet stream: {$url} -> {$msg}");
            return null;
        }
        // `$http_response_header` is auto-populated in the current scope on
        // a successful stream open.
        $status = isset($http_response_header[0]) ? $http_response_header[0] : '';
        if (!preg_match('#\s2\d\d\s#', $status)) {
            error_log("Updater::httpGet stream: {$url} -> {$status}");
            return null;
        }
        return $body;
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

        // A failed check (network blip, GitHub rate-limit, …) is cached too
        // — otherwise every /me would re-attempt the same failing call.
        // But: caching `null` for the full 6h TTL would hide the banner for
        // hours after a single transient blip. Use a much shorter TTL for
        // negative results so we retry quickly while still rate-limiting
        // ourselves.
        $negativeTtl = 300; // 5 min.

        if (is_file($cacheFile)) {
            $raw    = (string)@file_get_contents($cacheFile);
            $cached = $raw ? json_decode($raw, true) : null;
            if (is_array($cached) && isset($cached['checked_at'])) {
                $age      = $now - (int)$cached['checked_at'];
                $result   = $cached['result'] ?? null;
                $applyTtl = is_array($result) ? $ttlSeconds : $negativeTtl;
                if ($age < $applyTtl) {
                    return is_array($result) ? $result : null;
                }
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

        // Download ZIP to temp file. Routed through httpGet() so the
        // CA-bundle detection that fixes checkLatest() on misconfigured
        // hosts (Local Sites and similar) also applies here — otherwise
        // every release-zip download fails with the same opaque "Download
        // failed" message right after the user clicks Update now.
        // 120s timeout is generous: the zip is ~2 MB but shared hosts can
        // be slow, and GitHub redirects through codeload.github.com which
        // adds a handshake.
        $tmpZip = tempnam(sys_get_temp_dir(), 'fp_') . '.zip';
        $data   = $this->httpGet($zipUrl, '*/*', 120);
        if ($data === null) {
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
                $this->invalidateOpcache($dest);
            }
        }

        $zip->close();
        unlink($tmpZip);

        // Belt-and-braces opcache reset. Per-file `opcache_invalidate` calls
        // above cover every PHP file we just wrote, but `opcache_reset`
        // also nukes any stale entry for files we *deleted* in this update
        // (e.g. a class moved between releases). Without it, hosts running
        // with `opcache.validate_timestamps=0` would keep serving the old
        // bytecode for the autoloader's static classmap — fataling on
        // every "Class not found" for newly-added classes (the exact bug
        // 0.3.7 shipped). `clearstatcache` flushes the stat cache too.
        clearstatcache(true);
        if (function_exists('opcache_reset')) {
            @opcache_reset();
        }

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
            $this->invalidateOpcache($dest);
        }
    }

    /**
     * Drop the freshly-written file out of opcache so the next request
     * recompiles it instead of serving stale bytecode. No-op on hosts
     * without opcache (CLI, hardened production setups). The `@` on the
     * call silences "Zend OPcache API is restricted by 'restrict_api'"
     * warnings — some shared hosts disable invalidation from PHP code,
     * and we can't do anything about it from inside the request.
     */
    private function invalidateOpcache(string $absPath): void
    {
        if (!str_ends_with($absPath, '.php')) return;
        if (!function_exists('opcache_invalidate')) return;
        @opcache_invalidate($absPath, true);
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
