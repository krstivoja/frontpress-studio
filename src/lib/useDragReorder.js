import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { reorderWithEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/reorder-with-edge';
import { api } from './api.js';
import { useToast } from './toast.jsx';

/**
 * Pragmatic drag-and-drop reorder for the post list. Rows register
 * themselves as draggable + drop target via `useRowDrag`; this hook owns
 * the list-level monitor that performs the reorder on drop, plus the
 * optimistic state and persistence.
 *
 * We use Pragmatic DnD (not the old hand-rolled native handlers, and not
 * @dnd-kit which hit Rollup TDZ issues) so both this list and the Theme
 * Builder tree share one library.
 */

// Shared `data.type` marker so the monitor only reacts to page rows.
export const PAGE_ROW_DND = 'page-row';

export function useDragReorder(filtered, enabled = true) {
  const qc = useQueryClient();
  const toast = useToast();
  const [localItems, setLocalItems] = useState(null);
  const displayItems = localItems ?? filtered;

  // The monitor is registered once (per `enabled` toggle); it reads the
  // freshest list and mutate fn through refs rather than re-subscribing on
  // every render.
  const itemsRef = useRef(displayItems);
  itemsRef.current = displayItems;

  const reorderMut = useMutation({
    mutationFn: (items) => api.post('/pages/reorder', { items }),
    onSuccess: () => {
      setLocalItems(null);
      qc.invalidateQueries({ queryKey: ['pages'] });
    },
    onError: (err) => {
      setLocalItems(null);
      toast.show(err.message || "Couldn't reorder.", { tone: 'error' });
    },
  });

  const mutateRef = useRef(reorderMut.mutate);
  mutateRef.current = reorderMut.mutate;

  useEffect(() => {
    if (!enabled) return undefined;
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === PAGE_ROW_DND,
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0];
        if (!target) return;

        const items = itemsRef.current;
        const startIndex = items.findIndex((p) => p.path === source.data.path);
        const indexOfTarget = items.findIndex((p) => p.path === target.data.path);
        if (startIndex < 0 || indexOfTarget < 0) return;

        const next = reorderWithEdge({
          list: items,
          startIndex,
          indexOfTarget,
          closestEdgeOfTarget: extractClosestEdge(target.data),
          axis: 'vertical',
        });
        if (next === items) return; // dropped in place — no change

        setLocalItems(next);
        mutateRef.current(next.map((p, i) => ({ path: p.path, order: i + 1 })));
      },
    });
  }, [enabled]);

  return { displayItems, isReordering: reorderMut.isPending };
}
