export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** "Oppgave 1: Homayoon Bar" -> eyebrow "Oppgave 1", name "Homayoon Bar". Splits on the first ": ". */
export function splitTitle(title: string): { eyebrow: string | null; name: string } {
  const i = title.indexOf(': ');
  return i < 0 ? { eyebrow: null, name: title } : { eyebrow: title.slice(0, i), name: title.slice(i + 2) };
}

/** Splits on backtick pairs. An unmatched backtick stays literal text. */
export function inlineCode(text: string): Array<{ code: boolean; text: string }> {
  const parts: Array<{ code: boolean; text: string }> = [];
  let rest = text;
  while (rest) {
    const open = rest.indexOf('`');
    const close = open < 0 ? -1 : rest.indexOf('`', open + 1);
    if (close < 0) {
      parts.push({ code: false, text: rest });
      break;
    }
    if (open > 0) parts.push({ code: false, text: rest.slice(0, open) });
    parts.push({ code: true, text: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  return parts;
}

/** Appends text with `code` spans rendered as <code> elements. Never uses innerHTML. */
export function appendInlineCode(parent: HTMLElement, text: string): void {
  for (const p of inlineCode(text)) parent.append(p.code ? el('code', '', p.text) : document.createTextNode(p.text));
}

/** <h1> with the eyebrow and name as spans. aria-label keeps the accessible name the full title (block spans would otherwise read "Oppgave 1 : Name"). */
export function taskHeading(title: string): HTMLHeadingElement {
  const { eyebrow, name } = splitTitle(title);
  const h = el('h1', 'task-heading', undefined, { 'aria-label': title });
  if (eyebrow) h.append(el('span', 'eyebrow', eyebrow));
  h.append(el('span', 'task-name', name));
  return h;
}
