const INPUT_NAME_RE = /^[a-zA-Z_]\w*$/;

export function validateComponentInputs(inputs) {
  const seen = new Set();
  for (const input of inputs || []) {
    const name = String(input?.name || '');
    if (!INPUT_NAME_RE.test(name)) {
      return `Input name "${name}" is invalid - use letters, digits, underscore; no leading digit.`;
    }
    if (seen.has(name)) {
      return `Input name "${name}" is duplicated.`;
    }
    seen.add(name);
  }
  return null;
}
