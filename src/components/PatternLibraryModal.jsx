import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { Button, Badge } from './ui/index.js';
import PatternFormDialog from './PatternFormDialog.jsx';

const CATEGORY_ORDER = ['layout', 'navigation', 'content', 'media', 'forms', 'utility'];
const CATEGORY_LABEL = {
  layout: 'Layout', navigation: 'Navigation', content: 'Content',
  media:  'Media',  forms: 'Forms', utility:    'Utility',
};

/**
 * Full-screen modal launched from the Theme Builder header. Shows every
 * registered component as a live iframe preview powered by the
 * `/admin/themes/component-preview` endpoint, grouped by category.
 *
 * Click a card → close the modal and open that component's source file
 * in the Theme Builder.
 */
export default function PatternLibraryModal({ open, theme, onClose, onOpenCode }) {
  const qc    = useQueryClient();
  const toast = useToast();
  // Form dialog state: `null` = closed, `{}` = new pattern, `{component}` = editing.
  const [editing, setEditing] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['theme-components', theme],
    queryFn:  () => api.get(`/themes/components${theme ? `?theme=${encodeURIComponent(theme)}` : ''}`),
    enabled:  open,
  });
  const components = data?.components || [];
  const grouped    = useMemo(() => groupByCategory(components), [components]);

  async function deleteComponent(c) {
    if (!confirm(`Delete pattern "${c.name}"? The template file stays untouched.`)) return;
    try {
      await api.post('/themes/components-delete', { theme, id: c.id });
      qc.invalidateQueries({ queryKey: ['theme-components', theme] });
      toast.show(`Removed pattern "${c.name}".`, { tone: 'success' });
    } catch (e) {
      toast.show(e.message, { tone: 'error', duration: 5000 });
    }
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ['theme-components', theme] });
  }

  // Close on Escape — matches every other modal in the admin.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-full w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold">Pattern Library</h2>
            {theme && <div className="text-[12px] text-zinc-500">Theme: <span className="font-mono">{theme}</span></div>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setEditing({})}>+ Add pattern</Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l10 10M14 4l-10 10" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600">Couldn’t load — {error.message}. Reload and try again.</div>
          ) : components.length === 0 ? (
            <EmptyState theme={theme} />
          ) : (
            CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => (
              <section key={cat} className="mb-6 last:mb-0">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {CATEGORY_LABEL[cat]} ({grouped[cat].length})
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped[cat].map((c) => (
                    <PreviewCard
                      key={c.id}
                      component={c}
                      theme={theme}
                      onOpenCode={() => { onOpenCode(c.template); onClose(); }}
                      onEdit={() => setEditing({ component: c })}
                      onDelete={() => deleteComponent(c)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <PatternFormDialog
        open={editing !== null}
        theme={theme}
        editing={editing?.component || null}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
    </div>
  );
}

function PreviewCard({ component, theme, onOpenCode, onEdit, onDelete }) {
  const [loaded, setLoaded] = useState(false);
  const stale = !component.template_exists;
  // Cache-bust by hashing the component fields the preview depends on.
  // Changes to sample/template force the iframe to reload; cosmetic edits
  // (name, description) reload too but that's harmless.
  const v = hashStr(JSON.stringify({ s: component.sample, t: component.template }));
  const src = `/admin/themes/component-preview?theme=${encodeURIComponent(theme || '')}&id=${encodeURIComponent(component.id)}&v=${v}`;

  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-zinc-100 bg-zinc-50">
        {stale ? (
          <div className="flex h-full items-center justify-center text-[12px] text-zinc-500">
            Template file missing
          </div>
        ) : (
          <>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-400">
                Rendering…
              </div>
            )}
            <iframe
              title={`${component.name} preview`}
              src={src}
              onLoad={() => setLoaded(true)}
              className="h-full w-full border-0"
              // Sandbox lets us render arbitrary theme HTML without
              // letting it navigate the parent or run cross-origin code.
              sandbox="allow-same-origin"
            />
          </>
        )}
      </div>
      <div className="space-y-1 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate text-[13px] font-semibold">{component.name}</h4>
          {stale && <Badge tone="warning">missing</Badge>}
        </div>
        <code className="block truncate text-[11px] text-zinc-500">{component.template}</code>
        {component.description && (
          <p className="line-clamp-2 text-[12px] text-zinc-600">{component.description}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={onOpenCode} disabled={stale}>
            Open code
          </Button>
          <Button size="sm" variant="secondary" onClick={onEdit}>
            Edit info
          </Button>
          <Button size="sm" variant="link-danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ theme }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="mb-2 text-sm font-semibold">No components registered</h3>
      <p className="text-[12px] leading-relaxed text-zinc-600">
        Drop a sidecar manifest next to a template — e.g.{' '}
        <code className="rounded bg-white px-1 py-0.5 font-mono">templates/components/hero.json</code>
        {' '}beside <span className="font-mono">hero.twig</span> in{' '}
        <span className="font-mono">site/themes/{theme || '<theme>'}/</span>:
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-100">{`{
  "id":          "hero",
  "name":        "Hero",
  "description": "Landing-page hero block.",
  "category":    "layout",
  "inputs": [
    { "name": "title", "type": "text", "default": "Headline" }
  ]
}`}</pre>
    </div>
  );
}

function groupByCategory(components) {
  const out = {};
  for (const c of components) (out[c.category] ||= []).push(c);
  return out;
}

/** Tiny non-cryptographic hash — good enough to invalidate an iframe URL. */
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}
