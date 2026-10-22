import type { TaskUpdate } from '../../tasks/api.js';

export interface ResultSummary {
  correct: boolean;
  title: string;
  text: string;
  goals: { text: string; done: boolean }[];
  doneCount: number;
  stats: [string, number][];
}

/** What the result dialog shows, or null while the task has no ending yet. */
export function resultSummary(u: TaskUpdate): ResultSummary | null {
  if (!u.ending) return null;
  const goals = u.stepTexts.map((text, i) => ({ text, done: !!u.stepsDone[i] }));
  return {
    correct: u.ending.correct,
    title: u.ending.correct ? 'Godt jobbet!' : 'Oi da!',
    text: u.ending.text,
    goals,
    doneCount: goals.filter((g) => g.done).length,
    stats: Object.entries(u.stats),
  };
}
