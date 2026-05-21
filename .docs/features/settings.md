# Settings

Sidebar → **Settings**. Five sub-screens.

## Site

`site/config.json` is the source of truth for site-wide configuration. The Site screen is a form over it.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `site.name` | string | (empty) | Used in `<title>`, RSS feed title, default SEO. |
| `site.url` | string | (empty) | Canonical base URL. Used for absolute URLs in the feed and SEO meta. |
| `site.description` | string | (empty) | Default meta description. |
| `posts_per_page` | int | 10 | Default archive pagination. Folders override via `_index.md:posts_per_page`. |
| `uploads.max_mb` | int | 10 | Per-file upload size cap (in megabytes). |
| `cache.invalidate_on_save` | bool | true | Clear the HTML page cache when content is saved. Turn off only if you're running your own cache pipeline. |

The active theme name lives at `active_theme` and is set from the **Themes** screen, not edited directly.

## Manage fields

Where you configure taxonomies and custom fields. Full reference: [Fields and taxonomies](fields.md). The on-disk shape lives at `site/config.json` under `taxonomies:`:

```json
{
  "taxonomies": {
    "tags":       { "label": "Tags",       "post_types": [],       "fields": [] },
    "categories": { "label": "Categories", "post_types": [],       "fields": [] },
    "series": {
      "label": "Series",
      "post_types": ["blog"],
      "fields": [
        { "name": "series", "type": "array", "widget": "select", "items": ["WordPress", "Tailwind", "Performance"], "multiple": false, "hidden": false }
      ]
    }
  }
}
```

The **Applies to folders** list is empty → all folders. Add folder names to scope.

## Themes

Covered in [Themes feature](themes.md).

## SEO

Defaults for the auto-injected meta tags:

| Field | Maps to |
|-------|---------|
| Default title suffix | `<title>{{ page.title }} — <suffix></title>` |
| Default description | `<meta name="description">` when a page doesn't define its own. |
| Default Open Graph image | `<meta property="og:image">` fallback. |
| Twitter handle | `<meta name="twitter:creator">` |
| Robots indexing | `index,follow` (default) or `noindex,nofollow` site-wide (e.g. a staging copy). |

Per-page front matter (`meta.description`, `meta.canonical`, `meta.image`) overrides these defaults. See [SEO feature](seo.md) and [`seo_head()`](../advanced/extending.md).

## Security

The admin password rotation form:

- **Current password** — required as a second factor; a hijacked session can't quietly rotate credentials.
- **New password** — at least 8 characters; the literal `admin` and `fpspass` are rejected.
- **Confirm** — match.

On submit:

1. `POST /admin/api/password` validates everything server-side.
2. Bcrypt-hashes the new password.
3. Atomically rewrites `config.php` with the new `FPS_ADMIN_PASS_HASH`.
4. Refreshes the session so the "Set a strong admin password" banner clears.

Also on this screen:

- **Audit log** — last 50 login attempts (success/failure, IP, timestamp). Useful for spotting brute-force probes. Persisted at `site/cache/audit.json`.
- **Session info** — how long the current session has left before idle timeout. Default is 2 hours; configurable via `session_idle_seconds` in `config.php`.

## Cache

Three buttons:

- **Clear HTML page cache** — wipes `site/cache/html/`. Forces every public URL to re-render on next request.
- **Clear Twig cache** — wipes `site/cache/twig/`. Forces Twig to recompile templates on next request.
- **Clear all** — both, plus the index cache (the post-list flat file the framework keeps for fast queries).

Useful after:

- Bulk-editing files outside the admin.
- Updating a theme outside the admin.
- Switching `APP_ENV` between dev and prod.

The HTML cache is also cleared automatically whenever a page is saved (configurable via `cache.invalidate_on_save`).
