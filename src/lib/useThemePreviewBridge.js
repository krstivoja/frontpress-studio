import { useEffect, useState } from 'react';
import { findElementByTag } from './themeBuilderBlocks.js';

/**
 * Wires the Theme Builder preview iframe ↔ editor message bridge.
 *
 * The public-side preview script (see bootstrap.php `inject_preview_script`)
 * posts these message types, all carrying a source-file `path`:
 *   - `fp:select` — user clicked an element; select its source block.
 *   - `fp:action` — user hit Duplicate / Delete on the in-canvas toolbar.
 *   - `fp:move`   — user drag-dropped an element to reorder / reparent it.
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
  setPath,
  setDraft,
  setDirty,
  setSelectedBlockId,
  runAction,
  runMove,
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
    if (data.type === 'fp:action') runAction(data.action, match.id);
    else setSelectedBlockId(match.id);
  }

  useEffect(() => {
    function onMessage(e) {
      const data = e.data;
      if (!data || !['fp:select', 'fp:action', 'fp:move'].includes(data.type)) return;
      if (typeof data.path !== 'string' || !files.some((f) => f.path === data.path)) return;

      if (path === data.path) {
        // Same file already open — resolve against the current tree now.
        resolve(data);
        return;
      }
      if (dirty && !confirm('Discard unsaved changes?')) return;
      setPath(data.path);
      setDraft('');
      setDirty(false);
      setSelectedBlockId('');
      setPending(data);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [files, path, dirty, blocks, resolve, setPath, setDraft, setDirty, setSelectedBlockId]);

  // Once the switched-to file's draft has parsed, resolve the queued message.
  useEffect(() => {
    if (!pending || !draft) return;
    resolve(pending);
    setPending(null);
  }, [pending, draft, blocks, resolve]);
}
