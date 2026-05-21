import { useUpdate } from '../lib/useUpdate.js';

/**
 * Compact "update available" card slotted near the bottom of the sidebar.
 * Renders nothing when no update is available — the surrounding layout
 * stays the same on the happy path, so this is safe to mount unconditionally
 * inside Sidebar.jsx.
 *
 * Visual language matches the rest of the admin sidebar (13px copy, rounded
 * card, zinc-900 primary button). No icon — text-first keeps it scannable
 * next to the dense nav links above it.
 */
export default function SidebarUpdateBanner() {
  const { available, current, latest, applying, apply } = useUpdate();
  if (!available) return null;

  return (
    <div className="mx-3 my-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[12px]">
      <div className="font-semibold text-zinc-900">Update available</div>
      <div className="mt-0.5 text-zinc-600">
        v{current} → <span className="font-medium text-zinc-900">v{latest}</span>
      </div>
      <button
        type="button"
        onClick={apply}
        disabled={applying}
        aria-busy={applying || undefined}
        className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {applying ? 'Updating…' : 'Update now'}
      </button>
    </div>
  );
}
