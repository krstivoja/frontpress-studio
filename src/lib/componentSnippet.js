// Build the author-facing snippet for a component from its manifest, so
// the sidebar (and later the inserter) can offer a copy-paste tag using
// the declared prop defaults — the same self-closing PascalCase syntax
// documented in the Components docs.

/** `button` → `Button`, `pricing-card` → `PricingCard`. */
export function pascalCase(id) {
  return String(id || '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/** Escape a value for a double-quoted HTML/JSX attribute. */
function attrValue(v) {
  return String(v ?? '').replace(/"/g, '&quot;');
}

/**
 * Return the `<Tag prop="default" … />` string for a component.
 * `inputs` override the manifest's own (so the sidebar can reflect
 * unsaved edits). Every declared input becomes an attribute; its value
 * is the input's default (empty string when none).
 */
export function buildComponentTag(component, inputs) {
  const tag = component?.tag || pascalCase(component?.id);
  const list = Array.isArray(inputs) ? inputs : (component?.inputs || []);
  const attrs = list
    .filter((i) => i && i.name)
    .map((i) => `${i.name}="${attrValue(i.default)}"`);
  return attrs.length
    ? `<${tag} ${attrs.join(' ')} />`
    : `<${tag} />`;
}
