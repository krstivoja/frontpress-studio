import { Button, Select } from './ui/index.js';

// Header bar for the Theme Builder. Title is the active theme name with
// "Theme Builder" as the subtitle. The active template file is shown in
// the template-switcher dropdown to the right, so no need to repeat the
// path in the subtitle.
export default function ThemeBuilderHeader({
  themeLabel,
  path,
  templates,
  layout,
  onChooseFile,
  onSave,
  onLayoutChange,
  saving,
  dirty,
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4">
      <div className="min-w-[200px]">
        <h1 className="truncate text-sm font-semibold">{themeLabel || 'No theme'}</h1>
        <div className="text-xs text-zinc-500">Theme Builder</div>
      </div>
      <Select
        className="ml-auto w-44"
        value={path}
        onChange={(e) => onChooseFile(e.target.value)}
        disabled={templates.length === 0}
      >
        {templates.length === 0 && <option value="">No templates</option>}
        {templates.map((t) => (
          <option key={t.path} value={t.path}>{t.name}</option>
        ))}
      </Select>
      {onLayoutChange && (
        <LayoutToggle value={layout} onChange={onLayoutChange} />
      )}
      <Button size="sm" onClick={onSave} disabled={!dirty || saving || !path}>
        {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
      </Button>
    </header>
  );
}

// Pair of icon buttons that flips the editor between "below" the preview
// (default — stacked) and "right of" the preview (side-by-side). The
// icons mirror the resulting layout: a square with a horizontal divider
// for "below", a square with a vertical divider for "right".
function LayoutToggle({ value, onChange }) {
  const opts = [
    { value: 'below', label: 'Editor below', icon: <SplitBelowIcon /> },
    { value: 'right', label: 'Editor on right', icon: <SplitRightIcon /> },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Editor layout"
      className="inline-flex items-center gap-0.5 rounded-md border border-zinc-200 bg-white p-0.5"
    >
      {opts.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              active
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}

const toggleStroke = {
  width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
};

function SplitBelowIcon() {
  return (
    <svg {...toggleStroke}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="2" y1="9" x2="14" y2="9" />
    </svg>
  );
}

function SplitRightIcon() {
  return (
    <svg {...toggleStroke}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="9" y1="2" x2="9" y2="14" />
    </svg>
  );
}
