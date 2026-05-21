<?php

declare(strict_types=1);

namespace FrontPress\Api;

defined('FRONTPRESS_BOOT') || exit;

use FrontPress\Env;
use FrontPress\Updater;

class AuthController
{
    /** @param array<string, mixed> $config */
    public static function me(array $config = []): void
    {
        $user = $_SESSION['admin_user'] ?? null;

        // Update-check info is only included for authenticated sessions —
        // calling GitHub's API on every unauthenticated /me probe would
        // burn rate limit, and an attacker probing /me shouldn't get free
        // version intel either. The result is cached on disk for 6h so an
        // authenticated user reloading the admin shell every few seconds
        // doesn't generate one GitHub call per reload.
        $update = null;
        if ($user !== null && isset($config['appRoot'])) {
            $updater = new Updater((string)$config['appRoot']);
            $current = $updater->currentVersion();
            $latest  = $updater->cachedCheckLatest();
            $update  = [
                'current'   => $current,
                'latest'    => $latest['version'] ?? null,
                'available' => $latest
                    ? version_compare($latest['version'], $current, '>')
                    : false,
                // Trimmed: full release notes can be megabytes. The sidebar
                // banner only needs enough to identify the release.
                'notes'     => $latest ? mb_substr((string)($latest['notes'] ?? ''), 0, 400) : '',
            ];
        }

        \json_response([
            'ok'                => true,
            'authenticated'     => $user !== null,
            'user'              => $user,
            'csrf'              => \csrf_token(),
            // Surfaced so the admin shell can render the "rotate the default
            // password" banner; safe to expose pre-auth since it's a boolean,
            // not a credential.
            'passwordIsDefault' => Env::isPasswordDefault(),
            // Null for unauthenticated probes (see above).
            'update'            => $update,
        ]);
    }

    /** @param array<string, mixed> $config */
    public static function login(string $method, array $config): void
    {
        if ($method !== 'POST') {
            \json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
        }
        $body     = Router::jsonBody();
        $username = trim((string)($body['username'] ?? ''));
        $password = (string)($body['password'] ?? '');

        if ($username === '' || $password === '') {
            \json_response(['ok' => false, 'error' => 'Fill in both the username and password.'], 400);
        }

        $ok = $username === $config['ADMIN_USER']
            && \passwordCheck($password, $config['ADMIN_PASS_HASH'] ?? '');

        if (!$ok) {
            // Don't reveal which field is wrong — prevents username enumeration
            // and matches the conversational form in Yifrah Ch. 7.
            \json_response(['ok' => false, 'error' => "The username or password doesn't match. Try again, or check your config.php credentials."], 401);
        }

        session_regenerate_id(true);
        $_SESSION['admin_user'] = $config['ADMIN_USER'];
        \json_response([
            'ok'   => true,
            'user' => $_SESSION['admin_user'],
            'csrf' => \csrf_token(),
        ]);
    }

    /**
     * Update admin credentials — username and/or password. Requires an
     * authenticated session, CSRF, and the current password as a second
     * factor (so a hijacked session can't quietly lock the operator out
     * by rotating the username out from under them).
     *
     * Body shape:
     *   {
     *     current:  string,   // required — current password
     *     username: string?,  // optional — new username (omit/empty to leave alone)
     *     next:     string?,  // optional — new password (omit/empty to leave alone)
     *   }
     *
     * At least one of `username` / `next` must differ from the current
     * value, otherwise we 400 — saves the user from a no-op write.
     *
     * The route is still mounted at `POST /admin/api/password` for
     * backwards compatibility — the SPA's old client code just sent
     * `{current, next}`. The username field is additive.
     *
     * @param array<string, mixed> $config
     */
    public static function password(string $method, array $config): void
    {
        if ($method !== 'POST') {
            \json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
        }
        Router::requireAuth();
        Router::requireCsrf();

        $body         = Router::jsonBody();
        $current      = (string)($body['current'] ?? '');
        $nextPassword = (string)($body['next'] ?? '');
        $nextUsername = trim((string)($body['username'] ?? ''));

        $currentUsername = (string)($config['ADMIN_USER'] ?? '');
        $usernameChange  = $nextUsername !== '' && $nextUsername !== $currentUsername;
        $passwordChange  = $nextPassword !== '';

        if (!$usernameChange && !$passwordChange) {
            \json_response(['ok' => false, 'error' => 'Nothing to change — set a new username or a new password.'], 400);
        }

        if ($usernameChange) {
            if (strlen($nextUsername) < 3) {
                \json_response(['ok' => false, 'error' => 'Username should be at least 3 characters.'], 400);
            }
            if (strlen($nextUsername) > 64) {
                \json_response(['ok' => false, 'error' => 'Username is too long (64 characters max).'], 400);
            }
            // Conservative allow-list — letters, digits, underscore, dot,
            // hyphen. Keeps shell-escaping and URL-encoding concerns out of
            // the credential surface.
            if (!preg_match('/^[A-Za-z0-9._-]+$/', $nextUsername)) {
                \json_response(['ok' => false, 'error' => 'Username can use letters, digits, dot, underscore, and hyphen only.'], 400);
            }
        }

        if ($passwordChange) {
            if (strlen($nextPassword) < 8) {
                \json_response(['ok' => false, 'error' => 'New password should be at least 8 characters.'], 400);
            }
            // Tiny blocklist of obvious defaults. The client surfaces these as
            // a checklist item; the server enforces the same list so curl
            // users can't bypass the UI. Kept short on purpose — full
            // breach-corpus checks belong in a separate HIBP-style integration.
            $blocked = ['admin', 'password', '12345678', 'qwertyui', 'iloveyou', 'changeme', 'admin123', 'fpspass', 'fpsadmin'];
            if (in_array(strtolower($nextPassword), $blocked, true)) {
                \json_response(['ok' => false, 'error' => 'Pick something less common than that.'], 400);
            }
        }

        // Second-factor gate. Same hash check for both credential changes —
        // changing username without the password would otherwise let a
        // hijacked session change who can log in.
        $hash = (string)($config['ADMIN_PASS_HASH'] ?? '');
        if (!\passwordCheck($current, $hash)) {
            \json_response(['ok' => false, 'error' => 'The current password doesn\'t match.'], 401);
        }

        $envFile = (string)($config['ENV_FILE'] ?? '');
        if ($envFile === '') {
            \json_response(['ok' => false, 'error' => 'Config file path not configured.'], 500);
        }

        if ($usernameChange && !Env::changeUsername($envFile, $nextUsername)) {
            \json_response(['ok' => false, 'error' => 'Could not write to config.php. Check file permissions.'], 500);
        }
        if ($passwordChange && !Env::changePassword($envFile, $nextPassword)) {
            \json_response(['ok' => false, 'error' => 'Could not write to config.php. Check file permissions.'], 500);
        }

        // Keep the current session valid across the change. Without this,
        // the next `Router::requireAuth()` call would still succeed (the
        // session value never changes mid-request), but the SPA's `/me`
        // re-poll would show the old username and confuse the user.
        if ($usernameChange) {
            $_SESSION['admin_user'] = $nextUsername;
        }

        \json_response([
            'ok'       => true,
            'user'     => $_SESSION['admin_user'] ?? $currentUsername,
            'username' => $usernameChange,
            'password' => $passwordChange,
        ]);
    }

    public static function logout(string $method): void
    {
        if ($method !== 'POST') {
            \json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
        }
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        \json_response(['ok' => true]);
    }
}
