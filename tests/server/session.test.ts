import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { Session } from '../../src/server/session.js';

const TASKS = [
  { id: 't1', title: 'Ett', intro: 'Les dette høyt' },
  { id: 't2', title: 'To' },
];
let dir: string;
let s: Session;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tq-session-'));
  s = new Session(dir, TASKS);
});

describe('Session', () => {
  test('startNext walks the task order and stops at the end', () => {
    expect(s.current).toBeNull();
    expect(s.startNext()).toBe('t1');
    expect(s.startNext()).toBe('t2');
    expect(s.startNext()).toBeNull();
    expect(s.current).toBe('t2');
  });

  test('the first ending wins, later ones and later progress are ignored', () => {
    s.join('c1', 'Ola', 'mac');
    s.startNext();
    expect(s.end('c1', 't1', 'toalett', true, { hiroshimaer: 2 })).toBe(true);
    expect(s.end('c1', 't1', 'bar', false, { hiroshimaer: 9 })).toBe(false);
    s.progress('c1', 't1', [true, false], { hiroshimaer: 3 });
    const row = s.rows('t1')[0];
    expect(row).toMatchObject({ status: 'ferdig', endingId: 'toalett', correct: true, stats: { hiroshimaer: 2 } });
    expect(s.resultFor('c1', 't1')).toEqual({ endingId: 'toalett', correct: true, stats: { hiroshimaer: 2 } });
  });

  test('progress marks a student as jobber with their step count', () => {
    s.join('c1', 'Ola', 'linux');
    s.startNext();
    expect(s.rows('t1')[0].status).toBe('venter');
    s.progress('c1', 't1', [true, false, true], { x: 1 });
    expect(s.rows('t1')[0]).toMatchObject({ status: 'jobber', steps: 2, stats: { x: 1 } });
  });

  test('progress for a task that is not current is ignored', () => {
    s.join('c1', 'Ola', 'mac');
    s.startNext();
    s.startNext();
    s.progress('c1', 't1', [true], {});
    expect(s.rows('t1')[0].status).toBe('venter');
  });

  test('ending or progress from an unknown student is ignored', () => {
    s.startNext();
    expect(s.end('ghost', 't1', 'x', true, {})).toBe(false);
    s.progress('ghost', 't1', [], {});
    expect(s.rows('t1')).toEqual([]);
  });

  test('same name with different clientIds gives two rows, the same clientId twice gives one', () => {
    s.join('c1', 'Ola', 'mac');
    s.join('c2', 'Ola', 'windows');
    s.join('c1', 'Ola', 'mac');
    s.startNext();
    expect(s.rows('t1').map((r) => r.clientId)).toEqual(['c1', 'c2']);
  });

  test('rejoining updates name and OS but keeps the result', () => {
    s.join('c1', 'Ola', 'mac');
    s.startNext();
    s.end('c1', 't1', 'toalett', true, {});
    s.join('c1', 'Ola N', 'linux');
    expect(s.rows('t1')[0]).toMatchObject({ name: 'Ola N', os: 'linux', status: 'ferdig' });
  });

  test('a student who joins late gets a waiting row in every started task', () => {
    s.startNext();
    s.startNext();
    s.join('late', 'Sen', 'mac');
    expect(s.rows('t1')[0]).toMatchObject({ clientId: 'late', status: 'venter' });
    expect(s.rows('t2')[0]).toMatchObject({ clientId: 'late', status: 'venter' });
  });

  test('a task started after a student joined has a row for them', () => {
    s.join('c1', 'Ola', 'mac');
    s.startNext();
    expect(s.rows('t1').length).toBe(1);
  });

  test('adminState lists started tasks and the next one', () => {
    s.join('c1', 'Ola', 'mac');
    s.startNext();
    const st = s.adminState();
    expect(st.currentTaskId).toBe('t1');
    expect(st.nextTask).toEqual({ taskId: 't2', title: 'To' });
    expect(st.tasks.map((t) => t.taskId)).toEqual(['t1']);
    expect(st.tasks[0].intro).toBe('Les dette høyt');
    s.startNext();
    expect(s.adminState().nextTask).toBeNull();
  });

  test('reset clears everything', () => {
    s.join('c1', 'Ola', 'mac');
    s.startNext();
    s.end('c1', 't1', 'a', true, {});
    s.reset();
    expect(s.current).toBeNull();
    expect(s.snapshot()).toEqual({ students: [], started: [], current: null, results: {} });
    expect(s.startNext()).toBe('t1');
  });

  test('a restored snapshot equals the pre-restart state (Review Focus 3)', async () => {
    s.join('c1', 'Ola', 'mac');
    s.join('c2', 'Kari', 'windows');
    s.startNext();
    s.progress('c1', 't1', [true], { hiroshimaer: 1 });
    s.end('c2', 't1', 'bar', false, { hiroshimaer: 4 });
    s.startNext();
    await s.flush();
    const restored = new Session(dir, TASKS);
    expect(restored.snapshot()).toEqual(s.snapshot());
    expect(restored.current).toBe('t2');
    expect(restored.resultFor('c2', 't1')).toEqual({ endingId: 'bar', correct: false, stats: { hiroshimaer: 4 } });
  });

  test('persistence is debounced but flush writes at once', async () => {
    s.join('c1', 'Ola', 'mac');
    await s.flush();
    expect(new Session(dir, TASKS).snapshot().students).toHaveLength(1);
  });

  test('a corrupt or unknown-task snapshot starts fresh instead of crashing', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'session.json'), '{not json');
    expect(new Session(dir, TASKS).snapshot().students).toEqual([]);
    writeFileSync(join(dir, 'session.json'), JSON.stringify({ students: [], started: ['gone'], current: 'gone', results: {} }));
    expect(new Session(dir, TASKS).current).toBeNull();
  });
});
