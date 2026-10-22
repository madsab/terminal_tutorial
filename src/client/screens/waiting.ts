import type { Os } from '../../shared/protocol.js';
import { el } from '../dom.js';
import { osLabel } from './pick-os.js';

export function renderWaiting(root: HTMLElement, opts: { name: string; os: Os; onChange(): void }): void {
  const box = el('div', 'card setup-card waiting');
  const tile = el('div', 'wait-tile', undefined, { 'aria-hidden': 'true' });
  tile.append(el('span', '', '>'), el('span', 'wait-cursor'));
  const change = el('button', 'link', 'Endre navn eller terminal', { type: 'button' });
  change.addEventListener('click', opts.onChange);
  box.append(
    tile,
    el('h1', '', 'Venter på at oppgaven starter…'),
    el('p', 'lead', 'Følg med på tavla. Oppgaven dukker opp her av seg selv.'),
    el('span', 'chip-pill who', `${opts.name} · ${osLabel(opts.os)}`),
    change,
  );
  const setup = el('div', 'setup');
  setup.append(box);
  root.replaceChildren(setup);
}
