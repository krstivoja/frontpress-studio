import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag-to-resize `<aside>` wrapper. Replaces a hand-styled
 * `<aside className="w-60 shrink-0 flex flex-col ...">` with a version
 * whose width lives in localStorage and can be resized via a vertical
 * drag handle on the inner edge. Double-click the handle to reset.
 *
 * The handle is `role="separator"` with `aria-orientation="vertical"`
 * and `aria-valuenow/min/max` for screen-reader users; keyboard users
 * can grab focus and use ← / → / Home (or ↑ / ↓) to nudge.
 *
 * Props:
 *   storageKey   — localStorage key (per-aside, so each side persists
 *                  independently).
 *   side         — which edge the handle sits on:
 *                  'right' for a left-of-content nav (handle on its
 *                  right edge, dragging right widens),
 *                  'left'  for a right-of-content meta panel (handle
 *                  on its left edge, dragging left widens).
 *   defaultWidth — pixels, used on first mount and after reset.
 *   min, max     — clamp bounds in pixels.
 *   className    — passed through to the underlying `<aside>` (use
 *                  for borders, padding, layout — but NOT a width
 *                  utility like `w-60`; this component owns width).
 *   children     — aside contents.
 */
export default function ResizableAside({
  storageKey,
  side,
  defaultWidth,
  min,
  max,
  className = '',
  children,
}) {
  const [width, setWidth] = useState(() => readStoredWidth(storageKey, defaultWidth, min, max));
  const widthRef     = useRef(width);
  const draggingRef  = useRef(false);
  const startXRef    = useRef(0);
  const startWidthRef = useRef(0);
  widthRef.current = width;

  const clamp = useCallback((w) => Math.max(min, Math.min(max, w)), [min, max]);

  const persist = useCallback((w) => {
    try { localStorage.setItem(storageKey, String(w)); } catch { /* private mode etc. */ }
  }, [storageKey]);

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return; // primary only
    draggingRef.current   = true;
    startXRef.current     = e.clientX;
    startWidthRef.current = widthRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Body-wide cursor + no-select while dragging so the cursor stays
    // col-resize even when the pointer slips off the handle.
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!draggingRef.current) return;
    const delta  = e.clientX - startXRef.current;
    // Handle on the right edge → dragging right (+delta) widens.
    // Handle on the left edge  → dragging left (-delta) widens.
    const signed = side === 'right' ? delta : -delta;
    setWidth(clamp(startWidthRef.current + signed));
  }

  function endDrag(e) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    // setState callback reads the latest queued value — defensive
    // against React batching corner cases where widthRef.current
    // could lag a frame behind the last pointermove's setWidth call.
    setWidth((w) => { persist(w); return w; });
  }

  function onDoubleClick() {
    setWidth(defaultWidth);
    try { localStorage.removeItem(storageKey); } catch { /* private mode */ }
  }

  function onKeyDown(e) {
    // Keyboard resize: arrows nudge ±8px, Shift+arrows nudge ±32px,
    // Home resets to default.
    const step = e.shiftKey ? 32 : 8;
    const widen  = side === 'right' ? ['ArrowRight', 'ArrowDown'] : ['ArrowLeft', 'ArrowDown'];
    const narrow = side === 'right' ? ['ArrowLeft', 'ArrowUp']    : ['ArrowRight', 'ArrowUp'];
    if (widen.includes(e.key)) {
      e.preventDefault();
      setWidth((w) => { const n = clamp(w + step); persist(n); return n; });
    } else if (narrow.includes(e.key)) {
      e.preventDefault();
      setWidth((w) => { const n = clamp(w - step); persist(n); return n; });
    } else if (e.key === 'Home') {
      e.preventDefault();
      onDoubleClick();
    }
  }

  // Re-clamp if min/max change at runtime (rare, but cheap to handle).
  useEffect(() => { setWidth((w) => clamp(w)); }, [clamp]);

  // Wrapper holds the width and is the positioned ancestor for the
  // absolute handle. The handle is a *sibling* of <aside> rather than
  // a child, so it's not clipped when the aside has `overflow-y-auto`
  // (browsers force overflow-x:hidden when overflow-y is auto, which
  // would chop the pill's outer half off where it sits on the border).
  return (
    <div
      className="relative shrink-0"
      style={{ width, flex: `0 0 ${width}px` }}
    >
      <aside className={`h-full w-full ${className}`}>
        {children}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label="Resize panel"
        tabIndex={0}
        title="Drag to resize · double-click to reset · arrow keys to nudge"
        className={`group absolute top-0 z-10 h-full w-2 cursor-col-resize touch-none focus-visible:outline-none ${side === 'right' ? '-right-1' : '-left-1'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      >
        {/* Centered grip pill: invisible at rest, fades in as a short
            vertical handle on hover / focus / drag. The aside's
            existing `border-r`/`border-l` provides the thin full-height
            line at idle — this just adds an unambiguous drag affordance
            without redrawing what's already there. 4px halo at 15%
            opacity matches the input focus ring's recipe so the visual
            language stays consistent across the admin. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition group-hover:bg-zinc-900 group-hover:ring-4 group-hover:ring-zinc-900/15 group-focus-visible:bg-zinc-900 group-focus-visible:ring-4 group-focus-visible:ring-zinc-900/15" />
      </div>
    </div>
  );
}

function readStoredWidth(key, def, min, max) {
  try {
    const raw = parseInt(localStorage.getItem(key) || '', 10);
    if (raw && !isNaN(raw)) return Math.max(min, Math.min(max, raw));
  } catch { /* private mode */ }
  return def;
}
