import { el } from '../dom.js';

/** Wordmark used inside the setup cards. */
export function wordmark(): HTMLElement {
  const mark = el('div', 'wordmark');
  mark.append(el('span', 'wordmark-icon', '>_', { 'aria-hidden': 'true' }), el('span', 'wordmark-text', 'Terminal-oppgaver'));
  return mark;
}

/** Step 1: the student's name. */
export function renderJoin(root: HTMLElement, opts: { name: string; onSubmit(name: string): void }): void {
  const form = el('form', 'card setup-card join');
  const input = el('input', 'name-input', undefined, { id: 'name', type: 'text', placeholder: 'Navnet ditt', maxlength: '40', autocomplete: 'off', required: '' });
  input.value = opts.name;
  const label = el('label', 'field-label', 'Hva heter du?', { for: 'name' });
  const next = el('button', 'btn btn-dark', 'Neste →', { type: 'submit' });
  next.setAttribute('aria-label', 'Neste');
  form.append(
    wordmark(),
    el('h1', '', 'Velkommen!'),
    el('p', 'lead', 'Du skal løse små oppdrag ved å skrive kommandoer i en terminal.'),
    label,
    input,
    next,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (name) opts.onSubmit(name);
  });
  const setup = el('div', 'setup');
  setup.append(form);
  root.replaceChildren(setup);
  input.focus();
}
