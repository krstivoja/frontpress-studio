import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import {
  deleteBlock,
  duplicateBlock,
  findBlock,
  insertBlockRelative,
  moveBlock,
  parseThemeBlocks,
} from './themeBuilderBlocks.js';
import { setBlockText } from './themeBuilderText.js';
import { useThemePreviewBridge } from './useThemePreviewBridge.js';
import {
  insertSnippet,
  SNIPPETS as BUILTIN_SNIPPETS,
  buildPartialSnippets,
} from './themeBuilderSnippets.js';
import { listTemplateFiles } from './themeBuilderTemplates.js';
import { buildComponentSnippet } from './componentSnippet.js';
import { readLayout, preferredPath, defaultPreviewPath } from './themeBuilderPaths.js';

/**
 * All of the Theme Builder screen's data, state, and edit plumbing. The
 * screen component is left as pure layout — this hook owns the queries, the
 * save mutation, the source-rewriting action handlers, and the iframe bridge.
 * See CLAUDE.md's file-size split guidance (`use*.js` for network plumbing).
 */
export function useThemeBuilder() {
  const qc = useQueryClient();
  const [theme, setTheme] = useState('');
  const [path, setPath] = useState('');
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState('');
  // Bumped to re-focus the code editor on a block's line even when it's
  // already selected — used when a data-bound canvas element sends the user
  // to the code row to edit its Twig / PHP.
  const [focusTick, setFocusTick] = useState(0);
  const [previewKey, setPreviewKey] = useState(Date.now());
  const [previewPath, setPreviewPath] = useState('/');
  const [cursorLine, setCursorLine] = useState(1);
  const [layout, setLayout] = useState(() => readLayout());
  const previewPathTouched = useRef(false);

  useEffect(() => {
    try { localStorage.setItem('fp:theme-builder:layout', layout); } catch (_) {}
  }, [layout]);

  const { data: themesData, isLoading: themesLoading } = useQuery({
    queryKey: ['themes'],
    queryFn: () => api.get('/themes'),
  });

  useEffect(() => {
    if (!theme && themesData?.active) setTheme(themesData.active);
  }, [theme, themesData]);

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['theme-files', theme],
    queryFn: () => api.get(`/themes/files?theme=${encodeURIComponent(theme)}`),
    enabled: !!theme,
  });

  const files = filesData?.files || [];

  // Theme snippets for Monaco autocomplete. The Snippets sidebar panel
  // runs the same query — react-query dedupes by key so this is free.
  // Built-ins + partials merge in for the same `@<id>` dropdown.
  const { data: snippetsData } = useQuery({
    queryKey: ['theme-snippets', theme],
    queryFn:  () => api.get(`/themes/snippets?theme=${encodeURIComponent(theme)}`),
    enabled:  !!theme,
  });
  const autocompleteSnippets = useMemo(() => {
    const out = [];
    for (const s of BUILTIN_SNIPPETS) {
      out.push({ id: s.id, label: s.label, body: (s.lines || []).join('\n'), description: s.description });
    }
    for (const p of buildPartialSnippets(files)) {
      out.push({ id: p.id, label: p.label, body: (p.lines || []).join('\n'), description: p.description });
    }
    for (const s of (snippetsData?.snippets || [])) {
      out.push({ id: s.id, label: s.name, body: s.content || '', description: s.description });
    }
    return out;
  }, [files, snippetsData]);

  useEffect(() => {
    if (!theme || path || !files.length) return;
    // Honor `?file=<path>` so "Open code" from the Pattern Library lands
    // on the right template. Falls back to the usual preferred path
    // (page.twig / first file) when the query is absent or invalid.
    const requested = new URLSearchParams(window.location.search).get('file');
    if (requested && files.some((f) => f.path === requested)) {
      setPath(requested);
    } else {
      setPath(preferredPath(files));
    }
  }, [theme, path, files]);

  const { data: fileData, isLoading: fileLoading, error: fileError } = useQuery({
    queryKey: ['theme-file', theme, path],
    queryFn: () => api.get(
      `/themes/file?theme=${encodeURIComponent(theme)}&path=${encodeURIComponent(path)}`
    ),
    enabled: !!theme && !!path,
  });

  useEffect(() => {
    if (!fileData || fileData.path !== path) return;
    setDraft(fileData.content || '');
    setDirty(false);
    setSelectedBlockId('');
  }, [fileData, path]);

  const blocks = useMemo(() => parseThemeBlocks(draft), [draft]);
  const selectedBlock = selectedBlockId ? findBlock(blocks, selectedBlockId) : null;

  useEffect(() => {
    if (selectedBlockId && !selectedBlock) setSelectedBlockId('');
  }, [selectedBlockId, selectedBlock]);

  const save = useMutation({
    // `content` lets canvas/duplicate actions persist the freshly-rewritten
    // source directly (state updates are async, so we can't rely on `draft`
    // being current in the same tick). Plain saves call `save.mutate()` with
    // no arg and fall back to the current draft.
    mutationFn: (content) => api.post('/themes/file', {
      theme,
      path,
      content: typeof content === 'string' ? content : draft,
    }),
    onSuccess: () => {
      setDirty(false);
      setPreviewKey(Date.now());
      qc.invalidateQueries({ queryKey: ['theme-files', theme] });
      qc.invalidateQueries({ queryKey: ['theme-file', theme, path] });
    },
  });

  // Cmd/Ctrl+S saves. Bound at window level so it works no matter which
  // pane has focus (code editor, outline, header). No-op when there's
  // nothing to save or a save is already in flight.
  useEffect(() => {
    function onKey(e) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (path && dirty && !save.isPending) save.mutate();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [path, dirty, save]);

  // When the open file changes, auto-pick a preview URL that exercises
  // that template — unless the user has manually typed something in the
  // preview input, in which case we leave their value alone.
  useEffect(() => {
    if (!path) return;
    if (previewPathTouched.current) return;
    const next = defaultPreviewPath(path);
    if (next) setPreviewPath(next);
  }, [path]);

  // Duplicate / delete a block by source line-range, then persist. Canvas
  // edits (and their header-button twins) must show up in the server-rendered
  // preview, so we save immediately and let `onSuccess` bump `previewKey` to
  // reload the iframe. Selection clears — the block ids regenerate on reparse.
  function runAction(action, blockId) {
    if (!blockId) return;
    const next = action === 'duplicate'
      ? duplicateBlock(draft, blockId, blocks)
      : action === 'delete'
        ? deleteBlock(draft, blockId, blocks)
        : null;
    if (next == null || next === draft) return;
    setDraft(next);
    setDirty(true); // cleared by save.onSuccess; stays set if the save fails
    setSelectedBlockId('');
    save.mutate(next);
  }

  // Canvas drag-to-move: reorder / reparent a block, then persist so the
  // server-rendered preview reflects it. `moveBlock` no-ops on an invalid
  // move (self, missing range, or dropping a parent into its own descendant).
  function runMove(fromId, toId, position) {
    if (!fromId || !toId || fromId === toId) return;
    const next = moveBlock(draft, fromId, toId, position, blocks);
    if (next === draft) return;
    setDraft(next);
    setDirty(true);
    setSelectedBlockId('');
    save.mutate(next);
  }

  // Component drag-to-place: the sidebar streams a placement drag over the
  // canvas; on drop the iframe posts `fp:insert` with a target block +
  // position. Insert the armed component's `<Tag/>` there, then persist +
  // reload like the other canvas edits. The armed component is stashed on a
  // ref (set at drag start) so the drop handler reads the latest without
  // re-running the pointer stream.
  const placingComponent = useRef(null);
  function startPlacingComponent(component) {
    placingComponent.current = component || null;
  }
  function runInsert(toId, position) {
    const component = placingComponent.current;
    placingComponent.current = null;
    if (!component || !toId || !path) return;
    const snippet = buildComponentSnippet(component, component.inputs, path);
    const next = insertBlockRelative(draft, toId, position, snippet.split('\n'), blocks);
    if (next === draft) return;
    setDraft(next);
    setDirty(true);
    setSelectedBlockId('');
    save.mutate(next);
  }

  // Inline edit committed on the canvas — `edit` carries the new inner HTML
  // and optional block formatting (text-align, tag switch). `setBlockText`
  // no-ops (returns the same source) for data-bound / non-literal text, so a
  // stray commit just saves nothing rather than corrupting the template.
  function runText(blockId, edit) {
    if (!blockId) return;
    const next = setBlockText(draft, blockId, edit, blocks);
    if (next === draft) return;
    setDraft(next);
    setDirty(true);
    setSelectedBlockId('');
    save.mutate(next);
  }

  // Iframe ↔ editor bridge: click-to-select (`fp:select`), the in-canvas
  // Duplicate/Delete toolbar (`fp:action`), and drag-to-move (`fp:move`).
  // Send the user to the source line of a canvas element and focus the code
  // editor there — the actionable path for data-bound / non-literal text that
  // can't be edited on the canvas.
  function gotoSource(blockId) {
    if (!blockId) return;
    setSelectedBlockId(blockId);
    setFocusTick((t) => t + 1);
  }

  useThemePreviewBridge({
    files, path, draft, blocks, dirty,
    setPath, setDraft, setDirty, setSelectedBlockId,
    runAction, runMove, runText, runInsert, gotoSource,
  });

  function chooseFile(next) {
    if (path === next) return;
    if (dirty && !confirm('Discard unsaved changes?')) return;
    setPath(next);
    setDraft('');
    setDirty(false);
    setSelectedBlockId('');
  }

  function updateDraft(next) {
    setDraft(next);
    setDirty(true);
  }

  function applyBlockChange(next, selectedId = selectedBlockId) {
    setDraft(next);
    setDirty(true);
    setSelectedBlockId(selectedId || '');
  }

  // Drop a component's `<Tag …/>` (built from its manifest defaults, same
  // snippet the Fields tab shows) at the cursor in the open template.
  // No-ops when no file is open.
  function insertComponentTag(component) {
    if (!path) return;
    const snippet = buildComponentSnippet(component, component.inputs, path);
    applyBlockChange(insertSnippet(draft, { lines: snippet.split('\n') }, { line: cursorLine }));
  }

  function insertSnippetAtCursor(snippet) {
    applyBlockChange(insertSnippet(draft, snippet, { line: cursorLine }));
  }

  const isTwig = path.endsWith('.twig');
  const busy = themesLoading || filesLoading || fileLoading;
  const templates = useMemo(() => listTemplateFiles(files), [files]);
  const activeThemeMeta = (themesData?.themes || []).find((t) => t.slug === theme);
  const themeLabel = activeThemeMeta?.name || theme || '';

  return {
    // data / derived
    theme, path, draft, dirty, files, templates, blocks, selectedBlock,
    selectedBlockId, autocompleteSnippets, cursorLine, focusTick, previewPath,
    previewKey, layout, isTwig, busy, themeLabel,
    saving: save.isPending, saveError: save.error, fileError,
    // setters / handlers
    setLayout, setSelectedBlockId, setCursorLine, setPreviewPath,
    previewPathTouched,
    chooseFile, updateDraft, applyBlockChange, insertComponentTag,
    insertSnippetAtCursor, startPlacingComponent,
    saveFile: () => save.mutate(),
    invalidateFiles: () => qc.invalidateQueries({ queryKey: ['theme-files', theme] }),
  };
}
