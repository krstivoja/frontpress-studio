import { useEffect, useMemo, useRef, useState } from 'react';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import {
  attachInstruction,
  extractInstruction,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item';
import { flattenBlocks } from '../lib/themeBuilderBlocks.js';

const tone = {
  marker: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  code: 'bg-amber-50 text-amber-700 ring-amber-200',
  html: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
};

const TREE_ITEM_DND = 'tree-item';
const INDENT = 14; // px of left padding per nesting level

// Block tags that can accept children. Used to decide whether the
// "inside" (make-child) drop is offered. Void / atomic elements (img, hr,
// h1…) fold to before/after only.
const CONTAINER_TAGS = new Set([
  'article', 'aside', 'div', 'footer', 'form', 'header', 'main',
  'nav', 'ol', 'section', 'ul', 'li', 'figure', 'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr',
]);

function canContainChildren(block) {
  if (block.source !== 'html') return true; // marker / twig blocks always wrap
  return CONTAINER_TAGS.has(block.tag);
}

// Pragmatic tree instruction → the before/inside/after contract onMove
// expects. `reparent` is blocked (see attachInstruction below) so it never
// reaches here; `instruction-blocked` is ignored by the monitor.
const INSTRUCTION_POSITION = {
  'reorder-above': 'before',
  'reorder-below': 'after',
  'make-child': 'inside',
};

export default function ThemeBuilderOutline({ blocks, selectedId, onSelect, onMove }) {
  const flat = useMemo(() => flattenBlocks(blocks), [blocks]);

  // Keep the monitor stable while always calling the latest onMove.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => monitorForElements({
    canMonitor: ({ source }) => source.data.type === TREE_ITEM_DND,
    onDrop({ source, location }) {
      const target = location.current.dropTargets[0];
      if (!target) return;
      const instruction = extractInstruction(target.data);
      if (!instruction || instruction.type === 'instruction-blocked') return;
      const position = INSTRUCTION_POSITION[instruction.type];
      const activeId = source.data.id;
      const overId = target.data.id;
      if (!position || activeId === overId) return;
      onMoveRef.current?.(activeId, overId, position);
    },
  }), []);

  if (!flat.length) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 p-3 text-xs text-zinc-500">
        No selectable structure in this file.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {flat.map((block) => (
        <OutlineRow
          key={block.id}
          block={block}
          selected={selectedId === block.id}
          onSelect={() => onSelect?.(block.id)}
        />
      ))}
    </div>
  );
}

function OutlineRow({ block, selected, onSelect }) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);
  // Live pragmatic instruction for THIS row while another is dragged over it.
  const [instruction, setInstruction] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const data = { type: TREE_ITEM_DND, id: block.id };
    // Never offer reparent (keeps the before/inside/after contract); drop
    // make-child too when this block can't hold children.
    const blocked = canContainChildren(block) ? ['reparent'] : ['reparent', 'make-child'];

    return combine(
      draggable({
        element: el,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          source.data.type === TREE_ITEM_DND && source.data.id !== block.id,
        getData: ({ input, element }) =>
          attachInstruction(data, {
            input,
            element,
            currentLevel: block.depth,
            indentPerLevel: INDENT,
            mode: 'standard',
            block: blocked,
          }),
        onDrag: ({ self, source }) =>
          setInstruction(source.data.id === block.id ? null : extractInstruction(self.data)),
        onDragLeave: () => setInstruction(null),
        onDrop: () => setInstruction(null),
      }),
    );
  }, [block.id, block.depth, block.source, block.tag]);

  const pos = instruction && INSTRUCTION_POSITION[instruction.type];

  return (
    <div
      ref={ref}
      className="relative"
      style={{ paddingLeft: `${block.depth * INDENT}px` }}
    >
      {pos === 'before' && <DropLine pos="top" />}
      {pos === 'after'  && <DropLine pos="bottom" />}
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
          dragging
            ? 'opacity-40'
            : selected
              ? 'bg-zinc-900 text-white'
              : pos === 'inside'
                ? 'bg-blue-50 text-zinc-900 ring-1 ring-blue-300'
                : 'text-zinc-700 hover:bg-zinc-100'
        }`}
      >
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
            selected ? 'bg-white/15 text-white ring-white/30' : tone[block.source]
          }`}
        >
          {block.type}
        </span>
        <span className="min-w-0 flex-1 truncate">{block.label}</span>
        <span className="text-[10px] opacity-70">{block.startLine}</span>
      </button>
    </div>
  );
}

function DropLine({ pos }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-2 right-2 h-0.5 rounded bg-blue-500 ${
        pos === 'top' ? '-top-0.5' : '-bottom-0.5'
      }`}
    />
  );
}
