---
name: frontpress-theme
description: Use when building or editing themes for FrontPress Studio (the flat-file PHP CMS). Triggers on changes under `site/themes/<slug>/` — Twig templates in `templates/`, CSS/SCSS under `assets/`, or `theme.json`. Covers theme layout, the Twig inheritance pattern, partials, all template helpers, what variables each route hands the template, SCSS auto-compile, image defaults, and the marker convention that powers the in-admin Theme Builder.
---

# FrontPress Studio — Twig theme building

You're editing a Twig-engine theme. The framework is FrontPress Studio: flat-file PHP CMS, content is Markdown on disk, no database. Themes are plain Twig + CSS.

## File layout

```
site/themes/<slug>/
├── theme.json
├── templates/
│   ├── _layout.twig         ← HTML shell; route templates extend this
│   ├── _header.twig          ← just <header>...</header>
│   ├── _footer.twig          ← just <footer>...</footer>
│   ├── post.twig             ← single post (URL /<folder>/<slug>)
│   ├── page.twig             ← single page (URL /<slug>)
│   ├── archive.twig          ← folder listing (URL /<folder>, /<folder>/page/N)
│   ├── taxonomy.twig         ← /tags/<term>, /categories/<term>
│   ├── feed.twig             ← Atom feed (XML, doesn't extend _layout)
│   ├── 404.twig
│   └── <custom>.twig         ← per-page `meta.template` override targets
└── assets/
    ├── style.css             ← served at /assets/style.css
    └── style.scss            ← optional; auto-compiles in APP_ENV=dev
```

`theme.json` (minimum):

```json
{
  "name": "My Theme",
  "version": "1.0.0",
  "engine": "twig"
}
```

`active_theme` in `site/config.json` decides which theme is live. The framework symlinks the active theme's `assets/` → `/assets/` in the webroot on activation, so `asset_url('style.css')` resolves to `/assets/style.css` regardless of theme slug.

## The layout pattern (REQUIRED)

Every route template uses Twig inheritance to extend `_layout.twig`:

```twig
{# templates/post.twig #}
{% extends '_layout.twig' %}
{% set page_title = meta.title|default('Post') %}

{% block content %}
<article>
  <h1>{{ meta.title|default('') }}</h1>
  {% if meta.date %}<time>{{ meta.date }}</time>{% endif %}
  {{ html|raw }}
</article>
{% endblock %}
```

`_layout.twig` owns the entire `<!doctype>` → `</html>` chrome and calls `partial('header')` / `partial('footer')`:

```twig
{# templates/_layout.twig #}
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{{ page_title|default(config.site.name|default('Site')) }}{% if page_title %} — {{ config.site.name|default('') }}{% endif %}</title>
  {% if meta is defined and meta.description %}<meta name="description" content="{{ meta.description }}">{% endif %}
  <link rel="stylesheet" href="{{ asset_url('style.css') }}">
  <link rel="alternate" type="application/atom+xml" title="{{ config.site.name|default('Site') }}" href="/feed">
  {% block extra_head %}{% endblock %}
</head>
<body>
  <div class="container">
    {{ partial('header') }}
    <main>
      {% block content %}{% endblock %}
    </main>
    {{ partial('footer') }}
  </div>
</body>
</html>
```

**Why this matters:** the in-admin Theme Builder injects HTML-comment markers around each `partial()` call to map clicks-in-preview back to source files. That bridge only works if every partial is *well-formed* — closes every tag it opens. The OLD pattern (split `_header.twig`/`_footer.twig` that opened tags on the way in and closed them on the way out) breaks the click bridge because the browser parser engulfs the partial's `:end` marker inside the unclosed `<main>`. Stick with `_layout.twig` + `{% block content %}`.

So:

- `_header.twig` = JUST `<header>...</header>`. No `<!doctype>`, no `<html>`, no `<body>`.
- `_footer.twig` = JUST `<footer>...</footer>`. No `</body>`, no `</html>`.
- `feed.twig` is the one exception. It outputs Atom XML, doesn't extend the HTML layout, lives alone:

```twig
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>{{ title }}</title>
  <updated>{{ updated|date('c') }}</updated>
  {% for item in items %}
  <entry>
    <title>{{ item.title }}</title>
    <link href="{{ item.absolute_url }}"/>
    <updated>{{ item.mtime|date('c') }}</updated>
  </entry>
  {% endfor %}
</feed>
```

## Helpers (always available in Twig)

All registered as Twig functions in `cms/lib/TemplateRenderer.php`. Use them directly.

