---
name: frontpress-theme
description: FrontPress Studio theme authoring and content modeling — site/themes/<name>/ Twig templates, theme.json, asset pipeline, Twig globals (config, query) and helpers (contact_form, paginate, seo_head, slug_url, asset_url, partial), front-matter schema for posts/pages, taxonomies and folder-based archives, fields/forms configurator (forms.<name>.fields[] in site/config.json), starter conventions. Use when building or editing themes, writing content, or configuring fields/forms — NOT when editing framework PHP under cms/.
license: MIT
---

# FrontPress Studio — Themes, content, and fields

## How users activate this skill

This file is bundled with every FrontPress Studio install under `.claude/skills/frontpress-theme/`. Open the install's root directory in **Claude Code** and this skill auto-loads whenever the conversation touches themes, content, or fields. Users who run Claude in another tool can copy this folder into their `~/.claude/skills/` to load it globally.

No "connect site folder" step is required — the working directory of your Claude session IS the site folder. If Claude is in your FrontPress install root, every path below resolves directly.

## When to use this skill

Apply when working in:

- `site/themes/<name>/` — Twig templates, `theme.json`, `assets/`, SCSS sources
- `site/content/` — Markdown files, front matter, per-post media
- The admin's **Settings → Fields**, **Settings → Email → Contact form**, or `forms.<name>` / `taxonomies` in `site/config.json`

Skip and load `frontpress-cms` instead when editing PHP under `cms/lib/` or root entry-point files.

## Theme anatomy

```
site/themes/<theme>/
├── theme.json                # { name, version, description, author, engine }
├── templates/                # Twig (or PHP) view files
│   ├── _layout.twig          # required — every page extends this
│   ├── _header.twig
│   ├── _footer.twig
│   ├── home.twig             # served at / when a /index page sets template: home
│   ├── page.twig             # default for site/content/pages/*
│   ├── post.twig             # default for posts inside any folder archive
│   ├── archive.twig          # /:folder index pages
│   ├── taxonomy.twig         # /tag/:term and /category/:term
│   ├── feed.twig             # /:folder/feed RSS
│   ├── 404.twig
│   └── contact.twig          # used by pages with `template: contact`
├── assets/
│   ├── style.css             # built CSS (or hand-rolled)
│   ├── tokens.css            # optional design tokens
│   └── …                     # images, fonts
└── scss/                     # optional — compiled by ScssCompiler when present
    └── style.scss
```

Required: `theme.json`, `templates/_layout.twig`, and one of `assets/style.css` / a `scss/` source. Without these the theme falls back to `blank`.

`theme.json`:

```json
{
  "name": "My Theme",
  "version": "0.1.0",
  "description": "Short pitch.",
  "author": "You",
  "engine": "twig"
}
```

`engine: php` switches to the PHP renderer (see `blank-php` reference theme). Default is Twig.

## Template resolution order

For a given page request:

1. Page front-matter `template: <name>` (without `.twig`) — explicit override.
2. Folder convention: `site/content/pages/about.md` → `page.twig`; `site/content/blog/foo.md` → `post.twig`; index of `/:folder` → `archive.twig`.
3. Special: `/` with no matching page → `home.twig` if it exists, else `archive.twig`.
4. Taxonomy URLs → `taxonomy.twig`.
5. 404 → `404.twig`.

`_layout.twig` is the base. Pages `{% extends '_layout.twig' %}` and override `{% block content %}`.

## Twig globals (always available)

| Global | Type | What |
|--------|------|------|
| `config` | array | `site/config.json` flattened. `config.site.name`, `config.active_theme`, `config.taxonomies`, `config.forms`, etc. |
| `query` | array | mirror of `$_GET` — use for `?sent=1` success banners |

## Template helpers (Twig functions)

All are autoescape-safe where they return HTML.

