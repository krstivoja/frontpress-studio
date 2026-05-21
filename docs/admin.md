---
title: Admin
layout: default
---

# Admin

* TOC
{:toc}

Visit `/admin/` in a browser.

## Setting the password

The framework ships with a `config.php` carrying a friendly default — username `fpsadmin`, password `fpspass`, already pre-hashed:

```php
define('FPS_ADMIN_USER',      getenv('FPS_ADMIN_USER') ?: 'fpsadmin');
define('FPS_ADMIN_PASS_HASH', '$2y$12$Se9J1HL9cltJyftHLaykGuP8pidNbtds0WR02Vl2JyUGNfJaQe7Le');
```

You sign in once, get nagged by a persistent "Set a strong admin password" banner, and rotate the password under **Settings → Security**.

> **Upgrading from a pre-rename install?** Legacy `MD_*` constants in `config.php` are still read silently — the framework prefers `FPS_*` but falls back to `MD_*` if only that's defined. The first config rewrite (password rotate, username change) migrates the affected lines to `FPS_*` automatically. No action required.

### Plaintext shortcut (optional)

If you'd rather pick the initial password yourself before first login, swap the hash line in `config.php` for a plaintext `FPS_ADMIN_PASS`:

```php
define('FPS_ADMIN_PASS', 'pickapassword');
```

On the first request to `/admin/`, the plaintext is bcrypt-hashed and `config.php` is rewritten atomically to `define('FPS_ADMIN_PASS_HASH', '…')` (the plaintext line is removed). Subsequent requests see only the hash. `FPS_ADMIN_PASS_HASH` wins if both are present.

### Production: hash from day one

To skip the auto-hash window entirely (the seconds-to-minutes between unzip and first `/admin/` hit, when plaintext would sit on disk), generate the hash yourself and put it directly in `config.php`:

```bash
php -r "echo password_hash('yourpassword', PASSWORD_BCRYPT);"
```

```php
define('FPS_ADMIN_PASS_HASH', '$2y$12$...');
```

### If `config.php` isn't writable

If the web server can't rewrite `config.php` (read-only filesystem, wrong file owner), the in-memory hash still works for the current request and login succeeds — but the next request will see the plaintext again and re-hash it. The error is logged via `error_log()`. Fix file permissions or set `FPS_ADMIN_PASS_HASH` directly to break the cycle.

### First-run banner

When the active password still verifies against a known shipped default (current: `fpspass`; legacy: `admin`), the admin shell renders a persistent banner across the top of every screen:

> Set a strong admin password to finish setup. **Open Security settings**

It does not dismiss — the only way to clear it is to rotate the password under **Settings → Security**. The check loops `password_verify(<candidate>, $ADMIN_PASS_HASH)` over the shipped-defaults list in [`FrontPress\Env::isPasswordDefault()`](app/cms/lib/Env.php), surfaced via `/admin/api/me` as `passwordIsDefault`. A custom password that happens to match one of those values triggers the banner — that's intentional; you should pick something else.

### Changing the password from the admin

**Settings → Security** has a three-field form: current password, new password, confirm. On submit:

- The endpoint (`POST /admin/api/password`) requires an authenticated session, CSRF, and the current password — a hijacked session can't quietly rotate credentials without the second factor.
- New password must be at least 8 characters; literal `admin` is rejected.
- `.env` is atomically rewritten so only the hash is on disk.
- The auth context refreshes, so the first-run banner disappears in the same turn.

## Admin features

