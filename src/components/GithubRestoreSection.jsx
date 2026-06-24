import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { Button, Input } from './ui/index.js';

export default function GithubRestoreSection() {
  const qc    = useQueryClient();
  const toast = useToast();

  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy]               = useState(false);
  const [progress, setProgress]       = useState(null);
  const pollRef = useRef(null);

  const { data: github } = useQuery({
    queryKey: ['github-status'],
    queryFn:  () => api.get('/github/status'),
  });

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  if (!github) return null;

  if (!github.connected) {
    return (
      <p className="text-[13px] text-zinc-500">
        Connect GitHub in the GitHub backup tab first.
      </p>
    );
  }

  if (!github.repo) {
    return (
      <p className="text-[13px] text-zinc-500">
        Select a repo in the GitHub backup tab first.
      </p>
    );
  }

  async function pull(e) {
    e.preventDefault();
    if (confirmText !== 'RESTORE') return;

    setBusy(true);
    setProgress(null);

    pollRef.current = setInterval(async () => {
      try {
        const s = await api.get('/github/pull-status');
        if (s.active) setProgress({ done: s.done, total: s.total, current: s.current });
      } catch { /* swallowed — main request drives final state */ }
    }, 500);

    try {
      const res = await api.post('/github/pull', {});
      qc.invalidateQueries();
      const note = res.truncated
        ? ' (repo was large — some files may be missing, re-run to be sure)'
        : '';
      toast.show(
        `Restored ${res.files} files from ${(res.commit || '').slice(0, 7)}.${note}`,
        { tone: 'success', duration: 5000 },
      );
    } catch (e) {
      const isRateLimit =
        (e instanceof ApiError && e.status === 429) ||
        (typeof e.message === 'string' && e.message.toLowerCase().includes('rate limit'));
      toast.show(
        isRateLimit ? 'GitHub rate limit hit — wait a few minutes and try again.' : e.message,
        { tone: 'error', duration: isRateLimit ? 8000 : 6000, copyText: e.message },
      );
    } finally {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setBusy(false);
      setProgress(null);
      setConfirmText('');
    }
  }

  return (
    <div className="space-y-3 border-t border-zinc-100 pt-3">
      <div className="text-[13px] font-medium text-zinc-900">Restore from GitHub</div>
      <p className="text-xs text-zinc-500">
        Downloads content, themes, and uploads from{' '}
        <span className="font-mono">{github.repo}</span> on{' '}
        <span className="font-mono">{github.branch || 'main'}</span> and overwrites local files.
        Config is not touched. This cannot be undone.
      </p>

      <form onSubmit={pull} className="space-y-3">
        <Input
          className="w-48"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type RESTORE"
          disabled={busy}
        />
        <Button type="submit" variant={confirmText === 'RESTORE' ? 'primary' : 'danger'} disabled={busy || confirmText !== 'RESTORE'}>
          {busy ? 'Restoring…' : 'Restore from GitHub'}
        </Button>
      </form>

      {busy && (
        <div className="space-y-1">
          <div className="h-1 w-full overflow-hidden rounded bg-zinc-100">
            {progress ? (
              <div
                className="h-full rounded bg-red-500 transition-all duration-200"
                style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
              />
            ) : (
              <div className="h-full w-1/3 animate-fp-indeterminate rounded bg-red-500" />
            )}
          </div>
          {progress && (
            <p className="text-[11px] text-zinc-500">
              {progress.done} / {progress.total} —{' '}
              <span className="font-mono">{progress.current}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
