import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useFocusTrap from '../../../lib/useFocusTrap.js';
import { slugify } from '../../../lib/utils.js';
import { Alert, Button, Field, Input } from '../../../components/ui/index.js';

/**
 * Modal for creating a new field group, opened by the "+ New" chip on the
 * Fields screen. Mirrors TemplateAddDialog's shape (portal, focus trap,
 * Esc/backdrop close, Enter submits) so the admin's "add a named thing"
 * flows feel consistent.
 *
 * `existing` is the set of taxonomy slugs already present — used to block
 * duplicates before the parent commits the change. On success it calls
 * `onCreate(slug, label)`; the parent inserts the group and selects it.
 */
export default function FieldGroupAddDialog({ open, existing, onClose, onCreate }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  useFocusTrap(dialogRef, open, inputRef);

  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setLabel('');
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const slug = slugify(label);
  const dupe = !!slug && existing.has(slug);
  const canCreate = !!slug && !dupe;
  const hint = !label
    ? null
    : !slug
      ? 'Use letters, digits, dashes, or underscores.'
      : dupe
        ? 'A field group with that name already exists.'
        : `Saved as “${slug}”.`;

  function submit(e) {
    e.preventDefault();
    if (!canCreate) return;
    onCreate(slug, label.trim());
    onClose?.();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-group-add-title"
        onSubmit={submit}
        className="mt-[12vh] w-full max-w-md rounded-lg bg-white p-5 shadow-modal"
      >
        <h2 id="field-group-add-title" className="text-base font-semibold text-zinc-900">
          New field group
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          A group bundles related custom fields and binds them to chosen post
          types. You'll add the individual fields after creating it.
        </p>

        {dupe && <Alert tone="error" className="mt-3">That name is already taken.</Alert>}

        <div className="mt-4">
          <Field label="Name" hint={hint}>
            <Input
              ref={inputRef}
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Categories, Pricing, SEO"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!canCreate}>Create group</Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
