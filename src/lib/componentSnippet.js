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

function booleanLiteral(v) {
  const value = String(v ?? 'false').trim().toLowerCase();
  return v === true || value === 'true' || value === '1' ? 'true' : 'false';
}

function numberLiteral(v) {
  const value = String(v ?? '').trim();
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : null;
}

function defaultLiteral(input) {
  if (input.type === 'boolean') {
    return { expr: true, value: booleanLiteral(input.default) };
  }
  if (input.type === 'number') {
    const value = numberLiteral(input.default);
    if (value !== null) return { expr: true, value };
  }
  return { expr: false, value: String(input.default ?? '') };
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
  const entries = list
    .filter((i) => i && i.name)
    .map((input) => ({ input, literal: defaultLiteral(input) }));
  if (entries.some(({ literal }) => !literal.expr && String(literal.value).includes('"'))) {
    return buildHelperCall(id, list, syntaxFromPath(path));
  }
  const attrs = entries
    .map(({ input, literal }) => {
      return literal.expr
        ? `${input.name}={${literal.value}}`
        : `${input.name}="${attrValue(literal.value)}"`;
    });
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
    .map((i) => {
      const literal = defaultLiteral(i);
      const value = literal.expr ? literal.value : `'${stringValue(literal.value)}'`;
      return syntax === 'php'
        ? `'${i.name}' => ${value}`
        : `'${i.name}': ${value}`;
    });

  if (syntax === 'php') {
    return `<?php component('${id}', [${parts.join(', ')}]); ?>`;
  }
  return `{{ component('${id}', {${parts.join(', ')}}) }}`;
}
