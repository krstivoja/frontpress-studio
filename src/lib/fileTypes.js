// File-type grouping for the Theme Builder Files tab's filter chips.
// Known extensions collapse into a language group (js/mjs/cjs → JavaScript);
// anything else becomes its own bucket so no file type is unfilterable.
// Dot colors mirror the language marks in components/icons.jsx.

const GROUPS = [
  { key: 'twig', label: 'Twig',       color: '#78be20', exts: ['twig'] },
  { key: 'php',  label: 'PHP',        color: '#6366f1', exts: ['php'] },
  { key: 'js',   label: 'JavaScript', color: '#facc15', exts: ['js', 'mjs', 'cjs'] },
  { key: 'ts',   label: 'TypeScript', color: '#3178c6', exts: ['ts', 'tsx'] },
  { key: 'jsx',  label: 'JSX',        color: '#06b6d4', exts: ['jsx'] },
  { key: 'css',  label: 'CSS',        color: '#2563eb', exts: ['css'] },
  { key: 'scss', label: 'SCSS',       color: '#cd6799', exts: ['scss', 'sass'] },
  { key: 'json', label: 'JSON',       color: '#71717a', exts: ['json'] },
  { key: 'md',   label: 'Markdown',   color: '#6b7280', exts: ['md', 'markdown'] },
  { key: 'html', label: 'HTML',       color: '#e34c26', exts: ['html', 'htm'] },
  { key: 'svg',  label: 'SVG',        color: '#7c3aed', exts: ['svg'] },
  { key: 'yaml', label: 'YAML',       color: '#cb171e', exts: ['yml', 'yaml'] },
];

const EXT_TO_GROUP = {};
for (const g of GROUPS) for (const e of g.exts) EXT_TO_GROUP[e] = g;
const KNOWN_KEYS = new Set(GROUPS.map((g) => g.key));

function extOf(name) {
  const i = String(name || '').lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

// The filter bucket a file belongs to — its language group key, or its raw
// extension (or 'other' for extensionless files) when unrecognized.
export function fileTypeKey(name) {
  const ext = extOf(name);
  const g = EXT_TO_GROUP[ext];
  return g ? g.key : (ext || 'other');
}

// Ordered, de-duplicated list of the type buckets actually present in
// `files`, each with a display label, dot color, and count. Known language
// groups keep GROUPS order; unknown extensions follow, alphabetically.
export function presentFileTypes(files) {
  const counts = new Map();
  for (const f of files || []) {
    const key = fileTypeKey(f.name);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const known = GROUPS
    .filter((g) => counts.has(g.key))
    .map((g) => ({ key: g.key, label: g.label, color: g.color, count: counts.get(g.key) }));
  const unknown = [...counts.keys()]
    .filter((k) => !KNOWN_KEYS.has(k))
    .sort()
    .map((k) => ({ key: k, label: k.toUpperCase(), color: '#71717a', count: counts.get(k) }));
  return [...known, ...unknown];
}
