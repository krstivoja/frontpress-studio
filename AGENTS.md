# FrontPress Studio — project rules

## File size budget

**No source file over 300 lines.** Applies to `.js`, `.jsx`, and `.php` under
`app/src/` and `app/cms/lib/`. Excluded: generated files (`app/admin/assets/`),
vendored code, theme templates.

When a file approaches the limit, split it. Patterns the codebase has already
adopted:

- **React screens** → extract sidebars/panels into their own components and
  pull network plumbing into custom hooks under `src/lib/use*.js`.
  See `screens/PageEditor.jsx` ↔ `components/PageEditorSidebar.jsx`,
  `lib/useToastUiEditor.js`, `lib/usePageMutations.js` for the canonical split.
- **Backend services** → break out orthogonal helpers (`FilesystemUtils`,
  `BackupRestorer`, `ThumbnailGenerator`, `ImageAnnotator`).
- **Pure helpers** → put them in `src/lib/` or `cms/lib/` as a flat module,
  not as a private static method on a class that's already big.

If a split would obscure something cohesive, mention it in the PR description
rather than silently shipping a 400-line file.

#### test