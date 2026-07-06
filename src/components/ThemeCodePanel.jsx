import { useMemo, useState } from 'react';
import CodeEditor from './CodeEditor.jsx';
import ThemeBuilderComponentsPanel from './ThemeBuilderComponentsPanel.jsx';
import ThemeBuilderFieldsPanel from './ThemeBuilderFieldsPanel.jsx';
import ResizableAside from './ResizableAside.jsx';
import { findAncestorsAtLine } from '../lib/themeBuilderBlocks.js';

const SNIPPETS_OPEN_KEY = 'fp:theme-builder:snippets-open';
const SIDEBAR_TAB_KEY   = 'fp:theme-builder:sidebar-tab';

export default function ThemeCodePanel({
  selectedPath,
  draft,
  focusLine,
  blocks,
  cursorLine,
  selectedBlockId,
  snippets,
  isTwig,
  files,
  theme,
  onChange,
  onCursorChange,
  onSelectBlock,
  onInsertSnippet,
}) {
  const crumbs = useMemo(
    () => (Array.isArray(blocks) ? findAncestorsAtLine(blocks, cursorLine || 1) : []),
    [blocks, cursorLine]
  );
  // Persist open/closed across sessions — the panel takes ~280px of
  // editor width and authors have opinions on whether they want that.
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(SNIPPETS_OPEN_KEY) !== '0'; } catch { return true; }
  });
  function toggle() {
    setOpen((v) => {
      const next = !v;
      try { localStorage.setItem(SNIPPETS_OPEN_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_TAB_KEY) || 'snippets'; } catch { return 'snippets'; }
  });
  function selectTab(next) {
    setTab(next);
    try { localStorage.setItem(SIDEBAR_TAB_KEY, next); } catch {}
  }

  return (
    <div className="flex min-h-0 flex-1 border-t border-zinc-200 bg-white">
      <div className="flex min-w-0 flex-1 flex-col">
        <Breadcrumbs
          crumbs={crumbs}
          selectedBlockId={selectedBlockId}
          onSelectBlock={onSelectBlock}
          snippetsOpen={open}
          onToggleSnippets={toggle}
        />
        <CodeEditor
          value={draft}
          onChange={onChange}
          onCursorChange={onCursorChange}
          filename={selectedPath}
          focusLine={focusLine}
          snippets={snippets}
          className="min-h-0 flex-1"
        />
      </div>
      {open && (
        <ResizableAside
          storageKey="fp:theme-builder:sidebar-width"
          side="left"
          defaultWidth={288}
          min={240}
          max={620}
          className="flex flex-col border-l border-zinc-200 bg-zinc-50"
        >
          <div className="flex h-7 shrink-0 items-stretch border-b border-zinc-200 bg-white text-[11px] font-semibold uppercase tracking-wider">
            {[['snippets', 'Snippets'], ['fields', 'Fields']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => selectTab(key)}
                aria-pressed={tab === key}
                className={`px-3 transition-colors ${
                  tab === key
                    ? 'border-b-2 border-zinc-900 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === 'snippets' ? (
              <ThemeBuilderComponentsPanel
                isTwig={isTwig}
                files={files}
                theme={theme}
                onInsert={onInsertSnippet}
              />
            ) : (
              <ThemeBuilderFieldsPanel
                theme={theme}
                selectedPath={selectedPath}
              />
            )}
          </div>
        </ResizableAside>
      )}
    </div>
  );
}

function Breadcrumbs({ crumbs, selectedBlockId, onSelectBlock, snippetsOpen, onToggleSnippets }) {
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
      {onToggleSnippets && (
        <button
          type="button"
          onClick={onToggleSnippets}
          aria-pressed={snippetsOpen}
          title={snippetsOpen ? 'Hide snippets panel' : 'Show snippets panel'}
          className={`shrink-0 rounded px-2 py-0.5 font-medium transition-colors ${
            snippetsOpen
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
          }`}
        >
          Snippets
        </button>
      )}
    </div>
  );
}
