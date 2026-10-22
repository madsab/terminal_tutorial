import type { OsMode } from '../../shell/modes.js';
import { el } from '../dom.js';

const deco = (cls: string, text = '') => el('span', cls, text, { 'aria-hidden': 'true' });

function macBar(title: HTMLElement): HTMLElement {
  const bar = el('div', 'term-bar');
  const lights = deco('term-lights');
  for (const c of ['red', 'yellow', 'green']) lights.append(deco(`term-light ${c}`));
  bar.append(lights, title);
  return bar;
}

function linuxBar(title: HTMLElement): HTMLElement {
  const bar = el('div', 'term-bar');
  const left = deco('term-plus', '+');
  const right = el('div', 'term-right');
  right.setAttribute('aria-hidden', 'true');
  right.append(deco('term-icon', '⌕'), deco('term-icon', '☰'));
  for (const g of ['─', '☐', '✕']) right.append(deco('term-round', g));
  bar.append(left, title, right);
  return bar;
}

function windowsBar(title: HTMLElement): HTMLElement {
  const bar = el('div', 'term-bar');
  const tab = deco('term-tab');
  tab.append(deco('term-tab-icon', '>_'), title, deco('term-tab-close', '×'));
  const caps = deco('term-caps');
  for (const g of ['─', '☐', '✕']) caps.append(deco('term-cap', g));
  bar.append(tab, deco('term-new', '+'), deco('term-new', '⌄'), caps);
  return bar;
}

/** Wraps the terminal in an OS-style window frame. Decoration only: nothing in the chrome is a control. */
export function mountTerminalWindow(host: HTMLElement, mode: OsMode): { body: HTMLElement; setTitle(text: string): void } {
  const win = el('div', `term-window term-${mode}`);
  const title = el('span', 'term-title', mode === 'windows' ? 'Windows PowerShell' : '');
  const bar = { mac: macBar, linux: linuxBar, windows: windowsBar }[mode](title);
  const body = el('div', 'term-body');
  win.append(bar, body);
  host.append(win);
  return {
    body,
    setTitle(text) {
      title.textContent = text;
    },
  };
}
