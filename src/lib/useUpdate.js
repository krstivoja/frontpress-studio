import { useCallback, useState } from 'react';
import { api, ApiError } from './api.js';
import { useAuth } from './auth.jsx';
import { useToast } from './toast.jsx';

/**
 * Sidebar update banner state + apply trigger.
 *
 * Read side: pulls the `update` object from /me (cached server-side for 6h)
 * via `useAuth()`. Shape: `{ available, current, latest, notes }` or null
 * when unauthenticated / no manifest configured.
 *
 * Write side: `apply()` POSTs /admin/api/update, then POSTs
 * /admin/api/update/migrate if the response listed pending migrations.
 * On success it hard-reloads the page so the freshly-installed admin SPA
 * assets and PHP classes are picked up (otherwise the user is running new
 * backend with stale JS, which is a recipe for confusing bugs).
 *
 * Error paths surface via toast — `apply()` returns a boolean for the
 * caller's UI logic (disable button, show inline status, …).
 */
export function useUpdate() {
  const { update, refresh } = useAuth();
  const toast = useToast();
  const [applying, setApplying] = useState(false);
  const [checking, setChecking] = useState(false);

  const apply = useCallback(async () => {
    if (applying) return false;
    setApplying(true);
    try {
      const res = await api.post('/update');
      const pending = Array.isArray(res?.pending_migrations) ? res.pending_migrations : [];
      if (pending.length > 0) {
        try {
          await api.post('/update/migrate');
        } catch (migrateErr) {
          // Update applied, migrations failed — tell the user explicitly
          // rather than silently swallowing. They'll need to re-run them
          // manually or surface the error to support.
          const msg = migrateErr instanceof ApiError
            ? migrateErr.message
            : "the database migration didn't finish";
          toast.show(`Updated to v${res.version}, but the database migration didn’t finish: ${msg}. Re-run the update or contact support.`, {
            tone: 'error',
            duration: 8000,
          });
          return false;
        }
      }
      toast.show(`Updated to v${res.version}. Reloading…`, { tone: 'success', duration: 1500 });
      // Tiny delay so the toast actually paints before the reload wipes it.
      setTimeout(() => { window.location.reload(); }, 600);
      return true;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't update — try again or contact support.";
      toast.show(msg, { tone: 'error', duration: 6000 });
      setApplying(false);
      return false;
    }
  }, [applying, toast]);

  // Re-check after focus return, useful for users who tab away during the
  // GitHub-cache TTL window — without this they'd see stale "no update"
  // info even right after a release lands.
  const recheck = useCallback(() => { refresh(); }, [refresh]);

  // Force-bust the 6h disk cache and refetch from GitHub. The local /me
  // banner is driven by the same cache, so we also call refresh() after
  // to repaint the sidebar with whatever the fresh check returned.
  // Returns the new check result so the caller can show a one-shot
  // "you're on the latest" / "vX.Y.Z available" status next to its button.
  const recheckNow = useCallback(async () => {
    if (checking) return null;
    setChecking(true);
    try {
      const res = await api.post('/update/check');
      await refresh();
      return res;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't check for updates — try again.";
      toast.show(msg, { tone: 'error', duration: 4000 });
      return null;
    } finally {
      setChecking(false);
    }
  }, [checking, refresh, toast]);

  return {
    available: !!update?.available,
    current:   update?.current ?? null,
    latest:    update?.latest ?? null,
    notes:     update?.notes ?? '',
    applying,
    apply,
    recheck,
    recheckNow,
    checking,
  };
}
