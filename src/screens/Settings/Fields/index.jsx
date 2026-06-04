import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api.js';
import { slugify } from '../../../lib/utils.js';
import { Alert, Button, Card, Input } from '../../../components/ui/index.js';
import TaxonomyRow from './TaxonomyRow.jsx';

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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.settings) setTaxonomies(data.settings.taxonomies || {});
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/settings', {
      site: data?.settings?.site || { name: '', base: '/' },
      uploads: data?.settings?.uploads || { max_mb: 5, max_width: 0, max_height: 0 },
      taxonomies,
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

      <Card>
        <TaxonomiesEditor taxonomies={taxonomies} onChange={setTaxonomies} folders={folders} />
      </Card>
    </div>
  );
}

function TaxonomiesEditor({ taxonomies, onChange, folders }) {
  const [newLabel, setNewLabel] = useState('');

  function addTaxonomy() {
    const slug = slugify(newLabel);
    if (!slug || taxonomies[slug]) return;
    onChange({
      ...taxonomies,
      [slug]: { label: newLabel, post_types: [], fields: [] },
    });
    setNewLabel('');
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
  }

  function removeTax(slug) {
    const next = { ...taxonomies };
    delete next[slug];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {Object.keys(taxonomies).length === 0 && (
        <p className="text-sm text-zinc-500">No fields yet. Add one below.</p>
      )}

      <div className="space-y-4">
        {Object.entries(taxonomies).map(([slug, tax]) => (
          <TaxonomyRow
            key={slug}
            slug={slug}
            tax={tax}
            folders={folders}
            onUpdate={(patch) => updateTax(slug, patch)}
            onRename={(next) => renameTax(slug, next)}
            onRemove={() => { if (confirm(`Remove "${slug}"?`)) removeTax(slug); }}
          />
        ))}
      </div>

      <div className="flex items-end gap-2 border-t border-zinc-100 pt-4">
        <label className="block text-xs">
          <span className="font-medium text-zinc-600">Label</span>
          <Input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
          />
        </label>
        <Button variant="secondary" onClick={addTaxonomy}>Add field</Button>
      </div>
    </div>
  );
}
