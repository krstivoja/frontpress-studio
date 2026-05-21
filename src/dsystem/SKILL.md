---
name: frontpress-studio-design
description: Use this skill to generate well-branded interfaces and assets for FrontPress Studio (the ultralight flat-file PHP CMS), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI-kit components for prototyping both the admin app (shadcn-flavored B&W) and the default public theme (warm cream + purple link).
user-invocable: true
---

# FrontPress Studio design skill

Read `README.md` in this skill for the full system: content fundamentals, visual foundations, iconography, and sources. It's the source of truth.

Then orient yourself to the other files:

- `colors_and_type.css` — the canonical token layer (import this anywhere).
- `assets/` — logos, icons (SVG sprite), sample photos.
- `ui_kits/admin/` — interactive recreation of the admin app (pages list, editor, media, themes, login).
- `ui_kits/public/` — the default public theme (home, blog archive, post, about).
- `preview/` — small design-system cards used for reference.

## Two surfaces

FrontPress Studio has two distinct visual systems. **Pick the right one before you start.**

| Surface              | When to use                                                  | Vibe                             |
| -------------------- | ------------------------------------------------------------ | -------------------------------- |
| **Admin** (primary)  | Dashboard / CMS / internal tools / settings / anything dense | shadcn-flavored B&W, zinc scale  |
| **Public theme**     | Author-facing reading surfaces, blog posts, documentation     | warm cream (`#f1eddd`), purple link (`#7300ff`) |

Do not mix them. The admin never uses the cream. The public theme never uses badges, tables, dropzones, or sidebars.

## When creating visual artifacts (slides, mocks, throwaway prototypes)

1. Copy the relevant UI kit files out of this skill (don't cross-reference the skill dir — copy what you use).
2. Import `colors_and_type.css` — it's the whole token layer.
3. Reuse the `<use href="assets/icons.svg#icon-...">` sprite for icons. If you need an icon that isn't in the sprite, hand-draw a 16×16 / stroke-1.5 SVG in the same style (matches Lucide).
4. Match the content fundamentals from `README.md` for copy: sentence case, terse, no emoji, no exclamation points.
5. Ship static HTML files for the user to view.

## When working on production code

Use `colors_and_type.css` directly (or `cms/src/admin.css` from the repo). Use the markup patterns in `ui_kits/admin/` as a starting point for new screens — class names match the real templates.

## If the user invokes this skill without guidance

Ask what they want to build:

- "Is this for the admin app or the public site?"
- "Is this a whole screen, or just a component?"
- "Is this a prototype to look at, or code to ship?"

Then ask a few problem-specific questions and act as an expert designer for FrontPress Studio, producing either HTML artifacts or production code depending on the answer.

## Substitutions to flag on the way in

- **Fonts:** pure system stacks on both surfaces (`-apple-system, BlinkMacSystemFont, system-ui, …` for sans; `ui-monospace, SFMono-Regular, Menlo, …` for mono). No webfonts. If a user asks for a custom display face, attach the font and update `colors_and_type.css`.e file.
- **Icons:** the 11-icon inline-SVG set in the repo is complete for the admin's current needs. If you need more, draw them in the same style (16×16 viewBox, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`) or substitute from Lucide and flag it.
