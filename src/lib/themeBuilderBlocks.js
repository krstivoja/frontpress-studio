import { tokenizeThemeSource } from './themeBuilderTokenizer.js';

// Tags the outline surfaces as selectable blocks. Curated, not exhaustive
// — `<span>` and most inline-only elements would drown the structure view
// in noise. If you're missing a tag here, the rule is "is it something a
// theme author would want to point at in the outline?" If yes, add it.
//
// Mirrored in `bootstrap.php`'s `inject_preview_script` so the preview's
// click-to-select bridge resolves the same set of tags. Keep them in sync.
const VISUAL_TAGS = new Set([
  // Sectioning + layout
  'article', 'aside', 'div', 'footer', 'form', 'header', 'li', 'main',
  'nav', 'ol', 'section', 'ul',
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Text content
  'p', 'blockquote', 'pre',
  // Media + embeds
  'a', 'button', 'img', 'figure', 'figcaption', 'video', 'audio', 'iframe',
  // Tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  // Misc
  'hr',
]);

export function parseThemeBlocks(source) {
  const tokens = tokenizeThemeSource(String(source || ''));
  return buildTree(tokens);
}

export function flattenBlocks(blocks, depth = 0, parentId = null) {
  return blocks.flatMap((block) => [
    { ...block, depth, parentId, children: undefined },
    ...flattenBlocks(block.children || [], depth + 1, block.id),
  ]);
}

/**
 * Move a block in the outline relative to a target block. Supports
 * cross-parent moves: `position: 'before' | 'after' | 'inside'`
 * specifies where to drop the moved chunk relative to `toId`.
 *
 * Re-indents the moved chunk to match the target context. The chunk's
 * current leading indent (the minimum indent across its non-empty lines)
 * is stripped, then a new indent matching the target row's indent (plus
 * one extra step for `'inside'`) is added.
 *
 * Returns the new source string. No-ops (returns the original) when:
 *   - either block can't be located,
 *   - `toId === fromId`,
 *   - dropping a block inside one of its own descendants (would tangle
 *     the tree).
 */
export function moveBlock(source, fromId, toId, position, blocks) {
  if (!fromId || !toId || fromId === toId) return source;
  if (!['before', 'after', 'inside'].includes(position)) return source;

  const flat = flattenBlocks(blocks);
  const from = flat.find((b) => b.id === fromId);
  const to   = flat.find((b) => b.id === toId);
  if (!from || !to) return source;
  if (!from.startLine || !from.endLine || !to.startLine || !to.endLine) return source;

  // Refuse "drop a parent inside its own descendant" — that would orphan
  // the tree. Walk down from `from` and bail if we find `to`.
  if (isDescendant(blocks, fromId, toId)) return source;

  const lines = String(source || '').split('\n');
  const chunk = lines.slice(from.startLine - 1, from.endLine);

  // Strip the chunk's current leading indent so we can re-indent fresh.
  const currentIndent = minLeadingWhitespace(chunk);
  const stripped = chunk.map((l) => (l.length >= currentIndent ? l.slice(currentIndent) : l));

  // Target indent: the indent of the target's first line, plus one
  // extra step for `'inside'`. We don't know the project's tab size; the
  // codebase's existing snippets all use 2-space indent, so we match.
  const targetLine = lines[to.startLine - 1] || '';
  const baseIndent = targetLine.match(/^\s*/)?.[0] || '';
  const indent = position === 'inside' ? baseIndent + '  ' : baseIndent;
  const reindented = stripped.map((l) => (l.length ? indent + l : l));

  // Remove the chunk first so subsequent line numbers line up. Then
  // compute where to splice it back in. `to.startLine` / `to.endLine`
  // need adjusting when the removed chunk was above them.
  lines.splice(from.startLine - 1, chunk.length);
  let toStart = to.startLine;
  let toEnd   = to.endLine;
  if (from.startLine < to.startLine) {
    toStart -= chunk.length;
    toEnd   -= chunk.length;
  }

  let insertAt;
  if (position === 'before') {
    insertAt = toStart - 1;
  } else if (position === 'after') {
    insertAt = toEnd;
  } else {
    // 'inside' — after the target's opening line. This puts the moved
    // chunk as the first child of the target. Good enough for the
    // common case ("drop into an empty container"); the user can
    // re-drag among siblings to fine-tune ordering.
    insertAt = toStart;
  }
  lines.splice(insertAt, 0, ...reindented);
  return lines.join('\n');
}

