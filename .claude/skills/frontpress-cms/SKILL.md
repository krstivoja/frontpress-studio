---
name: frontpress-cms
description: FrontPress Studio framework internals — PHP classes under cms/lib/, REST controllers, services (MediaService, Mailer, Updater, BackupService, Index, ThemeService), Twig environment, Markdown content tree, content/folder routing, update pipeline, release process. Use when editing the framework itself (cms/, root entry-point PHP), debugging the admin REST API, or shipping a new framework feature/release.
license: MIT
---

# FrontPress Studio — CMS internals

## How users activate this skill

This file is bundled with every FrontPress Studio install under `.claude/skills/frontpress-cms/`. Open the install's root directory in **Claude Code** (the Claude CLI/desktop dev tool) and this skill auto-loads whenever the conversation touches framework internals. Users who run Claude in another tool can copy this folder into their `~/.claude/skills/` to load it globally.

No "connect site folder" step is required — the working directory of your Claude session IS the site folder. If Claude is in `app/public/` of your install, every path reference below is already resolved.

## When to use this skill

Apply when the user is working on the FrontPress framework itself — not when building a theme or authoring content. Triggers:

- Editing files under `cms/lib/` or `cms/lib/Api/`
- Touching root entry-point PHP (`index.php`, `admin.php`, `bootstrap.php`, `router.php`)
- Debugging the admin React app talking to the REST API
- Cutting a new release / running the in-place update flow
- Adding a new content type, helper, or service

Skip and load `frontpress-theme` instead when the work is under `site/themes/<name>/` or `site/content/`.

## Repo layout (canonical FrontPress install)

```
app/public/                # document root
├── index.php              # public-site front controller (routes + /uploads/* serving)
├── admin.php              # admin SPA entry — auths + serves admin/ build
├── bootstrap.php          # autoload + config + globals
├── router.php             # built-in PHP server router (php -S)
├── config.php             # admin creds + APP_ENV (NOT committed; survives updates)
├── .htaccess              # Apache rewrites — keep entry-points working
├── admin/                 # built React bundle (Vite output) — replaced on update
│   ├── index.php
│   └── assets/
├── cms/
│   ├── VERSION            # framework version, bumped LAST on update
│   ├── manifest.json
│   ├── composer.json
│   ├── vendor/
│   ├── templates/         # PHP templates (admin SPA shell, error pages)
│   └── lib/               # PSR-4 FrontPress\
│       ├── Bootstrap.php
│       ├── Config.php
│       ├── Env.php
│       ├── ContentRepository.php
│       ├── FrontMatter.php
│       ├── Index.php
│       ├── Content.php
│       ├── MarkdownEmbeds.php      # YouTube URL → iframe expansion
│       ├── PathResolver.php
│       ├── Fs.php
│       ├── FilesystemUtils.php
│       ├── TemplateRenderer.php
│       ├── template_helpers.php
│       ├── ThemeService.php
│       ├── ThemeAssets.php         # SCSS compile + asset symlink/copy
│       ├── ThemeFiles.php
│       ├── ThemeArchiver.php
│       ├── ScssCompiler.php
│       ├── MediaService.php
│       ├── ThumbnailGenerator.php
│       ├── ImageAnnotator.php
│       ├── BackupService.php
│       ├── BackupRestorer.php
│       ├── Updater.php             # in-place self-update
│       ├── UnsplashHttp.php        # Unsplash integration HTTP layer
│       ├── UnsplashImporter.php
│       ├── Mailer.php
│       ├── SmtpTransport.php
│       ├── RateLimiter.php
│       ├── Trash.php
│       ├── AuditLog.php
│       ├── CacheService.php
│       ├── Seo.php
│       ├── Url.php
│       ├── Vite.php
│       └── Api/                    # REST controllers
│           ├── Router.php
│           ├── ServiceFactory.php
│           ├── AuthController.php
│           ├── PagesController.php
│           ├── PagesIoController.php
│           ├── MediaController.php
│           ├── SettingsController.php
│           ├── ThemesController.php
│           ├── EmailController.php
│           ├── BackupController.php
│           ├── CacheController.php
│           ├── UpdateController.php
│           ├── SearchController.php
│           ├── AuditController.php
│           └── UnsplashController.php
├── site/                  # USER DATA — never replaced by updater
│   ├── config.json        # forms, taxonomies, SEO, email, active_theme, uploads, integrations
│   ├── content/           # Markdown files + per-post media folders
│   ├── uploads/           # global media library
│   ├── themes/<name>/     # themes (templates/, assets/, theme.json, optional scss/)
│   └── cache/
│       ├── index.json     # sorted post index — rebuilt on file change
│       ├── twig/          # compiled Twig templates
│       └── rate-limit.json
└── src/                   # React admin SOURCE (Vite project)
    └── package.json
```

