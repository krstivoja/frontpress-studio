import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getCsrf, ADMIN_BASE } from '../lib/api.js';
import { useFileUpload } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { formatBytes } from '../lib/utils.js';
import { Button, Card, Dropzone, Input } from '../components/ui/index.js';
import GithubBackupCard from '../components/GithubBackupCard.jsx';

export default function Backup() {
  const qc = useQueryClient();
  const toast = useToast();
  // Holds the picked .zip until the user types RESTORE and submits — a
  // backup restore is destructive, so we deliberately stage the file rather
  // than auto-upload on drop.
  const [pickedFile, setPickedFile] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  // Local UI state — which destination is in front. Plain useState (not a
  // route) since the choice is ephemeral and doesn't need to survive reloads.
  const [activeTab, setActiveTab] = useState('local');
  const restoreUpload = useFileUpload({ endpoint: `${ADMIN_BASE}/admin/api/backup/restore`, fileField: 'backup' });

  const { data, isLoading } = useQuery({
    queryKey: ['backup'],
    queryFn: () => api.get('/backup'),
  });

  async function download(scope) {
    setBusy(true);
    try {
      const res = await fetch(`${ADMIN_BASE}/admin/api/backup/download`, {
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
      toast.show(e.message, { tone: 'error', duration: 5000 });
    } finally {
      setBusy(false);
    }
  }

  async function restore(e) {
    e.preventDefault();
    if (confirmText !== 'RESTORE') {
      toast.show('Type RESTORE to confirm.', { tone: 'error' });
      return;
    }
    if (!pickedFile) {
      toast.show('Choose a backup file.', { tone: 'error' });
      return;
    }
    try {
      await restoreUpload.upload(pickedFile);
      toast.show('Backup restored.', { tone: 'success' });
      qc.invalidateQueries();
      setPickedFile(null);
    } catch (err) {
      toast.show(err.message, { tone: 'error', duration: 6000 });
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
          A backup is a single .zip of your content, media, themes, and site config — everything FrontPress Studio needs to bring this site back exactly as it is. There's no database to dump. Pick a destination below.
        </p>
      </header>

      <Card>
        {/* In-card tab bar — mirrors the Settings nav pattern but with
            local state instead of routes. Two destinations: download a
            zip to your machine, or push to a GitHub repo. */}
        <nav className="-mt-2 flex gap-1 border-b border-zinc-200 text-sm">
          <TabButton active={activeTab === 'local'}  onClick={() => setActiveTab('local')}>Local download</TabButton>
          <TabButton active={activeTab === 'github'} onClick={() => setActiveTab('github')}>GitHub</TabButton>
        </nav>

        {activeTab === 'local' ? (
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
        ) : (
          <GithubBackupCard />
        )}
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

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 transition-colors ${
        active
          ? 'border-zinc-900 font-medium text-zinc-900'
          : 'border-transparent text-zinc-500 hover:text-zinc-800'
      }`}
    >
      {children}
    </button>
  );
}
