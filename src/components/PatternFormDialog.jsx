import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Field, Input, Select, Textarea } from './ui/index.js';
import ComponentInputsEditor from './ComponentInputsEditor.jsx';
import { normalizeComponentInputs, validateComponentInputs } from '../lib/componentInputs.js';

const CATEGORIES = [
  { value: 'layout',     label: 'Layout' },
  { value: 'navigation', label: 'Navigation' },
  { value: 'content',    label: 'Content' },
  { value: 'media',      label: 'Media' },
  { value: 'forms',      label: 'Forms' },
  { value: 'utility',    label: 'Utility' },
];

/**
 * Create-or-edit dialog for a single pattern registry entry. `editing`
 * (the existing component, or null for new) drives which endpoint we
 * POST to and which initial state we hydrate.
 *
 * Server is the source of truth on validation (id collisions, template
 * existence). We only do quick client-side checks (id slug pattern,
 * required fields) before the round-trip.
 */
export default function PatternFormDialog({ open, theme, editing, onClose, onSaved }) {
  const [id,          setId]          = useState('');
  const [name,        setName]        = useState('');
  const [template,    setTemplate]    = useState('');
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState('layout');
  // Sample is the JSON blob passed as Twig vars when rendering the preview.
  // Stored as a string in form state so the user can have it in a half-typed
  // / invalid state without us blowing up; parsed on submit.
  const [sampleText, setSampleText] = useState('');
  // Typed prop schema (button.json `inputs[]`). Edited row-by-row below.
  const [inputs,      setInputs]      = useState([]);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setId(editing.id || '');
      setName(editing.name || '');
      setTemplate(editing.template || '');
      setDescription(editing.description || '');
      setCategory(editing.category || 'layout');
      const s = editing.sample && Object.keys(editing.sample).length
        ? JSON.stringify(editing.sample, null, 2)
        : '';
      setSampleText(s);
      setInputs(Array.isArray(editing.inputs) ? editing.inputs : []);
    } else {
      setId(''); setName(''); setTemplate('');
      setDescription(''); setCategory('layout');
      setSampleText('');
      setInputs([]);
    }
    setError(null);
  }, [open, editing]);

  // Esc to close (matches the parent modal pattern).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    setError(null);
    // Quick client-side guard so we don't round-trip just to be told
    // "id is empty". Real validation still happens server-side.
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
      setError('Id must be lowercase letters, digits, dashes or underscores (no spaces).');
      return;
    }
    if (!template.trim()) {
      setError('Template path is required.');
      return;
    }

    // Parse sample JSON. Empty is fine (means "no overrides"); anything
    // else has to parse cleanly to an object or we won't send it.
    let sample = {};
    const sampleTrim = sampleText.trim();
    if (sampleTrim !== '') {
      try {
        sample = JSON.parse(sampleTrim);
      } catch (_) {
        setError('Sample data must be valid JSON (or left blank).');
        return;
      }
      if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
        setError('Sample data must be a JSON object, e.g. {"title": "Hello"}.');
        return;
      }
    }

    const inputError = validateComponentInputs(inputs);
    if (inputError) {
      setError(inputError);
      return;
    }

    setBusy(true);
    const base = editing ? { ...editing } : {};
    const component = {
      ...base,
      id,
      name: name.trim(),
      template: template.trim(),
      description: description.trim(),
      category,
      inputs: normalizeComponentInputs(inputs),
      sample,
    };
    if (editing) {
      component.examples = mergeSampleIntoExamples(editing.examples, sample);
    } else {
      component.sample = sample;
    }

    const payload = {
      theme: theme || undefined,
      component,
    };
    try {
      const endpoint = editing ? '/themes/components-update' : '/themes/components-add';
      if (editing) payload.id = editing.id; // rename support
      const res = await api.post(endpoint, payload);
      onSaved?.(res.component);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-3">
          <h3 className="text-sm font-semibold">{editing ? 'Edit component' : 'Add component'}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <form onSubmit={submit} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <Field label="ID">
            <Input
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase())}
              placeholder="hero"
              autoFocus={!editing}
              spellCheck={false}
            />
          </Field>
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hero"
            />
          </Field>
          <Field label="Template path">
            <Input
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="templates/_hero.twig"
              spellCheck={false}
            />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this component, and where is it used?"
            />
          </Field>

          <ComponentInputsEditor inputs={inputs} onChange={setInputs} />

          <Field label="Sample data (JSON)">
            <Textarea
              rows={6}
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              placeholder={'{\n  "title": "Hello",\n  "items": [{"label": "Home"}]\n}'}
              className="font-mono text-[12px]"
              spellCheck={false}
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Optional JSON object. Keys become Twig variables when this component is rendered in the preview.
              Leave blank to use the neutral defaults.
            </p>
          </Field>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add component'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function mergeSampleIntoExamples(examples, sample) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return Object.keys(sample).length ? [{ name: 'Default', props: sample }] : [];
  }
  const [first, ...rest] = examples;
  return [
    {
      ...first,
      props: sample,
    },
    ...rest,
  ];
}
