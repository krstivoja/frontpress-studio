# FrontPress Studio Design System

> Ultralight, shadcn-flavored black & white design system for a flat-file PHP CMS.

**Product:** FrontPress Studio ("Docspages") — an ultralight flat-file CMS built in PHP. No database. Content is Markdown files on disk; the admin is a browser UI at `/admin`. Version 1.0.0 (public release 2026-04-23).

## Surfaces represented

This design system covers **two distinct visual surfaces**:

1. **Admin UI** — a sophisticated, shadcn-inspired black & white application interface. This is where the design system lives; it's rich with tokens, components, and states. Source: `cms/src/admin.css`, `cms/templates/*.php`.
2. **Public theme (default)** — a deliberately minimal, typographic "document" theme for published sites. Cream background, system font, single content column. Source: `site/themes/default/`.

The two surfaces are intentionally different: the admin is a tool (productive, dense, neutral); the public theme is a canvas for the author's content (warm, quiet, reading-first).

## Sources

- **GitHub:** `krstivoja/frontpress-studio` (default branch `main`, commit `f8dc90f`)
- Live docs: `https://frontpress.studio/docs`
- Key files read:
  - `cms/src/admin.css` — the primary design-system source (33 KB, tokens + components)
  - `cms/templates/*.php` — admin screens (layout, pages, edit, media, login, backup, settings, themes, starters)
  - `cms/src/editor.js`, `pages.js`, `settings.js`, `themes.js` — admin JS
  - `site/themes/default/**` — public theme CSS + PHP templates
  - `docs/*.md` — product documentation (content, templates, admin, extending, caching, changelog)
  - `site/content/**` — sample Markdown content

## Index

- **`README.md`** — you are here. Product context, content fundamentals, visual foundations, iconography.
- **`SKILL.md`** — cross-compatible skill definition (works in Claude Code).
- **`colors_and_type.css`** — the full token layer + semantic type styles. Source of truth for both surfaces.
- **`assets/`**
  - `logo-mark.svg`, `logo-wordmark.svg` — admin logo pieces.
  - `icons.svg` — the 11-symbol SVG sprite used by the admin. Reference with `<use href="assets/icons.svg#icon-folder">`.
  - `sample-photo.jpg`, `sample-about.png` — placeholder media for demos.
- **`preview/`** — 22 small HTML cards populating the Design System tab (colors, type, spacing, components, brand).
- **`ui_kits/admin/`** — pixel-fidelity recreation of the admin app.
  - `admin.css` — distilled from `cms/src/admin.css`; classes map 1:1 to the PHP templates.
  - `Chrome.jsx`, `PagesList.jsx`, `Editor.jsx`, `MediaLibrary.jsx`, `Themes.jsx`, `Login.jsx`
  - `index.html` — click-through demo wiring all of them.
  - `README.md` — per-kit notes, fidelity & omissions.
- **`ui_kits/public/`** — the default public theme (warm cream, purple link).
  - `style.css` — recreated from `site/themes/default/assets/css/style.css` with small additions (code blocks, blockquote, pagination) marked in the kit README.
  - `Chrome.jsx`, `Pages.jsx` — header/footer/admin-bar + Home / Blog / Post / About / 404.
  - `index.html`, `README.md`

---

## Content fundamentals

### Voice & tone

- **Technical, unceremonious, precise.** This is documentation and software copy for developers. It tells you what something does in as few words as possible, with concrete paths and commands. No marketing. No exclamation points.
- **Imperative for instructions** ("Edit `.env` and set your admin credentials"), **third-person or passive for descriptions** ("Parsed HTML is cached in `cache/html/`"). Never "we" / "our".
- **"You" appears sparingly**, always when addressing the reader directly to do something ("You already have templates — applying a starter will overwrite them.").
- **Low-key warnings**, short and direct: "Change the password before deploying:" / "Type `RESTORE` to confirm."
- **No emoji in product copy.** File-type icons in the media dropzone use emoji (`📄` PDF, `🗜` ZIP) as a pragmatic placeholder — that's the only sanctioned use.
- **No filler.** Labels are one word when possible: "Save", "Cancel", "Delete", "Edit", "Log out", "Copy URL". Buttons never plead.

### Casing

- **Sentence case everywhere** for UI copy: "Media library", "Rebuild cache", "Install from starter", "Check for updates".
- **Page titles also sentence case** ("Backup", "Settings", "Themes") — never Title Case.
- Acronyms stay uppercase: `CSRF`, `SEO`, `ZIP`, `URL`, `OG Image`, `PHP`.
- File paths and code identifiers in `inline code` treatment, case preserved.

### Microcopy patterns

