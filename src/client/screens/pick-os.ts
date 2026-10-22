import type { Os } from '../../shared/protocol.js';
import { el } from '../dom.js';

const LABELS: Record<Os, string> = { mac: 'macOS', linux: 'Linux', windows: 'Windows' };
const SUBTITLES: Record<Os, string> = { mac: 'Terminal · zsh', linux: 'Terminal · bash', windows: 'Windows Terminal · PowerShell' };
export const osLabel = (os: Os) => LABELS[os];

/** CSS-only mini window: title bar plus a couple of prompt lines. Decoration, hidden from assistive tech. */
function preview(os: Os): HTMLElement {
  const win = el('span', `os-preview os-preview-${os}`, undefined, { 'aria-hidden': 'true' });
  const bar = el('span', 'os-preview-bar');
  if (os === 'mac') bar.append(el('i'), el('i'), el('i'));
  win.append(bar, el('span', 'os-preview-body', os === 'windows' ? 'PS> _' : '$ _'));
  return win;
}

/** Step 2: which terminal the student wants to practise in. */
export function renderPickOs(root: HTMLElement, opts: { os: Os; onPick(os: Os): void; onBack(): void }): void {
  const box = el('div', 'card setup-card pick-os');
  box.append(el('span', 'eyebrow', 'Steg 2 av 2'), el('h1', '', 'Hvilken terminal bruker du?'));
  const list = el('div', 'os-buttons');
  for (const os of ['mac', 'linux', 'windows'] as const) {
    const descId = `os-desc-${os}`;
    const b = el('button', os === opts.os ? 'os-tile current' : 'os-tile', undefined, {
      type: 'button',
      'data-os': os,
      'aria-label': LABELS[os],
      'aria-describedby': descId,
      'aria-pressed': String(os === opts.os),
    });
    const text = el('span', 'os-text');
    text.append(el('span', 'os-name', LABELS[os], { 'aria-hidden': 'true' }), el('span', 'os-sub', SUBTITLES[os], { id: descId }));
    b.append(preview(os), text);
    b.addEventListener('click', () => opts.onPick(os));
    list.append(b);
  }
  const back = el('button', 'link', 'Tilbake', { type: 'button' });
  back.addEventListener('click', opts.onBack);
  box.append(list, back);
  const setup = el('div', 'setup');
  setup.append(box);
  root.replaceChildren(setup);
}
