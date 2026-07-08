import { publicUrl } from '../lib/utils.js';
import { Button, DatePicker, Field, SegmentedControl, Select } from './ui/index.js';
import FeaturedImageField from './FeaturedImageField.jsx';
import PageFields from './PageFields.jsx';
import ResizableAside from './ResizableAside.jsx';

/**
 * Right-hand pane of the page editor. Owns the Save / Preview / Slug /
 * Status / Template / Delete controls plus the per-folder PageFields.
 *
 * The parent owns all state — this is presentational glue that wires
 * controls back to setters. `markDirty(setter)(value)` is the same
 * convention the parent uses internally so dirty-state is tracked
 * consistently regardless of which surface mutated a field.
 */
export default function PageEditorSidebar({
  isNew,
  folder,
  path,
  title,
  slug,
  setSlug,
  setSlugTouched,
  status,
  setStatus,
  date,
  setDate,
  sortMode,
  template,
  setTemplate,
  templates,
  taxValues,
  setTaxValues,
  save,
  del,
  markDirty,
  setDirty,
}) {
  return (
    <ResizableAside
      storageKey="fp_meta_w"
      side="left"
      defaultWidth={288}
      min={240}
      max={680}
      className="flex flex-col overflow-y-auto border-l border-zinc-200 bg-white"
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex gap-2">

          {!isNew && (
            <a
              href={publicUrl(path)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-900 transition-colors hover:bg-zinc-100 grow-1"
            >
              Preview
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 2.5h4v4" />
                <path d="M13.5 2.5L7 9" />
                <path d="M12 9v3.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1H7" />
              </svg>
            </a>
          )}

          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !(slug || '').trim()}
            title={!(slug || '').trim() ? 'Slug is required' : undefined}
            className="grow-1"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <Field label="Slug">
          {/* Slug is editable on both new and saved pages. For saved pages we
              show only the slug-after-folder (everything past the first
              segment) so the user edits the same field they did at create
              time. The save mutation sends the rebuilt `folder/slug` as the
              target `path` and the backend renames the file when it differs. */}
          <div className={`flex h-9 w-full overflow-hidden rounded-md border bg-white transition-colors focus-within:ring-2 ${
            (slug || '').trim()
              ? 'border-zinc-200 focus-within:border-zinc-900 focus-within:ring-zinc-900/15'
              : 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/15'
          }`}>
            <span className="inline-flex select-none items-center border-r border-zinc-200 bg-zinc-50 px-2 font-mono text-xs text-zinc-500">
              {folder}/
            </span>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                markDirty(setSlug)(e.target.value.toLowerCase().replace(/[^a-z0-9/-]/g, ''));
              }}
              placeholder="my-post"
              aria-invalid={!(slug || '').trim()}
              className="min-w-0 flex-1 border-0 bg-transparent px-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0"
            />
          </div>
          {!(slug || '').trim() ? (
            <p className="mt-1 text-[11px] text-red-600">Slug is required.</p>
          ) : !isNew ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              Editing the slug renames the file and changes the URL.
            </p>
          ) : null}
        </Field>

        <FeaturedImageField
          value={taxValues.image || ''}
          pagePath={path}
          onChange={(url) => {
            setDirty(true);
            setTaxValues((prev) => {
              const next = { ...prev };
              if (url) next.image = url;
              else delete next.image;
              return next;
            });
          }}
        />

        <Field label="Status">
          <SegmentedControl
            ariaLabel="Status"
            value={status}
            onChange={(v) => markDirty(setStatus)(v)}
            className="flex w-full"
            options={[
              { value: 'published', label: 'Published' },
              { value: 'draft',     label: 'Draft' },
            ]}
          />
        </Field>

        {sortMode === 'order' ? (
          <Field label="Order">
            <p className="text-[13px] text-zinc-500">
              {taxValues.order ? `#${taxValues.order}` : 'Not set'}
              <span className="ml-2 text-[11px]">— drag rows in the list to reorder</span>
            </p>
          </Field>
        ) : (
          <Field label="Date">
            <DatePicker
              value={date || ''}
              onChange={(v) => markDirty(setDate)(v)}
            />
          </Field>
        )}

        <Field label="Template">
          <Select
            value={template}
            onChange={e => markDirty(setTemplate)(e.target.value)}
          >
            <option value="">Default ({folder === 'pages' ? 'page' : 'post'})</option>
            {templates.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </Field>

        {!isNew && (
          // Soft delete: clicking Delete trashes the page and surfaces an
          // Undo toast on the destination screen. No modal — the toast is
          // the safety net (10s window, server keeps the file for 24h).
          <Button
            variant="danger-outline"
            onClick={() => del.mutate()}
            disabled={del.isPending}
            className="mt-3"
          >
            {del.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        )}
      </div>

      <PageFields
        folder={folder}
        values={taxValues}
        onChange={(slug, value) => {
          setDirty(true);
          setTaxValues(prev => ({ ...prev, [slug]: value }));
        }}
      />
    </ResizableAside>
  );
}
