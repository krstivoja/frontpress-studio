import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, ADMIN_BASE } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { Button, Combobox } from './ui/index.js';
import GithubSourceList from './GithubSourceList.jsx';
import GithubRestoreSection from './GithubRestoreSection.jsx';

const GITHUB_ERRORS = {
  invalid_state:  'GitHub authorization could not be verified. Please try again.',
  token_rejected: 'GitHub returned a token but rejected it on verification. Please try again.',
};

/**
 * "Connect → pick repo → pick what to push → push" UI for the Backup
 * screen. Self-contained so Backup.jsx stays small and any future "push"
 * surface (Settings panel, theme-builder button) can drop this in.
 */
export default function GithubBackupCard() {
  const qc       = useQueryClient();
  const toast    = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  // Real-time push progress polled from /push-status. `null` when idle;
  // `{done, total, current}` while a push is running.
  const [progress, setProgress] = useState(null);
  const pollRef = useRef(null);

  const { data: github } = useQuery({
    queryKey: ['github-status'],
    queryFn:  () => api.get('/github/status'),
  });

  // OAuth round-trip lands on /admin/backup?github=connected or ?error=…
  // Surface a toast and strip the query so a refresh doesn't repaint it.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const gh    = params.get('github');
    const err   = params.get('error');
    if (gh === 'connected') {
      toast.show('GitHub connected.', { tone: 'success' });
      qc.invalidateQueries({ queryKey: ['github-status'] });
      navigate(location.pathname, { replace: true });
    } else if (err && GITHUB_ERRORS[err]) {
      toast.show(GITHUB_ERRORS[err], { tone: 'error', duration: 5000 });
      navigate(location.pathname, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const { data: repoData, isLoading: reposLoading, error: reposError } = useQuery({
    queryKey: ['github-repos'],
    queryFn:  () => api.get('/github/repos'),
    enabled:  !!github?.connected,
    staleTime: 60_000,
  });

  const { data: sourcesData } = useQuery({
    queryKey: ['github-sources'],
    queryFn:  () => api.get('/github/sources'),
    enabled:  !!github?.connected,
  });

  async function disconnect() {
    if (!confirm('Disconnect GitHub from this site?')) return;
    setBusy(true);
    try {
      await api.post('/github/disconnect');
      qc.invalidateQueries({ queryKey: ['github-status'] });
      toast.show('GitHub disconnected.', { tone: 'success' });
    } catch (e) {
      toast.show(e.message, { tone: 'error', duration: 5000 });
    } finally { setBusy(false); }
  }

  async function selectRepo(fullName) {
    if (!fullName) return;
    setBusy(true);
    try {
      const found  = (repoData?.repos || []).find((r) => r.full_name === fullName);
      const branch = found?.default_branch || 'main';
      await api.post('/github/select-repo', { full_name: fullName, branch });
      qc.invalidateQueries({ queryKey: ['github-status'] });
      toast.show(`Sync target set to ${fullName}.`, { tone: 'success' });
    } catch (e) {
      toast.show(e.message, { tone: 'error', duration: 5000 });
    } finally { setBusy(false); }
  }

  async function toggleSource(key, on) {
    const current = (sourcesData?.sources || [])
      .filter((s) => (s.key === key ? on : s.selected))
      .map((s) => s.key);
    try {
      await api.post('/github/save-sources', { sources: current });
      qc.invalidateQueries({ queryKey: ['github-sources'] });
    } catch (e) {
      toast.show(e.message, { tone: 'error', duration: 5000 });
    }
  }

  async function push() {
    setBusy(true);
    setProgress(null);
    // Poll the status endpoint while the main push request is in flight.
    // Both endpoints release the session lock so this doesn't deadlock.
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.get('/github/push-status');
        if (s.active) setProgress({ done: s.done, total: s.total, current: s.current });
      } catch {
        // Swallow — polling errors aren't actionable. The main push
        // request's outcome is what actually drives the UI state.
      }
    }, 500);
    try {
      const res = await api.post('/github/push', {});
      qc.invalidateQueries({ queryKey: ['github-status'] });
      toast.show(
        `Pushed ${res.files} files. Commit ${(res.commit || '').slice(0, 7)}.`,
        { tone: 'success', duration: 4000 },
      );
    } catch (e) {
      // GitHub 429 = personal rate limit exhausted (5000/hr). Show a
      // short, actionable message; the full original error is still
      // copyable from the toast (click to copy).
      const isRateLimit =
        (e instanceof ApiError && e.status === 429) ||
        (typeof e.message === 'string' && e.message.toLowerCase().includes('rate limit'));
      const msg = isRateLimit
        ? 'GitHub rate limit hit (5000/hr per user). Wait a few minutes and retry. Click to copy details.'
        : e.message;
      // For rate-limit (and any error where the visible label is shorter
      // than the raw message), expose the full original text via copy.
      toast.show(msg, {
        tone: 'error',
        duration: isRateLimit ? 8000 : 6000,
        copyText: e.message,
      });
    } finally {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setBusy(false);
      setProgress(null);
    }
  }

  // Safety net — if the component unmounts mid-push, stop polling.
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const sources    = sourcesData?.sources || [];
  const anyPicked  = sources.some((s) => s.selected && s.exists);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Connect a GitHub account so themes (and later content) can be pushed to a repo for version control and off-site backup.
      </p>

      {!github?.connected ? (
        <div>
          {/* Full-page navigation (not an SPA route) — the server needs
              to issue a 302 to GitHub, which fetch() can't follow
              cross-origin. window.location handoff is the right tool. */}
          <Button onClick={() => { window.location.href = `${ADMIN_BASE}/admin/github/connect`; }} disabled={busy}>
            Connect to GitHub
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-sm">
              Connected as <span className="font-mono font-semibold">@{github.user}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          </div>

          <div className="space-y-1">
            <label className="text-[13px] font-medium text-zinc-900">Sync to repository</label>
            {reposError ? (
              <div className="text-[12px] text-red-600">
                Couldn't load repos: {reposError.message}
              </div>
            ) : (
              <Combobox
                className="w-80"
                value={github.repo || ''}
                onChange={(v) => selectRepo(v)}
                disabled={reposLoading || busy}
                placeholder={reposLoading ? 'Loading repos…' : 'Type to search your repos…'}
                options={(repoData?.repos || []).map((r) => ({
                  value: r.full_name,
                  label: r.full_name,
                  hint:  r.private ? 'private' : '',
                }))}
              />
            )}
            {github.repo && (
              <p className="text-[12px] text-zinc-500">
                Pushes will target <span className="font-mono">{github.repo}</span>
                {github.branch && <> on <span className="font-mono">{github.branch}</span></>}.
              </p>
            )}
          </div>

          {github.repo && (
            <div className="space-y-3 border-t border-zinc-100 pt-3">
              <GithubSourceList
                label="What to push"
                sources={sources}
                picked={sources.filter((s) => s.selected).map((s) => s.key)}
                disabled={busy}
                onChange={(key, on) => toggleSource(key, on)}
              />

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Button onClick={push} disabled={busy || !anyPicked}>
                    {busy ? 'Pushing…' : 'Push selected now'}
                  </Button>
                  {github.last_pushed_at && (
                    <span className="text-[12px] text-zinc-500">
                      Last push: <span className="font-mono">{github.last_pushed_at}</span>
                      {github.last_pushed_sha && <> ({github.last_pushed_sha.slice(0, 7)})</>}
                    </span>
                  )}
                </div>
                {/* Real percentage from /push-status. Before the first
                    poll lands `progress` is null — show an indeterminate
                    bar so the user knows something's started. */}
                {busy && (
                  <div className="space-y-1">
                    <div className="h-1 w-full overflow-hidden rounded bg-zinc-100">
                      {progress ? (
                        <div
                          className="h-full rounded bg-zinc-900 transition-all duration-200"
                          style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
                        />
                      ) : (
                        <div className="h-full w-1/3 animate-fp-indeterminate rounded bg-zinc-900" />
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

              <GithubRestoreSection />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
