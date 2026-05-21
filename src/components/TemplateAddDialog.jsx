import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useFocusTrap from '../lib/useFocusTrap.js';
import { api } from '../lib/api.js';
import { Alert, Button, Field, Input, SegmentedControl, Select } from './ui/index.js';

// Standard FrontPress Studio template kinds we know how to seed from.
// "blank" doesn't read from disk — see `blankStub()` below.
const STARTER_KINDS = ['page', 'post', 'archive', 'taxonomy', 'feed', '404'];

function blankTemplateStub(ext) {
  if (ext === 'php') {
    return `<?php /* New template */ ?>\n`;
  }
  return [
    "{% extends '_layout.twig' %}",
    '',
    '{% block content %}',
    '  ',
    '{% endblock %}',
    '',
  ].join('\n');
}

function blankPartialStub(ext) {
  if (ext === 'php') {
    return `<?php /* New partial */ ?>\n`;
  }
  // Partials are fragments — no extends/blocks, just a div to start
  // from. Trailing newline because every editor in the codebase ends
  // files with one.
  return [
    '<div class="partial">',
    '  ',
    '</div>',
    '',
  ].join('\n');
}

// Pull the bare template name (no extension, no leading `_`) out of
// `templates/<name>.<ext>` or `templates/_<name>.<ext>`.
function templateBasename(path) {
  const match = /^templates\/_?([^/]+)\.[^.]+$/.exec(path || '');
  return match ? match[1] : '';
}

function isPartialPath(path) {
  return /^templates\/_[^/]+\.[^.]+$/.test(path || '');
}

/**
 * Modal opened by the Theme Builder header's "+ New" button.
 *
 * Type toggle picks between **Template** (page-level file at
 * `templates/<slug>.<ext>`) and **Partial** (reusable fragment at
 * `templates/_<slug>.<ext>`). Both flows then ask for a slug + which
 * existing file to copy from ("Blank" produces a kind-appropriate stub).
 *
 * Posts to `/themes/create-template` with `{ kind, slug, ext, content }`
 * and calls `onCreated(path)` so the parent can switch to the new file.
 *
 * `defaultExt` lets the parent pre-select `.twig` vs `.php` based on the
 * currently-open file or the theme's engine — most themes are
 * homogeneous, so we don't expose this as a separate field.
 */
export default function TemplateAddDialog({
  open,
  onClose,
  onCreated,
  theme,
  files,
  defaultExt = 'twig',
}) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  useFocusTrap(dialogRef, open, inputRef);

  const [kind, setKind] = useState('template');
  const [slug, setSlug] = useState('');
  const [starter, setStarter] = useState('blank');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setKind('template');
    setSlug('');
    setStarter('blank');
    setError(null);
    setBusy(false);
  }, [open]);

  // Reset starter when switching type so "Copy from header" doesn't
  // carry over from Partial mode to Template mode.
  useEffect(() => {
    setStarter('blank');
  }, [kind]);

  // Templates and partials share the same `templates/` dir but their
  // starter pools are disjoint — templates seed from system kinds
  // (page/post/…) and partials seed from each `_<name>.twig` in the
  // theme. Both filter to files that actually exist on disk.
  const availableStarters = useMemo(() => {
    if (kind === 'partial') {
      const partialNames = (files || [])
        .filter((f) => isPartialPath(f.path))
        .map((f) => templateBasename(f.path))
        .filter(Boolean)
        .sort();
      return [
        { value: 'blank', label: 'Blank' },
        ...partialNames.map((name) => ({ value: name, label: `Copy from _${name}` })),
      ];
    }
    const present = new Set();
    for (const f of files || []) {
      if (isPartialPath(f.path)) continue;
      const name = templateBasename(f.path);
      if (STARTER_KINDS.includes(name)) present.add(name);
    }
    return [
      { value: 'blank', label: 'Blank' },
      ...STARTER_KINDS
        .filter((k) => present.has(k))
        .map((k) => ({ value: k, label: `Copy from ${k}` })),
    ];
  }, [kind, files]);

  // Existing slugs of the same kind — bail before the server does.
  const existing = useMemo(() => {
    const set = new Set();
    for (const f of files || []) {
      const isPartial = isPartialPath(f.path);
      if (kind === 'partial' ? !isPartial : isPartial) continue;
      const name = templateBasename(f.path);
      if (name) set.add(name);
    }
    return set;
  }, [kind, files]);

  const normalized = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const slugError = (() => {
    if (!slug) return null;
    if (normalized === '') return 'Use lowercase letters, digits, dashes, or underscores.';
    if (normalized !== slug) return 'Will be saved as ' + normalized;
    if (normalized.startsWith('_')) return 'Slug cannot start with an underscore — the underscore is added automatically for partials.';
    if (existing.has(normalized)) return `A ${kind} with that name already exists.`;
    return null;
  })();
  const canCreate = normalized && !normalized.startsWith('_') && !existing.has(normalized) && !busy;

  const previewFilename = `${kind === 'partial' ? '_' : ''}${normalized || '<slug>'}.${defaultExt}`;

  async function create(event) {
    event.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      let content = kind === 'partial' ? blankPartialStub(defaultExt) : blankTemplateStub(defaultExt);
      if (starter !== 'blank') {
        const sourcePath = kind === 'partial'
          ? `templates/_${starter}.${defaultExt}`
          : `templates/${starter}.${defaultExt}`;
        const read = await api.get(
          `/themes/file?theme=${encodeURIComponent(theme)}&path=${encodeURIComponent(sourcePath)}`,
        );
        content = read.content || '';
      }
      const result = await api.post('/themes/create-template', {
        theme,
        kind,
        slug: normalized,
        ext: defaultExt,
        content,
      });
      onCreated?.(result.path);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose?.(); }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-add-title"
        onSubmit={create}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-modal"
      >
        <h2 id="template-add-title" className="text-base font-semibold text-zinc-900">
          New {kind}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Creates <span className="font-mono">templates/{previewFilename}</span> in the active theme.
          {kind === 'template'
            ? ' Posts opt into it via the editor sidebar\'s Template dropdown.'
            : ' Drop it into any template via the Add modal\'s Partials tab, or call {{ partial(\'name\') }}.'}
        </p>

        {error && <Alert tone="error" className="mt-3">{error}</Alert>}

        <div className="mt-4 space-y-3">
          <Field label="Type">
            <SegmentedControl
              value={kind}
              onChange={setKind}
              ariaLabel="File kind"
              options={[
                { value: 'template', label: 'Template' },
                { value: 'partial',  label: 'Partial' },
              ]}
            />
          </Field>

          <Field label="Slug" hint={slugError}>
            <Input
              ref={inputRef}
              autoFocus
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={kind === 'partial' ? 'hero' : 'landing'}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <Field label="Starts from">
            <Select value={starter} onChange={(e) => setStarter(e.target.value)}>
              {availableStarters.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!canCreate}>
            {busy ? 'Creating…' : `Create ${kind}`}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
