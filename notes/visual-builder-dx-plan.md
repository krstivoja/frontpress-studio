# FrontPress Studio — Visual Builder DX Improvement Plan

> **notes/ = idea container.**
> Drop discussion notes + plans here so we don't forget them.
> First entry below: visual-builder DX improvement plan (2026-07-05).

---

## Context

Goal: improve developer/author experience by learning from best-in-class
visual builders (Builder.io, Webflow, Framer, Plasmic, Storyblok, Contentful)
and applying the good parts to FrontPress Studio — **without** abandoning the
code-first, source-is-truth philosophy.

A codebase review + two deep exploration passes confirmed the real state of
the system (below). FrontPress already has a strong foundation: a source-first
Theme Builder, a component registry with full CRUD, JSX-like `<Tag/>` →
`component()` compilation, and a preview↔source click bridge. The opportunity
is to turn the component registry from *"preview cards + free-form sample JSON"*
into a **real, typed component contract** that powers insertion, inspection,
binding, linting, and safe migration.

Recommendation: build a **source-first visual builder**, not a freeform canvas.
The win = give developers a typed, inspectable component contract while letting
authors compose real theme components safely.

---

## What already exists (verified)

| Capability | State | Location |
|---|---|---|
| `theme.components.json` registry | **Full CRUD** + validation + atomic writes | `cms/lib/ThemeComponentRegistry.php` |
| Entry fields | `id, name, template, category, description, sample`, computed `template_exists` | same, `:84-92` |
| Registry lives at | `site/themes/<theme>/theme.components.json` (kit has 12 components) | on disk |
| JSX `<Hero/>` → `component()` in **Twig** | Works | `cms/lib/Twig/ComponentTagLoader.php:23` |
| JSX `<Hero/>` → `component()` in **PHP** | Works | `cms/lib/template_helpers.php:84` |
| `processMarkdown()` | Implemented + **test-covered**, but **NOT wired** to production | `ComponentTagProcessor.php:46` |
| REST: list/add/update/delete components | Works | `cms/lib/Api/ThemesController.php`, `/admin/api/themes/components*` |
| REST: isolated component HTML preview | Works (merges `sample`, iframes) | `cms/lib/Api/ComponentPreview.php`, `/admin/themes/component-preview` |
| Source-first Theme Builder | `draft` string is canonical; block tree = `useMemo(parseThemeBlocks(draft))` | `src/screens/ThemeBuilder.jsx:109` |
| Preview click → source bridge | `postMessage {path, tag, occurrence}` | `ThemeBuilder.jsx:150-188`, `bootstrap.php:213+` |
| Pattern Library (gallery + CRUD) | Previews components, edits registry — but **no insert action** | `src/components/PatternLibraryModal.jsx` |
| Snippets panel (cursor insert) | Inserts built-ins/partials/theme snippets — **ignores registry** | `src/components/ThemeBuilderComponentsPanel.jsx` |
| Insert primitive | `insertSnippet(draft, snippet, {line})` | `src/lib/themeBuilderSnippets.js` |
| Line-based move primitive | `moveBlock()` (line ranges, re-indent) | `src/lib/themeBuilderBlocks.js:54` |

## The actual gaps (what to build)

1. **No prop schema.** `sample` is free-form/untyped. No declared props, types,
   defaults, enums, slots — they live only in prose `description` + example data.
   **This is the keystone.** Everything downstream (inserter defaults, inspector
   fields, binding picker, lint, migration) needs it.
2. **Markdown components inert.** `processMarkdown()` exists + tested but
   `Content::parse()` (`Content.php:85`) sends Markdown straight to CommonMark.
   `<Hero/>` in `.md` content renders as a literal unknown tag. Missing link.
3. **Registry & insertion are disjoint.** Pattern Library previews but can't
   insert; Snippets panel inserts but never reads the registry. No path inserts
   a registered component as `{{ component('id', {...}) }}`.
4. **Parser is line-granular, identity-unstable.** No byte/char offsets; block
   IDs regenerate every parse (`html-${line}-${seq}`); no component-instance
   node type. Sub-line edits + reliable instance selection impossible today.
5. **No component preview correspondence.** `findElementByTag` matches only
   `source:'html'` DOM tags; Twig `component()` calls have zero click mapping.
   Server `fp:src` markers are file-level, not instance-level.

---

## Improvement ideas — full list, grouped by phase

Dependency order. Each phase ships value on its own; later phases build on earlier.

### Phase 1 — Component manifest = typed contract (keystone)

Extend each `theme.components.json` entry with a structured schema. Mirrors how
Builder.io / Webflow / Framer / Plasmic expose code components: **code owns the
component, metadata defines editable props, defaults, slots, valid values.**

```json
{
  "id": "hero",
  "tag": "Hero",
  "template": "templates/components/hero.twig",
  "inputs": [
    { "name": "title",   "type": "text",  "default": "Headline", "bindable": true },
    { "name": "variant", "type": "enum",  "options": ["centered", "split"] },
    { "name": "image",   "type": "media" }
  ],
  "slots": [
    { "name": "actions", "allowed": ["button"], "default": [] }
  ],
  "examples": [
    { "name": "Landing hero", "props": { "title": "Build faster" } }
  ]
}
```

- Prop types to support: `text`, `richtext`, `number`, `boolean`, `enum`,
  `media`, `link`, `color`(token), `component`/`slot`.
- Keep it **additive** (open decision — see below): keep `sample` working for
  existing previews, layer `inputs`/`slots`/`examples` on top → no day-one
  migration of the 12 kit components.
