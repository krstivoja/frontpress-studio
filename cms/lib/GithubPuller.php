<?php

declare(strict_types=1);

namespace FrontPress;

defined('FRONTPRESS_BOOT') || exit;

/**
 * Restores a flat tree of files from a GitHub repo into site/.
 * Only paths that match known GithubSources prefixes are written;
 * config.json is always skipped (it was redacted on push — token gone).
 *
 * Full-overwrite: every blob in the repo under the known prefixes is
 * downloaded and written, creating directories as needed. Files that
 * exist locally but are absent from the repo are left untouched (not
 * deleted). A future "selective" mode can layer on top of this.
 */
class GithubPuller
{
    public function __construct(
        private GithubClient $client,
        private string $owner,
        private string $repo,
        private string $branch,
    ) {}

    /**
     * @param string[]                             $picked     Source keys to restore (content/themes/uploads).
     *                                                         Empty = all non-config sources.
     * @param (callable(int,int,string):void)|null $onProgress Called after each write: (done, total, path).
     * @return array{ok: bool, files?: int, commit?: string, truncated?: bool, error?: string, status?: int}
     */
    public function pull(string $appRoot, array $picked = [], ?callable $onProgress = null): array
    {
        $siteRoot = rtrim($appRoot, '/') . '/site';

        // 1. Branch tip → commit SHA.
        $refRes = $this->client->get("/repos/{$this->owner}/{$this->repo}/git/ref/heads/{$this->branch}");
        if (!$refRes['ok']) {
            return ['ok' => false, 'status' => self::httpStatus($refRes), 'error' => $this->humanRefError($refRes)];
        }
        $commitSha = (string)($refRes['data']['object']['sha'] ?? '');
        if ($commitSha === '') {
            return ['ok' => false, 'error' => 'Could not read branch tip SHA.'];
        }

        // 2. Commit → tree SHA.
        $commitRes = $this->client->get("/repos/{$this->owner}/{$this->repo}/git/commits/{$commitSha}");
        if (!$commitRes['ok']) {
            return [
                'ok'     => false,
                'status' => self::httpStatus($commitRes),
                'error'  => 'Could not read commit: ' . ($commitRes['reason'] ?? 'unknown'),
            ];
        }
        $treeSha = (string)($commitRes['data']['tree']['sha'] ?? '');
        if ($treeSha === '') {
            return ['ok' => false, 'error' => 'Could not read tree SHA from commit.'];
        }

        // 3. Recursive tree (up to 100 000 entries; GitHub truncates beyond that).
        $treeRes = $this->client->get(
            "/repos/{$this->owner}/{$this->repo}/git/trees/{$treeSha}?recursive=1",
        );
        if (!$treeRes['ok']) {
            return [
                'ok'     => false,
                'status' => self::httpStatus($treeRes),
                'error'  => 'Could not read repo tree: ' . ($treeRes['reason'] ?? 'unknown'),
            ];
        }
        $truncated = (bool)($treeRes['data']['truncated'] ?? false);
        $items     = is_array($treeRes['data']['tree'] ?? null) ? $treeRes['data']['tree'] : [];

        // 4. Keep only blobs under selected source prefixes; config always excluded.
        $restorable = array_filter(GithubSources::ITEMS, fn(array $s) => $s['key'] !== 'config');
        if (!empty($picked)) {
            $clean      = GithubSources::sanitizeKeys($picked);
            $restorable = array_filter($restorable, fn(array $s) => in_array($s['key'], $clean, true));
        }
        $allowedPrefixes = array_map(
            fn(array $s) => $s['type'] === 'dir' ? $s['path'] . '/' : $s['path'],
            $restorable,
        );
        $blobs = array_values(array_filter($items, function (array $item) use ($allowedPrefixes): bool {
            if (($item['type'] ?? '') !== 'blob') return false;
            $path = (string)($item['path'] ?? '');
            foreach ($allowedPrefixes as $prefix) {
                if (str_starts_with($path, $prefix)) return true;
            }
            return false;
        }));

        if (empty($blobs)) {
            return [
                'ok'    => false,
                'error' => 'No content found under the expected folders (content/, themes/, uploads/) in this repo.',
            ];
        }

        $total   = count($blobs);
        $written = 0;

        foreach ($blobs as $item) {
            $remotePath = (string)($item['path'] ?? '');
            $blobSha    = (string)($item['sha']  ?? '');

            // Path-traversal guard: ensure the resolved target stays inside site/.
            $localPath = $siteRoot . '/' . $remotePath;
            if (!str_starts_with(str_replace('\\', '/', $localPath), $siteRoot . '/')) {
                continue;
            }

            $blobRes = $this->client->get(
                "/repos/{$this->owner}/{$this->repo}/git/blobs/{$blobSha}",
            );
            if (!$blobRes['ok']) {
                return [
                    'ok'     => false,
                    'status' => self::httpStatus($blobRes),
                    'error'  => "Couldn't download {$remotePath}: " . ($blobRes['reason'] ?? 'unknown'),
                ];
            }

            $encoding = (string)($blobRes['data']['encoding'] ?? 'base64');
            $raw      = (string)($blobRes['data']['content']  ?? '');
            // GitHub wraps base64 at 60 chars with \n — strip before decode.
            $content  = $encoding === 'base64'
                ? base64_decode(str_replace(["\r", "\n"], '', $raw), true)
                : $raw;
            if ($content === false) {
                return ['ok' => false, 'error' => "Couldn't decode {$remotePath} — blob may be corrupt."];
            }

            $dir = dirname($localPath);
            if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
                return ['ok' => false, 'error' => "Couldn't create directory for {$remotePath}."];
            }
            if (file_put_contents($localPath, $content) === false) {
                return ['ok' => false, 'error' => "Couldn't write {$remotePath} to disk."];
            }

            $written++;
            if ($onProgress) $onProgress($written, $total, $remotePath);
        }

        return ['ok' => true, 'files' => $written, 'commit' => $commitSha, 'truncated' => $truncated];
    }

    private static function httpStatus(array $res): int
    {
        $status = (int)($res['status'] ?? 0);
        return $status >= 400 ? $status : 502;
    }

    private function humanRefError(array $res): string
    {
        $status = (int)($res['status'] ?? 0);
        if ($status === 404) {
            return "Branch `{$this->branch}` not found in {$this->owner}/{$this->repo}.";
        }
        if ($status === 401 || $status === 403) {
            return 'GitHub denied access — disconnect and reconnect to refresh the token.';
        }
        return 'Could not read branch tip: ' . ($res['reason'] ?? 'unknown');
    }
}
