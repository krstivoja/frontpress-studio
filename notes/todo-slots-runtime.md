# TODO — wire `slots` into the component tag runtime

## Status
`slots` is documented and parsed, but has **no runtime effect** yet.

- `ThemeComponentManifest` normalizes/validates/stores `slots[]` from the sidecar manifest.
- `/docs/components` documents `slots` as part of the manifest schema.
- The `<Tag/>` → `component()` compiler does **not** consume `slots` — nothing renders them.

So today `slots` is forward-looking schema only. A theme author declaring a slot sees it in the manifest but gets no child-content rendering.

## To do
- [ ] Decide slot semantics for the tag system: how child content maps to named slots (default slot vs named), and the Twig/PHP render contract.
- [ ] Implement slot passing in the tag compiler + `component()` render path.
- [ ] Pattern Library: let `examples[]` supply slot content so previews show filled slots.
- [ ] Component inserter (Phase 2+): emit slot placeholders / editable child regions.
- [ ] Once wired, drop the "not yet rendered" caveat from `/docs/components` and note it in the changelog.

## Meanwhile
Options for `/docs/components` until this lands:
- Leave as forward-looking schema (current state), **or**
- Add a short "declared but not yet rendered" note next to the `slots` field so readers don't expect child rendering.

Related: [[visual-builder-dx-plan]] (Phase 3/4 covers instance editing / slots).
