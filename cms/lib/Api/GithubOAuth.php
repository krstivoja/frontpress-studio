<?php

declare(strict_types=1);

namespace FrontPress\Api;

defined('FRONTPRESS_BOOT') || exit;

use FrontPress\GithubClient;

/**
 * Browser-facing OAuth flow handlers — kept separate from GithubController
 * (which serves the JSON API) so each file stays under the size budget.
 *
 * Flow recap:
 *   /admin/github/connect → 302 to GitHub → user authorizes → GitHub 302s
 *   to https://auth.frontpress.studio/callback (the Worker) → Worker swaps
 *   `code` for an access token (using the client_secret it alone holds)
 *   → 302 back to /admin/github/receive with `?token` & `?nonce`. We
 *   verify the nonce against session, fetch the username from GitHub
 *   /user to sanity-check the token, persist `{token, user, connected_at}`
 *   into `site/config.json:github`, and 302 to the SPA Backup screen.
 */
class GithubOAuth
{
    /** Public OAuth App client_id. Safe to ship — secret lives in the Worker. */
    private const CLIENT_ID = 'Ov23lilDV6woMm2p3mrv';
    private const PROXY_URL = 'https://auth.frontpress.studio/callback';
    private const SCOPE     = 'repo';

    /** @param array<string, mixed> $config */
    public static function start(array $config): void
    {
        if (empty($_SESSION['admin_user'])) {
            self::bounceToLogin();
        }

        // Nonce survives the round-trip via `state`; verified on return.
        $nonce = bin2hex(random_bytes(16));
        $_SESSION['github_nonce'] = $nonce;

        $scheme    = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host      = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $base      = (string)($GLOBALS['fp_base_path'] ?? '');
        $returnUrl = $scheme . '://' . $host . $base . '/admin/github/receive';

        // Standard (not URL-safe) base64 — the Worker decodes with atob().
        $state = base64_encode(json_encode([
            'returnUrl' => $returnUrl,
            'nonce'     => $nonce,
        ], JSON_UNESCAPED_SLASHES));

        $authorize = 'https://github.com/login/oauth/authorize?' . http_build_query([
            'client_id'    => self::CLIENT_ID,
            'redirect_uri' => self::PROXY_URL,
            'scope'        => self::SCOPE,
            'state'        => $state,
            'allow_signup' => 'false',
        ]);

        header('Location: ' . $authorize, true, 302);
        exit;
    }

    /** @param array<string, mixed> $config */
    public static function receive(array $config): void
    {
        if (empty($_SESSION['admin_user'])) {
            self::bounceToLogin();
        }

        $token = isset($_GET['token']) ? (string)$_GET['token'] : '';
        $nonce = isset($_GET['nonce']) ? (string)$_GET['nonce'] : '';
        $sent  = $_SESSION['github_nonce'] ?? null;

        // Always clear the pending nonce — single-use even on failure.
        unset($_SESSION['github_nonce']);

        if ($token === '' || $nonce === '' || !is_string($sent) || !hash_equals($sent, $nonce)) {
            self::redirectBack('error', 'invalid_state');
        }

        $verify = self::fetchUserVerbose($token);
        if (!$verify['ok']) {
            self::redirectBack('error', 'token_rejected:' . $verify['reason']);
        }
        $user = $verify['login'];

        /** @var \FrontPress\Config $cfg */
        $cfg  = $config['config'];
        $data = $cfg->all();
        $data['github'] = [
            'token'        => $token,
            'user'         => $user,
            'connected_at' => date(\DATE_ATOM),
        ];
        $cfg->save($data);

        ServiceFactory::audit($config)->record('github.connect', $user, ['ok' => true]);

        self::redirectBack('github', 'connected');
    }

    /** @return array{ok: bool, login?: string, reason?: string} */
    private static function fetchUserVerbose(string $token): array
    {
        $res = (new GithubClient($token))->get('/user');
        if (!$res['ok']) {
            return ['ok' => false, 'reason' => (string)($res['reason'] ?? 'unknown')];
        }
        $data = $res['data'] ?? null;
        if (!is_array($data) || empty($data['login'])) {
            return ['ok' => false, 'reason' => 'no_login'];
        }
        return ['ok' => true, 'login' => (string)$data['login']];
    }

    private static function bounceToLogin(): never
    {
        $base = (string)($GLOBALS['fp_base_path'] ?? '');
        header('Location: ' . $base . '/admin/#/login', true, 302);
        exit;
    }

    private static function redirectBack(string $key, string $value): never
    {
        $base = (string)($GLOBALS['fp_base_path'] ?? '');
        $back = $base . '/admin/#/backup?' . urlencode($key) . '=' . urlencode($value);
        header('Location: ' . $back, true, 302);
        exit;
    }
}
