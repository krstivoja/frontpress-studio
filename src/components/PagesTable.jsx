import PageRow from './PageRow.jsx';
import PagesListEmptyState from './PagesListEmptyState.jsx';

export default function PagesTable({
  folder,
  isOrderMode,
  reordering,
  displayItems,
  filtered,
  selected,
  visibleSelectedCount,
  allVisibleSelected,
  filterActive,
  onToggleAll,
  onToggleOne,
  onEdit,
  onDelete,
  onNew,
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-zinc-100 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">
          <th className="w-8 pl-6 pr-2 py-3">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
              }}
              onChange={(e) => onToggleAll(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-zinc-300"
            />
          </th>
          <th className="px-6 py-3">
            {isOrderMode ? (
              <span className="flex items-center gap-3">
                <span className="w-6 text-left">No.</span>
                <span>Title</span>
              </span>
            ) : 'Title'}
          </th>
          {folder ? <th className="px-6 py-3">Status</th> : <th className="px-6 py-3">Type</th>}
          <th className="w-40 px-6 py-3"></th>
        </tr>
      </thead>

      {isOrderMode ? (
        <tbody className={reordering ? 'opacity-60 pointer-events-none' : ''}>
          {displayItems.length === 0 && (
            <PagesListEmptyState
              folder={folder}
              filterActive={filterActive}
              columnSpan={4}
              onNew={onNew}
            />
          )}
          {displayItems.map((page, index) => (
            <PageRow
              key={page.path}
              page={page}
              showStatus
              dragEnabled
              order={index + 1}
              onToggle={() => {}}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      ) : (
        <tbody>
          {filtered.length === 0 && (
            <PagesListEmptyState
              folder={folder}
              filterActive={filterActive}
              columnSpan={4}
              onNew={onNew}
            />
          )}
          {filtered.map((page) => (
            <PageRow
              key={page.path}
              page={page}
              showStatus={!!folder}
              selected={selected.has(page.path)}
              onToggle={onToggleOne}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      )}
    </table>
  );
}
