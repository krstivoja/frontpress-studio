<?php

declare(strict_types=1);

namespace FrontPress\Api;

defined('FRONTPRESS_BOOT') || exit;

use FrontPress\GithubClient;
use FrontPress\GithubSources;

/**
 * GitHub JSON API — status, repo list & selection, sources, disconnect.
 * Long-running sync operations (push/pull) live in {@see GithubSyncController}.
 * The browser-facing OAuth flow lives in {@see GithubOAuth}.
 */
class GithubController
{
    /**
     * @param string[]             $rest
     * @param array<string, mixed> $config
     */
    public static function handle(array $rest, string $method, array $config): void
    {
        $route = $method . ' ' . ($rest[0] ?? '');
        Router::requireAuth();
        if ($method === 'POST') Router::requireCsrf();

        switch ($route) {
            case 'GET status':        self::status($config);                   return;
            case 'POST disconnect':   self::disconnect($config);               return;
            case 'GET repos':         self::repos($config);                    return;
            case 'POST select-repo':  self::selectRepo($config);              return;
            case 'GET sources':       self::sources($config);                  return;
            case 'POST save-sources': self::saveSources($config);              return;
            case 'POST push':         GithubSyncController::push($config);    return;
            case 'POST pull':         GithubSyncController::pull($config);    return;
            case 'GET push-status':
                session_write_close();
                GithubSyncController::pushStatus($config);
                return;
            case 'GET pull-status':
                session_write_close();
                GithubSyncController::pullStatus($config);
                return;
        }

        \json_response(['ok' => false, 'error' => 'Unknown github endpoint'], 404);
    }

    /** @param array<string, mixed> $config */
    private static function status(array $config): void
    {
        /** @var \FrontPress\Config $cfg */
        $cfg = $config['config'];
        $gh  = (array)$cfg->get('github', []);
        \json_response([
            'ok'              => true,
            'connected'       => !empty($gh['token']),
            'user'            => isset($gh['user'])               ? (string)$gh['user']               : null,
            'repo'            => isset($gh['repo'])               ? (string)$gh['repo']               : null,
            'branch'          => isset($gh['branch'])             ? (string)$gh['branch']             : null,
            'last_pushed_at'  => isset($gh['last_pushed_at'])     ? (string)$gh['last_pushed_at']     : null,
            'last_pushed_sha' => isset($gh['last_pushed_commit']) ? (string)$gh['last_pushed_commit'] : null,
        ]);
    }

    /** @param array<string, mixed> $config */
    private static function disconnect(array $config): void
    {
        /** @var \FrontPress\Config $cfg */
        $cfg  = $config['config'];
        $data = $cfg->all();
        $prev = (array)($data['github'] ?? []);
        unset($data['github']);
        $cfg->save($data);

        ServiceFactory::audit($config)->record('github.disconnect', (string)($prev['user'] ?? ''), []);

        // We deliberately don't call GitHub's revoke-grant API — the user
        // can do that from github.com/settings/applications if they want
        // the OAuth grant fully removed. Disconnecting locally just drops
        // our copy of the token so further pushes fail closed.
        \json_response(['ok' => true]);
    }

    /**
     * GET /admin/api/github/repos — trimmed /user/repos, newest first.
     * @param array<string, mixed> $config
     */
    private static function repos(array $config): void
    {
        /** @var \FrontPress\Config $cfg */
        $cfg   = $config['config'];
        $gh    = (array)$cfg->get('github', []);
        $token = (string)($gh['token'] ?? '');
        if ($token === '') {
            \json_response(['ok' => false, 'error' => 'Not connected'], 400);
        }

        $client = new GithubClient($token);
        $repos  = [];
        for ($page = 1; $page <= 10; $page++) {
            $res = $client->get('/user/repos?per_page=100&sort=updated'
                . '&affiliation=owner,collaborator,organization_member'
                . '&page=' . $page);
            if (!$res['ok']) {
                \json_response([
                    'ok'    => false,
                    'error' => 'GitHub call failed (' . ($res['reason'] ?? 'unknown') . ')',
                ], 502);
            }
            $raw = is_array($res['data']) ? $res['data'] : [];
            foreach ($raw as $r) {
                if (!is_array($r) || empty($r['full_name'])) continue;
                $repos[] = [
                    'full_name'      => (string)$r['full_name'],
                    'default_branch' => (string)($r['default_branch'] ?? 'main'),
                    'private'        => (bool)($r['private'] ?? false),
                ];
            }
            if (count($raw) < 100) break;
        }
        \json_response(['ok' => true, 'repos' => $repos]);
    }

    /** POST /admin/api/github/select-repo — `{full_name, branch?}` → config. */
    private static function selectRepo(array $config): void
    {
        $body   = Router::jsonBody();
        $full   = trim((string)($body['full_name'] ?? ''));
        $branch = trim((string)($body['branch'] ?? ''));
        if (!preg_match('#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#', $full)) {
            \json_response(['ok' => false, 'error' => 'Invalid repo name'], 400);
        }

        /** @var \FrontPress\Config $cfg */
        $cfg  = $config['config'];
        $data = $cfg->all();
        $gh   = (array)($data['github'] ?? []);
        if (empty($gh['token'])) {
            \json_response(['ok' => false, 'error' => 'Not connected'], 400);
        }
        $gh['repo']     = $full;
        $gh['branch']   = $branch !== '' ? $branch : 'main';
        $data['github'] = $gh;
        $cfg->save($data);

        ServiceFactory::audit($config)->record('github.select_repo', $full, ['branch' => $gh['branch']]);

        \json_response(['ok' => true, 'repo' => $full, 'branch' => $gh['branch']]);
    }

    /** @param array<string, mixed> $config */
    private static function sources(array $config): void
    {
        /** @var \FrontPress\Config $cfg */
        $cfg    = $config['config'];
        $gh     = (array)$cfg->get('github', []);
        $picked = (array)($gh['sources'] ?? []);
        \json_response([
            'ok'      => true,
            'sources' => GithubSources::listForUi((string)$config['appRoot'], $picked),
        ]);
    }

    /** @param array<string, mixed> $config */
    private static function saveSources(array $config): void
    {
        $body = Router::jsonBody();
        $raw  = $body['sources'] ?? [];
        if (!is_array($raw)) {
            \json_response(['ok' => false, 'error' => 'sources must be an array'], 400);
        }
        $clean = GithubSources::sanitizeKeys($raw);

        /** @var \FrontPress\Config $cfg */
        $cfg  = $config['config'];
        $data = $cfg->all();
        $data['github']            = (array)($data['github'] ?? []);
        $data['github']['sources'] = $clean;
        $cfg->save($data);

        \json_response(['ok' => true, 'sources' => $clean]);
    }
}
