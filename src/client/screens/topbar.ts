import type { Os } from '../../shared/protocol.js';
import { el } from '../dom.js';
import { osLabel } from './pick-os.js';

const SHELL: Record<Os, string> = { mac: 'zsh', linux: 'bash', windows: 'PowerShell' };

/** Freeplay task switcher. A missing handler disables that arrow. */
export interface TopbarNav {
  title: string;
  onPrev?(): void;
  onNext?(): void;
}

function navButton(label: string, arrow: string, onClick?: () => void): HTMLButtonElement {
  const b = el('button', 'nav-arrow', arrow, { type: 'button', 'aria-label': label });
  if (onClick) b.addEventListener('click', onClick);
  else b.disabled = true;
  return b;
}

/** Wordmark on the left; in freeplay `← task →` in the middle; the student's name and `<OS> · <shell>` pill on the right. */
export function renderTopbar(o: { student?: { name: string; os: Os }; nav?: TopbarNav }): HTMLElement {
  const bar = el('header', 'topbar');
  const mark = el('div', 'wordmark');
  mark.append(el('span', 'wordmark-icon', '>_', { 'aria-hidden': 'true' }), el('span', 'wordmark-text', 'Terminal-oppgaver'));
  bar.append(mark);
  if (o.nav) {
    const nav = el('nav', 'topbar-nav', undefined, { 'aria-label': 'Bytt oppgave' });
    nav.append(
      navButton('Forrige oppgave', '←', o.nav.onPrev),
      el('span', 'nav-title', o.nav.title, { 'aria-live': 'polite' }),
      navButton('Neste oppgave', '→', o.nav.onNext),
    );
    bar.append(nav);
  }
  if (o.student) {
    const who = el('div', 'topbar-who');
    who.append(
      el('span', 'topbar-name', o.student.name),
      el('span', 'chip-pill', `${osLabel(o.student.os)} · ${SHELL[o.student.os]}`),
    );
    bar.append(who);
  }
  return bar;
}
