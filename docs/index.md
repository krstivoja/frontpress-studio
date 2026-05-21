---
title: Home
layout: default
---

# FrontPress Studio

Ultralight flat-file CMS built in PHP. No database. Content is Markdown files on disk; the admin is a browser UI at `/admin`.

## Requirements

- PHP 8.1+
- Apache with `mod_rewrite` (or nginx with the equivalent rewrites)
- Composer (for source installs)

## Installation

### Shared hosting — unzip into your domain folder

Download `frontpress-studio-<version>.zip` from the [GitHub Releases](https://github.com/krstivoja/frontpress-studio/releases) page and unzip its contents directly into your site's document root (the folder your domain points at — for example `htdocs/example.com/` or `public_html/`). It should sit alongside any existing files the way WordPress lives next to `wp-config.php`:

```
public_html/
├── .htaccess
├── index.php
├── admin.php
├── bootstrap.php
├── cms/
├── admin/
│   └── assets/
└── site/
```

Visit `/admin` in your browser and sign in with **`fpsadmin`** / **`fpspass`**. A persistent banner across the top of the admin nags you until you set a real password under **Settings → Security**.

### Source install (development)

```bash
git clone https://github.com/krstivoja/frontpress-studio.git
cd frontpress-studio/app
composer install --working-dir=cms
```

The admin UI is a React app built with Vite. To work on it locally:

```bash
cd src
npm install
npm run dev    # HMR on localhost:5173 — visit /admin/ on your PHP host
npm run build  # production assets to ../admin/assets/
```

Production deployments need the prebuilt `admin/assets/` directory present; the release zip ships it pre-built, so this only matters for source installs.

## Directory structure

The framework root (`app/` in the source tree, your domain folder for a release unzip) is also the document root. Sensitive prefixes (`cms/`, `site/`, `bootstrap.php`, `config.php`) are blocked at the HTTP layer by `.htaccess`, the same way WordPress protects `wp-config.php` while sitting next to `index.php`.

```
app/                          # ← also the web root (DocumentRoot)
├── .htaccess                 # Front controller + deny rules for private paths
├── index.php                 # Public front controller
├── admin.php                 # Admin SPA shell (HTTP layer)
├── router.php                # PHP -S dev router (mirrors .htaccess)
├── bootstrap.php             # Autoloader, shared globals, render() / posts() helpers
├── config.php                # Admin credentials + runtime flags (DENIED via .htaccess)
├── assets/                   # Symlink → site/themes/<active>/assets
├── admin/                    # Admin entry point + built SPA bundle
│   ├── index.php             # /admin/ front controller
│   └── assets/               # Built admin SPA bundle (Vite manifest + hashed assets)
│
├── cms/                      # Framework code + admin app + starter assets (DENIED)
│   ├── composer.json
│   ├── lib/                  # Core PHP (namespace MD\)
│   │   ├── Bootstrap.php     # First-run /site seeding from cms/starters/
│   │   ├── Content.php       # Markdown parser + HTML cache
│   │   ├── Index.php         # Post index builder + filter
│   │   ├── Router.php        # URL → route resolver
│   │   ├── CacheService.php  # Cache clear/rebuild
│   │   ├── ThemeService.php  # Active theme, template resolution
│   │   ├── TemplateRenderer.php  # Twig wrapper
│   │   ├── ScssCompiler.php  # Auto-compile theme SCSS
│   │   ├── template_helpers.php  # e(), partial(), asset_url(), paginate(), slug_url()
│   │   └── Api/              # /admin/api/* JSON controllers
│   ├── starters/             # Defaults copied into /site on first request
│   │   ├── content/          # Welcome page + sample blog post
│   │   ├── uploads/          # Security stub (index.php)
│   │   ├── config.example.json
│   │   ├── blank-twig/       # Default theme (copied to site/themes/<active>)
│   │   └── blank-php/        # PHP-engine alternative
│   └── templates/            # Admin SPA shell + setup-required gate
│
├── src/                      # Admin SPA source (React 18 + Vite + Tailwind)
│   ├── App.jsx, main.jsx
│   ├── screens/              # Route-level screens
│   ├── components/           # Shared UI components
│   ├── styles.css
│   └── vite.config.js
│
└── site/                     # User data — git-ignored, seeded on first request
    ├── config.json           # Copied from cms/starters/config.example.json
    ├── content/              # Copied from cms/starters/content/
    │   ├── pages/            # Flat pages — /about, /contact, etc.
    │   │   └── index.md      # Homepage stub
    │   ├── blog/             # Folder → /blog archive + /blog/<slug> posts
    │   └── <folder>/         # Any folder becomes a collection
    ├── themes/               # Copied from cms/starters/blank-twig/ on first run
    │   └── <slug>/
    │       ├── theme.json
    │       ├── templates/    # post.twig | post.php, archive.*, taxonomy.*, etc.
    │       └── assets/       # CSS / JS / images, served at /assets/
    ├── uploads/              # Shared media library (image-only public serving)
    └── cache/                # Auto-generated, safe to delete
        ├── index.json        # Compiled post index
        ├── index.mtime       # O(1) rebuild marker
        ├── html/             # Per-page HTML cache (.json files)
        └── twig/             # Compiled Twig templates
```

`/site` is **never tracked in git** — it's user data, populated by `FrontPress\Bootstrap::ensureSiteDefaults()` on the first request after install. Editing content in the admin won't show up as a diff in the framework repo.

## Next steps

- [Content]({{ '/content' | relative_url }}) — front matter, routing, pagination, taxonomy archives
- [Templates]({{ '/templates' | relative_url }}) — engine-agnostic reference: route variables, helpers, `posts()` API, per-post overrides, theme assets
  - [Templates — Twig]({{ '/templates-twig' | relative_url }}) — end-to-end cookbook: layouts, archive + pagination, taxonomy linking, recent/related posts, `_inspect` partial
  - [Templates — PHP]({{ '/templates-php' | relative_url }}) — same cookbook in plain PHP, with escaping rules and the legacy output-buffer layout
- [Caching]({{ '/caching' | relative_url }}) — what's cached, how it invalidates, when to clear it manually
- [Admin]({{ '/admin' | relative_url }}) — editor, uploads, settings, backup, auth
- [Accessibility]({{ '/accessibility' | relative_url }}) — keyboard + screen-reader guarantees the admin SPA makes
- [Extending]({{ '/extending' | relative_url }}) — collections, custom templates, custom helpers, taxonomies
- [Changelog]({{ '/changelog' | relative_url }})
