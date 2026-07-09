import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { Button } from './ui/index.js';
import ComponentInputsEditor from './ComponentInputsEditor.jsx';
import { normalizeComponentInputs, validateComponentInputs } from '../lib/componentInputs.js';
import { buildComponentSnippet } from '../lib/componentSnippet.js';

/**
 * Sidebar "Fields" tab for the Theme Builder. When the open file is a
 * component template (`templates/components/<id>.twig|php`), it loads that
 * component's manifest and edits its `inputs[]` inline — no need to open
 * the detached Pattern Library dialog. Reuses ComponentInputsEditor so the
 * two surfaces never drift.
 *
 * Also offers a FanCoolo-style copy: the `<Tag …/>` snippet built from the
 * current (possibly unsaved) input defaults, ready to paste into a template.
 */
export default function ThemeBuilderFieldsPanel({ theme, selectedPath }) {
  const qc    = useQueryClient();
  const toast = useToast();
  const compId = componentIdFromPath(selectedPath);
  const selectedTemplate = normalizeTemplatePath(selectedPath);

  const { data } = useQuery({
    queryKey: ['theme-components', theme],
    queryFn:  () => api.get(`/themes/components${theme ? `?theme=${encodeURIComponent(theme)}` : ''}`),
    enabled:  !!theme && !!compId,
  });
  const component = useMemo(
    () => {
      const components = data?.components || [];
      return components.find((c) => normalizeTemplatePath(c.template) === selectedTemplate)
        || components.find((c) => c.id === compId)
        || null;
    },
    [data, selectedTemplate, compId],
  );
  const draftComponent = useMemo(
    () => compId ? {
      id:          compId,
      name:        labelFromId(compId),
      template:    selectedTemplate,
      description: '',
      category:    'content',
      inputs:      [],
      examples:    [],
      sample:      {},
    } : null,
    [compId, selectedTemplate],
  );
  const activeComponent = component || draftComponent;
  const hasManifest = !!component;

  const componentKey = activeComponent
    ? `${hasManifest ? 'manifest' : 'draft'}\n${activeComponent.id}\n${normalizeTemplatePath(activeComponent.template)}`
    : null;
  const componentInputs = useMemo(
    () => (Array.isArray(activeComponent?.inputs) ? activeComponent.inputs : []),
    [activeComponent],
  );
  const [editors, setEditors] = useState({});
  useEffect(() => {
    if (!componentKey) return;
    setEditors((current) => {
      const existing = current[componentKey];
      if (!existing) {
        return {
          ...current,
          [componentKey]: { inputs: componentInputs, sourceInputs: componentInputs },
        };
      }
      const currentDirty = !inputsEqual(existing.inputs, existing.sourceInputs);
      if (!currentDirty && !inputsEqual(existing.sourceInputs, componentInputs)) {
        return {
          ...current,
          [componentKey]: { inputs: componentInputs, sourceInputs: componentInputs },
        };
      }
      return current;
    });
  }, [componentKey, componentInputs]);
  const editor = componentKey ? editors[componentKey] : null;
  const inputs = editor ? editor.inputs : componentInputs;
  const sourceInputs = editor ? editor.sourceInputs : componentInputs;
  const setInputs = (nextInputs) => {
    if (!componentKey) return;
    setEditors((current) => ({
      ...current,
      [componentKey]: {
        inputs: nextInputs,
        sourceInputs: current[componentKey]?.sourceInputs || componentInputs,
      },
    }));
  };

  const [busy, setBusy] = useState(false);
  const dirty = activeComponent
    && JSON.stringify(inputs) !== JSON.stringify(sourceInputs);
  const canSave = dirty && !busy && (hasManifest || (inputs || []).length > 0);
  const saveLabel = hasManifest ? 'Save inputs' : 'Create fields';

  if (!compId) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 p-3 text-[11px] text-zinc-500">
        Open a component template (<span className="font-mono">templates/components/&lt;name&gt;.twig</span>)
        to edit its inputs here.
      </div>
    );
  }

  async function save() {
    // Send the FULL manifest so update()'s forWrite doesn't reset name /
    // category / examples — only inputs changed, but forWrite rebuilds
    // from whatever we pass.
    if (!activeComponent) return;
    const inputError = validateComponentInputs(inputs);
    if (inputError) {
      toast.show(inputError, { tone: 'error', duration: 5000 });
      return;
    }
    setBusy(true);
    try {
      const savedDraft  = inputs;
      const savedInputs = normalizeComponentInputs(inputs);
      const payload = {
        theme:     theme || undefined,
        component: { ...activeComponent, inputs: savedInputs },
      };
      if (hasManifest) payload.id = activeComponent.id;
      await api.post(hasManifest ? '/themes/components-update' : '/themes/components-add', payload);
      setEditors((current) => {
        const existing = current[componentKey];
        if (!existing) return current;
        // No further edits during the round-trip → adopt the canonical
        // (type-coerced) saved form so the editor and baseline stay equal.
        if (inputsEqual(existing.inputs, savedDraft)) {
          return {
            ...current,
            [componentKey]: { inputs: savedInputs, sourceInputs: savedInputs },
          };
        }
        // User kept editing mid-save → keep their draft, advance the baseline.
        return {
          ...current,
          [componentKey]: { ...existing, sourceInputs: savedInputs },
        };
      });
      qc.invalidateQueries({ queryKey: ['theme-components', theme] });
      toast.show(
        hasManifest
          ? `Saved inputs for "${activeComponent.name}".`
          : `Created fields for "${activeComponent.name}".`,
        { tone: 'success' },
      );
    } catch (e) {
      toast.show(e.message, { tone: 'error', duration: 5000 });
    } finally {
      setBusy(false);
    }
  }

  const snippet = buildComponentSnippet(activeComponent, inputs, selectedPath);

  async function copyTag() {
    const inputError = validateComponentInputs(inputs);
    if (inputError) {
      toast.show(inputError, { tone: 'error', duration: 5000 });
      return;
    }
    try {
      await navigator.clipboard.writeText(snippet);
      toast.show('Tag copied to clipboard.', { tone: 'success' });
    } catch {
      toast.show('Couldn’t copy automatically — select and copy manually.', { tone: 'error' });
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-zinc-900">{activeComponent.name}</p>
        <p className="font-mono text-[11px] text-zinc-500">{activeComponent.id}</p>
        {!hasManifest && (
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            No manifest yet. Add inputs below and save to create the sidecar fields file.
          </p>
        )}
      </div>

      <ComponentInputsEditor inputs={inputs} onChange={setInputs} />

      {canSave && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save}>
            {saveLabel}
          </Button>
        </div>
      )}

      {/* Copy-paste snippet built from the current defaults — paste into a
          template or content file. */}
      <div className="rounded-md border border-zinc-200 bg-white p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-zinc-600">Snippet</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={copyTag}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              Copy
            </button>
          </div>
        </div>
        <pre className="overflow-x-auto rounded bg-zinc-900 p-2 text-[11px] leading-snug text-zinc-100">{snippet}</pre>
      </div>
    </div>
  );
}

/**
 * Derive a component id from an open template path.
 * `templates/components/button.twig` → `button`; a leading `_` is stripped
 * to match the manifest's stem rule. Returns null for non-component files.
 */
function componentIdFromPath(path) {
  if (!path) return null;
  const m = String(path).match(/(?:^|\/)components\/([^/]+)\.(?:twig|php)$/i);
  if (!m) return null;
  return m[1].replace(/^_/, '').toLowerCase();
}

function normalizeTemplatePath(path) {
  return String(path || '').replace(/^\/+/, '');
}

function labelFromId(id) {
  return String(id || '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Component';
}

function inputsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
