import { Input, Select } from './ui/index.js';
import { IconSearch } from './icons.jsx';

/**
 * Filter toolbar for PagesList — search box, status chips (with live result
 * counts), sort selector, and a removable-pill row that summarises the
 * active filters. Extracted from PagesList to keep that screen under the
 * 300-line budget and because the filter UX is a cohesive unit.
 *
 * Status values match the filter logic in PagesList:
 *   ''      → all
 *   'live'  → published (non-draft)
 *   'draft' → drafts
 *
 * `counts` is computed by the parent from the folder+search-filtered list
 * *before* the status filter is applied, so each chip shows how many posts
 * it would surface regardless of which chip is currently active.
 */
export default function PagesFilterBar({
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  sort,
  setSort,
  counts,
}) {
  const hasActiveFilters = !!query.trim() || !!statusFilter;

  return (
    <header className="space-y-3 border-b border-zinc-100 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            {IconSearch}
          </span>
          <Input
            className="w-full pl-9"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <Select
          className="w-44"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All ({counts.all})</option>
          <option value="live">Published ({counts.published})</option>
          <option value="draft">Drafts ({counts.drafts})</option>
        </Select>

        <Select
          className="w-40"
          value={sort}
          onChange={e => setSort(e.target.value)}
          aria-label="Sort"
        >
          <option value="date-desc">Date — newest</option>
          <option value="date-asc">Date — oldest</option>
          <option value="title-asc">Title — A→Z</option>
          <option value="title-desc">Title — Z→A</option>
        </Select>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
            Filters
          </span>
          {query.trim() && (
            <FilterPill onClear={() => setQuery('')}>
              Search: “{query.trim()}”
            </FilterPill>
          )}
          {statusFilter && (
            <FilterPill onClear={() => setStatusFilter('')}>
              {statusFilter === 'draft' ? 'Drafts' : 'Published'}
            </FilterPill>
          )}
          <button
            type="button"
            onClick={() => { setQuery(''); setStatusFilter(''); }}
            className="text-[12px] font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-zinc-900"
          >
            Clear all
          </button>
        </div>
      )}
    </header>
  );
}

// Removable filter pill — label + × that clears just this filter.
function FilterPill({ children, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-zinc-700">
      {children}
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove filter"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
        </svg>
      </button>
    </span>
  );
}