| Helper | Signature | Notes |
|--------|-----------|-------|
| `e(value)` | string | HTML-escape. Twig autoescapes, so you normally don't need this — use only when `{% autoescape false %}`. |
| `partial(name, vars={})` | void (echoes) | Render a partial. See resolution order below. |
| `asset_url(path)` | string | Prefix `/assets/`. Use this for theme assets — survives base-path changes. |
| `paginate(page, totalPages, baseUrl)` | string (HTML) | prev / "Page X of Y" / next nav. Empty when `totalPages <= 1`. **Pipe through `\|raw`.** |
| `slug_url(term, taxonomy='categories')` | string | URL for a taxonomy archive (`/categories/php`). Slugifies the term. |
| `posts(args)` | array | Query the post index. See [posts()](#posts) below. |
| `inspect(value, label='')` | string (HTML) | Pretty-printed labelled dump. Useful for debugging — pipe through `\|raw`. |
| `seo_head()` | string (HTML) | The SEO meta block, for explicit placement in `<head>`. Calling it disables auto-injection so you don't double-emit. Pipe through `\|raw`. |

Plus Twig globals:

- `config` — full `site/config.json` as an array. `{{ config.site.name }}`, `{{ config.uploads.max_mb }}`, `{{ config.taxonomies.tags.label }}`.

### Partial resolution order

`partial('header')` tries these in order, first match wins:

1. `templates/components/header.php`
2. `templates/components/header.twig`
3. `templates/components/header.html`
4. `templates/_header.php`
5. `templates/header.php`
6. `templates/_header.twig`
7. `templates/header.twig`
8. `templates/_header.html`
9. `templates/header.html`

`.twig` and `.php` partials receive `vars`. `.html` partials are emitted verbatim (vars ignored). Convention: prefix with `_` for shared layout chunks (`_header`, `_footer`, `_nav`) — the leading underscore marks them as not user-selectable in the per-page template dropdown.

## Variables per route

The framework passes different variables depending on which template renders. Always check what your route hands you before rendering.

### `post` (URL: `/<folder>/<slug>`)

| Variable | Type | Notes |
|----------|------|-------|
| `meta` | array | Full front matter — `title`, `date`, `tags`, `categories`, `image`, `draft`, `excerpt`, `template`, plus any custom keys. |
| `html` | string | Rendered Markdown body. Trusted — `{{ html\|raw }}`. |
| `route` | array | `{ type: 'post', path: '<folder>/<slug>', folder: '<folder>' }`. |

### `page` (URL: `/<slug>`)

Same shape as `post`. Differs only in routing.

### `archive` (URL: `/<folder>`, `/<folder>/page/N`)

| Variable | Type | Notes |
|----------|------|-------|
| `folder` | string | The folder slug. |
| `items` / `posts` | array | The current page's posts (already sliced). `posts` is an alias. Each post has front matter flattened to the top level — `post.image`, `post.tags`, etc. — alongside canonical fields. Canonical fields (`url`, `title`, `date`, `slug`, `folder`, `path`, `mtime`, `draft`) win over same-named meta keys. |
| `folders` | string[] | Every content folder slug — useful for filter tabs. |
| `intro` | array \| null | The folder's `_index.md` parsed (`{ meta, body, html }`), or null. |
| `page` | int | Current page (1-indexed). |
| `total_pages` | int | Total. |
| `per_page` | int | Resolves from `_index.md:posts_per_page`, then `config.json:posts_per_page`, then 10. |

### `taxonomy` (URL: `/tags/<term>`, `/categories/<term>`)

| Variable | Type | Notes |
|----------|------|-------|
| `taxonomy` | `'tags'` \| `'categories'` | Which one. |
| `term` | string | URL slug (`php`). |
| `label` | string | Original cased term — use for page title (`PHP`). |
| `items` / `posts` | array | Same shape as `archive`. |
| `page`, `total_pages`, `per_page` | int | Same as `archive`. |

### `feed` (URL: `/feed`, `/<folder>/feed`)

| Variable | Type | Notes |
|----------|------|-------|
| `site_name`, `title` | string | |
| `site_url`, `feed_url` | string | Absolute URLs. |
| `updated` | int | Unix timestamp of most recent included item. |
| `items` | array | Up to 20 most recent posts; each has `absolute_url` pre-computed. |

### `404`

| Variable | Type | Notes |
|----------|------|-------|
| `url` | string | The path that didn't resolve. |

## posts()

Query helper. Reads the index, filters, sorts, paginates, returns a plain array.

```twig
{% set recent = posts({ folder: 'blog', limit: 3 }) %}
{% set featured = posts({ filter: { featured: true }, limit: 6 }) %}
{% set phpPosts = posts({ filter: { tags: 'PHP' } }) %}
```

| Key | Default | Notes |
|-----|---------|-------|
| `folder` | — | Restrict to one folder. |
| `filter` | `{}` | Key/value match. Scalars use `===`, arrays use `in_array`. **Custom keys MUST be inside `filter`** — top-level custom keys are silently ignored. |
| `orderby` | `'date'` | `date`, `title`, or any meta key. |
| `order` | `'desc'` | `'desc'` or `'asc'`. |
| `limit` | `0` | `0` = all. |
| `offset` | `0` | Skip N. |

Drafts are excluded by default.

## Custom per-page templates

If a post's front matter has `template: landing`, the framework looks for `templates/landing.twig` (or `landing.php`) and uses that instead of `post.twig` / `page.twig`. Use this for one-off landing pages. The dropdown in the admin sidebar populates from `templates/*.twig`/`*.php` minus partials (`_*`) and route-bound templates (`archive`, `taxonomy`, `feed`, `404`).

## CSS / SCSS

**Drop a `style.scss` into `assets/`** and the framework auto-compiles it on every public-site request when `APP_ENV=dev`. Uses pure-PHP scssphp — no Node, no `sass` binary. Output is minified.

Two layouts (both auto-detected):

| Layout | Source | Output |
|--------|--------|--------|
| **Flat** | `assets/style.scss` | `assets/style.css` (sibling) |
| **Nested** | `assets/scss/style.scss` | `assets/css/style.css` |

Files starting with `_` (`_tokens.scss`) are partials — inlined by their importer, no standalone `.css` produced. The whole `assets/` tree is added to scssphp's import paths.

`APP_ENV=prod` skips the freshness check entirely; ship with `style.css` pre-built.

Compile errors log to `error_log`; the request still serves whatever `.css` is on disk so a broken SCSS edit can't take down the site.

## Image defaults

Always include these in your base reset so content images don't distort:

```css
img, picture, video, svg {
  max-width: 100%;
  height: auto;     /* preserves aspect ratio when scaling down */
  display: block;
}

/* Centered, breathing room, rounded — adjust to taste */
article img,
figure img {
  margin-inline: auto;
  margin-block: 1.5rem;
  border-radius: 6px;
}
```

The bundled `blank` theme ships these. Missing `height: auto` causes visible distortion when source images have intrinsic width/height attributes — common with WordPress-imported content.

## Theme Builder markers (optional, useful)

The admin's Theme Builder parses `{# fp:block id="..." type="..." label="..." #} … {# /fp:block #}` Twig comments as first-class **editable, draggable** blocks in the outline. Twig strips them at render time (they're just comments), so they don't affect output.

