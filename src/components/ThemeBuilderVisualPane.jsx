import { useState } from 'react';
import { moveBlock } from '../lib/themeBuilderBlocks.js';
import ThemeBuilderOutline from './ThemeBuilderOutline.jsx';
import ThemeBuilderPreview from './ThemeBuilderPreview.jsx';
import ThemeBuilderFilesTab from './ThemeBuilderFilesTab.jsx';

const TABS = ['List', 'Files'];

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
}) {
  const [tab, setTab] = useState('List');

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
        <div
          role="tablist"
          aria-label="Sidebar view"
          className="flex shrink-0 border-b border-zinc-200 bg-zinc-50"
        >
          {TABS.map((name) => {
            const active = tab === name;
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(name)}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? 'border-b-2 border-zinc-900 text-zinc-900'
                    : 'border-b-2 border-transparent text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'List' && (
            <>
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
            </>
          )}
          {tab === 'Files' && (
            <ThemeBuilderFilesTab
              theme={theme}
              files={files}
              selectedPath={filePath}
              dirty={dirty}
              onSelectFile={onSelectFile}
            />
          )}
        </div>
      </aside>

      <ThemeBuilderPreview
        path={previewPath}
        cacheBust={previewKey}
        selectedBlock={selectedBlock}
        blocks={blocks}
        filePath={filePath}
        onPathChange={onPreviewPathChange}
      />
    </div>
  );
}

