import { findBlock } from './themeBuilderBlocks.js';

// Inline text editing for the Theme Builder canvas. A canvas edit round-trips
// an element's inner HTML back to the template, so it's only safe when that
// inner is **static markup**: no Twig/PHP expression (its rendered text is
// *data*, not in the source) and no block-level child (headings, lists,
// nested sections belong to the structural editor, not text editing).
//
// Inline formatting tags — `<span>`, `<a>`, `<strong>`, `<em>`, `<b>`, … —
// ARE allowed, so `<p>Read <a href="/x">more</a></p>` is editable and keeps
// its link. On commit an edit can also carry block-level formatting: a
// `text-align` value (merged into the element's inline `style`) and a new tag
// (`<p>` ↔ `<h1>`–`<h6>`). The guards below are the correctness backstop:
// worst case a commit is a no-op, never a source corruption.

const INLINE_TAGS = [
  'a', 'abbr', 'b', 'br', 'cite', 'code', 'del', 'em', 'i', 'ins', 'kbd',
  'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u',
  'var', 'wbr',
];
const INLINE_TAG_RE = new RegExp('</?(?:' + INLINE_TAGS.join('|') + ')\\b[^>]*>', 'gi');
const DYNAMIC_RE = /\{\{|\{%|<\?/;
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// True when `str` is text plus only inline formatting tags — no Twig/PHP and
// no block-level (or unknown) tags. Strips the allowed inline tags and checks
// nothing tag-like remains.
function isInlineOnly(str) {
  if (DYNAMIC_RE.test(str)) return false;
  return !str.replace(INLINE_TAG_RE, '').includes('<');
}

// Structural split of an html block's source into open tag / inner / close
// tag over its line-range. Returns null when the range isn't a single clean
// element wrapper (e.g. several elements sharing a line).
function innerRange(source, block) {
  if (!block || block.source !== 'html' || !block.tag) return null;
  if (!block.startLine || !block.endLine) return null;
  const lines = String(source || '').split('\n');
  const segment = lines.slice(block.startLine - 1, block.endLine).join('\n');
  const re = new RegExp(
    '^(\\s*<' + block.tag + '\\b[^>]*>)([\\s\\S]*)(</' + block.tag + '\\s*>\\s*)$',
    'i',
  );
  const m = segment.match(re);
  if (!m) return null;
  return { lines, before: m[1], inner: m[2], after: m[3] };
}

// Set/replace/remove one declaration in an open tag's inline `style`
// attribute, preserving the others. An empty `value` removes the property.
function setStyleProp(openTag, prop, value) {
  const styleRe = /\sstyle="([^"]*)"/i;
  const m = openTag.match(styleRe);
  const decls = new Map();
  if (m) {
    for (const d of m[1].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
  }
  if (value) decls.set(prop, value);
  else decls.delete(prop);
  const serial = [...decls].map(([k, v]) => `${k}:${v}`).join(';');
  if (!m) return serial ? openTag.replace(/>$/, ` style="${serial}">`) : openTag;
  return serial ? openTag.replace(styleRe, ` style="${serial}"`) : openTag.replace(styleRe, '');
}

// Why a block can't be inline-edited, for the canvas hint:
//   'ok'      — editable
//   'dynamic' — holds a Twig/PHP expression (edit the value in front-matter / code)
//   'complex' — nested block markup or an unmappable range (edit in the code panel)
export function textEditReason(source, id, blocks) {
  const range = innerRange(source, findBlock(blocks, id));
  if (!range) return 'complex';
  if (isInlineOnly(range.inner)) return 'ok';
  return DYNAMIC_RE.test(range.inner) ? 'dynamic' : 'complex';
}

export function canEditBlockText(source, id, blocks) {
  return textEditReason(source, id, blocks) === 'ok';
}

// The block's raw inner source (e.g. `{{ meta.title|default('') }}`), for
// editing a data-bound element's expression inline on the canvas. Null when
// the range isn't a clean single-element wrapper.
export function rawBlockInner(source, id, blocks) {
  const range = innerRange(source, findBlock(blocks, id));
  return range ? range.inner : null;
}

// Apply an inline edit to the block, returning the new source. `edit` is
// either the new inner HTML (string) or an object with any of:
//   html     — new inner HTML (rendered edit; must be inline-only)
//   align    — `text-align` value merged into the element's style ('' removes)
//   tag      — new block tag (`p` / `h1`–`h6`)
//   rawInner — verbatim replacement of the inner source (raw Twig/PHP edit);
//              bypasses the inline-only checks, since the user is editing
//              source directly, exactly as they would in the code panel
// No-ops (returns the source unchanged) when the range isn't a clean element
// wrapper, or — for rendered edits — when the inner or html isn't inline-only,
// so a stray commit can never corrupt the file.
export function setBlockText(source, id, edit, blocks) {
  const opts = typeof edit === 'string' ? { html: edit } : (edit || {});
  const block = findBlock(blocks, id);
  const range = innerRange(source, block);
  if (!range) return source;

  let { before, inner, after } = range;

  if (opts.rawInner != null) {
    inner = String(opts.rawInner);
  } else {
    if (!isInlineOnly(inner)) return source;
    if (opts.html != null) {
      const html = String(opts.html);
      if (!isInlineOnly(html)) return source;
      inner = html;
    }
    if (opts.align != null) before = setStyleProp(before, 'text-align', opts.align);
    if (opts.tag && opts.tag !== block.tag && BLOCK_TAGS.has(opts.tag) && BLOCK_TAGS.has(block.tag)) {
      before = before.replace(new RegExp('^(\\s*)<' + block.tag + '\\b', 'i'), '$1<' + opts.tag);
      after = after.replace(new RegExp('</' + block.tag + '(\\s*>)', 'i'), '</' + opts.tag + '$1');
    }
  }

  range.lines.splice(
    block.startLine - 1,
    block.endLine - block.startLine + 1,
    ...(before + inner + after).split('\n'),
  );
  return range.lines.join('\n');
}
