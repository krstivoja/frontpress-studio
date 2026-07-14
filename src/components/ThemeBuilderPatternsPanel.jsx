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

// Preview box clamps: floor keeps a too-short render (e.g. a bare label)
// from collapsing to a sliver; ceiling stops a tall component from eating
// the whole sidebar.
const PREVIEW_MIN = 48;
const PREVIEW_MAX = 320;

// Sidebar Patterns tab — the compact sibling of the full Pattern Library
// modal. Lists every reusable `<Tag/>` component (templates/components/*)
// grouped by category, each with a live iframe preview (same
// `/themes/component-preview` endpoint the modal uses) and the same
// Insert / Open code / Edit / Delete actions.
export default function ThemeBuilderPatternsPanel({ isTwig, theme, canInsert, onInsert, onOpenCode, onPlace }) {
  const qc    = useQueryClient();
  const toast = useToast();
  // Form dialog state: `null` = closed, `{}` = new pattern, `{component}` = editing.
  const [editing, setEditing] = useState(null);
  // Active category filters (empty = show all). Mirrors the Files tab's
  // file-type chips; only categories actually present get a chip.
  const [activeCats, setActiveCats] = useState([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['theme-components', theme],
    queryFn:  () => api.get(`/themes/components${theme ? `?theme=${encodeURIComponent(theme)}` : ''}`),
    enabled:  !!theme,
  });

  const components = useMemo(
    () => (data?.components || []).filter(isComponentEntry),
    [data],
  );
  const grouped = useMemo(() => groupByCategory(components), [components]);
  // Categories present in this theme, in the canonical order, with counts.
  const catOptions = useMemo(
    () => CATEGORY_ORDER.filter((c) => grouped[c]?.length)
      .map((c) => ({ key: c, label: CATEGORY_LABEL[c], count: grouped[c].length })),
    [grouped],
  );
  const visibleCats = useMemo(() => {
    const present = catOptions.map((c) => c.key);
    if (!activeCats.length) return present;
    const sel = new Set(activeCats);
    return present.filter((c) => sel.has(c));
  }, [catOptions, activeCats]);

  // Drop any active filter whose category no longer exists (last pattern of
  // that category deleted) so the list can't get stuck showing nothing.
  useEffect(() => {
    const present = new Set(catOptions.map((c) => c.key));
    setActiveCats((prev) => {
      const next = prev.filter((k) => present.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [catOptions]);

  const toggleCat = (key) =>
    setActiveCats((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  async function deleteComponent(c) {
    if (!confirm(`Delete component "${c.name}"? The template file stays untouched.`)) return;
    try {
      await api.post('/themes/components-delete', { theme, id: c.id });
      qc.invalidateQueries({ queryKey: ['theme-components', theme] });
      toast.show(`Removed component "${c.name}".`, { tone: 'success' });
    } catch (e) {
      toast.show(e.message, { tone: 'error', duration: 5000 });
    }
  }

  function insert(c) {
    onInsert?.(c);
    toast.show(`Inserted <${c.tag || c.name} /> at the cursor.`, { tone: 'success' });
  }

  if (!isTwig) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 p-3 text-xs text-zinc-500">
        Components insert Twig tags. Open a `.twig` template to use them.
      </div>
    );
  }
  if (isLoading) {
    return <div className="text-[11px] text-zinc-500">Loading…</div>;
  }
  if (error) {
    return <div className="text-[11px] text-red-600">Couldn’t load — {error.message}.</div>;
  }

  return (
    <div className="space-y-3">
      <Button size="sm" className="w-full" onClick={() => setEditing({})} disabled={!theme}>
        + Add component
      </Button>

      {catOptions.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <CatChip
            label="All"
            active={!activeCats.length}
            onClick={() => setActiveCats([])}
          />
          {catOptions.map((c) => (
            <CatChip
              key={c.key}
              label={c.label}
              count={c.count}
              active={activeCats.includes(c.key)}
              onClick={() => toggleCat(c.key)}
            />
          ))}
        </div>
      )}

      {components.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-200 p-3 text-[11px] text-zinc-500">
          No reusable components yet. Add a template under{' '}
          <span className="font-mono">templates/components/</span> with a sidecar manifest.
        </div>
      ) : (
        visibleCats.map((cat) => (
          <section key={cat}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {CATEGORY_LABEL[cat]} ({grouped[cat].length})
            </div>
            <div className="grid gap-2">
              {grouped[cat].map((c) => (
                <PatternCard
                  key={c.id}
                  component={c}
                  theme={theme}
                  canInsert={canInsert}
                  onInsert={() => insert(c)}
                  onOpenCode={() => onOpenCode?.(c.template)}
                  onEdit={() => setEditing({ component: c })}
                  onDelete={() => deleteComponent(c)}
                  onPlace={onPlace ? (e) => onPlace(e, c) : undefined}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <PatternFormDialog
        open={editing !== null}
        theme={theme}
        editing={editing?.component || null}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['theme-components', theme] })}
      />
    </div>
  );
}

function PatternCard({ component, theme, canInsert, onInsert, onOpenCode, onEdit, onDelete, onPlace }) {
  const [loaded, setLoaded] = useState(false);
  const [height, setHeight] = useState(null);
  const stale = !component.template_exists;
  // Cache-bust by hashing the fields the preview depends on — mirrors the
  // modal's PreviewCard so both share the render cache.
  const v = hashStr(JSON.stringify({ s: component.sample, t: component.template }));
  const src = `/admin/themes/component-preview?theme=${encodeURIComponent(theme || '')}&id=${encodeURIComponent(component.id)}&v=${v}`;

  // Same-origin iframe (allow-same-origin, admin serves the preview) — read
  // the rendered content height and size the box to it so short components
  // don't leave dead space. Falls back to the CSS min-height if blocked.
  function measure(e) {
    setLoaded(true);
    try {
      const doc = e.target.contentDocument;
      const h = doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight;
      if (h) setHeight(Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, h)));
    } catch {
      // Cross-origin/sandbox read blocked — keep the default min-height.
    }
  }

  // The preview thumbnail doubles as a drag handle: press and drag it onto
  // the canvas to place the component where you drop it. The iframe itself is
  // pointer-events:none so the pointerdown lands on this wrapper.
  const canPlace = !stale && canInsert && !!onPlace;

  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <div
        className={`relative overflow-hidden border-b border-zinc-100 bg-zinc-50 ${canPlace ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ height: stale ? 48 : (height ?? PREVIEW_MIN) }}
        onPointerDown={canPlace ? onPlace : undefined}
        title={canPlace ? 'Drag onto the canvas to place' : undefined}
      >
        {stale ? (
          <div className="flex h-full items-center justify-center text-[10px] text-zinc-500">
            Template file missing
          </div>
        ) : (
          <>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-400">
                Rendering…
              </div>
            )}
            <iframe
              title={`${component.name} preview`}
              src={src}
              onLoad={measure}
              className="pointer-events-none h-full w-full border-0"
              sandbox="allow-same-origin"
              tabIndex={-1}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-1 px-2 py-1.5">
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-zinc-900">{component.name}</span>
          <code className="text-[10px] text-zinc-400">{`<${component.tag || component.name}/>`}</code>
          {stale && <Badge tone="warning">missing</Badge>}
        </span>
        {component.description && (
          <span className="line-clamp-2 text-[10px] leading-snug text-zinc-500">
            {component.description}
          </span>
        )}
        <div className="flex flex-wrap gap-1 pt-0.5">
          <Button
            size="sm"
            onClick={onInsert}
            disabled={stale || !canInsert}
            title={canInsert ? undefined : 'Open a template file to insert this component.'}
          >
            Insert
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpenCode} disabled={stale}>
            Open code
          </Button>
          <Button size="sm" variant="secondary" onClick={onEdit}>
            {component.has_manifest === false ? 'Add fields' : 'Edit info'}
          </Button>
          {component.has_manifest !== false && (
            <Button size="sm" variant="link-danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// A single category filter toggle. Matches the Files tab's TypeChip look;
// no color dot since patterns group by category, not file type.
function CatChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-zinc-900 text-white'
          : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      }`}
    >
      {label}
      {typeof count === 'number' && (
        <span className={active ? 'text-zinc-300' : 'text-zinc-400'}>{count}</span>
      )}
    </button>
  );
}

// A component is a reusable `<Tag/>` template under `templates/components/`.
// Everything else the registry lists is a whole-page route template.
function isComponentEntry(c) {
  return /^templates\/components\//.test(String(c?.template || '').replace(/^\/+/, ''));
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