- Files: `ThemeComponentRegistry.php` (schema + validation), `ThemesController`
  (expose schema), `ComponentPreview.php` (prefer `examples[0].props`).
- **Docs:** update component/registry docs + changelog (per project rules).

### Phase 2 — Component Inserter (merge Pattern Library + Snippets)

Add a **"Components" tab** to the snippets sidebar that reads
`/admin/api/themes/components`, previews each, and inserts using manifest
defaults:

```twig
<Hero title="Headline" variant="centered" />
```

- Reuse `insertSnippet()` as the emitter; build the `<Tag .../>` (or
  `{{ component('id', {...}) }}`) string from `inputs[].default`.
- Fold Pattern Library preview + registry CRUD and Snippets insertion into one
  coherent inserter surface.
- Files: `ThemeBuilderComponentsPanel.jsx`, `PatternLibraryModal.jsx`,
  `themeBuilderSnippets.js`.

### Phase 3 — Parser upgrade: "HTML outline" → "FrontPress source tree"

Keep source as truth, but teach the parser real node types + stable positions.

- New node types: `component-tag` (`<Hero/>`), `component-call`
  (`component('hero', …)`), `partial-call`, `slot`, `loop`, `condition`,
  `html-element`, `fp:block` marker.
- **Store byte/char offsets alongside line numbers** → enables sub-line + safe
  drag/drop, prop editing, rename, wrap, extract, format.
- Give instances a **stable identity** (not line+seq regenerated per parse).
- Files: `src/lib/themeBuilderTokenizer.js`, `themeBuilderBlocks.js`.
- Largest gap; unlocks Phase 4.

### Phase 4 — Component Instance Inspector

Click a rendered `Hero` in preview → inspect that specific instance. Needs
Phase 1 (schema) + Phase 3 (offsets + component preview correspondence).

- Extend preview markers to be **instance-level**, and map component clicks
  back to their `component()` source span (today only HTML tags map).
- Inspector tabs:
  - **Instance** — edit `title`, `image`, `variant`, CMS bindings for this call.
  - **Source** — open `templates/components/hero.twig`.
  - **Usage** — all pages/templates using this component.
- Files: `bootstrap.php` `inject_preview_script`, `ThemeBuilderPreview.jsx`,
  `ThemeBuilder.jsx:150-188`, registry (schema-driven fields).

### Phase 5 — Reusable components in Markdown content

`processMarkdown()` already exists + tested — wire it into `Content::parse()`
so `<Hero/>` in `.md` content renders. Then add a **"Blocks" mode** in Page
Editor for non-technical authors.

```php
$html = $this->md->convert(
    ComponentTagProcessor::processMarkdown($body, $allowlistedRender)
)->getContent();
```

- **Security:** content authors could otherwise invoke *any* theme component,
  including internal ones. Gate with a registry flag (`content_insertable: true`)
  / allowlist. `Content.php` currently runs `html_input => 'allow'` — the
  allowlist is mandatory, not optional.
- Files: `Content.php`, `ComponentTagProcessor.php`, registry (allowlist flag).
- If we decide **not** to wire it: fix docs/tests so they don't imply Markdown
  support (avoid a false contract).

### Phase 6 — Bigger product ideas (post-inspector)

- **Auto-discover components** from `templates/components/*.twig`; infer props
  from `|default(...)`; suggest missing registry entries.
- **Binding picker:** static value, `meta.title`, `config.site.name`,
  `post.url`, `query.sent`, etc.
- **Component usage graph:** "where is this used?", "which props are stale?",
  "which components are unregistered?"
- **Preview states:** empty data, long text, missing image, mobile viewport,
  archive item vs page item.
- **Safe prop migration:** rename `cta_label` → `button_label` and update every
  usage.
- **Builder lint:** broken assets, missing alt text, invalid links, unused
  components, hard-coded colors outside tokens.

---

## Open decisions (yours to make)

1. **Scope for the first patch** — Phase 1 only (fastest real win), through
   Phase 4 (instance inspector = the marquee feature), or full phased roadmap.
2. **Markdown components** — wire `processMarkdown()` (with allowlist) vs keep
   components theme-only + fix docs.
3. **Manifest shape** — additive (`sample` + `inputs`/`slots`/`examples`) vs
   migrate `sample` → `examples[].props` now.

## Research references

- Builder.io custom components · Webflow Code Components (props/slots/CMS
  binding) · Webflow prop types · Framer Property Controls · Plasmic code
  components · WordPress `block.json` metadata · Storyblok Visual Editor ·
  Contentful Inspector Mode.

## Docs / changelog reminder (project rule)

Every phase that ships a feature needs a matching `site/content/docs/*.md`
edit + `site/content/changelog/<version>.md` entry in the marketing-website
checkout **in the same patch**. Those files sit on disk until pushed from the
docs-site admin — **remind the operator to push** after each shipping patch.

---

## Verification (per shipping phase)

- **P1:** unit-test schema validation in `ThemeComponentRegistry`; hit
  `GET /admin/api/themes/components` and confirm `inputs`/`slots`/`examples`
  round-trip; component-preview still renders.
- **P2:** insert a component from the Components tab; confirm emitted
  `<Tag/>` uses manifest defaults and renders in preview.
- **P3:** parser unit tests for each new node type + offset round-trip
  (parse → edit via offsets → reparse stable).
- **P4:** click a rendered component in preview → inspector opens the correct
  instance; edit a prop → source span updates; Usage tab lists real callers.
- **P5:** `<Hero/>` in a `.md` content file renders; a non-allowlisted
  component is rejected.
