import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getCsrf } from '../lib/api.js';
import { usePageTrash } from '../lib/usePageTrash.js';
import { cap } from '../lib/utils.js';
import { Button, Dropzone } from '../components/ui/index.js';
import PageRow from '../components/PageRow.jsx';
import PagesFilterBar from '../components/PagesFilterBar.jsx';
import PagesListEmptyState from '../components/PagesListEmptyState.jsx';

// Mirrors dsystem ui_kit `PagesList.jsx` — card-wrapped, header with count
// pill + filter toolbar, inline Draft badge, Edit + Delete row actions.
// Mounted both at `/` (All Content) and at `/:folder` (per-folder list).
export default function PagesList() {
  const { folder = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('date-desc');
  // Bulk selection — tracks page paths the user has ticked. Cleared on
  // filter changes so what's "selected" always matches what's visible.
  const [selected, setSelected] = useState(() => new Set());
  const [importMsg, setImportMsg] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const { del, deleteMany } = usePageTrash();

  const { data, isLoading, error } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get('/pages'),
  });

  const filtered = useMemo(() => {
    let list = data?.pages || [];
    if (folder)       list = list.filter(p => (p.folder || '') === folder);
    if (statusFilter) list = list.filter(p => (statusFilter === 'draft') === !!p.draft);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.path  || '').toLowerCase().includes(q)
      );
    }
    // Client-side re-sort so the user can pick the order. ISO `YYYY-MM-DD`
    // dates sort lexicographically the same as chronologically; missing
    // dates always go to the bottom so they don't poison either direction.
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === 'title-asc' || sort === 'title-desc') {
        const cmp = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
        return sort === 'title-asc' ? cmp : -cmp;
      }
      const ad = a.date || '';
      const bd = b.date || '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return sort === 'date-asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
    });
    return sorted;
  }, [data, folder, statusFilter, query, sort]);

  // Status-chip counts. Computed from the folder + search filtered list but
  // BEFORE the status filter, so each chip shows how many posts it would
  // surface regardless of which chip is currently active.
  const statusCounts = useMemo(() => {
    let list = data?.pages || [];
    if (folder) list = list.filter(p => (p.folder || '') === folder);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.path  || '').toLowerCase().includes(q)
      );
    }
    const drafts = list.filter(p => !!p.draft).length;
    return { all: list.length, drafts, published: list.length - drafts };
  }, [data, folder, query]);

  // Drop selections that aren't visible after a filter change so the bulk
  // toolbar count never lies about what "Delete selected" will affect.
  const visiblePaths = useMemo(() => new Set(filtered.map((p) => p.path)), [filtered]);
  const visibleSelected = useMemo(
    () => Array.from(selected).filter((p) => visiblePaths.has(p)),
    [selected, visiblePaths],
  );
  const allVisibleSelected = filtered.length > 0 && visibleSelected.length === filtered.length;

  function toggleOne(path, checked) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(path); else next.delete(path);
      return next;
    });
  }
  function toggleAll(checked) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) filtered.forEach((p) => next.add(p.path));
      else filtered.forEach((p) => next.delete(p.path));
      return next;
    });
  }

  function exportPages() {
    // Session cookie rides along with the top-level navigation; no CSRF on GET.
    const q = folder ? `?folder=${encodeURIComponent(folder)}` : '';
    window.location.href = `/admin/api/pages-export${q}`;
  }

  function exportSelected() {
    if (visibleSelected.length === 0) return;
    const paths = visibleSelected.join(',');
    window.location.href = `/admin/api/pages-export?paths=${encodeURIComponent(paths)}`;
  }

  const importMut = useMutation({
    mutationFn: async (files) => {
      const fd = new FormData();
      if (folder) fd.append('folder', folder);
      for (const f of files) fd.append('files[]', f);
      const res = await fetch('/admin/api/pages-import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': getCsrf() },
        body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Import failed');
      return data;
    },
    onSuccess: (data) => {
      const n = data.imported?.length || 0;
      const errs = data.errors?.length || 0;
      setImportMsg(
        errs
          ? `Imported ${n}; ${errs} skipped. ${data.errors.slice(0, 3).join(' ')}`
          : `Imported ${n} ${n === 1 ? 'page' : 'pages'}.`,
      );
      qc.invalidateQueries({ queryKey: ['pages'] });
    },
    onError: () => setImportMsg("Couldn't import the file — check it's a valid export and try again."),
  });

  function onImportFiles(files) {
    if (!files || files.length === 0) return;
    setImportMsg(null);
    importMut.mutate(files);
  }

  function bulkDelete() {
    if (visibleSelected.length === 0) return;
    const paths = [...visibleSelected];
    setSelected(new Set());
    deleteMany(paths);
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-card" aria-hidden="true">
        <div className="h-6 w-40 animate-pulse rounded bg-zinc-200" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded bg-zinc-100" />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <div className="text-sm text-red-600">Couldn’t load — {error.message}. Reload and try again.</div>;

  const title = folder ? cap(folder) : 'All Content';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight">
          {title}
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-600">
            {filtered.length}
          </span>
        </h1>

        {folder && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={exportPages}>
              Download
            </Button>
            <Button
              variant={importOpen ? 'primary' : 'secondary'}
              onClick={() => { setImportOpen((v) => !v); setImportMsg(null); }}
              aria-expanded={importOpen}
              aria-controls="pages-import-region"
            >
              Import
            </Button>
            <Button onClick={() => navigate(`/new/${encodeURIComponent(folder)}`)}>
              New page
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white shadow-card">
        <PagesFilterBar
          query={query}
          setQuery={setQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sort={sort}
          setSort={setSort}
          counts={statusCounts}
        />

      {folder && importOpen && (
        <div id="pages-import-region" className="space-y-3 border-b border-zinc-100 bg-zinc-50 px-6 py-5">
          <Dropzone
            accept=".md,.zip,application/zip,text/markdown" multiple
            disabled={importMut.isPending}
            label="Drop .md or .zip files here"
            hint={`Files import into ${folder}; existing slugs overwrite. ZIPs can carry per-post uploads.`}
            buttonLabel={importMut.isPending ? 'Importing…' : 'Choose files'}
            onFiles={onImportFiles}
          />
          {importMsg && <div role="status" aria-live="polite" className="text-[13px] text-zinc-700">{importMsg}</div>}
        </div>
      )}

      {visibleSelected.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-blue-600 text-white px-6 py-2 text-[12px]">
          <span className="font-medium">
            {visibleSelected.length} selected
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button variant="secondary" size="sm" onClick={exportSelected}>Download selected</Button>
            <Button variant="danger" size="sm" onClick={bulkDelete}>Delete selected</Button>
          </div>
        </div>
      )}

      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-zinc-100 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">
            <th className="w-10 px-6 py-3">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allVisibleSelected}
                ref={(el) => { if (el) el.indeterminate = visibleSelected.length > 0 && !allVisibleSelected; }}
                onChange={(e) => toggleAll(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-zinc-300"
              />
            </th>
            <th className="px-6 py-3">Title</th>
            {folder ? (
              <th className="px-6 py-3">Status</th>
            ) : (
              <th className="px-6 py-3">Type</th>
            )}
            <th className="w-40 px-6 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <PagesListEmptyState
              folder={folder}
              filterActive={!!(query || statusFilter)}
              columnSpan={4}
              onNew={() => navigate(`/new/${encodeURIComponent(folder)}`)}
            />
          )}
          {filtered.map(p => (
            <PageRow
              key={p.path}
              page={p}
              showStatus={!!folder}
              selected={selected.has(p.path)}
              onToggle={toggleOne}
              onEdit={navigate}
              onDelete={(page) => del.mutate(page)}
            />
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
