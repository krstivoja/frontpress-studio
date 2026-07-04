import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useFocusTrap from '../lib/useFocusTrap.js';
import { Alert, Button, Field, Input, SegmentedControl } from './ui/index.js';

// File-type presets for the create dialog. Each maps a chosen type to the
// path convention the CMS expects, so the user types only the name — no need
// to remember that a component lives in `components/` or a partial takes a
// leading underscore.
const KIND_PATH = {
  component: (name) => `templates/components/${name}.twig`,
  partial:   (name) => `templates/_${name}.twig`,
  template:  (name) => `templates/${name}.twig`,
  style:     (name) => `assets/${name}.css`,
  script:    (name) => `assets/${name}.js`,
};
const KIND_OPTIONS = [
  { value: 'component', label: 'Component' },
  { value: 'partial',   label: 'Partial'   },
  { value: 'template',  label: 'Template'  },
  { value: 'style',     label: 'Style'     },
  { value: 'script',    label: 'Script'    },
];

// The bare name inside a path, minus dir, leading underscore, and extension.
function pathStem(path) {
  const file = (path.split('/').pop() || '').replace(/\.[^.]+$/, '').replace(/^_/, '');
  return file || 'name';
}

// Which preset a path currently matches — drives the active toggle.
function pathKind(path) {
  if (path.startsWith('assets/')) return /\.js$/.test(path) ? 'script' : 'style';
  if (path.startsWith('templates/components/')) return 'component';
  if ((path.split('/').pop() || '').startsWith('_')) return 'partial';
  return 'template';
}

// Shared dialog for create / rename / duplicate. In create mode it shows a
// file-type picker that pre-fills the path convention; the path field stays
// editable for anyone who'd rather type it out.
export default function PathDialog({ mode, file, files, error, pending, onClose, onSubmit }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  useFocusTrap(ref, true, inputRef);

  const [path, setPath] = useState(() => {
    if (mode === 'rename')    return file?.path || '';
    if (mode === 'duplicate') return uniqueCopyPath(file?.path, files);
    return 'templates/components/new.twig';
  });

  // Switch file type: rebuild the path from the current name and select the
  // name portion so the user can immediately type over it.
  function chooseKind(kind) {
    const next = (KIND_PATH[kind] || KIND_PATH.template)(pathStem(path));
    setPath(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const stem = pathStem(next);
      const at = next.lastIndexOf(stem);
      if (at >= 0) el.setSelectionRange(at, at + stem.length);
    });
  }

  const title = mode === 'create'
    ? 'New file'
    : `${mode === 'rename' ? 'Rename' : 'Duplicate'} ${file?.name}`;
  const submitLabel = mode === 'create' ? 'Create' : mode === 'rename' ? 'Rename' : 'Duplicate';

  function submit(e) {
    e.preventDefault();
    const next = path.trim();
    if (!next || pending) return;
    onSubmit(next);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="files-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl"
      >
        <h2 id="files-dialog-title" className="mb-3 text-sm font-semibold text-zinc-900">
          {title}
        </h2>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'create' && (
            <Field label="Type">
              <SegmentedControl
                ariaLabel="File type"
                className="flex w-full"
                value={pathKind(path)}
                onChange={chooseKind}
                options={KIND_OPTIONS}
              />
            </Field>
          )}
          <Field
            label="Path"
            hint="Pick a type above, or edit the path directly. Under templates/ or assets/ — twig, php, html, css, scss, js."
          >
            <Input
              ref={inputRef}
              mono
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="templates/about.twig"
            />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !path.trim()}>
              {pending ? `${submitLabel}…` : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// Default destination for the Duplicate flow. If the source already ends
// in `.copy` / `.copy<N>` we bump the number instead of stacking, so
// re-duplicating "foo.copy.twig" gives "foo.copy2.twig", not
// "foo.copy.copy.twig".
function uniqueCopyPath(path, files) {
  if (!path) return '';
  const dot = path.lastIndexOf('.');
  let stem = dot >= 0 ? path.slice(0, dot) : path;
  const ext = dot >= 0 ? path.slice(dot) : '';
  const m = /\.copy(\d*)$/.exec(stem);
  if (m) stem = stem.slice(0, -m[0].length);
  const taken = new Set((files || []).map((f) => f.path));
  let i = m ? Math.max(2, (parseInt(m[1] || '1', 10) || 1) + 1) : 1;
  let next = i === 1 ? `${stem}.copy${ext}` : `${stem}.copy${i}${ext}`;
  while (taken.has(next)) { i = Math.max(i + 1, 2); next = `${stem}.copy${i}${ext}`; }
  return next;
}
