<?php

declare(strict_types=1);

namespace FrontPress\Api;

defined('FRONTPRESS_BOOT') || exit;

use FrontPress\GithubClient;
use FrontPress\GithubPuller;
use FrontPress\GithubPusher;
use FrontPress\GithubSources;

/**
 * Handles the long-running GitHub sync operations (push and pull) and
 * their companion status-poll endpoints. Split from {@see GithubController}
 * so each file stays under the 300-line budget.
 */
class GithubSyncController
{
    /** @param array<string, mixed> $config */
    public static function pushStatus(array $config): void
    {
        $file = (string)$config['cacheDir'] . '/github-push-status.json';
        if (!is_file($file)) {
            \json_response(['ok' => true, 'active' => false]);
        }
        $raw  = (string)@file_get_contents($file);
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            \json_response(['ok' => true, 'active' => false]);
        }
        \json_response(['ok' => true, 'active' => true] + $data);
    }

    /** @param array<string, mixed> $config */
    public static function pullStatus(array $config): void
    {
        $file = (string)$config['cacheDir'] . '/github-pull-status.json';
        if (!is_file($file)) {
            \json_response(['ok' => true, 'active' => false]);
        }
        $raw  = (string)@file_get_contents($file);
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            \json_response(['ok' => true, 'active' => false]);
        }
        \json_response(['ok' => true, 'active' => true] + $data);
    }

    /** POST /admin/api/github/push — `{message?}` → atomic commit. */
    public static function push(array $config): void
    {
        $token = self::tokenOrAbort($config);
        /** @var \FrontPress\Config $cfg */
        $cfg = $config['config'];
        $gh  = (array)$cfg->get('github', []);
        $repo   = (string)($gh['repo']   ?? '');
        $branch = (string)($gh['branch'] ?? 'main');
        if ($repo === '' || !str_contains($repo, '/')) {
            \json_response(['ok' => false, 'error' => 'No repo selected'], 400);
        }
        [$owner, $name] = explode('/', $repo, 2);

        $picked = (array)($gh['sources'] ?? []);
        if (empty($picked)) {
            \json_response(['ok' => false, 'error' => 'No sources selected — tick at least one folder to push.'], 400);
        }

        $files = GithubSources::gather((string)$config['appRoot'], $picked);
        if (empty($files)) {
            \json_response(['ok' => false, 'error' => 'Selected sources are empty (nothing to push).'], 400);
        }

        $body    = Router::jsonBody();
        $message = trim((string)($body['message'] ?? ''));
        if ($message === '') {
            $message = 'Sync from FrontPress Studio at ' . date(\DATE_ATOM);
        }

        $statusFile = (string)$config['cacheDir'] . '/github-push-status.json';
        @unlink($statusFile);
        session_write_close();

        $pusher = new GithubPusher(new GithubClient($token), $owner, $name, $branch);
        $res    = $pusher->push($files, $message, function (int $done, int $total, string $current) use ($statusFile): void {
            @file_put_contents($statusFile, (string)json_encode([
                'done'    => $done,
                'total'   => $total,
                'current' => $current,
            ]));
        });

        @unlink($statusFile);

        if (!$res['ok']) {
            ServiceFactory::audit($config)->record('github.push', $repo, ['ok' => false, 'error' => $res['error'] ?? '']);
            $status = (int)($res['status'] ?? 502);
            \json_response(['ok' => false, 'error' => $res['error'] ?? 'Push failed'], $status);
        }

        $data = $cfg->all();
        $data['github']['last_pushed_at']     = date(\DATE_ATOM);
        $data['github']['last_pushed_commit'] = $res['commit'];
        $cfg->save($data);

        ServiceFactory::audit($config)->record('github.push', $repo, [
            'ok'      => true,
            'commit'  => $res['commit'],
            'files'   => $res['files'],
            'sources' => $picked,
        ]);

        \json_response($res);
    }

    /** POST /admin/api/github/pull — download repo → overwrite site/. */
    public static function pull(array $config): void
    {
        $token = self::tokenOrAbort($config);
        /** @var \FrontPress\Config $cfg */
        $cfg    = $config['config'];
        $gh     = (array)$cfg->get('github', []);
        $repo   = (string)($gh['repo']   ?? '');
        $branch = (string)($gh['branch'] ?? 'main');
        if ($repo === '' || !str_contains($repo, '/')) {
            \json_response(['ok' => false, 'error' => 'No repo selected'], 400);
        }
        [$owner, $name] = explode('/', $repo, 2);

        $body       = Router::jsonBody();
        $rawSources = $body['sources'] ?? null;
        // If caller sends no sources, mirror what's selected for push.
        $picked = GithubSources::sanitizeKeys(
            is_array($rawSources) ? $rawSources : (array)($gh['sources'] ?? []),
        );

        $statusFile = (string)$config['cacheDir'] . '/github-pull-status.json';
        @unlink($statusFile);
        session_write_close();

        $puller = new GithubPuller(new GithubClient($token), $owner, $name, $branch);
        $res    = $puller->pull(
            (string)$config['appRoot'],
            $picked,
            function (int $done, int $total, string $current) use ($statusFile): void {
                @file_put_contents($statusFile, (string)json_encode([
                    'done'    => $done,
                    'total'   => $total,
                    'current' => $current,
                ]));
            },
        );

        @unlink($statusFile);

        if (!$res['ok']) {
            ServiceFactory::audit($config)->record('github.pull', $repo, ['ok' => false, 'error' => $res['error'] ?? '']);
            \json_response(['ok' => false, 'error' => $res['error'] ?? 'Restore failed'], (int)($res['status'] ?? 502));
        }

        ServiceFactory::audit($config)->record('github.pull', $repo, [
            'ok'        => true,
            'commit'    => $res['commit'],
            'files'     => $res['files'],
            'truncated' => $res['truncated'] ?? false,
        ]);

        \json_response($res);
    }

    /** @param array<string, mixed> $config */
    private static function tokenOrAbort(array $config): string
    {
        /** @var \FrontPress\Config $cfg */
        $cfg   = $config['config'];
        $gh    = (array)$cfg->get('github', []);
        $token = (string)($gh['token'] ?? '');
        if ($token === '') {
            \json_response(['ok' => false, 'error' => 'Not connected'], 400);
        }
        return $token;
    }
}
