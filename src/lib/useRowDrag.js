import { useEffect, useRef, useState } from 'react';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import {
  attachClosestEdge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { PAGE_ROW_DND } from './useDragReorder.js';

/**
 * Registers one <tr> as both a draggable and a drop target for the Pages
 * reorder. Returns a ref to attach to the row plus live drag state for
 * styling. No-op when `enabled` is false (normal, non-order-mode lists),
 * so the same PageRow works in both modes.
 *
 * `closestEdge` is the edge ('top' | 'bottom') the pointer is nearest on
 * THIS row while another row is dragged over it — drives the insert line.
 */
export function useRowDrag(path, enabled) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return undefined;

    const data = { type: PAGE_ROW_DND, path };
    return combine(
      draggable({
        element: el,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => source.data.type === PAGE_ROW_DND,
        getData: ({ input, element }) =>
          attachClosestEdge(data, { input, element, allowedEdges: ['top', 'bottom'] }),
        onDrag: ({ self, source }) =>
          setClosestEdge(source.data.path === path ? null : extractClosestEdge(self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    );
  }, [path, enabled]);

  return { ref, dragging, closestEdge };
}
