import { Checkbox, Input, Select, Textarea } from './ui/index.js';
import { IconTrash } from './icons.jsx';

// Editable prop types a component manifest input can declare. Mirror of
// ThemeComponentManifest::PROP_TYPES (PHP) — keep the two in sync.
const TYPES = [
  { value: 'text',      label: 'Text' },
  { value: 'richtext',  label: 'Rich text' },
  { value: 'number',    label: 'Number' },
  { value: 'boolean',   label: 'Boolean' },
  { value: 'enum',      label: 'Choice (enum)' },
  { value: 'media',     label: 'Media' },
  { value: 'link',      label: 'Link' },
  { value: 'color',     label: 'Color' },
  { value: 'component', label: 'Component' },
  { value: 'slot',      label: 'Slot' },
];

/**
 * One row of a component manifest's `inputs[]` editor. Same add/remove
 * shape as Settings/Fields/FieldRow.jsx, but its schema matches the
 * component manifest (button.json etc.): typed props with defaults,
 * enum options, and a CMS-bindable flag — NOT the taxonomy field schema.
 *
 * Shape edited here (one entry of `inputs`):
 *   { name, type, default?, options?(enum), bindable? }
 */
export default function ComponentInputRow({ input, onChange, onRemove }) {
  const isEnum = input.type === 'enum';
  const isBool = input.type === 'boolean';

  return (
    <div className="rounded border border-zinc-200 bg-white p-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="font-medium text-zinc-600">Name</span>
              <Input
                mono
                value={input.name || ''}
                onChange={e => onChange({ name: e.target.value })}
                placeholder="title"
                spellCheck={false}
              />
            </label>

            <label className="block text-xs">
              <span className="font-medium text-zinc-600">Type</span>
              <Select
                value={input.type || 'text'}
                onChange={e => {
                  const type = e.target.value;
                  const patch = { type };
                  // Switching into/out of enum: seed/clear the options list
                  // and reset a now-invalid default rather than leave stale.
                  if (type === 'enum') {
                    patch.options = input.options || [];
                    patch.default = (input.options || [])[0] || '';
                  } else if (type === 'boolean') {
                    patch.default = 'false';
                    patch.options = undefined;
                  } else {
                    patch.options = undefined;
                  }
                  onChange(patch);
                }}
              >
                {TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </label>

            <label className="block text-xs">
              <span className="font-medium text-zinc-600">Default</span>
              {isEnum ? (
                <Select
                  value={input.default ?? ''}
                  onChange={e => onChange({ default: e.target.value })}
                >
                  <option value="">— none —</option>
                  {(input.options || []).map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              ) : isBool ? (
                <Select
                  value={String(input.default ?? 'false')}
                  onChange={e => onChange({ default: e.target.value })}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </Select>
              ) : (
                <Input
                  value={input.default ?? ''}
                  onChange={e => onChange({ default: e.target.value })}
                  placeholder="no default"
                />
              )}
            </label>
          </div>

          {isEnum && (
            <label className="block text-xs">
              <span className="font-medium text-zinc-600">Choices (one per line)</span>
              <Textarea
                mono
                rows={3}
                value={(input.options || []).join('\n')}
                onChange={e => onChange({ options: e.target.value.split('\n') })}
                onBlur={e => {
                  const options = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
                  const patch = { options };
                  if (input.default && !options.includes(input.default)) patch.default = '';
                  onChange(patch);
                }}
              />
            </label>
          )}

          <Checkbox
            label="Allow CMS binding"
            checked={!!input.bindable}
            onChange={e => onChange({ bindable: e.target.checked })}
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove input"
          title="Remove input"
          className="mt-[18px] inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 [&>svg]:h-3.5 [&>svg]:w-3.5"
        >
          {IconTrash}
        </button>
      </div>
    </div>
  );
}
