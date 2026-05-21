import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getCsrf } from '../lib/api.js';
import { useFileUpload } from '../lib/hooks.js';
import { formatBytes } from '../lib/utils.js';
import { Alert, Button, Card, Dropzone, Input } from '../components/ui/index.js';

export default function Backup() {
  const qc = useQueryClient();
  // Holds the picked .zip until the user types RESTORE and submits — a
  // backup restore is destructive, so we deliberately stage the file rather
  // than auto-upload on drop.
  const [pickedFile, setPickedFile] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const restoreUpload = useFileUpload({ endpoint: '/admin/api/backup/restore', fileField: 'backup' });

  const { data, isLoading } = useQuery({
    queryKey: ['backup'],
    queryFn: () => api.get('/backup'),
  });

  async function download(scope) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/admin/api/backup/download', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify({ scope }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      a.download = m ? m[1] : `frontpress-studio-${scope}-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function restore(e) {
    e.preventDefault();
    if (confirmText !== 'RESTORE') {
      setMsg({ tone: 'error', text: 'Type RESTORE to confirm.' });
      return;
    }
    if (!pickedFile) { setMsg({ tone: 'error', text: 'Choose a backup file.' }); return; }

    setMsg(null);
    try {
      await restoreUpload.upload(pickedFile);
      setMsg({ tone: 'success', text: 'Restored successfully.' });
      qc.invalidateQueries();
      setPickedFile(null);
    } catch (err) {
      setMsg({ tone: 'error', text: err.message });
    } finally {
      setConfirmText('');
    }
  }

  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Backup</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-zinc-500">
          A backup is a single .zip of your content, media, themes, and site config — everything FrontPress Studio needs to bring this site back exactly as it is. There's no database to dump. Pick a scope below to download your first one.
        </p>
      </header>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <Card title="Download">
        <div className="grid gap-3 md:grid-cols-3">
          {['full', 'content', 'settings'].map(scope => (
            <div key={scope} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="font-medium capitalize">{scope}</div>
              <div className="mt-1 text-xs text-zinc-500">{formatBytes(data?.sizes?.[scope] ?? 0)}</div>
              <div className="mt-2">
                <Button size="sm" onClick={() => download(scope)} disabled={busy}>
                  Download .zip
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Restore">
        <p className="text-xs text-zinc-500">Restoring overwrites content and settings. Type RESTORE to confirm.</p>
        <form onSubmit={restore} className="space-y-3">
          <Dropzone
            accept=".zip,application/zip"
            disabled={restoreUpload.busy}
            label="Drop a backup .zip here"
            buttonLabel="Choose file"
            selectedLabel={pickedFile?.name}
            onFiles={(files) => setPickedFile(files[0] || null)}
          />
          <Input
            className="w-48"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="Type RESTORE"
          />
          <Button type="submit" variant="danger" disabled={busy || restoreUpload.busy || !pickedFile}>
            {restoreUpload.busy ? 'Restoring…' : busy ? 'Working…' : 'Restore'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
