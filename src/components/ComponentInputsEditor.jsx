import { Button } from './ui/index.js';
import ComponentInputRow from './ComponentInputRow.jsx';

/**
 * The `inputs[]` list editor for a component manifest: add/remove typed
 * prop rows. Shared by the pattern dialog (PatternFormDialog) and the
 * Theme Builder sidebar (ThemeBuilderFieldsPanel) so the two never drift.
 *
 * Controlled: `inputs` is the array, `onChange(nextArray)` replaces it.
 */
export default function ComponentInputsEditor({ inputs, onChange }) {
  function add() {
    onChange([...(inputs || []), { name: '', type: 'text', default: '' }]);
  }
  function update(idx, patch) {
    onChange((inputs || []).map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function remove(idx) {
    onChange((inputs || []).filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="flex items-center">
        <span className="text-xs font-medium text-zinc-600">Inputs (props)</span>
        <Button variant="link" size="sm" onClick={add} className="ml-auto">
          + Add input
        </Button>
      </div>
      {(inputs || []).length === 0 ? (
        <p className="mt-1 text-[11px] text-zinc-500">
          No typed props yet. Declared inputs drive defaults and (later) the insert + inspect UI.
        </p>
      ) : (
        <div className="mt-1 space-y-2">
          {inputs.map((it, i) => (
            <ComponentInputRow
              key={i}
              input={it}
              onChange={(patch) => update(i, patch)}
              onRemove={() => remove(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
