import { useEffect, useRef, useState } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { Alert, Button, Input, Select } from './ui/index.js';

const PER_PAGE = 18;

// Unsplash's `/search/photos` enums. We only ship the values Unsplash
// actually documents — `curated` exists as a separate endpoint, not a
// search sort, so it's not offered here.
const ORIENTATIONS = [
  { value: '',          label: 'Any orientation' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait',  label: 'Portrait' },
  { value: 'squarish',  label: 'Square' },
];
const ORDERS = [
  { value: 'relevant', label: 'Sort: Relevance' },
  { value: 'latest',   label: 'Sort: Newest' },
];

/**
 * Unsplash search section inside the MediaPicker. Sits between the upload
 * dropzone and the local library. Lazily fetches its "key status" once on
 * mount; if no key is configured we render a one-line nudge pointing at
 * Settings → Integrations instead of the search UI.
 *
 * Pagination uses `useInfiniteQuery`: each page is one Unsplash search
 * request, "Load more" appends the next page in-place rather than jumping
 * the user out to a fresh result set. `getNextPageParam` returns
 * `undefined` once we've shown `total` results — which hides the button.
 *
 * Selecting a photo POSTs `/admin/api/unsplash/pick`, which:
 *   1. Pings Unsplash's mandatory download-event endpoint (compliance)
 *   2. Streams the image into `site/uploads/` (or the per-post folder)
 *   3. Returns the local URL + attribution payload
 *
 * The caller (MediaPicker) then forwards the local URL through `onPick`
 * exactly as if it had come from Upload or Library — and inserts a
 * compliant "Photo by … on Unsplash" caption immediately after the image.
 */
export default function MediaPickerUnsplash({ onPick, pagePath }) {
  const qc = useQueryClient();
  // Cheap status probe. The integration is normally on (FrontPress ships
  // a default Access Key), but operators can clear it — in which case we
  // show a single setup hint instead of letting search 400.
  const { data: keyData } = useQuery({
    queryKey: ['unsplash', 'key'],
    queryFn: () => api.get('/unsplash/key'),
  });
  const configured = keyData?.configured !== false; // default true while loading

  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [orientation, setOrientation] = useState('');
  const [orderBy, setOrderBy] = useState('relevant');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(null); // photo id currently downloading
  const inputRef = useRef(null);

  const {
    data,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    // Filters are part of the key so changing a dropdown re-fetches
    // page 1 of a fresh result set rather than appending mismatched
    // pages onto the old query.
    queryKey: ['unsplash', 'search', submitted, orientation, orderBy],
    enabled:  submitted.length > 0,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({
        q: submitted,
        per_page: String(PER_PAGE),
        page: String(pageParam),
        order_by: orderBy,
      });
      if (orientation) qs.set('orientation', orientation);
      return api.get(`/unsplash/search?${qs.toString()}`);
    },
    getNextPageParam: (lastPage, allPages) => {
      // Unsplash returns the full total upfront. Once we've shown that many
      // results, there's nothing more to load — return undefined to hide
      // the "Load more" button and short-circuit the query.
      const shown = allPages.reduce((n, p) => n + (p.results?.length || 0), 0);
      const total = lastPage?.total || 0;
      return shown < total ? allPages.length + 1 : undefined;
    },
  });

  // Reset any stale error when the user starts a fresh search.
  useEffect(() => { if (q) setError(''); }, [q]);

  // Only path where Unsplash isn't usable: operator stripped the bundled
  // default AND neither config.php nor Settings UI has a key. Surface a
  // direct setup hint instead of a vague 400 from /unsplash/search.
  if (!configured) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-[13px] text-zinc-600">
        Add an Unsplash Access Key under{' '}
        <a
          href="/admin/#/settings/integrations"
          className="text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
        >Settings → Integrations</a>{' '}
        to enable photo search here.
      </div>
    );
  }

  async function pick(photo) {
    setError('');
    setPicking(photo.id);
    try {
      const res = await api.post('/unsplash/pick', {
        photo_id:          photo.id,
        download_location: photo.download_location,
        page_path:         pagePath || '',
        alt:               photo.description || `Photo by ${photo.author?.name || 'Unsplash'}`,
        author_name:       photo.author?.name || '',
        author_username:   photo.author?.username || '',
        author_link:       photo.author?.link || '',
      });
      qc.invalidateQueries({ queryKey: ['media'] });
      onPick({
        url: res.url,
        alt: photo.description || `Photo by ${photo.author?.name || 'Unsplash'}`,
        attribution: res.attribution,
      });
    } catch (e) {
      setError(e?.message || "Couldn't import the photo — try again.");
    } finally {
      setPicking(null);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    const next = q.trim();
    setSubmitted(next);
  }

  // Flatten the per-page chunks for rendering. Empty results during the
  // initial fetch are handled below via the !isFetching guard.
  const results = (data?.pages || []).flatMap((p) => p.results || []);
  const total   = data?.pages?.[data.pages.length - 1]?.total || 0;
  const initialFetching = isFetching && !isFetchingNextPage;

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Unsplash (e.g. mountains, coffee, abstract)"
          aria-label="Search Unsplash"
          className="min-w-[14rem] flex-1"
        />
        <Select
          value={orientation}
          onChange={(e) => setOrientation(e.target.value)}
          aria-label="Filter by orientation"
          className="w-44"
        >
          {ORIENTATIONS.map((o) => (
            <option key={o.value || 'any'} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Select
          value={orderBy}
          onChange={(e) => setOrderBy(e.target.value)}
          aria-label="Sort results"
          className="w-44"
        >
          {ORDERS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Button type="submit" disabled={initialFetching || q.trim() === ''}>
          {initialFetching ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {error && <Alert tone="error">{error}</Alert>}

      {submitted && !initialFetching && results.length === 0 && (
        <p className="text-[13px] text-zinc-500">No results for "{submitted}".</p>
      )}

      {results.length > 0 && (
        <>
          {/*
            Masonry-style layout via CSS columns so each thumbnail keeps
            its real aspect ratio instead of being cropped to square.
            `break-inside-avoid` on each item keeps the photo + author
            footer together within a column.
          */}
          <ul role="list" className="columns-3 gap-2 [&]:list-none sm:columns-4 md:columns-5 lg:columns-6">
            {results.map((p) => (
              <li key={p.id} className="relative mb-2 break-inside-avoid">
                <button
                  type="button"
                  onClick={() => pick(p)}
                  disabled={picking !== null}
                  aria-label={`Use photo by ${p.author?.name || 'Unsplash author'}`}
                  className="group block w-full overflow-hidden rounded-md border border-zinc-200 bg-white transition-shadow hover:shadow-popover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <img
                    src={p.small || p.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="block h-auto w-full"
                  />
                  <div className="truncate border-t border-zinc-100 px-2 py-1 text-[11px] text-zinc-500">
                    {p.author?.name || 'Unsplash'}
                  </div>
                </button>
                {picking === p.id && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/80 text-[12px] font-medium text-zinc-700">
                    Importing…
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between pt-1 text-[12px] text-zinc-500">
            <span>Showing {results.length} of {total.toLocaleString()}</span>
            {hasNextPage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
