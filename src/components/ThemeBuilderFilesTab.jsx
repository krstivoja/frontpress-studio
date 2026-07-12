import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { fileTypeKey, presentFileTypes } from '../lib/fileTypes.js';
import { Button, ConfirmDialog } from './ui/index.js';
import { IconFile, IconPlus } from './icons.jsx';
import PathDialog from './ThemeFilePathDialog.jsx';

// Files panel for the Theme Builder's left sidebar. List + "+" button +
// right-click menu driving the file-create/rename/duplicate/delete
// endpoints; create/rename/duplicate share PathDialog.
export default function ThemeBuilderFilesTab({
  theme,
  files,
  selectedPath,
  dirty,
  onSelectFile,
}) {
  const qc = useQueryClient();
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [topError, setTopError] = useState('');
  // Active file-type filters (bucket keys from fileTypes.js). Empty = show
  // all. Only buckets actually present in `files` get a chip.
  const [activeTypes, setActiveTypes] = useState([]);

  const typeOptions = useMemo(() => presentFileTypes(files), [files]);
  const visibleFiles = useMemo(() => {
    if (!activeTypes.length) return files || [];
    const sel = new Set(activeTypes);
    return (files || []).filter((f) => sel.has(fileTypeKey(f.name)));
  }, [files, activeTypes]);

  // Drop any active filter whose type no longer exists (last file of that
  // type renamed/deleted) so the list can't get stuck showing nothing.
  useEffect(() => {
    const present = new Set(typeOptions.map((t) => t.key));
    setActiveTypes((prev) => {
      const next = prev.filter((k) => present.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [typeOptions]);

  const toggleType = (key) =>
    setActiveTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['theme-files', theme] });

  const onMutated = (next) => {
    invalidate();
    setDialog(null);
    setTopError('');
    if (next) onSelectFile?.(next);
  };

  const createMut = useMutation({
    mutationFn: ({ path }) => api.post('/themes/file-create', { theme, path, content: '' }),
    onSuccess: (res) => onMutated(res.path),
  });
  const renameMut = useMutation({
    mutationFn: ({ from, to }) => api.post('/themes/file-rename', { theme, from, to }),
    onSuccess: (res) => onMutated(selectedPath === res.from ? res.path : null),
  });
  const dupMut = useMutation({
    mutationFn: ({ from, to }) => api.post('/themes/file-duplicate', { theme, from, to }),
    onSuccess: (res) => onMutated(res.path),
  });
  const deleteMut = useMutation({
    mutationFn: ({ path }) => api.post('/themes/file-delete', { theme, path }),
    onSuccess: (res) => {
      invalidate();
      setPendingDelete(null);
      // If the deleted file was open, fall back to a sibling.
      if (selectedPath === res.path) {
        const sibling = files.find((f) => f.path !== res.path);
        if (sibling) onSelectFile?.(sibling.path);
      }
    },
    onError: (e) => { setPendingDelete(null); setTopError(e.message); },
  });

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const dialogError = (createMut.error || renameMut.error || dupMut.error)?.message || '';
  const dialogPending = createMut.isPending || renameMut.isPending || dupMut.isPending;

  function runRowAction(action, file) {
    setMenu(null);
    if (action === 'rename')         { renameMut.reset(); setDialog({ mode: 'rename', file }); }
    else if (action === 'duplicate') { dupMut.reset();    setDialog({ mode: 'duplicate', file }); }
    else                             { setTopError('');    setPendingDelete(file); }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Theme files
        </span>
        <button
          type="button"
          onClick={() => {
            setTopError('');
            createMut.reset();
            setDialog({ mode: 'create' });
          }}
          title="New file"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        >
          {IconPlus}
          New
        </button>
      </div>

      {topError && (
        <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{topError}</div>
      )}

      {typeOptions.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1">
          <TypeChip
            label="All"
            active={!activeTypes.length}
            onClick={() => setActiveTypes([])}
          />
          {typeOptions.map((t) => (
            <TypeChip
              key={t.key}
              label={t.label}
              count={t.count}
              color={t.color}
              active={activeTypes.includes(t.key)}
              onClick={() => toggleType(t.key)}
            />
          ))}
        </div>
      )}

      {!files?.length ? (
        <div className="text-xs text-zinc-500">No files in this theme.</div>
      ) : (
        <ul className="space-y-0.5">
          {visibleFiles.map((file) => {
            const active = file.path === selectedPath;
            return (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => onSelectFile?.(file.path)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ file, x: e.clientX, y: e.clientY });
                  }}
                  title={file.path}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium ${
                    active
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  <span className="shrink-0">
                    <IconFile ext={extOf(file.name)} mono={active} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {file.name}
                    {active && dirty ? ' *' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {menu && createPortal(
        <ContextMenu x={menu.x} y={menu.y} onAction={(a) => runRowAction(a, menu.file)} />,
        document.body,
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete file?"
        message={pendingDelete ? `${pendingDelete.path} will be permanently removed.` : ''}
        confirmLabel={deleteMut.isPending ? 'Deleting…' : 'Delete'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete || deleteMut.isPending) return;
          deleteMut.mutate({ path: pendingDelete.path });
        }}
      />

      {dialog && (
        <PathDialog
          mode={dialog.mode}
          file={dialog.file}
          files={files}
          error={dialogError}
          pending={dialogPending}
          onClose={() => setDialog(null)}
          onSubmit={(path) => {
            if (dialog.mode === 'create') createMut.mutate({ path });
            else if (dialog.mode === 'rename') renameMut.mutate({ from: dialog.file.path, to: path });
            else dupMut.mutate({ from: dialog.file.path, to: path });
          }}
        />
      )}
    </div>
  );
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1) : '';
}

// A single file-type filter toggle. `color` drives the leading dot; the
// "All" chip passes none. Active state mirrors the selected file rows.
function TypeChip({ label, count, color, active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-zinc-900 text-white'
          : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      }`}
    >
      {color && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      )}
      {label}
      {typeof count === 'number' && (
        <span className={active ? 'text-zinc-300' : 'text-zinc-400'}>{count}</span>
      )}
    </button>
  );
}

function ContextMenu({ x, y, onAction }) {
  const item = (label, action, danger) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => onAction(action)}
      className={`block w-full px-3 py-1.5 text-left text-xs ${
        danger ? 'text-rose-600 hover:bg-rose-50' : 'text-zinc-700 hover:bg-zinc-100'
      }`}
    >
      {label}
    </button>
  );
  // stopPropagation: a menu click shouldn't also fire the window-level
  // close-on-outside-click handler.
  return (
    <div
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 min-w-40 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {item('Rename...', 'rename')}
      {item('Duplicate...', 'duplicate')}
      <div className="my-1 border-t border-zinc-100" />
      {item('Delete', 'delete', true)}
    </div>
  );
}

