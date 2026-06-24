import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getCsrf } from '../../lib/api.js';
import { useFileUpload } from '../../lib/hooks.js';
import { Alert, Badge, Button, Card, Dropzone } from '../../components/ui/index.js';

export default function Themes() {
  const qc = useQueryClient();
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const upload = useFileUpload({
    endpoint: '/admin/api/themes/upload',
    fileField: 'theme',
    invalidate: [['themes']],
  });
  const { data, isLoading } = useQuery({
    queryKey: ['themes'],
    queryFn: () => api.get('/themes'),
  });

  const activate = useMutation({
    mutationFn: (slug) => api.post('/themes/activate', { slug }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['themes'] }),
    onError: (e) => setError(e.message),
  });

  const install = useMutation({
    mutationFn: ({ starter, theme_slug }) => api.post('/themes/install', { starter, theme_slug }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['themes'] }),
    onError: (e) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (slug) => api.post('/themes/delete', { slug }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['themes'] }),
    onError: (e) => setError(e.message),
  });

  async function download(slug) {
    setDownloading(slug);
    setError(null);
    try {
      const res = await fetch('/admin/api/themes/download', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        // The server keeps JSON for errors and only switches to
        // application/zip on success — peek at the content-type to
        // surface a real message instead of "500 Internal Server Error".
        const ct = res.headers.get('Content-Type') || '';
        if (ct.includes('application/json')) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `${res.status} ${res.statusText}`);
        }
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      a.download = m ? m[1] : `theme-${slug}-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(null);
    }
  }

  async function handleUpload(files) {
    const file = files[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const res = await upload.upload(file);
      setNotice(
        res.replaced
          ? `Replaced theme "${res.slug}".`
          : `Installed theme "${res.slug}".`
      );
    } catch (e) {
      setError(e.message);
    }
  }

  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Themes</h2>
        <Link
          to="/theme-builder"
          className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
        >
          Open theme builder
        </Link>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card title="Installed">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(data?.themes || []).map(t => (
            <div key={t.slug} className="flex flex-col rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="font-medium">{t.name || t.slug}</div>
              {t.description && <p className="mt-1 text-xs text-zinc-500">{t.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <EngineBadge engine={t.engine} />
                {data.active === t.slug ? (
                  <Badge tone="active">Active</Badge>
                ) : (
                  <Button variant="link" size="sm" onClick={() => activate.mutate(t.slug)}>
                    Activate
                  </Button>
                )}
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => download(t.slug)}
                  disabled={downloading === t.slug}
                >
                  {downloading === t.slug ? 'Downloading…' : 'Download'}
                </Button>
                {data.active !== t.slug && (
                  <Button
                    variant="link-danger"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete the "${t.name || t.slug}" theme. This deletes the theme files from disk.`)) {
                        remove.mutate(t.slug);
                      }
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Upload theme">
        <p className="text-xs text-zinc-500">
          Drop a theme .zip to install it. If a theme with the same folder name
          is already installed, it will be replaced — useful for editing a
          theme locally and dragging the updated zip back to swap it in.
        </p>
        <Dropzone
          accept=".zip,application/zip"
          disabled={upload.busy}
          label={upload.busy ? 'Uploading…' : 'Drop a theme .zip here'}
          buttonLabel="Choose file"
          onFiles={handleUpload}
        />
      </Card>

      <Card title="Starters">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(data?.starters || []).map(s => (
            <div key={s.slug} className="flex flex-col rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="font-medium">{s.name || s.slug}</div>
              {s.description && <p className="mt-1 text-xs text-zinc-500">{s.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <EngineBadge engine={s.engine} />
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => install.mutate({ starter: s.slug, theme_slug: s.slug })}
                >
                  Install
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// Tiny tone-coded badge that surfaces the templating engine declared in
// `theme.json` (or auto-detected by ThemeService::detectEngine). Skipped
// when the engine couldn't be determined — better silence than a misleading
// "unknown" pill on the card.
function EngineBadge({ engine }) {
  if (!engine || engine === 'unknown') return null;
  const tone = engine === 'twig' ? 'success' : engine === 'php' ? 'purple' : 'warning';
  return <Badge tone={tone}>{engine}</Badge>;
}