| Helper | Signature | Notes |
|--------|-----------|-------|
| `e(s)` | `string` → `string` | HTML escape (Twig's `escape` filter is usually preferred) |
| `asset_url(path)` | `string` → `string` | `/site/themes/<active>/assets/<path>` with mtime cache-bust |
| `slug_url(term)` | `string` → `string` | Build `/tag/<term>` or `/category/<term>` URL |
| `paginate(current, total, base)` | renders pagination markup | Default: numbered links. Configurable. |
| `seo_head(page)` | renders meta tags | OG, Twitter, JSON-LD, canonical |
| `contact_form(name='contact', opts=[])` | renders a configured form | Pipe through `|raw` in Twig: `{{ contact_form()|raw }}` |
| `partial(name, vars={})` | includes a partial (see below) | `{{ partial('card', { post: p })|raw }}` |
| `inspect(val)` | `<pre>var_dump</pre>` | Debug only |

## `posts()` — query the content index (PHP function, NOT Twig)

`posts()` is a global **PHP** function (defined in `bootstrap.php`), not a Twig helper. It's the canonical way to query the site's content index — folder-filtered, sorted, paginated.

```php
posts([
  'folder'  => 'showcase',  // restrict to one folder under site/content/
  'filter'  => ['draft' => false],  // arbitrary meta-field equality match
  'orderby' => 'date',      // 'date' (default), 'title', or any meta key
  'order'   => 'desc',      // 'desc' (default) or 'asc'
  'limit'   => 10,          // 0 = all
  'offset'  => 0,           // for manual pagination
]);
// → array<int, array{title, url, slug, date, folder, meta, ...}>
```

Each returned post is the same shape as `posts` in `archive.twig`. Access front-matter fields via `meta.<key>`.

**Twig templates cannot call `posts()` directly** — it's not registered as a Twig function. Two ways to use it from a Twig theme:

1. **PHP partial** — write the loop in `_<name>.php` and call it from Twig via `{{ partial('<name>') }}`. This is the standard pattern for custom archives, related-post lists, recent-posts widgets, etc.
2. **Pre-populate via the template render** — for archives, `archive.twig` already receives `posts` as a variable, so most of the time you don't need to call `posts()` at all.

## `partial()` — extend templates with components or PHP

`partial(name, vars={})` looks up the partial in the active theme's `templates/` dir in this resolution order:

```
1. components/<name>.php
2. components/<name>.twig
3. components/<name>.html
4. _<name>.php            ← legacy: lets you drop into PHP for posts() etc.
5. <name>.php
6. _<name>.twig           ← legacy: Twig partial convention
7. <name>.twig
8. _<name>.html
9. <name>.html
```

`.php` partials are `require`d directly with `$vars` extracted into local scope — useful for anything Twig can't express, including calling `posts()`. `.twig` partials go through the Twig engine. `.html` partials are emitted verbatim (no logic).

Theme authors building components prefer the `components/` directory; the leading-underscore form (`_<name>`) is the older convention and is still supported for backward compat.

Per-page vars available in the relevant template:

| Var | Available in | Shape |
|-----|--------------|-------|
| `page` | `page.twig`, `post.twig`, `contact.twig` | `{ meta, html, url, date, slug, folder }` |
| `meta` | same | The post's front matter as an array |
| `html` | same | The rendered Markdown body — pipe through `|raw` |
| `posts` | `archive.twig`, `taxonomy.twig` | List of page summaries |
| `intro` | `archive.twig` | The folder's `_index.md`, if any |
| `folder` | `archive.twig` | URL segment (e.g. `'blog'`) |
| `total_pages`, `page` (number) | paginated archives | For passing to `paginate()` |

## Front-matter schema

Top of every `.md` file in `site/content/`:

```yaml
---
title: "My Post"               # required for the admin sidebar label
date: 2026-05-22               # required for sorting (date desc)
draft: false                   # omit submissions / blocked from public
template: post                 # optional override of the folder default
excerpt: "Short summary."      # optional; auto-derived from body if omitted
tags: [news, release]
categories: [updates]
image:                               # featured image (admin-canonical format)
  - /uploads/blog/foo/hero.png
  - 'hero.png'
description: "SEO description."
section: features              # used by docs archive grouping
order: 5                       # advisory; NOT consulted by the sort (date is)
---
```

Any other front-matter key is preserved and accessible as `meta.<key>` in templates — that's how custom fields work.

### Image field — what the admin saves

When the editor's featured-image picker writes a post, `image:` is **always a 2-element YAML array**: `[url, original-filename]`. The renderer accepts both forms (plain string or array) — but if you hand-edit a post to use the string form and then re-save through the admin, the admin reformats it back to array. Templates that need to dereference should:

```twig
{# Twig: handles both forms #}
{% set hero = page.meta.image is iterable ? page.meta.image|first : page.meta.image %}
<img src="{{ hero }}" alt="{{ page.title }}">
```

```php
// PHP partial: same idea
$hero = is_array($p['meta']['image'] ?? null) ? $p['meta']['image'][0] : ($p['meta']['image'] ?? '');
```

## Folder-based content modelling

Each top-level folder under `site/content/` is a content type. The URL is `/:folder/:slug`.

```
site/content/
├── pages/
│   ├── about.md             → /pages/about
│   └── _index.md            → /pages (folder archive)
├── blog/
│   ├── _index.md            → /blog (archive)
│   ├── hello-world.md       → /blog/hello-world
│   └── hello-world/         # per-post media folder
│       └── hero.png
└── docs/
    ├── _index.md
    └── quick-start.md       → /docs/quick-start
```

`_index.md` is the folder archive intro — its front matter sets `title` and `description` for the archive; its body becomes the archive's intro paragraph.

## Fields / taxonomies / forms

### Fields and taxonomies (admin: Settings → Fields)

`site/config.json.taxonomies` defines per-post-type field schemas. Each taxonomy lives under a `key` and binds to one or more `post_types` (folder names).

```json
{
  "taxonomies": {
    "categories": {
      "label": "Categories",
      "post_types": ["blog"],
      "fields": [
        {
          "name": "categories",
          "type": "array",
          "widget": "checkbox",
          "multiple": true,
          "items": ["news", "updates", "releases"],
          "hidden": false
        }
      ]
    },
    "tags": {
      "label": "Tags",
      "post_types": ["blog"],
      "fields": [
        { "name": "tags", "type": "array", "widget": "checkbox", "multiple": true, "items": [], "hidden": false }
      ]
    }
  }
}
```

Field shape per entry:

| Key | Required | Values |
|-----|----------|--------|
| `name` | yes | Front-matter key it writes to |
| `type` | yes | `array` (multi-value) or `single` (one value) |
| `widget` | array only | `checkbox`, `select`, `radio` |
| `items` | array only | List of choices the editor sees |
| `multiple` | array only | Allow multiple selections (defaults true for checkbox) |
| `value` | single only | Default value |
| `hidden` | optional | Hide the field from the editor sidebar |

Values land in the post's front matter under `name`. Templates read them via `meta.<name>`.

### Forms (admin: Settings → Email → Contact form)

```json
{
  "forms": {
    "contact": {
      "to": "you@example.com",
      "subject_prefix": "[Contact]",
      "success_redirect": "/contact?sent=1",
      "rate_limit_per_hour": 5,
      "honeypot_field": "website",
      "fields": [
        { "name": "name",    "label": "Your name", "type": "text",     "required": true },
        { "name": "email",   "label": "Email",     "type": "email",    "required": true },
        { "name": "message", "label": "Message",   "type": "textarea", "required": true }
      ]
    },
    "rsvp": { … }
  }
}
```

Form field types:

| `type` | Renders | Server validation |
|--------|---------|-------------------|
| `text` | `<input type="text">` | trim, max 5,000 chars |
| `email` | `<input type="email">` | `FILTER_VALIDATE_EMAIL` |
| `tel` | `<input type="tel">` | regex `^[0-9+\-() ]{4,32}$` |
| `url` | `<input type="url">` | `FILTER_VALIDATE_URL` |
| `textarea` | `<textarea rows="6">` | trim, max 5,000 chars |
| `select` | `<select>` with `choices: [...]` | value must be in choices |
| `checkbox` | inline `<input type="checkbox">` | coerced to `"1"` or absent |

Embed in a template:

```twig
{% if query.sent is defined %}
  <p class="ok">Thanks — we'll be in touch.</p>
{% endif %}
{{ contact_form()|raw }}             {# default form name 'contact' #}
{{ contact_form('rsvp')|raw }}       {# any configured form #}
```

Submissions arrive as draft `.md` files in `site/content/<form-name>/`. The folder is 404'd publicly (only subpaths under it — `/contact/*` — are blocked; `/contact` the page is free).

### Taxonomy URLs

```json
{
  "taxonomies": [
    { "key": "tags",       "label": "Tags",       "url": "tag"      },
    { "key": "categories", "label": "Categories", "url": "category" }
  ]
}
```

- `key` matches the front-matter array key on posts (`tags: [foo, bar]`).
- `url` is the URL prefix (`/tag/foo`).
- Term values are slugified for URL matching: `"News Flash" → news-flash`.
- Templates render via `taxonomy.twig`; vars: `term`, `taxonomy`, `posts`, pagination.

## Per-post media

Living right next to the `.md` file:

```
site/content/blog/hello-world.md
site/content/blog/hello-world/
  ├── hero.png
  └── hero.thumb.png      # auto-generated 400px-wide thumbnail
```

URLs resolve via the `/uploads/*` route — `index.php` looks under `site/content/<rest>` **first** (per-post folder), then falls through to `site/uploads/<rest>` (global). So `/uploads/blog/hello-world/hero.png` automatically resolves to `site/content/blog/hello-world/hero.png` when that file exists, and to `site/uploads/blog/hello-world/hero.png` otherwise. This means you never need to construct different URLs for per-post vs global media — the same `/uploads/<folder>/<slug>/<file>` pattern works.

Global media (`site/uploads/`) is the alternative for assets shared across posts.

Allowed uploaded types: **JPG, PNG, GIF, WebP, SVG, PDF, ZIP** (default 5 MB — `uploads.max_mb` in config).

Video files (`mp4`, `webm`, `mov`, `m4v`, `ogv`, `ogg`) and AVIF aren't accepted by the admin uploader but ARE served correctly by `/uploads/*` if you SFTP them in.

Unsplash search is also available in the admin's image picker and per-post Files tab — picks land in the same per-post folder or `site/uploads/` depending on context, with photographer attribution auto-inserted.

YouTube embeds: paste a YouTube URL on its own line in the Markdown body and FrontPress renders it as a responsive iframe at request time (no plugin needed).

## SCSS pipeline

If `site/themes/<name>/scss/style.scss` exists, `cms/lib/ScssCompiler.php` compiles it to `assets/style.css` on theme save. Otherwise `assets/style.css` is served as-is.

The starter themes ship a `tokens.css` (CSS variables) for design tokens.

## Starter conventions

The bundled `blank` theme is the minimum viable Twig theme — copy it as the starting point:

```bash
cp -r site/themes/blank site/themes/my-theme
# edit theme.json (name, version, author)
# tweak templates/_layout.twig + assets/style.css
# switch active_theme in site/config.json (or in Settings → Themes)
```

CSS conventions in the starters:

- System font stack by default
- Modern CSS reset built into `_layout.twig`
- Responsive image defaults (`img { max-width: 100%; height: auto; display: block; }`)
- Per-post images get inline-margin + radius via `article img { ... }`

## SEO

Auto-injected when `seo.enabled: true` in config. Front matter overrides per page:

```yaml
title: …          # used in <title> and og:title
description: …    # meta description + og:description
image: …          # og:image + twitter:image
canonical: …      # explicit override
noindex: true     # adds robots: noindex,nofollow
```

JSON-LD: `BlogPosting` for posts (any post in a folder other than `pages/`), `WebPage` otherwise. Add `seo_head(page)` in `_layout.twig`'s `<head>`.

## Common patterns

### Folder archive with intro

```twig
{# archive.twig — render the folder's _index.md as intro, then the post grid #}
{% if intro and intro.html %}
  <div class="archive__intro prose">{{ intro.html|raw }}</div>
{% endif %}

<ul class="post-grid">
  {% for post in posts %}
    <li>
      <a href="{{ post.url }}">
        <h2>{{ post.title }}</h2>
        <time>{{ post.date }}</time>
        {% if post.meta.excerpt %}<p>{{ post.meta.excerpt }}</p>{% endif %}
      </a>
    </li>
  {% endfor %}
</ul>

<div class="pagination">{{ paginate(page|default(1), total_pages|default(1), '/' ~ folder)|raw }}</div>
```

### Custom field rendered in template

Front matter:
```yaml
---
title: Product launch
launch_date: 2026-06-01
price_usd: 49
features:
  - Markdown editor
  - Theme builder
  - REST API
---
```

Template:
```twig
<p>Launches {{ meta.launch_date }} at ${{ meta.price_usd }}.</p>
<ul>
  {% for f in meta.features %}<li>{{ f }}</li>{% endfor %}
</ul>
```

No registration step — any unknown front-matter key is preserved and reachable as `meta.<key>`. If you want the admin to expose it as an editable field, configure it under **Settings → Fields**.

### Custom archive driven by a folder + custom field (the showcase pattern)

Goal: a `/showcase` page that lists every post in `site/content/showcase/` as a card grid, with the card's title + featured image + a click-through to a `link:` custom field.

Pieces:

1. **`site/content/pages/showcase.md`** — the page itself, sets `template: showcase`.
2. **`site/themes/<theme>/templates/showcase.twig`** — page template (hero + calls partial).
3. **`site/themes/<theme>/templates/_showcase-grid.php`** — PHP partial that loops `posts()` (needed because `posts()` isn't available in Twig).

The page front matter:

```yaml
---
title: 'Built with FrontPress'
template: showcase
---

Sites built with FrontPress Studio.
```

`showcase.twig`:

```twig
{% extends '_layout.twig' %}
{% block content %}
  <section class="showcase">
    <header>
      <h1>{{ page.title }}</h1>
      {% if html %}<div class="prose">{{ html|raw }}</div>{% endif %}
    </header>
    {{ partial('showcase-grid')|raw }}
  </section>
{% endblock %}
```

`_showcase-grid.php`:

```php
<?php
$sites = posts([
  'folder'  => 'showcase',
  'orderby' => 'date',
  'order'   => 'desc',
]);
?>
<ul class="showcase-grid">
  <?php foreach ($sites as $s):
    $hero = is_array($s['meta']['image'] ?? null) ? $s['meta']['image'][0] : ($s['meta']['image'] ?? '');
    $link = $s['meta']['link'] ?? '#';
    $host = preg_replace('#^https?://#', '', rtrim($link, '/'));
  ?>
    <li>
      <a href="<?= htmlspecialchars($link) ?>" target="_blank" rel="noreferrer noopener">
        <?php if ($hero): ?><img src="<?= htmlspecialchars($hero) ?>" alt="<?= htmlspecialchars($s['title']) ?>"></?php endif; ?>
        <h2><?= htmlspecialchars($s['title']) ?></h2>
        <span class="host"><?= htmlspecialchars($host) ?></span>
      </a>
    </li>
  <?php endforeach; ?>
</ul>
```

Per-showcase post (`site/content/showcase/example.md`):

```yaml
---
title: 'Example Site'
date: '2026-05-30'
link: 'https://example.com'
image:
  - /uploads/showcase/example/screenshot.webp
  - 'screenshot.webp'
---
```

The screenshot file lives at `site/content/showcase/example/screenshot.webp` — same per-post-folder convention as blog posts. The `/uploads/showcase/example/screenshot.webp` URL resolves there via the per-post-first fallback.

When the user adds a new showcase entry through the admin: new post under `showcase`, fill the custom `link` field (configured under Settings → Fields), upload a screenshot via the Featured Image picker (admin saves it under `site/content/showcase/<slug>/`), save. The grid picks it up on the next request.

### Section-grouped docs archive

Posts have `section: <name>` in front matter; `archive.twig` walks them in sort order and emits a heading when `section` changes from the previous entry. **Sort is by date desc**, so to keep a section together, give its entries adjacent dates.

## Common gotchas

1. **Twig autoescape is HTML** — rendered Markdown body must be `{{ html|raw }}`. Helpers tagged `is_safe: html` already mark themselves safe.
2. **Date-driven sorting** — `order:` is advisory only. To reorder docs, change `date:`.
3. **`_index.md` is special** — it's the folder archive intro, NOT a regular post. Don't link to it from posts.
4. **Form folder is 404'd publicly** — `/contact/*` is blocked. `/contact` the page is free. If you add `forms.feedback`, `/feedback/*` will be blocked too.
5. **Per-post folder name must match the `.md` slug** — `foo.md` ↔ `foo/`. Renames need to keep both in sync.
6. **`active_theme` switching** — change in `site/config.json` and flush Twig cache (Settings → Cache, or delete `site/cache/twig/`).
7. **CSS asset cache-bust** — `asset_url()` appends mtime. Don't bypass it by hardcoding the path or you'll get stale CSS.

## Related skill

For framework internals (PHP classes under `cms/lib/`, REST API, update pipeline), load the `frontpress-cms` skill.
