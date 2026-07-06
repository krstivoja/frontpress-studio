import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { Button } from './ui/index.js';
import ComponentInputsEditor from './ComponentInputsEditor.jsx';
import { validateComponentInputs } from '../lib/componentInputs.js';
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

  const componentKey = component
    ? `${component.id}\n${normalizeTemplatePath(component.template)}`
    : null;
  const componentInputs = useMemo(
    () => (Array.isArray(component?.inputs) ? component.inputs : []),
    [component],
  );
  const [editor, setEditor] = useState({ componentKey: null, inputs: [], sourceInputs: [] });
  useEffect(() => {
    setEditor((current) => {
      if (!componentKey) {
        return current.componentKey === null && current.inputs.length === 0 && current.sourceInputs.length === 0
          ? current
          : { componentKey: null, inputs: [], sourceInputs: [] };
      }
      const currentDirty = JSON.stringify(current.inputs) !== JSON.stringify(current.sourceInputs);
      if (current.componentKey !== componentKey || !currentDirty) {
        return { componentKey, inputs: componentInputs, sourceInputs: componentInputs };
      }
      return current;
    });
  }, [componentKey, componentInputs]);
  const inputs = editor.componentKey === componentKey ? editor.inputs : componentInputs;
  const sourceInputs = editor.componentKey === componentKey ? editor.sourceInputs : componentInputs;
  const setInputs = (nextInputs) => {
    setEditor((current) => ({ ...current, componentKey, inputs: nextInputs }));
  };

  const [busy, setBusy] = useState(false);
  const dirty = component
    && JSON.stringify(inputs) !== JSON.stringify(sourceInputs);

  if (!compId) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 p-3 text-[11px] text-zinc-500">
        Open a component template (<span className="font-mono">templates/components/&lt;name&gt;.twig</span>)
        to edit its inputs here.
      </div>
    );
  }

  if (!component) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 p-3 text-[11px] text-zinc-500">
        <p className="font-mono text-zinc-700">{compId}</p>
        <p className="mt-1">No manifest yet. Add one from the Patterns dialog, then edit its inputs here.</p>
      </div>
    );
  }

  async function save() {
    // Send the FULL manifest so update()'s forWrite doesn't reset name /
    // category / examples — only inputs changed, but forWrite rebuilds
    // from whatever we pass.
    const inputError = validateComponentInputs(inputs);
    if (inputError) {
      toast.show(inputError, { tone: 'error', duration: 5000 });
      return;
    }
    setBusy(true);
    try {
      const savedInputs = inputs;
      await api.post('/themes/components-update', {
        theme:     theme || undefined,
        id:        component.id,
        component: { ...component, inputs: savedInputs },
      });
      setEditor((current) => current.componentKey === componentKey
        ? { ...current, inputs: savedInputs, sourceInputs: savedInputs }
        : current);
      qc.invalidateQueries({ queryKey: ['theme-components', theme] });
      toast.show(`Saved inputs for "${component.name}".`, { tone: 'success' });
    } catch (e) {
      toast.show(e.message, { tone: 'error', duration: 5000 });
    } finally {
      setBusy(false);
    }
  }

  const snippet = buildComponentSnippet(component, inputs, selectedPath);

  async function copyTag() {
    try {
      await navigator.clipboard.writeText(snippet);
      toast.show('Tag copied to clipboard.', { tone: 'success' });
    } catch {
      toast.show('Copy failed — select and copy manually.', { tone: 'error' });
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-zinc-900">{component.name}</p>
        <p className="font-mono text-[11px] text-zinc-500">{component.id}</p>
      </div>

      <ComponentInputsEditor inputs={inputs} onChange={setInputs} />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={!dirty || busy}>
          {busy ? 'Saving…' : dirty ? 'Save inputs' : 'Saved'}
        </Button>
      </div>

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
