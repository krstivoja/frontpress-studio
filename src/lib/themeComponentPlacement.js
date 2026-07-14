// Drag-to-place bridge for sidebar components.
//
// Native HTML5 drag-and-drop can't cross the preview <iframe> boundary
// (see bootstrap.php `inject_preview_script`), so we run our own pointer
// stream: capture the pointer on the drag handle, translate each move into
// the iframe's viewport coordinates, and postMessage the preview script.
// The preview script paints a before/after/inside drop indicator and, on
// release inside the canvas, posts back `fp:insert` with the target block.
//
// `path` is the open template file — placement only targets elements that
// map to its source, so the editor can resolve the drop to a source line.

const PREVIEW_IFRAME = 'iframe[title="Theme preview"]';

/**
 * Begin a placement drag from a pointerdown event on a component card.
 * `onArm` fires immediately so the caller can stash which component is
 * being placed before any drop message arrives.
 */
export function startComponentPlacement(e, { path, onArm } = {}) {
  const iframe = document.querySelector(PREVIEW_IFRAME);
  const win = iframe?.contentWindow;
  if (!iframe || !win || !path) return;

  e.preventDefault();
  onArm?.();

  const handle = e.currentTarget;
  try { handle.setPointerCapture(e.pointerId); } catch { /* fallback: window listeners */ }
  const prevCursor = document.body.style.cursor;
  document.body.style.cursor = 'grabbing';

  function at(ev) {
    const r = iframe.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
    return { x, y, inside };
  }

  function post(type, extra) {
    try { win.postMessage({ type, ...extra }, '*'); } catch { /* iframe gone */ }
  }

  function move(ev) {
    const { x, y, inside } = at(ev);
    if (inside) post('fp:place-move', { x, y, path });
    else post('fp:place-end', { commit: false }); // left the canvas → clear indicator
  }

  function finish(ev, commit) {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    document.body.style.cursor = prevCursor;
    post('fp:place-end', { commit: commit && at(ev).inside });
  }
  function up(ev)     { finish(ev, true); }
  function cancel(ev) { finish(ev, false); }

  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
}
