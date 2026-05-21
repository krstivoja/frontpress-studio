# Production hardening

The defaults ship friendly so a first-time install works in one click. Before you point a real domain at it, walk through this list.

## 1. Rotate the admin password

Two ways:

**Through the admin** (after first login):

- **Settings → Security** → current password = `fpspass` → set a new one → save.
- The "Set a strong admin password" banner disappears.

**Pre-install, no plaintext window**:

Generate the hash yourself and write it directly to `config.php`:

```bash
php -r "echo password_hash('your-real-password', PASSWORD_BCRYPT);"
```

```php
define('FPS_ADMIN_USER',      'youruser');
define('FPS_ADMIN_PASS_HASH', '$2y$12$…');   // replace with the generated hash
```

With `FPS_ADMIN_PASS_HASH` set, the auto-hash step is skipped. The default `fpspass` plaintext never touches disk.

## 2. Set `APP_ENV=prod`

Open `config.php` and set:

```php
define('APP_ENV', 'prod');
```

What changes:

- **SCSS auto-compile is skipped on every public request.** Deploy with `style.css` already built. (Visit `/` locally with `APP_ENV=dev` once before zipping, or run your own SCSS pipeline.)
- **Twig auto-reload off.** Compiled templates land in `site/cache/twig/` and stick until you clear the cache.
- **Inline error output suppressed.** Errors still log to PHP's `error_log`; they just don't render into responses.

## 3. Lock down session cookies

The framework already sets `HttpOnly`, `SameSite=Strict`, `Path=/`. You should also serve over HTTPS so the `Secure` flag applies — most hosts terminate TLS automatically when you point a domain at them; if yours doesn't, force HTTPS in `.htaccess`:

```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
```

## 4. Protect `config.php` and `bootstrap.php`

The shipped `.htaccess` blocks direct HTTP access to:

- `cms/` — framework code
- `site/` — content + cache + themes
- `bootstrap.php`, `config.php`, `router.php`, `.env*`

If you're on nginx, replicate these denies in your server block. Anything other than `index.php`, `admin.php`, `admin/assets/*`, `assets/*` (theme assets), `uploads/*` (media) should 404.

## 5. File permissions

```bash
find . -type d -exec chmod 755 {} \;
find . -type f -exec chmod 644 {} \;
```

`config.php` should be writable by the PHP user *only* if you want the in-admin password rotation to work (it rewrites the file). If you'd rather make `config.php` read-only after setting the hash, you can — the admin will surface an error if a write fails, but auth still works.

## 6. Backups before going live

**Backup → Full backup** under the admin downloads everything — content, uploads, settings, the active theme — as a single ZIP. Take one before changing anything you care about.

For automated off-site backups, point cron at the same flow:

```bash
curl -u user:hashedpass https://your-domain/admin/api/backup/full -o /backup-path/$(date +%F).zip
```

Or just `tar` the `site/` directory.

## 7. CSP (optional, recommended)

Send a Content-Security-Policy header from `.htaccess` or nginx. A starting point that's compatible with the admin (Monaco needs `'unsafe-inline'` for its worker boot):

```apache
Header set Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' data:; worker-src 'self' blob:; frame-src 'self';"
```

Tighten further if you're not using the Theme Builder (drop the `cdn.jsdelivr.net` allowance).

## 8. Disable user-facing error pages

Already off in `prod` mode. If you want to be defensive in `dev` too, add to `.htaccess`:

```apache
php_value display_errors 0
php_value log_errors 1
```
