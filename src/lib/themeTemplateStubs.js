// Starter content for newly-created theme files. Used by the Files tab's
// "+ New" flow so a fresh template lands with the right boilerplate instead
// of an empty buffer. Non-template paths (components, assets, nested files)
// get an empty string — the author fills those in themselves.

function blankTemplateStub(ext) {
  if (ext === 'php') return `<?php /* New template */ ?>\n`;
  return [
    "{% extends '_layout.twig' %}",
    '',
    '{% block content %}',
    '  ',
    '{% endblock %}',
    '',
  ].join('\n');
}

function blankPartialStub(ext) {
  if (ext === 'php') return `<?php /* New partial */ ?>\n`;
  // Partials are fragments — no extends/blocks, just a div to start from.
  return ['<div class="partial">', '  ', '</div>', ''].join('\n');
}

const PARTIAL_RE  = /^templates\/_[^/]+\.(twig|php)$/;
const TEMPLATE_RE = /^templates\/[^_/][^/]*\.(twig|php)$/;

/**
 * Boilerplate for a file about to be created at `path`.
 *
 * - `templates/_<name>.(twig|php)` → partial stub
 * - `templates/<name>.(twig|php)`  → page-template stub (extends _layout)
 * - anything else (components/*, assets, nested, other extensions) → ''
 */
export function stubForPath(path) {
  const p = String(path || '').replace(/^\/+/, '');
  const ext = p.slice(p.lastIndexOf('.') + 1);
  if (PARTIAL_RE.test(p))  return blankPartialStub(ext);
  if (TEMPLATE_RE.test(p)) return blankTemplateStub(ext);
  return '';
}
