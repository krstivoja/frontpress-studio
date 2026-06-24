import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useUpdate } from '../../lib/useUpdate.js';
import { Alert, Button, Card, Field, Input } from '../../components/ui/index.js';

export default function SiteSettings() {
  const qc = useQueryClient();
  const { update } = useAuth();
  const { checking, recheckNow } = useUpdate();
  // One-shot status line under the button after a manual recheck.
  // Cleared automatically a few seconds later so it doesn't linger
  // and become noise.
  const [checkResult, setCheckResult] = useState(null);

  async function onCheckUpdates() {
    const res = await recheckNow();
    if (res) {
      setCheckResult(res.available
        ? `v${res.latest} available`
        : `You're on the latest version.`);
      setTimeout(() => setCheckResult(null), 5000);
    }
  }
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });

  const [site, setSite] = useState({ name: '', base: '/' });
  const [uploads, setUploads] = useState({ max_mb: 5, max_width: 0, max_height: 0 });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setSite({ name: s.site?.name || '', base: s.site?.base || '/' });
    setUploads({
      max_mb: s.uploads?.max_mb ?? 5,
      max_width: s.uploads?.max_width ?? 0,
      max_height: s.uploads?.max_height ?? 0,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/settings', {
      site,
      uploads,
      taxonomies: data?.settings?.taxonomies || {},
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const [cacheMsg, setCacheMsg] = useState('');
  const clearCache = useMutation({
    mutationFn: () => api.post('/cache/clear'),
    onSuccess: () => {
      setCacheMsg('Cache cleared');
      setTimeout(() => setCacheMsg(''), 2500);
    },
    onError: () => setCacheMsg("Cache wasn't cleared — reload and try again."),
  });
  const rebuildCache = useMutation({
    mutationFn: () => api.post('/cache/rebuild'),
    onSuccess: (res) => {
      setCacheMsg(`Cache rebuilt (${res?.count ?? 0} pages)`);
      setTimeout(() => setCacheMsg(''), 2500);
    },
    onError: () => setCacheMsg("Cache wasn't rebuilt — reload and try again."),
  });
  const rebuildAssets = useMutation({
    mutationFn: () => api.post('/cache/rebuild-assets'),
    onSuccess: (res) => {
      const n = (res?.compiled || []).length;
      setCacheMsg(n ? `Compiled ${n} stylesheet${n === 1 ? '' : 's'}` : 'No SCSS changes');
      setTimeout(() => setCacheMsg(''), 2500);
    },
    onError: () => setCacheMsg("Couldn't rebuild assets — reload and try again."),
  });

  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Site settings</h2>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-600">Saved</span>}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {save.error && <Alert tone="error">{save.error.message}</Alert>}

      <Card title="Site">
        <Field label="Site name">
          <Input value={site.name} onChange={e => setSite({ ...site, name: e.target.value })} />
        </Field>
        <Field label="Base path">
          <Input value={site.base} onChange={e => setSite({ ...site, base: e.target.value })} />
        </Field>
      </Card>

      <Card title="Uploads">
        <Field label="Max size (MB)">
          <Input type="number" min="1" max="512"
            value={uploads.max_mb} onChange={e => setUploads({ ...uploads, max_mb: +e.target.value })} />
        </Field>
        <Field label="Max width (px, 0 = no limit)">
          <Input type="number" min="0" max="20000"
            value={uploads.max_width} onChange={e => setUploads({ ...uploads, max_width: +e.target.value })} />
        </Field>
        <Field label="Max height (px, 0 = no limit)">
          <Input type="number" min="0" max="20000"
            value={uploads.max_height} onChange={e => setUploads({ ...uploads, max_height: +e.target.value })} />
        </Field>
      </Card>

      <Card title="Cache">
        <p className="text-xs text-zinc-500">
          Clears rendered HTML, the content index, and the compiled Twig cache. Use this after editing files on disk or switching themes if a page looks stale.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => clearCache.mutate()}
            disabled={clearCache.isPending || rebuildCache.isPending}
          >
            {clearCache.isPending ? 'Clearing…' : 'Clear cache'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => rebuildCache.mutate()}
            disabled={clearCache.isPending || rebuildCache.isPending}
          >
            {rebuildCache.isPending ? 'Rebuilding…' : 'Clear & rebuild'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => rebuildAssets.mutate()}
            disabled={rebuildAssets.isPending}
          >
            {rebuildAssets.isPending ? 'Compiling…' : 'Rebuild theme SCSS'}
          </Button>
          {cacheMsg && <span className="text-xs text-zinc-500">{cacheMsg}</span>}
        </div>
      </Card>

      {/* Version surface. `update.current` is the canonical on-disk version
          (cms/VERSION). When an update is available we also show the latest
          tag so the user has the same context they get from the sidebar
          banner. Kept read-only here — the actionable "Update now" button
          lives in the sidebar banner so we don't render the same control
          twice and have to keep two copies of the apply state in sync. */}
      <Card title="Version">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 text-[13px]">
            <span className="text-zinc-500">FrontPress Studio</span>
            <span className="font-mono font-medium text-zinc-900">
              v{update?.current ?? '—'}
            </span>
            {update?.available && update.latest && (
              <span className="text-xs text-zinc-500">
                · update available: <span className="font-mono text-zinc-700">v{update.latest}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            {checkResult && <span className="text-zinc-500">{checkResult}</span>}
            {/* Force-bust the 6h disk cache that backs the sidebar banner —
                without this, users who already saw "no update" have to
                wait out the TTL even after we ship a release. */}
            <Button
              variant="secondary"
              size="sm"
              onClick={onCheckUpdates}
              disabled={checking}
            >
              {checking ? 'Checking…' : 'Check for updates'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
