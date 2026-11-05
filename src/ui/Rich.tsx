/** Renders hint/explanation text, turning `backticks` into inline code. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`') && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : p,
      )}
    </>
  );
}

/** Python-ish rendering of a value, so receipts read like code. */
export function py(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (Array.isArray(value)) return `[${value.map(py).join(', ')}]`;
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.__repr__ === 'string') return o.__repr__;
    return `{${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${py(v)}`).join(', ')}}`;
  }
  return String(value);
}
