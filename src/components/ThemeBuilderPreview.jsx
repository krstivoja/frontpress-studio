import { useEffect, useRef, useState } from 'react';
import { occurrenceOfBlock } from '../lib/themeBuilderBlocks.js';

// Iframe preview of the public site. `path` is the URL the iframe loads
// (defaults to `/`) and is editable from the input in the header so the
// user can preview the template they're actually editing — e.g. open
// `/blog/some-post` while tweaking `templates/post.twig`.
//
// `cacheBust` flips on save and on the Reload button click; we append it
// as a query param on `src` so the iframe re-navigates to the freshly
// rendered output. We deliberately do NOT `key` the iframe on `src` —
// keying tears down and recreates the element, which drops the scroll
// position and fires an extra repaint. Updating the `src` attribute on
// the same element navigates it in place; the injected preview script
// (see bootstrap.php `inject_preview_script`) saves the scroll offset on
// `pagehide` and restores it on load, so save / duplicate / delete /
// move keep the user where they were instead of jumping to the top.
//
// `filePath` + `blocks` are the parsed tree of the file currently open in
// the editor; combined with `selectedBlock` they let us postMessage the
// iframe to scroll to (and briefly highlight) the matching DOM element
// whenever the user picks a block in the outline.
export default function ThemeBuilderPreview({
  path,
  cacheBust,
  selectedBlock,
  blocks,
  filePath,
  onPathChange,
  onDuplicate,
  onDelete,
}) {
  const [draft, setDraft] = useState(path || '/');
  const iframeRef = useRef(null);

  // Sync the input when the parent changes path externally (file switch,
  // explicit reset). The local `draft` lets the user type without
  // re-rendering the iframe on every keystroke.
  useEffect(() => { setDraft(path || '/'); }, [path]);

  function commit(value) {
    const normalized = normalizePath(value);
    setDraft(normalized);
    onPathChange?.(normalized);
  }

  // Outline → preview bridge. Whenever the selected block has a DOM tag
  // we can resolve (html-source blocks only — Twig and marker blocks
  // have no direct DOM correspondent), post the path + tag + occurrence
  // to the iframe and let the inline script scroll it into view.
  useEffect(() => {
    if (!selectedBlock || selectedBlock.source !== 'html' || !filePath) return;
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    const occurrence = occurrenceOfBlock(blocks, selectedBlock);
    if (occurrence < 0) return;
    try {
      iframe.contentWindow.postMessage({
        type: 'fp:focus',
        path: filePath,
        tag: selectedBlock.tag,
        occurrence,
      }, '*');
    } catch (_) {
      // Cross-origin or iframe-not-ready failures are silent — the
      // user can re-click the row to retry once the iframe has loaded.
    }
  }, [selectedBlock, blocks, filePath]);

  // `fp_admin_preview=1` tells the public-side render to wrap output
  // with source-mapping HTML comments + a click-handler script. The
  // server gates the feature on the admin session cookie, so this is
  // a no-op for unauthenticated visitors.
  const base = path || '/';
  const sep = base.includes('?') ? '&' : '?';
  const src = `${base}${sep}fp_admin_preview=1&fp_builder=${cacheBust}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-100">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-3">
        <div className="text-xs font-medium text-zinc-700">Preview</div>
        <form
          className="flex min-w-0 flex-1"
          onSubmit={(e) => { e.preventDefault(); commit(draft); }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            placeholder="/"
            spellCheck={false}
            className="h-7 w-full min-w-0 rounded border border-zinc-200 bg-zinc-50 px-2 font-mono text-[11px] text-zinc-700 focus:border-zinc-400 focus:bg-white focus:outline-none"
          />
        </form>
        {selectedBlock && (
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="max-w-[200px] truncate rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
              {selectedBlock.label} / line {selectedBlock.startLine}
            </div>
            {onDuplicate && (
              <button
                type="button"
                onClick={onDuplicate}
                className="rounded px-1.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Duplicate
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded px-1.5 py-1 text-xs font-medium text-zinc-600 hover:bg-red-50 hover:text-red-600"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
      <iframe
        ref={iframeRef}
        title="Theme preview"
        src={src}
        className="min-h-0 flex-1 border-0 bg-white"
      />
    </div>
  );
}

function normalizePath(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