```twig
{# fp:block id="hero" type="section" label="Hero" #}
<section class="hero">
  <h1>{{ meta.title }}</h1>
  <p>{{ meta.excerpt|default('') }}</p>
</section>
{# /fp:block #}
```

The outline shows "Hero (section)" with a marker tone and supports drag-reorder. Non-marker code (regular HTML, `{% for %}`, `{% if %}`) shows in the outline too but is read-only from the UI.

Add markers around the chunks a non-developer should be able to reorder visually. Keep small unsemantic divs unmarked.

## Don'ts

- **Don't split partials across opening/closing tags.** No `<body>` open in `_header.twig` and `</body>` close in `_footer.twig`. The Theme Builder's click-to-source bridge relies on partials being well-formed.
- **Don't hardcode `/assets/<file>`** — use `{{ asset_url('<file>') }}`. The webroot path may not be `/`.
- **Don't pipe `html` through Twig autoescape** — it's pre-rendered Markdown, already trusted. Always `{{ html|raw }}`.
- **Don't loop without checking iterability** — `{% if posts is iterable and posts|length %}…{% endif %}`. Empty archives are common.
- **Don't write `<title>` tags in route templates.** That's `_layout.twig`'s job. Override it via `{% set page_title = ... %}` or by redefining `{% block title %}{% endblock %}`.
- **Don't read `meta.body`** — it's not in the variable bag. Use `html` (the rendered Markdown).
- **Don't put `<script>` in `_header.twig`.** That partial is just `<header>...</header>`. Scripts go in `_layout.twig` (via a `{% block extra_head %}` or directly).
- **Don't ship absolute timestamps in templates without front matter context.** Use `{{ meta.date }}` (the page's own date), not `{{ "now"|date(...) }}`, unless you actually want "now".

## When you're done

1. Visit `/admin/theme-builder` and click around the preview — every click should map to the correct file in the code panel.
2. Visit `/` and a post URL on the public site — typography, image sizing, link colors, mobile width.
3. Check `error_log` for compile errors if you used SCSS.
4. Run **Settings → Cache → Clear all** if your edits aren't showing up in `prod` mode.

For deeper reference (route variables in detail, the partial resolution algorithm, advanced extending), see the docs at `https://frontpress.studio/docs`.
