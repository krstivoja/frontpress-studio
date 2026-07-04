import { memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from './ui/index.js';
import { useRowDrag } from '../lib/useRowDrag.js';

const DragHandle = () => (
  <span aria-hidden="true" className="text-zinc-400">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
      <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" />
    </svg>
  </span>
);

// One row in <PagesList>. Memo'd so toggling one checkbox doesn't re-render
// every other row in a large content set. When `dragEnabled` (order mode)
// the row registers itself for Pragmatic drag-and-drop via `useRowDrag` and
// the checkbox cell shows a drag handle.
const PageRow = memo(function PageRow(
  { page, showStatus, selected, onToggle, onEdit, onDelete, dragEnabled = false, order },
) {
  const handleEdit = useCallback(() => onEdit(`/${page.path}`), [onEdit, page.path]);
  const handleDelete = useCallback(() => onDelete(page), [onDelete, page]);
  const handleToggle = useCallback((e) => onToggle(page.path, e.target.checked), [onToggle, page.path]);

  const { ref, dragging, closestEdge } = useRowDrag(page.path, dragEnabled);

  const rowCls = [
    'border-b border-zinc-100 last:border-b-0',
    dragEnabled ? 'cursor-grab select-none' : 'hover:bg-zinc-50',
    dragging ? '[&>td]:invisible' : '',
  ].filter(Boolean).join(' ');

  const dragStyle = {
    ...(dragging ? { backgroundColor: '#f4f4f5' } : {}),
    ...(closestEdge === 'top'    ? { boxShadow: 'inset 0 2px 0 0 #3b82f6' } : {}),
    ...(closestEdge === 'bottom' ? { boxShadow: 'inset 0 -2px 0 0 #3b82f6' } : {}),
  };

  return (
    <tr ref={ref} style={dragStyle} className={rowCls}>
      <td className="pl-6 pr-2 py-4">
        {dragEnabled ? (
          <DragHandle />
        ) : (
          <input
            type="checkbox"
            checked={selected}
            onChange={handleToggle}
            aria-label={`Select ${page.title || page.path}`}
            className="h-4 w-4 cursor-pointer rounded border-zinc-300"
          />
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {order != null && (
            <span className="w-6 shrink-0 text-left font-mono text-[11px] tabular-nums text-zinc-400">
              {order}
            </span>
          )}
          <Link to={`/${page.path}`} className="block min-w-0" draggable={dragEnabled ? false : undefined}>
            <span className="block font-semibold text-zinc-900 hover:underline">
              {page.title || '(untitled)'}
            </span>
            <span className="mt-0.5 block font-mono text-[11px] text-zinc-500">
              {page.path}
            </span>
          </Link>
        </div>
      </td>
      {showStatus ? (
        <td className="px-6 py-4">
          <Badge tone={page.draft ? 'draft' : 'live'}>{page.draft ? 'Draft' : 'Live'}</Badge>
        </td>
      ) : (
        <td className="px-6 py-4 text-zinc-500">{page.folder || '—'}</td>
      )}
      <td className="px-6 py-4">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleEdit}>Edit</Button>
          <Button variant="danger" size="sm" onClick={handleDelete}>Delete</Button>
        </div>
      </td>
    </tr>
  );
});

export default PageRow;
