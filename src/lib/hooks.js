import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getCsrf } from './api.js';

// Shared TanStack Query hook for the folder list. Both the sidebar and the
// post-type-shell route guard need the same data, so they share a query key
// and avoid two parallel fetches against `/admin/api/pages`.
/**
 * Generic multipart-upload hook. Wraps the FormData + CSRF + invalidate +
 * busy/error state pattern that was hand-rolled in three different screens
 * (Media, Backup, MediaPicker upload tab).
 *
 * Pass `extraFields` to attach scalar form fields alongside the file (e.g.
 * `{ page_path: 'blog/hello-world' }` for per-post uploads). The hook returns
 * `{ upload, busy, error, reset }`; `upload(file, overrides?)` resolves with
 * the parsed JSON response on success or rejects with the API error.
 */
export function useFileUpload({ endpoint, fileField = 'file', extraFields = {}, invalidate = [] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upload = useCallback(async (file, overrides = {}) => {
    if (!file) return null;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append(fileField, file);
      const fields = { ...extraFields, ...overrides };
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined && v !== null && v !== '') fd.append(k, v);
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': getCsrf() },
        body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Couldn't upload the file — try again.");
      for (const key of invalidate) {
        qc.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      }
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, fileField, JSON.stringify(extraFields), JSON.stringify(invalidate), qc]);

  return { upload, busy, error, reset: () => setError(null) };
}

/**
 * Pair the `<ConfirmDialog>` UI primitive with a stable callback. Returns
 * `{ confirm, dialogProps }` — spread `dialogProps` onto a `<ConfirmDialog>`
 * once near the root of the screen, then call `confirm({ message })` from
 * anywhere; the returned promise resolves true if the user confirms, false
 * if they cancel/Esc/backdrop-click.
 */
export function useConfirmDialog() {
  const [state, setState] = useState({ open: false, props: {}, resolve: null });

  const confirm = useCallback((props = {}) => new Promise((resolve) => {
    setState({ open: true, props, resolve });
  }), []);

  const close = (result) => {
    state.resolve?.(result);
    setState({ open: false, props: {}, resolve: null });
  };

  return {
    confirm,
    dialogProps: {
      ...state.props,
      open: state.open,
      onConfirm: () => close(true),
      onCancel:  () => close(false),
    },
  };
}

export function useFolders() {
  const q = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get('/pages'),
  });
  return {
    folders: q.data?.folders || [],
    isLoading: q.isLoading,
    error: q.error,
  };
}
