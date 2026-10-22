import { describe, expect, test } from 'vitest';
import { resultSummary } from '../../src/client/screens/result-summary.js';
import type { TaskUpdate } from '../../src/tasks/api.js';

const base: TaskUpdate = { stepTexts: ['A', 'B', 'C'], stepsDone: [true, true, true], stepCompletionTexts: [], hint: '', stats: { Tiss: 2, Feil: 1 } };

describe('resultSummary', () => {
  test('is null without an ending', () => {
    expect(resultSummary(base)).toBeNull();
  });

  test('passing update', () => {
    const s = resultSummary({ ...base, ending: { id: 'e', text: 'Bra', correct: true } })!;
    expect(s.correct).toBe(true);
    expect(s.title).toBe('Godt jobbet!');
    expect(s.text).toBe('Bra');
    expect(s.doneCount).toBe(3);
  });

  test('failing update keeps all goals, including unreached ones', () => {
    const s = resultSummary({ ...base, stepsDone: [true, false, false], ending: { id: 'e', text: 'Dårlig', correct: false } })!;
    expect(s.title).toBe('Oi da!');
    expect(s.doneCount).toBe(1);
    expect(s.goals.map((g) => g.text)).toEqual(['A', 'B', 'C']);
    expect(s.goals.map((g) => g.done)).toEqual([true, false, false]);
  });

  test('stats keep order', () => {
    const s = resultSummary({ ...base, ending: { id: 'e', text: '', correct: true } })!;
    expect(s.stats).toEqual([['Tiss', 2], ['Feil', 1]]);
  });
});
