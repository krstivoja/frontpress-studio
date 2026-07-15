import { useState } from 'react';
import ThemeBuilderPreview from './ThemeBuilderPreview.jsx';
import ThemeBuilderFilesTab from './ThemeBuilderFilesTab.jsx';
import ThemeBuilderComponentsPanel from './ThemeBuilderComponentsPanel.jsx';
import ThemeBuilderPatternsPanel from './ThemeBuilderPatternsPanel.jsx';
import ThemeBuilderFieldsPanel from './ThemeBuilderFieldsPanel.jsx';
import ThemeBuilderOutline from './ThemeBuilderOutline.jsx';
import ResizableAside from './ResizableAside.jsx';
import { moveBlock } from '../lib/themeBuilderBlocks.js';

// Top pane of the Theme Builder: a left sidebar (Files + authoring panels),
// the live preview in the middle, and the DOM outline on the right. The code
// editor lives in the bottom pane (ThemeCodePanel).
const TABS = [
  ['files', 'Files'],
  ['snippets', 'Snippets'],
  ['components', 'Components'],
  ['fields', 'Fields'],
];

export default function ThemeBuilderVisualPane({
  blocks,
  draft,
  filePath,
  isTwig,
  selectedBlock,
  selectedBlockId,
  previewPath,
  previewKey,
  files,
  theme,
  dirty,
  onSelectBlock,
  onChangeDraft,
  onSelectFile,
  onPreviewPathChange,
  onInsertSnippet,
  onInsertComponent,
  onOpenComponentCode,
  onPlaceComponent,
}) {
  const [tab, setTab] = useState('files');

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div
          role="tablist"
          aria-label="Sidebar view"
          className="flex shrink-0 border-b border-zinc-200 bg-zinc-50"
        >
          {TABS.map(([key, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={`flex-1 px-1.5 py-2 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border-b-2 border-zinc-900 text-zinc-900'
                    : 'border-b-2 border-transparent text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'files' && (
            <ThemeBuilderFilesTab
              theme={theme}
              files={files}
              selectedPath={filePath}
              dirty={dirty}
              onSelectFile={onSelectFile}
            />
          )}
          {tab === 'snippets' && (
            <ThemeBuilderComponentsPanel
              isTwig={isTwig}
              files={files}
              theme={theme}
              onInsert={onInsertSnippet}
            />
          )}
          {tab === 'components' && (
            <ThemeBuilderPatternsPanel
              isTwig={isTwig}
              theme={theme}
              canInsert={!!filePath}
              onInsert={onInsertComponent}
              onOpenCode={onOpenComponentCode}
              onPlace={onPlaceComponent}
            />
          )}
          {tab === 'fields' && (
            <ThemeBuilderFieldsPanel
              theme={theme}
              selectedPath={filePath}
            />
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1">
        <ThemeBuilderPreview
          path={previewPath}
          cacheBust={previewKey}
          selectedBlock={selectedBlock}
          blocks={blocks}
          filePath={filePath}
          onPathChange={onPreviewPathChange}
        />
      </div>

      <ResizableAside
        storageKey="fp:theme-builder:dom-width"
        side="left"
        defaultWidth={280}
        min={220}
        max={480}
        className="flex flex-col border-l border-zinc-200 bg-zinc-50"
      >
        <div className="flex h-8 shrink-0 items-center border-b border-zinc-200 bg-white px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-900">
          DOM
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-2 text-[11px] text-zinc-500">
            {isTwig ? 'Twig visual map' : 'Code editor only'}
          </div>
          <ThemeBuilderOutline
            blocks={blocks}
            selectedId={selectedBlockId}
            onSelect={onSelectBlock}
            onMove={onChangeDraft
              ? (fromId, toId, position) => onChangeDraft(
                  moveBlock(draft, fromId, toId, position, blocks),
                  fromId,
                )
              : undefined}
          />
        </div>
      </ResizableAside>
    </div>
  );
}