/**
 * Insert a fresh chunk of source (e.g. a component `<Tag/>` snippet)
 * relative to a target block. `position: 'before' | 'after' | 'inside'`
 * mirrors `moveBlock`'s drop semantics but there's no source chunk to
 * remove — the lines come from the caller.
 *
 * Re-indents `snippetLines` to the target context (its own leading indent
 * is stripped first, then the target row's indent — plus one step for
 * `'inside'` — is applied). Returns the new source string, or the original
 * unchanged when the target can't be located or the snippet is empty.
 */
export function insertBlockRelative(source, toId, position, snippetLines, blocks) {
  if (!toId || !['before', 'after', 'inside'].includes(position)) return source;
  if (!Array.isArray(snippetLines) || snippetLines.length === 0) return source;

  const flat = flattenBlocks(blocks);
  const to = flat.find((b) => b.id === toId);
  if (!to || !to.startLine || !to.endLine) return source;

  const lines = String(source || '').split('\n');
  const targetLine = lines[to.startLine - 1] || '';
  const baseIndent = targetLine.match(/^\s*/)?.[0] || '';
  const indent = position === 'inside' ? baseIndent + '  ' : baseIndent;

  const currentIndent = minLeadingWhitespace(snippetLines);
  const reindented = snippetLines.map((l) => {
    const body = l.length >= currentIndent ? l.slice(currentIndent) : l;
    return body.length ? indent + body : body;
  });

  let insertAt;
  if (position === 'before') insertAt = to.startLine - 1;
  else if (position === 'after') insertAt = to.endLine;
  else insertAt = to.startLine; // 'inside' → first child of the target

  lines.splice(insertAt, 0, ...reindented);
  return lines.join('\n');
}

/**
 * Duplicate a block: copy its source line-range and insert the copy
 * immediately after the original. Returns the new source string, or the
 * original unchanged when the block can't be located or has no line range
 * (Twig/marker blocks that never closed clamp to a range, so those work too).
 */
export function duplicateBlock(source, id, blocks) {
  if (!id) return source;
  const block = findBlock(blocks, id);
  if (!block || !block.startLine || !block.endLine) return source;
  const lines = String(source || '').split('\n');
  const chunk = lines.slice(block.startLine - 1, block.endLine);
  lines.splice(block.endLine, 0, ...chunk);
  return lines.join('\n');
}

/**
 * Delete a block by removing its source line-range. Returns the new source
 * string, or the original unchanged when the block can't be located or has
 * no line range.
 */
export function deleteBlock(source, id, blocks) {
  if (!id) return source;
  const block = findBlock(blocks, id);
  if (!block || !block.startLine || !block.endLine) return source;
  const lines = String(source || '').split('\n');
  lines.splice(block.startLine - 1, block.endLine - block.startLine + 1);
  return lines.join('\n');
}

function isDescendant(blocks, ancestorId, candidateId) {
  function walk(items, foundAncestor) {
    for (const b of items) {
      const here = foundAncestor || b.id === ancestorId;
      if (here && b.id === candidateId && b.id !== ancestorId) return true;
      if (b.children && walk(b.children, here)) return true;
    }
    return false;
  }
  return walk(blocks, false);
}

function minLeadingWhitespace(lines) {
  let min = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(/^(\s*)/);
    const n = m ? m[1].length : 0;
    if (n < min) min = n;
  }
  return min === Infinity ? 0 : min;
}

/**
 * Return every ancestor of the block containing `line`, ordered
 * outermost → innermost (inclusive of the leaf itself). Used by the
 * code editor's breadcrumb strip.
 *
 * Strategy: pick the deepest block whose `[startLine..endLine]` covers
 * the cursor, then walk *up* via `parentId`. Earlier versions did a
 * depth-first walk and pushed every block whose range covered the
 * line, which got confused on multi-element-per-line markup (e.g.
 * `<li><a>…</a></li>` all on one row) because the depth-first selector
 * stopped at the first matching sibling instead of the most specific
 * one. Walking up from the deepest match avoids that entirely.
 */
export function findAncestorsAtLine(blocks, line) {
  const flat = flattenBlocks(blocks);
  let deepest = null;
  for (const b of flat) {
    if (!b.startLine || !b.endLine) continue;
    if (line < b.startLine || line > b.endLine) continue;
    if (!deepest || b.depth > deepest.depth) deepest = b;
  }
  if (!deepest) return [];

  const byId = new Map(flat.map((b) => [b.id, b]));
  const chain = [];
  let curr = deepest;
  // Defensive bound — a malformed tree could in theory create a cycle.
  for (let i = 0; i < flat.length && curr; i += 1) {
    chain.unshift(curr);
    curr = curr.parentId ? byId.get(curr.parentId) : null;
  }
  return chain;
}

