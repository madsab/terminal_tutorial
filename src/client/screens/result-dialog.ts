import { el } from '../dom.js';
import type { ResultSummary } from './result-summary.js';

/** Modal result dialog. Removes itself from the DOM when closed and calls onClose once. */
export function showResultDialog(
  summary: ResultSummary,
  opts: { waitingNote: boolean; onClose?(): void; onRetry?(): void },
): { close(): void } {
  const dialog = el('dialog', `result-dialog ${summary.correct ? 'correct' : 'wrong'}`, undefined, {
    'aria-labelledby': 'result-dialog-title',
  });

  const head = el('div', 'result-head');
  head.append(
    el('span', 'result-icon', summary.correct ? '✓' : '✕', { 'aria-hidden': 'true' }),
    el('h2', 'result-title', summary.title, { id: 'result-dialog-title' }),
  );
  dialog.append(head, el('p', 'ending-text', summary.text));

  if (summary.goals.length) {
    const list = el('ul', 'result-goals');
    for (const g of summary.goals) {
      const li = el('li', g.done ? 'result-goal done' : 'result-goal');
      li.append(
        el('span', 'result-mark', g.done ? '✓' : '○', { 'aria-hidden': 'true' }),
        el('span', 'step-text', g.text),
        el('span', 'visually-hidden', g.done ? ' (ferdig)' : ' (ikke nådd)'),
      );
      list.append(li);
    }
    dialog.append(el('h3', 'result-goals-head', `Mål ${summary.doneCount} av ${summary.goals.length}`), list);
  }

  if (summary.stats.length) {
    const row = el('div', 'ending-stats');
    for (const [k, v] of summary.stats) row.append(el('span', 'stat-chip', `${k}: ${v}`));
    dialog.append(row);
  }

  if (opts.waitingNote) {
    const wait = el('p', 'wait-note');
    wait.append(el('span', 'dots', '', { 'aria-hidden': 'true' }), document.createTextNode('Venter på neste oppgave…'));
    dialog.append(wait);
  }

  const closeBtn = el('button', 'btn btn-primary result-close', 'Lukk', { type: 'button' });
  const actions = el('div', 'result-actions');
  let retryBtn: HTMLButtonElement | undefined;
  if (opts.onRetry) {
    retryBtn = el('button', 'btn btn-outline retry', 'Prøv igjen', { type: 'button' });
    actions.append(retryBtn);
  }
  actions.append(closeBtn);
  dialog.append(actions);

  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    dialog.remove();
    opts.onClose?.();
  };
  const close = () => {
    if (dialog.open) dialog.close();
    finish();
  };
  closeBtn.addEventListener('click', close);
  retryBtn?.addEventListener('click', () => {
    close();
    opts.onRetry?.();
  });
  dialog.addEventListener('close', finish);

  document.body.append(dialog);
  dialog.showModal();
  closeBtn.focus();
  return { close };
}
