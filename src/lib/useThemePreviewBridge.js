import { useEffect, useState } from 'react';
import { findElementByTag } from './themeBuilderBlocks.js';
import { textEditReason, rawBlockInner } from './themeBuilderText.js';

/**
 * Wires the Theme Builder preview iframe ↔ editor message bridge.
 *
 * The public-side preview script (see bootstrap.php `inject_preview_script`)
 * posts these message types, all carrying a source-file `path`:
 *   - `fp:select`     — user clicked an element; select its source block.
 *   - `fp:action`     — user hit Duplicate / Delete on the in-canvas toolbar.
 *   - `fp:move`       — user drag-dropped an element to reorder / reparent it.
 *   - `fp:insert`     — user dropped a sidebar component onto the canvas.
 *   - `fp:text-probe` — user double-clicked text; asks whether it's editable.
 *   - `fp:text`       — user committed an inline text edit.
 *   - `fp:goto-source`— data-bound text: jump to + focus its source line.
 *
 * `fp:text-probe` is answered synchronously (no state change) by posting an
 * `fp:text-verdict` back to the iframe: the iframe can't tell static text
 * from resolved `{{ ... }}` output, so the source-side guard decides.
 *
 * When the message's path is a file other than the one open, we switch to
 * it and queue the resolution until that file's draft has parsed into
 * blocks (the block tree isn't available until the new draft loads).
 */
export function useThemePreviewBridge({
  files,
  path,
  draft,
  blocks,
  dirty,
  openFile,
  setSelectedBlockId,
  runAction,
  runMove,
  runText,
  runInsert,
  gotoSource,
}) {
  // A single queued message awaiting the switched-to file's draft.
  const [pending, setPending] = useState(null);

  // Resolve a message's tag/occurrence(s) against the current block tree and
  // dispatch. Recreated each render so it closes over the latest `blocks`.
  function resolve(data) {
    if (data.type === 'fp:move') {
      const from = findElementByTag(blocks, data.fromTag || null, data.fromOccurrence ?? -1);
      const to = findElementByTag(blocks, data.toTag || null, data.toOccurrence ?? -1);
      if (from && to) runMove(from.id, to.id, data.position);
      return;
    }
    const match = findElementByTag(blocks, data.tag || null, data.occurrence ?? -1);
    if (!match) return;
    if (data.type === 'fp:insert') runInsert(match.id, data.position);
    else if (data.type === 'fp:action') runAction(data.action, match.id);
    else if (data.type === 'fp:text') {
      if (data.raw != null) runText(match.id, { rawInner: data.raw });
      else runText(match.id, { html: data.html, align: data.align, tag: data.newTag });
    }
    else if (data.type === 'fp:goto-source') gotoSource(match.id);
    else setSelectedBlockId(match.id);
  }

  useEffect(() => {
    function onMessage(e) {
      const data = e.data;
      if (!data) return;

      // Probe: iframe asks whether a double-clicked text element is editable.
      // Answered only for the file already open (the block tree we can check
      // against); a probe for another file is treated as not-editable.
      if (data.type === 'fp:text-probe') {
        const match = path === data.path
          ? findElementByTag(blocks, data.tag || null, data.occurrence ?? -1)
          : null;
        const reason = match ? textEditReason(draft, match.id, blocks) : 'complex';
        // Three outcomes:
        //   rich — inline-only literal: edit the rendered element (bold/align/…)
        //   raw  — a single-line Twig/PHP expression: edit the source inline
        //   code — anything else (multiline / nested block): jump to the code row
        let mode = 'code';
        let raw = null;
        if (reason === 'ok') {
          mode = 'rich';
        } else if (reason === 'dynamic') {
          const inner = rawBlockInner(draft, match.id, blocks);
          if (inner != null && !inner.includes('\n')) { mode = 'raw'; raw = inner; }
        }
        e.source?.postMessage({
          type: 'fp:text-verdict',
          path: data.path,
          tag: data.tag,
          occurrence: data.occurrence,
          mode,
          raw,
        }, '*');
        return;
      }

      if (!['fp:select', 'fp:action', 'fp:move', 'fp:insert', 'fp:text', 'fp:goto-source'].includes(data.type)) return;
      if (typeof data.path !== 'string' || !files.some((f) => f.path === data.path)) return;

      if (path === data.path) {
        // Same file already open — resolve against the current tree now.
        resolve(data);
        return;
      }
      // A canvas element in another file — open/activate its tab (parking the
      // current tab's edits) and resolve once its draft has parsed.
      openFile(data.path);
      setPending(data);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [files, path, draft, dirty, blocks, resolve, openFile, setSelectedBlockId]);

  // Once the switched-to file's draft has parsed, resolve the queued message.
  useEffect(() => {
    if (!pending || !draft) return;
    resolve(pending);
    setPending(null);
  }, [pending, draft, blocks, resolve]);
}
