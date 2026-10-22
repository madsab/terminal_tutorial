import type { Os } from '../../shared/protocol.js';
import { el } from '../dom.js';
import { osLabel } from './pick-os.js';

const SHELL: Record<Os, string> = { mac: 'zsh', linux: 'bash', windows: 'PowerShell' };

/** Wordmark on the left; the student's name and `<OS> · <shell>` pill on the right. */
export function renderTopbar(o: { student?: { name: string; os: Os } }): HTMLElement {
  const bar = el('header', 'topbar');
  const mark = el('div', 'wordmark');
  mark.append(el('span', 'wordmark-icon', '>_', { 'aria-hidden': 'true' }), el('span', 'wordmark-text', 'Terminal-oppgaver'));
  bar.append(mark);
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