PSR-4 namespace: `FrontPress\` → `cms/lib/`.

## Request lifecycle (public site)

1. `index.php` boots — `bootstrap.php` loads autoload, config, $GLOBALS.
2. Special routes handled inline in `index.php`:
   - `/uploads/*` — image + video serve with `realpath` containment check.
   - `/robots.txt`, `/sitemap.xml` — generated on demand.
   - Form-folder block — every `forms.<name>` folder is 404'd to keep submissions private.
   - `POST /submit/<form>` — `Mailer` + `ContentRepository` save submission + send email.
3. Otherwise → `FrontPress\Router::dispatch()`.
4. Router resolves `/`, `/:folder`, `/:folder/:slug`, `/tag/:term`, `/category/:term`.
5. `Index::get()` returns the sorted post list (date desc).
6. `Content::render()` returns HTML for a single post (Markdown → HTML with front matter; standalone YouTube URLs are converted to iframes by `MarkdownEmbeds`).
7. `TemplateRenderer` picks the template (front-matter `template:` first, then folder convention, then default).

## Request lifecycle (admin)

1. `admin.php` checks session via `AuthController::ensureSession()`.
2. If unauthed and not a login request → serve login page from the React bundle.
3. Otherwise → serve the React SPA from `admin/`.
4. SPA hits `/admin/api/*` → `cms/lib/Api/Router.php` dispatches to a controller via `ServiceFactory`.
5. Every mutating endpoint requires a CSRF token (`X-CSRF-Token` header). Read-only endpoints don't.

## Configuration

Two layers:

| File | Contents | Replaced on update? |
|------|----------|---------------------|
| `config.php` | `FPS_ADMIN_USER`, `FPS_ADMIN_PASS_HASH`, `FPS_APP_ENV`, optional integration fallbacks (`FPS_UNSPLASH_ACCESS_KEY`) | **No** — kept across updates |
| `site/config.json` | site name, base URL, active theme, taxonomies, forms, SEO, email (non-secret), upload limits, integration keys | **No** — under `site/` |

`Config::all()` returns merged config. Admin's Settings screen writes back to `site/config.json` via `SettingsController`.

Env constants honoured: `FPS_ADMIN_USER`, `FPS_ADMIN_PASS_HASH`, `FPS_APP_ENV` (`dev`/`prod`), `FPS_APP_DEBUG`, `FPS_SESSION_IDLE_SECONDS`, `FPS_UNSPLASH_ACCESS_KEY`.

## Content model

Files in `site/content/<folder>/<slug>.md` with YAML front matter + Markdown body.

```yaml
---
title: My post
date: 2026-05-22
draft: false
tags: [news, release]
template: post            # optional, override default
excerpt: …                # optional, auto-derived if omitted
---
```

- `<folder>` segment maps directly to the URL: `site/content/blog/foo.md` → `/blog/foo`.
- A `_index.md` inside a folder is the archive intro; everything else is a post in that folder.
- Per-post media lives in a same-name sibling folder: `site/content/blog/foo/image.jpg`.
- Sort: **date desc, null dates last** (see `Index.php`). The `order:` front-matter field is **not** consulted by the sort; archive.twig groups consecutive entries with the same `section:` value.

Submissions: `forms.<name>` config drops a draft `.md` per submit at `site/content/<name>/<timestamp>-<rand>.md`. Folder is 404'd publicly.

## Template helpers (registered as Twig functions and global PHP fns)

All defined in `cms/lib/template_helpers.php`, registered in `cms/lib/TemplateRenderer.php`:

| Helper | Purpose |
|--------|---------|
| `e($s)` | HTML escape |
| `asset_url($path)` | Theme asset URL, busted by mtime |
| `slug_url($term)` | Taxonomy URL builder |
| `paginate($current, $total, $base)` | Configurable pagination markup |
| `inspect($val)` | `var_dump` in `<pre>` for debugging |
| `seo_head($page)` | OG/Twitter/JSON-LD meta tags |
| `contact_form($formName='contact', $opts=[])` | Renders a form spec into HTML |
| `partial($name, $vars=[])` | Includes a Twig partial with vars |

Twig globals: `config` (array of `site/config.json`), `query` (mirror of `$_GET`).

## Global PHP helpers (in `bootstrap.php`)

These live in the global namespace — themes call them directly from PHP templates / partials. NOT available in Twig (the partial layer is how Twig templates reach them).

| Function | Purpose |
|----------|---------|
| `posts($args = [])` | Query the content index. Args: `folder`, `filter`, `orderby`, `order`, `limit`, `offset`. Returns the same shape as `posts` in `archive.twig`. Backed by `Index::filter()` / `Index::get()`. |
| `render($template, $vars = [])` | Render a theme template by name (no extension). PHP wins if both `.php` and `.twig` exist with the same name. |

For theme authors, see the `frontpress-theme` skill for the PHP-partial pattern (`_<name>.php`) that's used to call `posts()` from Twig themes.

## REST API surface

Routes prefixed `/admin/api/`. All require session unless noted. Mutations require `X-CSRF-Token`.

| Route | Controller |
|-------|------------|
| `POST /auth/login`, `POST /auth/logout` | AuthController |
| `GET/POST/PUT/DELETE /pages` | PagesController + PagesIoController |
| `GET/POST/DELETE /media` | MediaController |
| `GET/PUT /settings` | SettingsController |
| `GET /themes`, `POST /themes/activate`, `POST /themes/upload`, `GET /themes/export` | ThemesController |
| `POST /email/test` | EmailController |
| `GET/POST /backup`, `POST /backup/restore` | BackupController |
| `POST /cache/clear` | CacheController |
| `GET /update`, `POST /update`, `POST /update/check`, `POST /update/migrate` | UpdateController |
| `GET /search` | SearchController |
| `GET /audit` | AuditController |
| `GET/PUT/DELETE /unsplash/key`, `GET /unsplash/search`, `POST /unsplash/pick` | UnsplashController |
| `POST /submit/<form>` (public, no session) | Handled in `index.php`, not the API router |

## Upload allowlist

`MediaService::ALLOWED_EXTS` — what the admin uploader accepts:

```
jpg, jpeg, png, gif, webp, svg, pdf, zip
```

`index.php` — what `/uploads/*` will **serve** (broader, because video files can be SFTP'd in):

```
jpe?g, png, gif, webp, svg, avif, mp4, webm, mov, m4v, ogv, ogg
```

To allow a new uploaded type, edit `ALLOWED_EXTS` + `MIME_MAP` in `MediaService.php` (and update the serve regex in `index.php` if the type isn't already served).

## Update flow

`cms/lib/Updater.php` drives in-place updates:

1. Polls `api.github.com` for latest release tag in `krstivoja/frontpress-studio`.
2. Downloads zip → `site/cache/updates/`.
3. Verifies SHA-256 against the release manifest.
4. Computes the file list to replace: everything under `cms/`, `admin/`, plus root entry-point PHP — **never** `site/` or `config.php`.
5. Atomic rename-aside-then-rename per file. Rollback on partial failure.
6. After extraction: `opcache_invalidate` per PHP file written + `opcache_reset` at the end (added in 0.3.8 — fixes "Class not found" 500s on hosts with stale opcache).
7. `cms/VERSION` is written LAST so a half-applied update keeps the old version string.
8. Twig + page cache cleared.

## Backup flow

`cms/lib/BackupService.php`:

- **Full** — zips `cms/` + `site/` + entry-points (excluding cache).
- **Content** — `site/content/` + `site/uploads/` + `site/config.json`.
- **Restore** via `BackupRestorer.php`: extract to `.restore-bak-<ts>` staging, atomic swap, rollback on failure.

## Theme service contract

`cms/lib/ThemeService.php` resolves the active theme:

1. `site/config.json.active_theme` → `site/themes/<name>/`.
2. Theme must have `theme.json`, `templates/_layout.twig`, and either `assets/style.css` or compiled SCSS output.
3. Twig loader is bound to the active theme's `templates/` dir; falls back to `blank` if missing.
4. `engine: twig` (default) or `engine: php` in `theme.json` flips which renderer runs (`blank-php/` ships as the PHP reference).

For theme authoring details, see the `frontpress-theme` skill.

## Integrations (per-install plus framework default)

`UnsplashController::accessKey()` resolves the active key in this order:

1. `site/config.json` → `integrations.unsplash.access_key` (Settings → Integrations UI)
2. `FPS_UNSPLASH_ACCESS_KEY` in `config.php` (per-server fallback)
3. `DEFAULT_ACCESS_KEY` bundled with the framework (works out of the box; shared rate limit + TOS scope)

`keyStatus()` returns `source: 'own' | 'config_php' | 'default' | 'none'` so the Settings UI can render the right state.

## Release process

Bump `cms/VERSION` → tag → GitHub Actions builds `frontpress-studio-<version>.zip` (composer install no-dev with `--optimize-autoloader` BUT NOT `--classmap-authoritative` — PSR-4 fallback fixes the in-admin-update opcache class). Publish release. The Updater finds it by tag.

Branching: `main` is what releases come from. No long-lived feature branches.

## Common gotchas

1. **Sort by date desc** — `Index.php` uses date only. `order:` front-matter is ignored. To re-order, change dates or patch the `uasort`.
2. **Twig autoescape is HTML** — pipe rendered HTML through `|raw`. Helpers registered with `is_safe: html` already mark output safe.
3. **`config.php` is preserved across updates** — never put runtime mutable state there.
4. **`site/` is never touched by Updater** — but IS included in Full backups.
5. **CSRF** — every mutating REST call needs `X-CSRF-Token`. The React admin reads it from a meta tag injected by `admin.php`.
6. **Form folder is publicly 404'd** — `/contact/*` is blocked even though `/contact` (the page) is allowed. Keep that asymmetry in mind when adding new forms.
7. **SVG uploads** — sanitised on upload AND served with `Content-Security-Policy: sandbox`. Don't relax either side.
8. **File size budget** — project rule: no source file in `src/` or `cms/lib/` over 300 lines. Split before you hit it. See repo `CLAUDE.md` for the canonical splits.
9. **Don't ship secrets in source** — Unsplash Access Key is the one exception (`DEFAULT_ACCESS_KEY` const), and it's documented as a known trade-off. Anything else with a quota or TOS scope must go through Settings → Integrations or `config.php`.

## File size rule (from project CLAUDE.md)

Hard cap of **300 lines** on `.js`, `.jsx`, `.php` under `src/` and `cms/lib/`. Excludes generated `admin/assets/`, vendor code, theme templates.

When splitting:
- React screens → extract sidebars/panels + pull network into `src/lib/use*.js` hooks.
- Backend services → orthogonal helpers (`FilesystemUtils`, `BackupRestorer`, `ThumbnailGenerator`).
- Pure helpers → flat modules in `src/lib/` or `cms/lib/`, not private static methods on big classes.

## Related skill

For theme authoring / content / front-matter / Twig template work, load the `frontpress-theme` skill instead.