- **Form hints** in parentheses, muted: `Base path (/ for root, /subfolder for subfolder installs)`, `Description (meta description)`.
- **Destructive confirmations** require a typed confirmation or a `confirm()` dialog naming the target: `Delete "{name}"?`
- **Status language** is terse and neutral: "Draft", "Published", "Active", "Uploading…", "Done", "Saved".
- **Error tone** is technical, not apologetic: "Path must be lowercase letters, numbers, hyphens, and slashes." / "Restore failed: {error}."
- **Docs tone** is explanatory-neutral with occasional pragmatic asides ("Caches are excluded — they rebuild automatically.").

### Examples from the source

- Home page body: "This is the homepage. It's a static markdown file at `content/pages/index.md`."
- Changelog entry: "Index rebuild uses an O(1) `cache/index.mtime` marker instead of scanning every `.md` file."
- Admin confirm: "This will overwrite your existing templates. Continue?"
- Media help: "Drop files here or browse" / "JPG, PNG, GIF, WebP, SVG, PDF, ZIP".

---

## Visual foundations

### Two visual systems

| Aspect | Admin (primary) | Public theme |
| --- | --- | --- |
| Feel | shadcn-flavored B&W tool | warm, quiet reading surface |
| Background | `--zinc-50` (#fafafa) | `#f1eddd` (warm cream) |
| Text | `--zinc-950` (#09090b) | `#353535` |
| Accent | black `#09090b` | purple `#7300ff` (links only) |
| Font | system-ui stack | system-ui stack |
| Max width | 960px content wrap | 720px body |
| Density | dense, 14px base, 13px controls | generous, 16px base, 1.6 line-height |

### Colors (admin)

A zinc-only neutral scale (50 → 950) with strictly scoped semantic accents. **No raw hex outside `:root`.**

- **Neutrals:** `--zinc-50` through `--zinc-950` — the whole B&W ladder.
- **Surface aliases:** `--bg` (page), `--surface` (white card), `--surface-2` (hover/secondary fill = zinc-100), `--border` (zinc-200), `--border-light` (zinc-100).
- **Text:** `--text` (zinc-950), `--text-2` (zinc-700), `--text-muted` (zinc-500).
- **Primary:** black (`--primary: var(--zinc-950)`). Hover goes to zinc-800. This is the only "brand" color the admin uses.
- **Semantic accents (muted, used sparingly):**
  - Danger `#dc2626` with a soft pair (`#fef2f2` bg / `#fecaca` border).
  - Success `#15803d` with `#dcfce7` soft bg.
  - Warning soft bg `#fef3c7`, fg `#854d0e` (not used for buttons — only banners).

### Colors (public)

Single-purpose, deliberately sparse:

- Background `#f1eddd` (warm cream).
- Text `#353535` (near-black, slightly warm).
- Link `#7300ff` (purple). The only "color-color" in the theme.
- Borders `#eee` between nav and articles.
- Tag chip `#f0f0f0` on cream.
- Admin bar floating pill `#111` bg, 0.85 opacity → 1 on hover.

### Typography

- **Font stack:** `-apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` (both surfaces). Pure system — no webfonts loaded.
- **Monospace:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` — used for paths, slugs, URL fields, badges displaying identifiers.
- **Base size:** admin 14px / public 16px. Admin inputs & buttons are 13px; admin small controls 12px; admin micro-labels 11px uppercase tracked.
- **Weights used:** 400 (body), 500 (labels, buttons, sidebar links), 600 (headings, strong emphasis), 700 (logo mark).
- **Letter-spacing:** headings use slightly-negative tracking (`-.01em` / `-.015em`); micro-labels use positive tracking (`.06em`–`.08em`) and uppercase.
- **Line-height:** 1.5 (admin body), 1.6 (public body), 1.3 (tight — sidebar user block), 1.4 (badges).

### Spacing

A 4px-based tailwind-flavored scale stored as `--space-1` through `--space-8`:

```
--space-1: .25rem;  /* 4px   */
--space-2: .5rem;   /* 8px   */
--space-3: .75rem;  /* 12px  */
--space-4: 1rem;    /* 16px  */
--space-5: 1.25rem; /* 20px  */
--space-6: 1.5rem;  /* 24px  */
--space-8: 2rem;    /* 32px  */
```

Gaps between sibling controls = `--space-2`. Card interior padding = `--space-6`. Section spacing = `--space-8`. Main layout padding = `--space-8`.

### Control heights

Three fixed heights keep inputs & buttons on a shared baseline:

- `--h-control-sm`: 32px (btn-sm, field-widget-select, form-input-sm)
- `--h-control`:    36px (default)
- `--h-control-lg`: 40px (btn-lg)

### Radii

- `--radius-sm`: 4px — badges inside lists, tax-slug chips, field-chip.
- `--radius-md`: 6px — **inputs & buttons**, most containers.
- `--radius-lg`: 8px — cards, dropzones, login card, modal dialog.
- `999px` — pills (badges, page-count, theme-badge).

### Elevation (shadow system)

Three-level scale, very subtle (this is a B&W system — shadows are structural, not decorative). Each level is a **two-part recipe** — a soft ambient shadow plus a tighter contact shadow — so the lift reads as physical depth, not a single fuzzy halo (per *Refactoring UI* Ch. 6).

- `--elevation-1` → `shadow-card`: `0 1px 2px rgba(0,0,0,.06), 0 1px 1px rgba(0,0,0,.04)` — cards, sidebar, list, badge background.
- `--elevation-2` → `shadow-popover`: `0 4px 6px -1px rgba(0,0,0,.07), 0 2px 4px -2px rgba(0,0,0,.05)` — popover, menu, hover lift, dropdown.
- `--elevation-3` → `shadow-modal`: `0 12px 32px rgba(0,0,0,.12), 0 2px 4px rgba(0,0,0,.06)` — modal, dialog, full-page sheet, floating toast.

Active theme card uses a dual-shadow trick: `0 0 0 1px var(--primary), var(--elevation-1)` — the primary color simulates a 2px border without shifting layout.

### Borders

- Default border: `1px solid var(--border)` (zinc-200).
- Light divider: `1px solid var(--border-light)` (zinc-100) — used between table rows, inside forms.
- Dashed border: dropzone uses `2px dashed var(--border)`, hitting `--primary` on dragover.
- Active state: border color switches to `--primary` (black) — theme card, media-dropzone--over, image picker hovered item.

### Focus ring

Standardized shadcn-style: **2px solid ring, 2px offset**, applied via `:focus-visible`.

```css
:focus-visible {
  outline: 2px solid var(--ring);   /* zinc-950 */
  outline-offset: 2px;
  border-radius: var(--radius-md);
}
```

Inputs also get a soft triple shadow on focus: `box-shadow: 0 0 0 3px rgba(9, 9, 11, .12)` in addition to a black border. Danger-state inputs get the same treatment in danger color.

### Hover, press, active states

- **Sidebar link, ghost button:** bg → `--surface-2` (zinc-100), text darkens to `--text`.
- **Primary button:** bg → `--primary-hover` (zinc-800) on hover. No press-shrink.
- **Secondary button:** bg → `--surface-2` on hover; border stays `--border`.
- **Danger button:** bg → `--danger-hover` (#b91c1c).
- **Media item / theme card / starter card:** `--elevation-1` → `--elevation-2` on hover; no transform.
- **Image picker item:** border → `--primary`, plus 1px primary ring-shadow.
- **Active sidebar link:** inverted — bg `--primary`, text `--primary-fg` (white).
- **No scale transforms.** The admin stays still — shadow + color swap only.
- **Transitions:** always 0.15s, property-specific (background, border-color, color, box-shadow). Never `transition: all`.

### Loading

Spinner: 12×12 `border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%`, animated with `btn-spin` (0.6s linear infinite). The button text is hidden via `color: transparent` while loading; the spinner is centered absolutely.

### Transparency & blur

The admin uses **near-zero transparency**. Exceptions:

- Modal backdrop: `rgba(0,0,0,.5)` — flat overlay, no blur.
- Dropzone-over highlight: `color-mix(in srgb, var(--primary) 3%, var(--surface))` — a 3% black tint.
- Focus ring shadow: `rgba(9, 9, 11, .12)` — 12% black halo.

**No `backdrop-filter`, no glass, no gradients.**

### Motion

- Transitions: 0.15s (snappy, property-specific).
- Spinner: 0.6s linear infinite.
- Toast dismiss: `setTimeout` 2800–3000ms then hidden.
- No springs, no bounces, no page transitions.

### Imagery

The admin has **no stock imagery**. Product uses real uploaded user content (jpg / png / webp / svg via the media library). The only illustrated assets are:

- **Logo mark:** 24×24 black rounded-square containing a white "M".
- **Empty-state SVG:** a minimal wireframe of a "page" (rectangles + dividers), stroked, at 25–30% opacity. Used on theme-preview, starter-preview placeholders.
- **Icon SVGs** (see below).

### Layout rules

- **Admin shell:** sticky 56px top bar + 240px left sidebar + flexible main. Content wraps at `max-width: 960px`.
- **Login:** centered card, max-width 360px.
- **Grids:** auto-fill using `repeat(auto-fill, minmax(160px, 1fr))` for media, `(220px, 1fr)` for starters, `(240px, 1fr)` for themes.
- **Modal dialog:** 720px max, capped at `calc(100vh - 4rem)`, flex column.
- **Public theme:** centered single column, `max-width: 720px; margin: 2rem auto; padding: 0 1rem`.

### Cards

Three card types, all share the same vocabulary:

- **Admin card:** white bg, 1px border, radius-lg (8px), padding `--space-6`, `shadow-card`. Always the root container of a page's content.
- **Media item / theme card / starter card:** 1px border, radius-md/lg, `overflow: hidden` so the image pins to the top edge with no radius mismatch. `shadow-card` resting → `shadow-popover` hover.
- **Taxonomy item:** flatter — 1px border, radius-md, padding `--space-4`, `shadow-card`. Sits in a stacked list.

### Badges & chips

- **Pill badges** (page-count, theme-badge, `.badge`): `border-radius: 999px`, 2px × 10px padding, 11px font.
- **Square chips** (field-chip, taxonomy-slug, badge-field): `--radius-sm`, 1–2px × 6–8px padding, 11–12px font.
- **Variants on `.badge`:** `.badge-draft` (muted: surface bg, text-2 color, border) vs `.badge-live` (inverted: primary bg, white text).

### Protection gradients vs capsules

No gradients at all. Protection is handled by **solid fills on capsules** — the draft/live badge, the "Active" theme-badge floating top-right of a card header, the page-count pill.

### Forms

- Control height: 36px. Input border 1px, radius 6px, bg white.
- Focus: black border + 12%-black triple shadow (3px).
- Error: `--danger` border + 20%-danger triple shadow.
- Labels: 13px / 500 / zinc-950, `margin-bottom: var(--space-2)` above the input.
- Hint: 12px / 400 / zinc-500, inline-parenthetical next to the label.
- Error hint: 12px / 400 / red, sits below the input with `margin-top: var(--space-1)`.

### Media dropzone

2px **dashed** border (not solid), radius-lg, centered icon + copy + hint. Hover/dragover → solid primary border + 3%-primary tint. Upload progress rendered inline as rows inside the zone (surface-2 bg, 12px font).

### Toast

Bottom-right fixed, `--space-6` offset. Primary-bg by default; `--media-toast--success` switches to green; `--media-toast--error` to red. `shadow-modal`, 2.8s dwell.

---

## Iconography

See `ICONOGRAPHY` (below).

### Approach

FrontPress Studio uses **inline SVG icons authored by hand in each template**. There is no imported icon font, no Lucide/Heroicons CDN dependency, no `<img>` icons.

### Spec

Every sidebar icon is a **16×16 viewBox SVG** with:

- `fill="none"`
- `stroke="currentColor"`
- `stroke-width="1.5"`
- Simple geometric primitives: `rect`, `circle`, `polyline`, `path` with straight-line coordinates.

This matches the Lucide / Tabler stroke aesthetic very closely (thin strokes, rounded joins implicit). If additional icons are needed for design work, **Lucide is the closest match** and is the recommended substitute (stroke-width 1.5, 16px grid). Flagged as a substitution — the project itself has no icon library; it hand-draws.

### Inventory (from `cms/templates/_layout.php` and others)

| Use | SVG (16×16) |
| --- | --- |
| All content (grid of 4 squares) | 4 × `<rect rx=1>` in a 2×2 |
| Folder / post-type | `<path>` forming an open folder |
| New / plus | cross of two lines `M8 3v10 M3 8h10` |
| Media library | rect + circle + mountain path |
| Themes | 3 panels (two vertical + one horizontal) |
| Backup | box with down-arrow |
| Settings (gear) | circle + 8 radial ticks |
| Logout | door + right-arrow |
| Search (6.5r circle + 3px tail) | in list header search inputs |
| Select chevron | inlined data-URI SVG |
| Upload cloud | 32×32 variant on dropzone |

Icon colors come from `currentColor`. Opacity tweaks (`opacity: .7` default → `1` when active in sidebar) replace any color change.

### Emoji usage

Minimal and pragmatic. **Only** on non-image media file cards:

- `📄` PDF
- `🗜` ZIP
- `📁` default / other

These are never decorative; they're substitutes for thumbnails that don't exist.

### Unicode used as UI

- `×` (0x00D7) — close button on modals (`.btn-icon` content).
- `→` / `←` — pagination, "View →" link after the editor.
- `—` — em-dash in labels ("Admin Login", "FrontPress Studio — Ultralight flat-file CMS")
- `✓` — success state in "Applied ✓"

### Logo

A 24×24 rounded-square mark (black, white "M") + wordmark "FrontPress Admin". Reproduced in `assets/logo-mark.svg`. On the public site there is no logo — just the site name in plain text via the `site.name` config.

---

## Font note

**Pure system fonts, no webfonts.** Both surfaces use the platform sans stack (`-apple-system, BlinkMacSystemFont, system-ui, …`) and the platform mono stack (`ui-monospace, SFMono-Regular, Menlo, …`). Renders natively on every OS; no network fetch, no FOUT, zero payload.
