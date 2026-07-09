const INPUT_NAME_RE = /^[a-zA-Z_]\w*$/;

export function validateComponentInputs(inputs) {
  const seen = new Set();
  for (const input of inputs || []) {
    const name = String(input?.name || '');
    if (!INPUT_NAME_RE.test(name)) {
      return `Input name "${name}" must use letters, digits, or underscores, and can’t start with a digit.`;
    }
    if (seen.has(name)) {
      return `Input name "${name}" is duplicated.`;
    }
    seen.add(name);
  }
  return null;
}

/**
 * Coerce each input's `default` to the real JSON type its declared `type`
 * implies before persisting: boolean → true/false, number → a finite
 * number (empty/invalid → ''). Everything else is left as-is. The UI keeps
 * editing defaults as strings for typing convenience; this is the single
 * point where they become canonical for the sidecar manifest.
 */
export function normalizeComponentInputs(inputs) {
  return (inputs || []).map((input) => {
    if (!input || typeof input !== 'object') return input;
    const next = { ...input };
    if (next.type === 'boolean') {
      const v = next.default;
      next.default = v === true || v === 'true' || v === 1 || v === '1';
    } else if (next.type === 'number') {
      const raw = String(next.default ?? '').trim();
      const n = Number(raw);
      next.default = raw !== '' && Number.isFinite(n) ? n : '';
    }
    return next;
  });
}
