import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api.js';
import { Alert, Button, Card } from '../../../components/ui/index.js';
import TaxonomyRow from './TaxonomyRow.jsx';
import FieldGroupAddDialog from './FieldGroupAddDialog.jsx';

export default function Fields() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });
  const { data: pagesData } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get('/pages'),
  });
  const folders = pagesData?.folders || [];

  const [taxonomies, setTaxonomies] = useState({});
  const [folderSettings, setFolderSettings] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setTaxonomies(data.settings.taxonomies || {});
      setFolderSettings(data.settings.folders || {});
    }
  }, [data]);

  function setFolderSortMode(folder, mode) {
    setFolderSettings((prev) => ({
      ...prev,
      [folder]: { ...(prev[folder] || {}), sort_mode: mode },
    }));
  }

  const save = useMutation({
    mutationFn: () => api.put('/settings', {
      site: data?.settings?.site || { name: '', base: '/' },
      uploads: data?.settings?.uploads || { max_mb: 5, max_width: 0, max_height: 0 },
      taxonomies,
      folders: folderSettings,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Fields</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-600">Saved</span>}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {save.error && <Alert tone="error">{save.error.message}</Alert>}

      {folders.length > 0 && (
        <Card>
          <div className="space-y-3">
            <div>
              <p className="text-[13px] font-semibold text-zinc-900">Folder sort mode</p>
              <p className="text-[12px] text-zinc-500">
                Order mode replaces the date picker with an order number and enables drag-and-drop reordering in the post list.
              </p>
            </div>
            <div className="divide-y divide-zinc-100">
              {folders.map((f) => {
                const mode = folderSettings[f]?.sort_mode || 'date';
                return (
                  <div key={f} className="flex items-center justify-between py-2.5">
                    <span className="font-mono text-[13px] text-zinc-800">{f}</span>
                    <div className="flex rounded-md border border-zinc-200 text-[12px] font-medium overflow-hidden">
                      {['date', 'order'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFolderSortMode(f, m)}
                          className={`px-3 py-1.5 transition-colors capitalize ${
                            mode === m
                              ? 'bg-zinc-900 text-white'
                              : 'bg-white text-zinc-600 hover:bg-zinc-50'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <TaxonomiesEditor taxonomies={taxonomies} onChange={setTaxonomies} folders={folders} />
      </Card>
    </div>
  );
}

function TaxonomiesEditor({ taxonomies, onChange, folders }) {
  const [adding, setAdding] = useState(false);
  const slugs = Object.keys(taxonomies);

  // Which group is open. Tracked here, not in props — the parent only
  // owns the data. Kept valid as groups are added/removed/renamed below.
  const [active, setActive] = useState(slugs[0] || null);
  useEffect(() => {
    if (slugs.length === 0) { if (active !== null) setActive(null); return; }
    if (!active || !taxonomies[active]) setActive(slugs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxonomies]);

  function addTaxonomy(slug, label) {
    if (!slug || taxonomies[slug]) return;
    onChange({
      ...taxonomies,
      [slug]: { label, post_types: [], fields: [] },
    });
    setActive(slug); // jump straight to the new group
  }

  function updateTax(slug, patch) {
    onChange({ ...taxonomies, [slug]: { ...taxonomies[slug], ...patch } });
  }

  function renameTax(oldSlug, nextSlug) {
    nextSlug = nextSlug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!nextSlug || nextSlug === oldSlug || taxonomies[nextSlug]) return;
    const next = {};
    for (const [k, v] of Object.entries(taxonomies)) {
      next[k === oldSlug ? nextSlug : k] = v;
    }
    onChange(next);
    if (active === oldSlug) setActive(nextSlug);
  }

  function removeTax(slug) {
    const next = { ...taxonomies };
    delete next[slug];
    onChange(next);
    if (active === slug) {
      const remaining = Object.keys(next);
      setActive(remaining[0] || null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Chip tabs: one per field group. Switching shows only that group's
          editor below, so a long list of groups doesn't become a long
          scroll. The trailing "+ New" reveals an inline name input. */}
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(taxonomies).map(([slug, tax]) => {
          const isActive = slug === active;
          const count = (tax.fields || []).length;
          return (
            <button
              key={slug}
              type="button"
              onClick={() => setActive(slug)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                isActive
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              {tax.label || slug}
              {count > 0 && (
                <span className={isActive ? 'text-white/60' : 'text-zinc-400'}>{count}</span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-3 py-1 text-[12px] font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-800"
        >
          + New
        </button>
      </div>

      <FieldGroupAddDialog
        open={adding}
        existing={new Set(slugs)}
        onClose={() => setAdding(false)}
        onCreate={addTaxonomy}
      />

      {slugs.length === 0 ? (
        <p className="text-sm text-zinc-500">No fields yet. Add one with “+ New”.</p>
      ) : active && taxonomies[active] ? (
        <TaxonomyRow
          key={active}
          slug={active}
          tax={taxonomies[active]}
          folders={folders}
          onUpdate={(patch) => updateTax(active, patch)}
          onRename={(next) => renameTax(active, next)}
          onRemove={() => { if (confirm(`Delete "${active}". This cannot be undone.`)) removeTax(active); }}
        />
      ) : null}
    </div>
  );
}
