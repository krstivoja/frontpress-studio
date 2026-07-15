import { useMemo } from 'react';
import CodeEditor from './CodeEditor.jsx';
import ThemeBuilderTabStrip from './ThemeBuilderTabStrip.jsx';
import { findAncestorsAtLine } from '../lib/themeBuilderBlocks.js';

// Bottom pane of the Theme Builder: open-file tabs, the element breadcrumb,
// and the code editor. The DOM outline + authoring panels live in the top
// pane (ThemeBuilderVisualPane).
export default function ThemeCodePanel({
  selectedPath,
  draft,
  focusLine,
  focusTick,
  blocks,
  cursorLine,
  selectedBlockId,
  snippets,
  onChange,
  onCursorChange,
  onSelectBlock,
  openTabs,
  onSelectTab,
  onCloseTab,
}) {
  const crumbs = useMemo(
    () => (Array.isArray(blocks) ? findAncestorsAtLine(blocks, cursorLine || 1) : []),
    [blocks, cursorLine]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-zinc-200 bg-white">
      <ThemeBuilderTabStrip
        tabs={openTabs}
        activePath={selectedPath}
        onSelect={onSelectTab}
        onClose={onCloseTab}
      />
      <Breadcrumbs
        crumbs={crumbs}
        selectedBlockId={selectedBlockId}
        onSelectBlock={onSelectBlock}
      />
      <CodeEditor
        value={draft}
        onChange={onChange}
        onCursorChange={onCursorChange}
        filename={selectedPath}
        focusLine={focusLine}
        focusTick={focusTick}
        snippets={snippets}
        className="min-h-0 flex-1"
      />
    </div>
  );
}

function Breadcrumbs({ crumbs, selectedBlockId, onSelectBlock }) {
  return (
    <div
      role="navigation"
      aria-label="Element path"
      className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-zinc-200 bg-zinc-50 px-2 text-[11px] text-zinc-600"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        {crumbs.length === 0 ? (
          <span className="text-zinc-400">No element at cursor</span>
        ) : (
          crumbs.map((b, i) => {
            const active = b.id === selectedBlockId;
            return (
              <span key={b.id} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-zinc-300">›</span>}
                <button
                  type="button"
                  onClick={() => onSelectBlock?.(b.id)}
                  className={`rounded px-1.5 py-0.5 font-mono ${
                    active
                      ? 'bg-zinc-900 text-white'
                      : 'hover:bg-zinc-200 hover:text-zinc-900'
                  }`}
                  title={`${b.label} — line ${b.startLine}`}
                >
                  {b.label}
                </button>
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