- **Three-column layout** — primary nav (Folders / Media / Settings / Backup) on the left, a sibling-list column in the middle when a folder is open, and the active screen on the right
- **Pages list** — all content files, with live/draft status and folder filter. First-run state inside a folder pitches the feature ("A page is a Markdown file stored under `site/content/`…") and offers a single **Create your first page** CTA instead of an empty table.
- **Editor** — Toast UI Editor v3 with three views: **WYSIWYG**, **Markdown** (source + preview split), and **HTML** (CodeMirror 6 with HTML syntax highlighting, line numbers, bracket matching, tab-indenting). Toggle via the segmented control above the editor. Toast UI's built-in bottom-right switcher is hidden — our toggle is the single source of truth. Storage is always markdown: in HTML view we round-trip through Toast UI's HTML→Markdown converter on save, so what lands in the `.md` file is markdown regardless of which surface you composed in.
- **Sibling switcher** — when editing, the middle column lists every page in the same folder with a search filter, so you can hop between files without going back to the list. Unsaved-change prompt appears before switching.
- **Editor sidebar** — Save / Preview / Slug / **Featured image** / Status / Template / Delete live in a right sidebar; the centre pane is title + SunEditor only. The **Featured image** field is a built-in default — pick from the global library or upload a new one via [`MediaPicker`](app/src/components/MediaPicker.jsx); the URL is stored at `meta.image` in front matter (Remove deletes the key entirely, so the saved file doesn't carry an empty `image:` line). Starter `post` templates render it above the title; archive lists also expose it as `post.image`. The **Template** dropdown is a per-post override that writes to `meta.template` (front-matter `template: <name>`); the list is sourced from the active theme via `GET /admin/api/themes/templates` ([`ThemeService::listTemplates`](app/cms/lib/ThemeService.php)), excluding partials (`_*`) and system templates (`archive`, `taxonomy`, `feed`, `404`). Selecting **Default** clears the key so the public renderer falls back to the route-type default (`post.twig` / `page.twig`). The override is also validated server-side via [`ThemeService::resolveTemplate`](app/cms/lib/ThemeService.php). Custom sub-fields defined in **Settings → Manage fields** render below Status when their parent taxonomy's `Applies to folders` matches the page's folder. **Each sub-field's `Name` is the front-matter key** (e.g. a sub-field named `image` writes to `meta.image`), so a single taxonomy can group several fields that share post-type targeting. The **Allow multiple values** toggle is per-field on List-of-choices fields; the **Hide from sidebar** toggle suppresses a field from the editor while keeping it in config.
- **Image uploads** — toolbar button opens a two-tab picker: **Library** (grid of every image already in `site/uploads/`, click to insert) and **Upload** (drag-and-drop or click-to-pick a new file, auto-inserts on success). Drag-drop / paste straight onto the editor still works and uploads via [`addImageBlobHook`](app/src/screens/PageEditor.jsx).
- **Create / edit / delete** any `.md` file
- **Media library** — shared `site/uploads/` pool with previews, alt/caption sidecars; per-post uploads land in `site/content/<pagePath>/` next to the post's `.md` file. Empty state shows a labelled dropzone with allowed types (JPG · PNG · GIF · WebP · SVG · PDF · ZIP) and the live `uploads.max_mb` limit; dropping files there hands them straight to the upload dialog so the first upload is a single gesture.
- **Settings** — site name, base path, taxonomies, upload limits
- **Themes** — list installed themes, activate one, delete non-active ones, install from a starter, **download any theme as a `.zip`**, and **drag-and-drop a theme `.zip` to install or replace**. The upload flow round-trips: download a theme, edit it locally, drop the updated zip back to swap it in (the archive's top-level folder name is the slug; matching slugs replace, new slugs install fresh). Validation, atomic rename-aside, and rollback on failure live in [`ThemeArchiver`](app/cms/lib/ThemeArchiver.php) — extracted from `ThemeService` so it can be unit-tested in isolation. Each theme/starter card shows an **engine badge** (`twig` / `php`) sourced from `theme.json:engine` or auto-detected by [`ThemeService::detectEngine`](app/cms/lib/ThemeService.php) (counts top-level `.twig` vs `.php` files in the theme's `templates/` dir). Two starters ship by default: **Blank (Twig)** and **Blank (PHP)** — same look, different engine.
- **Backup** — download/restore Full / Content / Settings ZIP archives
- CSRF-protected on all state-changing requests (`X-CSRF-Token` header)
- Session cookie auth — `HttpOnly`, `SameSite=Lax`

## Architecture

The admin is a React single-page application served from a thin PHP shell.

| Layer | Stack |
|-------|-------|
| SPA shell | `app/admin.php` → `app/cms/templates/spa.php` (static HTML + Vite tags) |
| Frontend | React 18, React Router 6, TanStack Query, Tailwind CSS v4, Vite 5 |
| Editor | Toast UI Editor v3 — markdown-native, WYSIWYG + markdown source modes (no HTML round-trip) |
| Backend API | `FrontPress\Api\Router` dispatches `/admin/api/*` to controllers under `app/cms/lib/Api/` |
| Data | Plain `.md` files under `app/site/content/`, JSON config at `app/site/config.json`, media on disk |

The PHP layer's only jobs are:
1. Serve the SPA shell on any `/admin/*` GET (React handles routing client-side)
2. Dispatch JSON requests at `/admin/api/*` to controllers
3. Manage the session cookie and CSRF token

There are no PHP-rendered admin templates apart from `setup-required.php` (shown only when no admin password is configured).

### Admin URL scheme

| URL | Screen |
|-----|--------|
| `/admin/` | All Content table |
| `/admin/:folder` | Folder index — table view, no middle column |
| `/admin/:folder/:slug` | Editor for an item — middle column lists siblings, highlights the active one |
| `/admin/new/:folder` | New-item editor for that folder |
| `/admin/media`, `/admin/backup`, `/admin/settings` | Standalone screens (no middle column) |

`media`, `backup`, `settings`, `new`, and `login` are reserved folder names — don't create content folders with those names.

## JSON API

All endpoints accept and return JSON. Mutating requests must include the CSRF token from `GET /me` in an `X-CSRF-Token` header.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET`  | `/admin/api/me` | Current user + CSRF token (public) |
| `POST` | `/admin/api/login` | Sign in (public) |
| `POST` | `/admin/api/logout` | Sign out |
| `GET`  | `/admin/api/pages` | List pages and folders |
| `GET`  | `/admin/api/pages/{path}` | Get one page (`meta`, `body`, `html`) |
| `POST` | `/admin/api/pages` | Create a page |
| `PUT`  | `/admin/api/pages/{path}` | Update a page |
| `DELETE` | `/admin/api/pages/{path}` | Delete a page |
| `GET`  | `/admin/api/pages-export[?folder=…]` | Download a `.zip` of pages in `folder` (or all content). Includes per-post upload directories alongside each `.md` |
| `POST` | `/admin/api/pages-import` | Import pages from one or more files (multipart `files[]` accepting `.md` or `.zip`, optional `folder` field for loose .md files). Existing slugs are overwritten |
| `GET`  | `/admin/api/media[?page_path=…]` | List media (optionally including a page's attachments) |
| `POST` | `/admin/api/media` | Upload (multipart `file` + optional `page_path`) |
| `PATCH` | `/admin/api/media/{name}` | Update alt/caption sidecar |
| `DELETE` | `/admin/api/media/{name}` | Delete a media file |
| `GET`  | `/admin/api/settings` | Read site config |
| `PUT`  | `/admin/api/settings` | Save site/uploads/taxonomies |
| `GET`  | `/admin/api/themes` | Installed themes, active slug, available starters |
| `POST` | `/admin/api/themes/activate` | Activate by slug |
| `POST` | `/admin/api/themes/install` | Install a starter |
| `POST` | `/admin/api/themes/replace` | Replace templates from a starter |
| `POST` | `/admin/api/themes/download` | Download a theme as `.zip` (body `{ slug }`, returns binary) |
| `POST` | `/admin/api/themes/upload` | Install or replace a theme from an uploaded `.zip` (multipart `theme` + optional `theme_slug`) |
| `POST` | `/admin/api/themes/delete` | Delete a non-active theme by slug |
| `POST` | `/admin/api/themes/file` | Write an existing theme file (`{ theme, path, content }`) |
| `POST` | `/admin/api/themes/create-template` | Create a new template or partial in a theme (`{ theme, kind, slug, ext, content }`; `kind: 'template' \| 'partial'`, default `template`); partials are saved as `_<slug>.<ext>`; fails if a file with that name already exists |
| `GET`  | `/admin/api/backup` | Estimated archive sizes |
| `POST` | `/admin/api/backup/download` | Download a `.zip` (returns binary) |
| `POST` | `/admin/api/backup/restore` | Restore from uploaded `.zip` (multipart) |
| `GET`  | `/admin/api/search?q=…` | Full-text search across pages |
| `GET`  | `/admin/api/update` | Check for a new release (also returns `pending_migrations`) |
| `POST` | `/admin/api/update` | Apply the latest release. The ZIP URL is taken from GitHub's release metadata server-side and host-checked against an allowlist; client-supplied URLs are ignored |
| `POST` | `/admin/api/update/migrate` | Explicitly run pending migration scripts (no longer auto-run on update) |
| `GET`  | `/admin/api/audit?limit=N` | Most-recent admin write actions (page create/update/delete). Append-only log at `site/cache/audit.log` — N defaults to 100, capped at 500 |

## Development workflow

```bash
cd app/src
npm install
npm run dev    # Vite dev server on :5173 with HMR
```

Then load `http://<your-host>/admin/` in a browser. The PHP shell auto-detects the dev server (via the `app/src/.vite-hot` file Vite writes on listen) and injects script tags pointing to `localhost:5173`. React Fast Refresh + Tailwind hot-reload work without reload.

```bash
npm run build  # Outputs hashed assets + manifest to app/admin/assets/
```

In production (no dev server), PHP reads `app/admin/assets/.vite/manifest.json` and emits the hashed `<script>`/`<link>` tags.

If a stale `.vite-hot` file ever points to a dead dev server (e.g. after an ungraceful Vite shutdown), delete it: `rm app/src/.vite-hot`. The PHP shell will fall back to the production manifest.

## Path format for new pages

When creating a page, the path determines the file location and URL:

| Path | File | URL |
|------|------|-----|
| `pages/about` | `content/pages/about.md` | `/about` |
| `blog/my-post` | `content/blog/my-post.md` | `/blog/my-post` |
| `tutorials/gsap-intro` | `content/tutorials/gsap-intro.md` | `/tutorials/gsap-intro` |

Paths must be lowercase, with only letters, numbers, hyphens, and slashes.

## Media storage

There's no database — every media file is a plain file on disk under `site/uploads/`, served directly by the web server.

### Two locations

- **Shared library** — `site/uploads/`. The global pool shown in the `/admin/media` page. Files are renamed to a 24-char hex stem on upload (e.g. `abc123…def.jpg`) to avoid collisions. URLs: `/uploads/<file>`.
- **Per-post attachments** — co-located with the post itself in `site/content/<pagePath>/`, e.g. `site/content/blog/hello-world/cover.jpg`. Used when uploading directly from the editor for a specific post; original filename is preserved. URLs: `/uploads/<pagePath>/<file>`. Both shapes are served by the `/uploads/*` route in `index.php` (image extensions only — `.md` and other types return 404). There is **no** `uploads/` directory in the webroot — that URL is always handled by the front controller.

### What each upload produces

Uploading `abc123…def.jpg` to the shared library creates three sibling files:

| File | Purpose |
|------|---------|
| `uploads/media/abc123…def.jpg` | The original |
| `uploads/media/abc123…def.thumb.jpg` | 400px-wide thumbnail, raster images only |
| `uploads/media/abc123…def.meta.json` | Sidecar metadata (see below) |

Deleting a media file also removes its `.thumb.*` and `.meta.json` siblings.

### Sidecar metadata (`.meta.json`)

Alt text, caption, and bookkeeping fields live in a JSON sidecar next to the file:

```json
{
  "alt": "A red fox in snow",
  "caption": "Photographed in Hokkaido, 2024",
  "attached_to": [],
  "uploaded_at": "2026-04-23T10:15:00+00:00"
}
```

- Created empty on upload, updated when you save alt/caption in the media admin.
- `attached_to` is reserved for future per-post association tracking.
- Alt/caption editing is currently limited to the shared `uploads/media/` pool — files in per-page folders use their `alt` attribute in the HTML instead.

### Allowed types and limits

- Extensions: `jpg`, `jpeg`, `png`, `gif`, `webp`, `svg`, `pdf`, `zip`.
- MIME is re-checked server-side against file contents, not just the extension.
- Size / dimensions are configurable under `uploads` in `site/config.json` (`max_mb`, `max_width`, `max_height`).

## Backup

`/admin/backup` builds a one-click archive of your site's user-owned state — no database to dump, just files on disk. The screen opens with a one-line explainer (content, media, themes, config — everything needed to bring the site back) above the three scope cards, so a first-time user understands what a download captures before clicking.

### What's included

- `site/content/` — all your Markdown
- `site/config.json` — site settings, taxonomies, upload limits
- `site/themes/` — active and installed themes
- `site/uploads/` — media files and their `.meta.json` sidecars

### What's excluded

- `site/cache/` — regenerates from source on first request
- `.env` — contains your admin password hash; back that up separately

### Three scopes

Each scope offers a single **Download ZIP** action.

| Scope | Covers | When to use |
|-------|--------|-------------|
| **Full backup** | `site/content/`, `site/config.json`, `site/themes/`, `site/uploads/` | Default — full disaster recovery. |
| **Content only** | `site/content/`, `site/uploads/` | Moving posts/media to another install with its own themes and config. |
| **Settings only** | `site/config.json`, `site/themes/` | Cloning a site's design and configuration onto a fresh install, without dragging content. |

The admin page estimates each size before you download. Full backup over 500&nbsp;MB surfaces a warning — at that point, downloading *Content only* and backing up uploads out-of-band is usually saner.

### Restoring from a backup

Upload a ZIP (any scope) under **Restore from backup** and type `RESTORE` to confirm. The server:

1. Validates the archive — every entry must live under one of the backup roots; no `..` segments, no absolute paths, no symlinks.
2. Extracts to a staging directory.
3. For each root present in the ZIP, moves the live copy aside (`<root>.restore-bak-<timestamp>`) and swaps the staged copy into place.
4. On success, removes the `.restore-bak-*` siblings. On any failure, rolls back every rename so the site is left exactly as it was.
5. Clears caches — HTML pages rebuild on next request, the post index rebuilds on the next admin load.

Partial ZIPs only replace the roots they contain. Uploading a Content-only backup leaves your current themes and config untouched.
