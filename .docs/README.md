# FrontPress Studio — Documentation

Flat-file CMS in PHP. No database. Markdown files on disk for content, a React admin at `/admin`, themes that are plain `.twig` / `.php` files.

> **Working on the docs?** This folder is the authoring source — nested by category for browsing. The published site at `frontpress.studio/docs/` is a flat rendering with specific front-matter conventions. **Always follow [AUTHORING.md](AUTHORING.md) when adding or porting a doc to the site.**

## Where to start

If you've never touched the project before, read these in order:

1. [Installation → Quick start](installation/01-quick-start.md) — five-minute install on shared hosting or local dev.
2. [Features → Pages and posts](features/pages-and-posts.md) — create your first piece of content.
3. [Features → Themes](features/themes.md) — switch the look, or start building your own.

## Documentation map

### Installation

| Doc | What's inside |
|-----|---------------|
| [Quick start](installation/01-quick-start.md) | Unzip → visit `/admin/` → sign in. |
| [Requirements](installation/02-requirements.md) | PHP version, modules, host compatibility. |
| [Production hardening](installation/03-production.md) | Hash from day one, `.htaccess`, `APP_ENV`, file permissions. |
| [Updates](installation/04-updates.md) | In-admin self-update from GitHub Releases. |

### Features

| Doc | What's inside |
|-----|---------------|
| [Pages and posts](features/pages-and-posts.md) | Content editor, front matter, taxonomies, per-page templates. |
| [Media library](features/media.md) | Global media + per-post uploads, supported types, image insertion. |
| [Themes](features/themes.md) | Install / activate / delete / download as zip, drag-drop install, starter themes. |
| [Theme Builder](features/theme-builder.md) | Visual editor for `.twig` / `.php` / `.css`, outline, preview, click-to-source. |
| [Fields and taxonomies](features/fields.md) | Custom front matter fields, taxonomy archives, the **Manage fields** screen. |
| [Contact form](features/contact-form.md) | Built-in form handler + SMTP / `mail()` delivery, submissions inbox, field builder. |
| [Backups](features/backups.md) | Full / Content / Settings ZIP archives + restore. |
| [Settings](features/settings.md) | Site config, SEO defaults, security, cache. |
| [SEO](features/seo.md) | Auto-injected meta tags, per-page overrides, `seo_head()`. |

### Advanced

| Doc | What's inside |
|-----|---------------|
| [Architecture](advanced/architecture.md) | Two layers — thin PHP shell + React SPA. Routing, sessions, data flow. |
| [Templates](advanced/templates.md) | Twig vs PHP, layout inheritance, partials, helpers, route variables. |
| [SCSS auto-compile](advanced/scss.md) | Pure-PHP scssphp pipeline, layout conventions, when it runs. |
| [API reference](advanced/api-reference.md) | All `/admin/api/*` endpoints and shapes. |
| [Extending](advanced/extending.md) | Custom front matter, template helpers, hooks. |
| [Theme Builder internals](advanced/theme-builder-internals.md) | Marker convention, parser, preview chrome, postMessage bridge. |
| [Claude skills in themes](advanced/claude-skills.md) | Themes ship `.claude/skills/` — AI agents get auto-context on theme conventions. |
| [Release process](advanced/release-process.md) | Build, tag, GH Actions, what ships in the zip. |

## Project layout

```
your-domain/
├── .htaccess          ← Apache rewrites
├── index.php          ← Public-site entry
├── admin/             ← Admin SPA assets (built React bundle)
├── admin.php          ← Admin entry
├── bootstrap.php      ← Shared bootstrap (autoload, helpers, render())
├── config.php         ← Admin credentials, app config
├── cms/               ← Framework code (PHP)
│   ├── lib/           ← Services, controllers, helpers
│   ├── starters/      ← Bundled starter themes
│   ├── tests/         ← PHPUnit suite
│   └── vendor/        ← Composer deps (committed)
└── site/              ← Your content
    ├── config.json    ← Site settings
    ├── content/       ← Markdown pages, organised in folders
    ├── themes/        ← Installed themes
    └── uploads/       ← Global media library
```

`site/` is gitignored in the source repo; everything users edit lives there. Framework code under `cms/` is replaced wholesale on update; user data is untouched.

## Where to file issues

GitHub: <https://github.com/krstivoja/frontpress-studio/issues>.
