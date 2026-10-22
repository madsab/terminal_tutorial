import type { Row } from '../../shared/protocol.js';

export interface Summary {
  total: number;
  done: number;
  working: number;
  waiting: number;
  correct: number;
  endings: Array<{ id: string; correct: boolean; count: number }>;
}

/** Counts for the stat tiles, progress bar and ending chips. Endings: most common first, then by id. */
export function summarize(rows: Row[]): Summary {
  const s: Summary = { total: rows.length, done: 0, working: 0, waiting: 0, correct: 0, endings: [] };
  const endings = new Map<string, { id: string; correct: boolean; count: number }>();
  for (const r of rows) {
    if (r.status === 'ferdig') s.done++;
    else if (r.status === 'jobber') s.working++;
    else s.waiting++;
    if (r.status === 'ferdig' && r.correct) s.correct++;
    if (r.endingId) {
      const e = endings.get(r.endingId) ?? { id: r.endingId, correct: !!r.correct, count: 0 };
      e.count++;
      endings.set(r.endingId, e);
    }
  }
  s.endings = [...endings.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return s;
}

/** A stat cell in the results table: Norwegian digit grouping (2 000 000), empty when the row has no such stat. */
export function formatStat(value: number | undefined): string {
  return value === undefined ? '' : value.toLocaleString('nb-NO');
}
