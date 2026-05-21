# Updates

FrontPress Studio updates itself in-place from your GitHub Releases. No FTP, no zip-and-upload.

## Update from the admin

1. **Settings → Updates**.
2. If there's a newer release tagged on GitHub, you'll see *"Version X.Y.Z available"* with the changelog excerpt.
3. Click **Install update**.

What happens:

1. The new release zip is downloaded from `github.com/krstivoja/frontpress-studio/releases/download/<tag>/frontpress-studio-<version>.zip` to `site/cache/updates/`.
2. SHA-256 is verified against the release manifest.
3. A manifest of files-to-replace is computed (everything under `cms/`, `admin/`, `bootstrap.php`, `index.php`, `admin.php`, `.htaccess` — *not* `site/` or `config.php`).
4. Files are atomically replaced via rename-aside-then-delete: each file is written next to its target as `.new`, then renamed over the original. If any step fails midway, the partial state is rolled back.
5. `cms/VERSION` updates last, so a half-applied update keeps the old version number until everything's swapped in.
6. Twig cache cleared, page cache cleared.
7. Page reloads. New version active.

## What's preserved

`site/` is **never touched**. That means:

- All your content (`site/content/`).
- All your uploads (`site/uploads/`).
- All your installed themes (`site/themes/`).
- Your site config (`site/config.json`).
- Your Twig cache (`site/cache/twig/` — but it gets cleared at the end of the update).

`config.php` is also preserved — your admin credentials and `APP_ENV` survive the update.

## What gets replaced

Everything under:

- `cms/` — framework code, services, controllers, vendor.
- `admin/` — built React bundle.
- `bootstrap.php`, `index.php`, `admin.php`, `router.php`, `.htaccess` — entry points.

If you've hand-edited any of these, your changes are overwritten. Don't.

## Manual update (when in-admin can't reach GitHub)

If the admin host can't reach `api.github.com` or download from `github.com/releases/`:

1. Download the release zip on a machine that can.
2. Unzip on a workstation.
3. SFTP / SCP the contents over your existing install, replacing `cms/`, `admin/`, and the root entry-point PHP files.
4. Do **not** copy `config.php` or `site/` from the unpacked release — they're skeletons. Keep yours.
5. Visit `/admin/` → log in → **Settings → Cache** → Clear all.

## Rolling back

Take a **Full backup** before any update (Backup screen → Full backup). If the update breaks something:

1. Restore the backup ZIP through the Restore tab.
2. The framework code reverts to the previous version.
3. Your content survives because the previous backup snapshot included it.

For higher-frequency safety, set up a cron to download a Full backup nightly. See [Backups feature](../features/backups.md).

## Update channels

There's only one channel today — whatever's tagged on GitHub. No beta / preview branches. If you want to track a specific commit instead of a tag, source install (see [Quick start](01-quick-start.md)).
