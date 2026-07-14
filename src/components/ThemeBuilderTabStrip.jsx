// Editor tab strip for the Theme Builder. One chip per open file; the active
// chip is highlighted, a dirty tab shows a dot (which becomes an ✕ on hover),
// and clicking a tab activates it. Persistent tabs — a tab stays until closed.
export default function ThemeBuilderTabStrip({ tabs, activePath, onSelect, onClose }) {
  if (!tabs || tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Open files"
      className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-zinc-200 bg-zinc-50"
    >
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={active}
            title={tab.path}
            onClick={() => onSelect?.(tab.path)}
            className={`group flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-zinc-200 px-3 text-xs ${
              active
                ? 'bg-white font-medium text-zinc-900'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
            }`}
          >
            <span className="max-w-[160px] truncate">{tab.name}</span>
            <button
              type="button"
              aria-label={`Close ${tab.name}`}
              onClick={(e) => { e.stopPropagation(); onClose?.(tab.path); }}
              className="relative flex h-4 w-4 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
            >
              {/* Dirty dot when not hovered; ✕ on hover/focus. */}
              {tab.dirty && (
                <span className="absolute h-1.5 w-1.5 rounded-full bg-zinc-500 group-hover:hidden" />
              )}
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.5"
                className={tab.dirty ? 'hidden group-hover:block' : 'block'}
              >
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
