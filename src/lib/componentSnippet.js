export function pascalCase(id) {
  return String(id || '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function attrValue(v) {
  return String(v ?? '').replace(/"/g, '&quot;');
}

function stringValue(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function toKebab(tag) {
  return String(tag || '').replace(/(?<!^)[A-Z]/g, '-$&').toLowerCase();
}

function syntaxFromPath(path) {
  return /\.php$/i.test(String(path || '')) ? 'php' : 'twig';
}

function canUseTag(tag, id) {
  return /^[A-Z][a-zA-Z0-9]*$/.test(tag) && toKebab(tag) === id;
}

export function buildComponentSnippet(component, inputs, path) {
  const tag = component?.tag || pascalCase(component?.id);
  const list = Array.isArray(inputs) ? inputs : (component?.inputs || []);
  const id = String(component?.id || '');
  if (!canUseTag(tag, id)) {
    return buildHelperCall(id, list, syntaxFromPath(path));
  }
  const attrs = list
    .filter((i) => i && i.name)
    .map((i) => `${i.name}="${attrValue(i.default)}"`);
  return attrs.length
    ? `<${tag} ${attrs.join(' ')} />`
    : `<${tag} />`;
}

export function buildComponentTag(component, inputs) {
  return buildComponentSnippet(component, inputs);
}

function buildHelperCall(id, inputs, syntax) {
  const parts = (inputs || [])
    .filter((i) => i && i.name)
    .map((i) => syntax === 'php'
      ? `'${i.name}' => '${stringValue(i.default)}'`
      : `'${i.name}': '${stringValue(i.default)}'`);

  if (syntax === 'php') {
    return `<?php component('${id}', [${parts.join(', ')}]); ?>`;
  }
  return `{{ component('${id}', {${parts.join(', ')}}) }}`;
}
