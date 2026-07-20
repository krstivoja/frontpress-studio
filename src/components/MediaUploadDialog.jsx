import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFileUpload } from '../lib/hooks.js';
import { ADMIN_BASE } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { extLabel, isImageFile } from '../lib/utils.js';
import { Alert, Button, Dropzone } from './ui/index.js';

/**
 * Modal dropzone for the Media library "Upload" button. Accepts one or many
 * files at once (drop or click-to-pick), uploads them sequentially through
 * the existing `useFileUpload` hook, and shows per-file status (pending /
 * uploading / done / error) so a partial failure is obvious at a glance.
 *
 * Sequential upload is deliberate: the server processes one multipart at a
 * time and parallel POSTs would only contend on disk + GD. Once everything
 * finishes (success or otherwise), a single toast summarises the result —
 * the modal stays open if anything failed so the user can retry, otherwise
 * it auto-closes after a short delay.
 */
export default function MediaUploadDialog({ open, onClose, initialFiles }) {
  const [items, setItems] = useState([]); // [{ id, file, status, error?, url? }]
  const toast = useToast();

  const { upload, busy } = useFileUpload({
    endpoint: `${ADMIN_BASE}/admin/api/media`,
    invalidate: [['media']],
  });

  // Reset queue every time the modal re-opens so a previous run's results
  // don't bleed into the next session. When the caller hands us files (the
  // first-run dropzone in the Media screen), enqueue them immediately so the
  // user sees one continuous upload flow instead of "drop, then drop again".
  useEffect(() => {
    if (!open) return;
    setItems([]);
    if (initialFiles && initialFiles.length > 0) {
      enqueue(initialFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc to close — but only when nothing's uploading, otherwise the user
  // would lose visibility into a half-finished batch.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  function enqueue(fileList) {
    const incoming = Array.from(fileList || []).filter(Boolean);
    if (incoming.length === 0) return;
    const queued = incoming.map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      file,
      status: 'pending',
    }));
    setItems((prev) => [...prev, ...queued]);
    runQueue(queued);
  }

  async function runQueue(queue) {
    let failed = 0;
    for (const it of queue) {
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: 'uploading' } : p)));
      try {
        const data = await upload(it.file);
        setItems((prev) => prev.map((p) => (
          p.id === it.id ? { ...p, status: 'done', url: data?.url } : p
        )));
      } catch (err) {
        failed += 1;
        setItems((prev) => prev.map((p) => (
          p.id === it.id ? { ...p, status: 'error', error: err.message } : p
        )));
      }
    }
    const okCount = queue.length - failed;
    if (okCount > 0) {
      toast.show(`Uploaded ${okCount} ${okCount === 1 ? 'file' : 'files'}`);
    }
    if (failed === 0) {
      // Auto-close shortly after a clean run so the user can get back to work.
      setTimeout(() => onClose(), 600);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-upload-title"
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-modal">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <h2 id="media-upload-title" className="text-base font-semibold text-zinc-900">Upload media</h2>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <Dropzone
            accept="image/*"
            multiple
            disabled={busy}
            label="Drop files here"
            hint="one or many — they'll upload one after another"
            buttonLabel="Choose files"
            onFiles={(files) => enqueue(files)}
          />

          {items.length > 0 && (
            <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
              {items.map((it) => (
                <UploadRow key={it.id} item={it} />
              ))}
            </ul>
          )}

          {items.some((i) => i.status === 'error') && (
            <Alert tone="error">
              Some files didn’t upload. Hover any red row for the reason.
            </Alert>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function UploadRow({ item }) {
  const isImg = isImageFile(item.file.name);
  return (
    <li className="flex items-center gap-3 px-3 py-2" title={item.error || item.file.name}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-50 text-[10px] font-semibold text-zinc-500">
        {isImg && item.url
          ? <img src={item.url} alt="" className="h-full w-full object-cover" />
          : extLabel(item.file.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-zinc-900">{item.file.name}</div>
        <div className="text-[11px] text-zinc-500">{formatSize(item.file.size)}</div>
      </div>
      <StatusBadge status={item.status} />
    </li>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending:   { label: 'Queued',     cls: 'bg-zinc-100 text-zinc-600' },
    uploading: { label: 'Uploading…', cls: 'bg-zinc-900 text-white' },
    done:      { label: 'Uploaded',   cls: 'bg-emerald-100 text-emerald-700' },
    error:     { label: 'Not uploaded', cls: 'bg-red-100 text-red-700' },
  };
  const m = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function formatSize(bytes) {
  if (!bytes) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