export function findBlock(blocks, id) {
  for (const block of blocks) {
    if (block.id === id) return block;
    const child = findBlock(block.children || [], id);
    if (child) return child;
  }
  return null;
}

/**
 * Depth-first walk to find the Nth `element` block with a given tag.
 * Used by the preview-click bridge: the iframe sends `{path, tag, occurrence}`
 * for what was clicked; we resolve that to a source block here.
 */
export function findElementByTag(blocks, tag, occurrence) {
  if (!tag || occurrence < 0) return null;
  let n = 0;
  function walk(items) {
    for (const b of items) {
      if (b.source === 'html' && b.tag === tag) {
        if (n === occurrence) return b;
        n += 1;
      }
      if (Array.isArray(b.children) && b.children.length) {
        const found = walk(b.children);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(blocks);
}

/**
 * Inverse of `findElementByTag`: given an html-source block, compute the
 * occurrence index it would land at if `findElementByTag` were called.
 * Used by the outline → preview bridge: parent posts `{path, tag,
 * occurrence}` to the iframe, which finds the matching DOM element and
 * scrolls to it.
 *
 * Returns -1 for blocks the bridge can't resolve (Twig / marker blocks
 * have no DOM tag, and blocks that aren't reachable in the tree).
 */
export function occurrenceOfBlock(blocks, target) {
  if (!target || target.source !== 'html' || !target.tag) return -1;
  let n = 0;
  let found = -1;
  function walk(items) {
    for (const b of items) {
      if (found !== -1) return;
      if (b.source === 'html' && b.tag === target.tag) {
        if (b.id === target.id) { found = n; return; }
        n += 1;
      }
      if (Array.isArray(b.children) && b.children.length) walk(b.children);
    }
  }
  walk(blocks);
  return found;
}

function buildTree(events) {
  const root = { id: 'root', children: [] };
  const stack = [root];

  // Monotonic per-build counter — appended to every generated ID so that
  // multiple blocks at the same line (e.g. `<li><a>…</a></li>` inline)
  // don't collide. Identity must be unique for `selectedBlockId`,
  // `findBlock`, parent-chain walks, and React keys to behave.
  let seq = 0;

  for (const ev of events) {
    if (ev.kind === 'marker-open') {
      seq += 1;
      pushBlock(stack, {
        id: ev.id,
        type: ev.type,
        label: ev.label,
        source: 'marker',
        startLine: ev.line,
        endLine: ev.line,
        children: [],
      });
      continue;
    }
    if (ev.kind === 'marker-close') {
      closeMostRecent(stack, (b) => b.source === 'marker', ev.line);
      continue;
    }
    if (ev.kind === 'twig-open') {
      seq += 1;
      pushBlock(stack, {
        id: `twig-${ev.line}-${seq}`,
        type: ev.type,
        label: ev.label,
        source: 'code',
        startLine: ev.line,
        endLine: ev.line,
        children: [],
      });
      continue;
    }
    if (ev.kind === 'twig-close') {
      closeMostRecent(stack, (b) => b.source === 'code' && b.type === ev.type, ev.line);
      continue;
    }
    if (ev.kind === 'html-open') {
      if (!VISUAL_TAGS.has(ev.tag)) continue;
      seq += 1;
      pushBlock(stack, {
        id: `html-${ev.line}-${seq}`,
        type: 'element',
        label: `<${ev.tag}>`,
        tag: ev.tag,
        source: 'html',
        startLine: ev.line,
        endLine: ev.line,
        children: [],
      });
      continue;
    }
    if (ev.kind === 'html-close') {
      if (!VISUAL_TAGS.has(ev.tag)) continue;
      closeMostRecent(stack, (b) => b.source === 'html' && b.tag === ev.tag, ev.line);
      continue;
    }
  }

  // Anything still open at EOF gets its end line clamped to the last
  // event's line so down-stream code (delete, swap) has a sane range.
  const lastLine = events.length ? events[events.length - 1].line : 1;
  while (stack.length > 1) {
    stack[stack.length - 1].endLine = lastLine;
    stack.pop();
  }

  return root.children;
}

function pushBlock(stack, block) {
  stack[stack.length - 1].children.push(block);
  stack.push(block);
}

function closeMostRecent(stack, predicate, line) {
  for (let i = stack.length - 1; i > 0; i -= 1) {
    if (!predicate(stack[i])) continue;
    stack[i].endLine = line;
    stack.length = i;
    return;
  }
}

