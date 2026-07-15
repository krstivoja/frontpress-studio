import { useThemeBuilder } from '../lib/useThemeBuilder.js';
import { startComponentPlacement } from '../lib/themeComponentPlacement.js';
import { Alert } from '../components/ui/index.js';
import ThemeBuilderHeader from '../components/ThemeBuilderHeader.jsx';
import ThemeBuilderVisualPane from '../components/ThemeBuilderVisualPane.jsx';
import ThemeCodePanel from '../components/ThemeCodePanel.jsx';
import VerticalResizer from '../components/VerticalResizer.jsx';

export default function ThemeBuilder() {
  const tb = useThemeBuilder();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50">
      <ThemeBuilderHeader
        themeLabel={tb.themeLabel}
        path={tb.path}
        templates={tb.templates}
        layout={tb.layout}
        onChooseFile={tb.chooseFile}
        onSave={tb.saveFile}
        onLayoutChange={tb.setLayout}
        saving={tb.saving}
        dirty={tb.dirty}
      />

      {tb.saveError && <Alert tone="error">{tb.saveError.message}</Alert>}
      {tb.fileError && <Alert tone="error">{tb.fileError.message}</Alert>}

      <VerticalResizer
        storageKey="fp:theme-builder:split"
        direction={tb.layout === 'right' ? 'row' : 'column'}
      >
        <ThemeBuilderVisualPane
          blocks={tb.blocks}
          draft={tb.draft}
          filePath={tb.path}
          isTwig={tb.isTwig}
          selectedBlock={tb.selectedBlock}
          selectedBlockId={tb.selectedBlockId}
          previewPath={tb.previewPath}
          previewKey={tb.previewKey}
          files={tb.files}
          theme={tb.theme}
          dirty={tb.dirty}
          onSelectBlock={tb.setSelectedBlockId}
          onChangeDraft={tb.applyBlockChange}
          onSelectFile={tb.chooseFile}
          onPreviewPathChange={(next) => {
            tb.previewPathTouched.current = true;
            tb.setPreviewPath(next);
          }}
          onInsertSnippet={tb.insertSnippetAtCursor}
          onInsertComponent={tb.insertComponentTag}
          onOpenComponentCode={tb.chooseFile}
          onPlaceComponent={(e, component) => {
            startComponentPlacement(e, {
              path: tb.path,
              onArm: () => tb.startPlacingComponent(component),
            });
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {tb.busy ? (
            <div className="p-4 text-sm text-zinc-500">Loading...</div>
          ) : (
            <ThemeCodePanel
              selectedPath={tb.path}
              draft={tb.draft}
              focusLine={tb.selectedBlock?.startLine || null}
              focusTick={tb.focusTick}
              blocks={tb.blocks}
              cursorLine={tb.cursorLine}
              selectedBlockId={tb.selectedBlockId}
              snippets={tb.autocompleteSnippets}
              onChange={tb.updateDraft}
              onCursorChange={tb.setCursorLine}
              onSelectBlock={tb.setSelectedBlockId}
              openTabs={tb.openTabs}
              onSelectTab={tb.chooseFile}
              onCloseTab={tb.closeFile}
            />
          )}
        </div>
      </VerticalResizer>
    </main>
  );
}
