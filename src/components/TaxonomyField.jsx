import { useId } from 'react';
import MultiCheckboxControl from './taxonomy/MultiCheckboxControl.jsx';
import MultiSelectControl from './taxonomy/MultiSelectControl.jsx';
import MultiTagsControl from './taxonomy/MultiTagsControl.jsx';
import SingleValueControl from './taxonomy/SingleValueControl.jsx';

// One front-matter sub-field rendered with its own label + styled wrapper.
// Each sub-field's `name` is the front-matter key — single-value fields write
// a string, list-of-choices fields write a string or array depending on the
// `multiple` flag. The actual control type is one component per shape, all
// living under `./taxonomy/`.
export default function TaxonomyField({ field, value, onChange }) {
  const label    = field.label || titleCase(field.name);
  const isArray  = field.type === 'array';
  const choices  = isArray ? (field.items || []) : [];
  const widget   = field.widget || 'select';
  const multiple = isArray && !!field.multiple;

  return (
    <FieldShell label={label} slug={field.name}>
      {pickControl({ isArray, multiple, value, choices, widget, onChange })}
    </FieldShell>
  );
}

function pickControl({ isArray, multiple, value, choices, widget, onChange }) {
  if (!isArray) {
    return <SingleValueControl value={value} onChange={onChange} />;
  }
  if (multiple) {
    if (choices.length && widget === 'checkbox') {
      return <MultiCheckboxControl value={value} choices={choices} onChange={onChange} />;
    }
    if (choices.length) {
      return <MultiSelectControl value={value} choices={choices} onChange={onChange} />;
    }
    return <MultiTagsControl value={value} onChange={onChange} />;
  }
  return <SingleValueControl value={value} choices={choices} onChange={onChange} />;
}

function FieldShell({ label, slug, children }) {
  const showSlug = slug && slug.toLowerCase() !== (label || '').toLowerCase();
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        {/* font-medium (not semibold) so taxonomy labels match the core
            Field label weight — they're peer field labels, not group
            titles. See dsystem/README "Visual hierarchy". */}
        <span id={labelId} className="text-[13px] font-medium text-zinc-900">{label}</span>
        {showSlug && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            {slug}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function titleCase(s) {
  return (s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
