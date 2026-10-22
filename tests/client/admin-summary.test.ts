import { describe, expect, test } from 'vitest';
import type { Row } from '../../src/shared/protocol.js';
import { formatStat, summarize } from '../../src/client/admin/summary.js';

const row = (status: Row['status'], endingId?: string, correct?: boolean): Row => ({
  clientId: Math.random().toString(36),
  name: 'x',
  os: 'mac',
  status,
  endingId,
  correct,
  stats: {},
});

describe('summarize', () => {
  test('counts statuses, correct endings and groups endings by count', () => {
    const rows = [
      row('ferdig', 'bar', false),
      row('ferdig', 'toalett', true),
      row('jobber'),
      row('ferdig', 'toalett', true),
      row('venter'),
    ];
    expect(summarize(rows)).toEqual({
      total: 5,
      done: 3,
      working: 1,
      waiting: 1,
      correct: 2,
      endings: [
        { id: 'toalett', correct: true, count: 2 },
        { id: 'bar', correct: false, count: 1 },
      ],
    });
  });

  test('ties are sorted by id', () => {
    const s = summarize([row('ferdig', 'b', false), row('ferdig', 'a', true)]);
    expect(s.endings.map((e) => e.id)).toEqual(['a', 'b']);
  });

  test('an empty list is all zeros', () => {
    expect(summarize([])).toEqual({ total: 0, done: 0, working: 0, waiting: 0, correct: 0, endings: [] });
  });
});

describe('formatStat', () => {
  test('numbers get Norwegian digit grouping, a missing stat is empty', () => {
    expect(formatStat(2_000_000).replace(/\s/g, ' ')).toBe('2 000 000');
    expect(formatStat(1_400_000)).toBe((1_400_000).toLocaleString('nb-NO'));
    expect(formatStat(1000).replace(/\s/g, ' ')).toBe('1 000');
    expect(formatStat(3)).toBe('3');
    expect(formatStat(0)).toBe('0');
    expect(formatStat(undefined)).toBe('');
  });
});
