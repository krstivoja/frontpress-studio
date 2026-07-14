// Pure path helpers for the Theme Builder screen (split out of
// useThemeBuilder.js to keep that hook under the file-size budget).

export function readLayout() {
  try {
    const raw = localStorage.getItem('fp:theme-builder:layout');
    return raw === 'right' ? 'right' : 'below';
  } catch (_) {
    return 'below';
  }
}

export function preferredPath(files) {
  return (
    files.find((file) => file.path === 'templates/page.twig')?.path ||
    files.find((file) => file.path.endsWith('.twig'))?.path ||
    files.find((file) => file.kind === 'template')?.path ||
    files[0]?.path ||
    ''
  );
}

// Best-effort guess at a public-site URL that will render the given
// theme file. We don't try to look up real post / page slugs from the
// API here — the preview input is still editable, so the user can
// always override. The goal is just "give them a sensible default
// when they switch files".
export function defaultPreviewPath(filePath) {
  const name = filePath.split('/').pop()?.toLowerCase() || '';
  if (/^post\.(twig|php)$/.test(name))     return '/blog'; // archive happens to render posts via partials in many themes
  if (/^page\.(twig|php)$/.test(name))     return '/';
  if (/^archive\.(twig|php)$/.test(name))  return '/blog';
  if (/^taxonomy\.(twig|php)$/.test(name)) return '/categories/news';
  if (/^feed\.(twig|php)$/.test(name))     return '/feed';
  if (/^404\.(twig|php)$/.test(name))      return '/__fp_preview_404__';
  if (/^_header\.(twig|php)$/.test(name))  return '/';
  if (/^_footer\.(twig|php)$/.test(name))  return '/';
  return '/';
}
