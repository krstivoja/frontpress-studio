import { Checkbox } from './ui/index.js';
import { IconFolder, IconFile } from './icons.jsx';

/**
 * Reusable source-picker list shared by push (GithubBackupCard) and
 * restore (GithubRestoreSection). Stateless — caller owns picked/onChange.
 */
export default function GithubSourceList({ sources, picked, disabled, onChange, label, disabledKeys = [] }) {
  return (
    <div className="space-y-1">
      <div className="text-[13px] font-medium text-zinc-900">{label}</div>
      <div className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
        {sources.map((s) => {
          const alwaysOff = disabledKeys.includes(s.key);
          const isDisabled = alwaysOff || !s.exists || disabled;
          return (
            <label
              key={s.key}
              className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-zinc-50 ${
                isDisabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : ''
              }`}
            >
              <Checkbox
                className="mt-0.5"
                checked={!alwaysOff && !!(picked || []).includes(s.key)}
                disabled={isDisabled}
                onChange={(e) => onChange(s.key, e.target.checked)}
              />
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500">
                {s.type === 'dir'
                  ? IconFolder
                  : <IconFile ext={(s.path.split('.').pop() || '').toLowerCase()} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px]">
                  <span className="font-mono font-medium text-zinc-900">{s.path}</span>
                  {alwaysOff && (
                    <span className="ml-2 text-[11px] text-zinc-400">(excluded from restore)</span>
                  )}
                  {!alwaysOff && !s.exists && (
                    <span className="ml-2 text-[11px] text-zinc-400">(not present)</span>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
