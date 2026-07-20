import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ADMIN_BASE } from '../lib/api.js';
import { useFileUpload, useConfirmDialog } from '../lib/hooks.js';
import { encodePath } from '../lib/utils.js';
import { Alert, ConfirmDialog, Dropzone, SegmentedControl } from './ui/index.js';
import MediaPickerUnsplash from './MediaPickerUnsplash.jsx';

const SOURCES = [
  { value: 'local',    label: 'Local'    },
  { value: 'unsplash', label: 'Unsplash' },
];

/**
 * Per-post attachments view shown in the page-editor sidebar. Lists every
 * image currently living next to the post's .md file under
 * `site/content/<pagePath>/`, lets the user drop more in, and offers a
 * hover delete on each tile.
 *
 * Hidden until the page is saved — there's no folder until the .md exists.
 */
export default function FilesPanel({ pagePath }) {
  const qc = useQueryClient();
  const { confirm, dialogProps } = useConfirmDialog();
  const [hoverName, setHoverName] = useState(null);
  // "Add new" source toggle. The already-uploaded tile grid below
  // ignores this — it's not part of the "add" flow.
  const [source, setSource] = useState('local');

  const { data, isLoading } = useQuery({
    queryKey: ['media', pagePath || 'all'],
    queryFn: () => api.get(`/media?page_path=${encodeURIComponent(pagePath)}`),
    enabled: !!pagePath,
  });

  const { upload, busy, error: uploadError } = useFileUpload({
    endpoint: `${ADMIN_BASE}/admin/api/media`,
    extraFields: { page_path: pagePath },
    invalidate: [['media']],
  });

  const del = useMutation({
    mutationFn: (name) =>
      api.delete(`/media/${encodePath(name)}?page_path=${encodeURIComponent(pagePath)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  });

  async function uploadFiles(files) {
    for (const f of files) {
      try { await upload(f); } catch { /* surfaced via uploadError */ }
    }
  }

  async function confirmDelete(name) {
    const ok = await confirm({
      title: 'Delete file',
      message: `Delete "${name}" from this post's folder? This cannot be undone.`,
    });
    if (ok) del.mutate(name);
  }

  // Only per-post attachments — the API merges global + per-post when
  // page_path is set, so filter to the rows it tagged source="page".
  const files = (data?.files || []).filter((f) => f.source === 'page');

  return (
    <div className="space-y-3">
      {uploadError && <Alert tone="error">{uploadError}</Alert>}

      {/* "Add image" zone — Local dropzone and Unsplash search are
          mutually exclusive, so they sit behind a toggle. The
          already-uploaded grid further down ignores this state. */}
      <SegmentedControl
        ariaLabel="Add image source"
        value={source}
        onChange={setSource}
        options={SOURCES}
      />

      {source === 'local' && (
        <Dropzone
          accept="image/*"
          multiple
          disabled={busy}
          label="Drop images here"
          hint="Files land in this post's folder."
          buttonLabel={busy ? 'Uploading…' : 'Choose files'}
          onFiles={uploadFiles}
        />
      )}

      {source === 'unsplash' && (
        // Same Unsplash search the editor's image picker uses. `onPick`
        // here just invalidates the media list — there's no editor body
        // to insert into, the user is just attaching files to the post.
        <MediaPickerUnsplash
          pagePath={pagePath}
          onPick={() => qc.invalidateQueries({ queryKey: ['media'] })}
        />
      )}

      {isLoading ? (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
          aria-hidden="true"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-md bg-zinc-100" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-500">
          No files yet — drop images above to attach them to this post.
        </p>
      ) : (
        // auto-fill keeps tiles ~120px wide regardless of container width.
        // In a narrow column the grid renders 2-3 columns; in the main
        // editor area it fans out to as many as fit. One layout, both places.
        <ul
          role="list"
          className="grid list-none gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
        >
          {files.map((f) => (
            <li
              key={f.name + (f.url || '')}
              className="relative overflow-hidden rounded-md border border-zinc-200 bg-white"
              onMouseEnter={() => setHoverName(f.name)}
              onMouseLeave={() => setHoverName((n) => (n === f.name ? null : n))}
            >
              <img
                src={f.thumb_url || f.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover"
              />
              <button
                type="button"
                onClick={() => confirmDelete(f.name)}
                aria-label={`Delete ${f.name}`}
                className={`absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900/80 text-white shadow-card transition-opacity hover:bg-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 ${
                  hoverName === f.name ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
              <div
                title={f.name}
                className="truncate border-t border-zinc-100 px-2 py-1 text-[10px] text-zinc-600"
              >
                {f.name}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
