import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import {
  SNIPPETS,
  SNIPPET_GROUPS,
  buildPartialSnippets,
} from '../lib/themeBuilderSnippets.js';
import SnippetFormDialog from './SnippetFormDialog.jsx';

// Sidebar Snippets tab. Inserts built-in scaffolds (from
// themeBuilderSnippets.js — read-only), partials detected on disk, and
// theme-owned snippets the user creates here. Click to insert at cursor.
//
// MVP scope (delete-only on theme snippets, no edit): edits are handled
// by deleting + recreating. Built-ins are intentionally non-editable —
// they're framework scaffolding, not authored content.
export default function ThemeBuilderComponentsPanel({ isTwig, files, theme, onInsert }) {
  const qc    = useQueryClient();
  const toast = useToast();
  const partials = useMemo(() => buildPartialSnippets(files || []), [files]);

  const { data: snippetsData } = useQuery({
    queryKey: ['theme-snippets', theme],
    queryFn:  () => api.get(`/themes/snippets?theme=${encodeURIComponent(theme || '')}`),
    enabled:  !!theme,
  });
  const themeSnippets = useMemo(
    () => (snippetsData?.snippets || []).map((s) => ({
      id:          's-' + s.id,
      group:       'Theme snippets',
      label:       s.name,
      description: s.description,
      target:      'content',
      lines:       String(s.content || '').split('\n'),
      _rawId:      s.id,
      _custom:     true,
    })),
    [snippetsData],
  );

  const groups = useMemo(() => {
    const out = ['Theme snippets', ...SNIPPET_GROUPS];
    if (partials.length) out.push('Partials');
    return out;
  }, [partials.length]);

  // Track expanded groups. Defaults to "Theme snippets" + "Elements" +
  // "Structure" — the three the author hits most. Others collapsed.
  const [open, setOpen] = useState(() => ({
    'Theme snippets': true, Elements: true, Structure: true,
  }));
  const [formOpen, setFormOpen] = useState(false);

  async function deleteSnippet(item) {
    if (!confirm(`Delete snippet "${item.label}". The file on disk will be deleted.`)) return;
    try {
      await api.post('/themes/snippets-delete', { theme, id: item._rawId });
      qc.invalidateQueries({ queryKey: ['theme-snippets', theme] });
      toast.show(`Deleted "${item.label}"`, { tone: 'success' });
    } catch (e) {
      toast.show(e.message, { tone: 'error', duration: 5000 });
    }
  }

  if (!isTwig) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 p-3 text-xs text-zinc-500">
        Snippets insert Twig code. Open a `.twig` template to use them.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        disabled={!theme}
        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-left text-[11px] font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50"
      >
        + New snippet
      </button>
      {groups.map((name) => {
        const items = name === 'Partials'        ? partials
                    : name === 'Theme snippets'  ? themeSnippets
                    : SNIPPETS.filter((s) => s.group === name);
        const isOpen = !!open[name];
        return (
          <section key={name} className="rounded-md border border-zinc-200 bg-white">
            <button
              type="button"
              onClick={() => setOpen((prev) => ({ ...prev, [name]: !prev[name] }))}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <span>{name}</span>
              <span className="text-[10px] text-zinc-400">
                {items.length} {isOpen ? '▾' : '▸'}
              </span>
            </button>
            {isOpen && (
              items.length === 0 ? (
                <div className="px-2 pb-2 text-[11px] text-zinc-500">
                  {name === 'Partials'
                    ? 'Add a templates/_<name>.twig file to see it here.'
                    : 'Nothing in this group.'}
                </div>
              ) : (
                <div className="grid gap-1.5 px-2 pb-2 sm:grid-cols-2">
                  {items.map((item) => (
                    <div key={item.id} className="relative">
                      <button
                        type="button"
                        onClick={() => onInsert?.(item)}
                        title={item.description}
                        className="flex w-full flex-col gap-0.5 rounded-md border border-zinc-200 bg-white px-2 py-1.5 pr-7 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50"
                      >
                        <span className="text-[11px] font-semibold text-zinc-900">{item.label}</span>
                        <span className="line-clamp-2 text-[10px] leading-snug text-zinc-500">
                          {item.description}
                        </span>
                      </button>
                      {item._custom && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteSnippet(item); }}
                          aria-label={`Delete ${item.label}`}
                          className="absolute right-1 top-1 rounded p-0.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M3 3l6 6M9 3l-6 6" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </section>
        );
      })}

      <SnippetFormDialog
        open={formOpen}
        theme={theme}
        onClose={() => setFormOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['theme-snippets', theme] })}
      />
    </div>
  );
}
