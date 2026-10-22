import { el } from '../dom.js';

/** The ending: heading, ending text, stat chips and (in class) the waiting note. Shared by the task panel and the reload screen. */
export function endingCard(o: { text: string; correct: boolean; stats: Record<string, number>; waitingNote: boolean }): HTMLElement {
  const card = el('div', `ending-card ${o.correct ? 'correct' : 'wrong'}`);
  card.append(el('h2', 'ending-title', o.correct ? 'Godt jobbet!' : 'Oi da!'), el('p', 'ending-text', o.text));
  const entries = Object.entries(o.stats);
  if (entries.length) {
    const row = el('div', 'ending-stats');
    for (const [k, v] of entries) row.append(el('span', 'stat-chip', `${k}: ${v}`));
    card.append(row);
  }
  if (o.waitingNote) {
    const wait = el('p', 'wait-note');
    wait.append(el('span', 'dots', '', { 'aria-hidden': 'true' }), document.createTextNode('Venter på neste oppgave…'));
    card.append(wait);
  }
  return card;
}
