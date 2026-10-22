export type HeadSpec = { kind: 'photo'; file: string } | { kind: 'placeholder'; color: string; initial: string };

function hashColor(text: string): string {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const hue = (h >>> 0) % 360;
  // HSL(hue, 60%, 55%) -> hex
  const s = 0.6;
  const l = 0.55;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** The photo when `available` has it, otherwise a coloured head with the character's initial. */
export function resolveHead(file: string, available: ReadonlySet<string>): HeadSpec {
  if (available.has(file)) return { kind: 'photo', file };
  const base = file.replace(/\.[^.]+$/, '');
  return { kind: 'placeholder', color: hashColor(base), initial: (base[0] ?? '?').toUpperCase() };
}
