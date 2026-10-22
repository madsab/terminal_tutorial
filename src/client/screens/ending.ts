import type { TaskDefinition } from '../../tasks/api.js';
import type { MyResult, Os } from '../../shared/protocol.js';
import { el, taskHeading } from '../dom.js';
import { endingCard } from './ending-card.js';
import { renderTopbar } from './topbar.js';

/** Shown when a student returns (reload) to a task they already finished. */
export function renderEnding(
  root: HTMLElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: TaskDefinition<any>,
  result: MyResult,
  student?: { name: string; os: Os },
): void {
  const ending = def.endings.find((e) => e.id === result.endingId);
  const heading = taskHeading(def.title);
  const card = endingCard({
    text: ending?.text ?? 'Du er ferdig med oppgaven.',
    correct: result.correct,
    stats: result.stats,
    waitingNote: true,
  });
  const main = el('main', 'ending-main card');
  main.append(heading, card);
  const page = el('div', 'ending-screen');
  page.append(renderTopbar({ student }), main);
  root.replaceChildren(page);
}
