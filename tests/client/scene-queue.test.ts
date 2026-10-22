import { describe, expect, test } from 'vitest';
import { ActionQueue, type SceneAction } from '../../src/client/scene/action-queue.js';
import { resolveHead } from '../../src/client/scene/head.js';

describe('ActionQueue (Review Focus 5)', () => {
  test('50 queued walkTo/play calls collapse so the character ends at the last target', () => {
    const q = new ActionQueue();
    for (let i = 0; i < 50; i++) {
      q.push({ type: 'walkTo', spot: `s${i}` });
      q.push({ type: 'play', anim: 'drink' });
    }
    const drained = q.drain();
    const walks = drained.filter((a) => a.type === 'walkTo');
    expect(walks).toEqual([{ type: 'walkTo', spot: 's49' }]);
    expect(drained.length).toBeLessThanOrEqual(4);
  });

  test('a new walkTo preempts a walk in progress, a play does not', () => {
    const q = new ActionQueue();
    expect(q.push({ type: 'walkTo', spot: 'bar' })).toBe('preempt');
    expect(q.push({ type: 'play', anim: 'drink' })).toBe('queued');
  });

  test('plays are kept in order and capped, dropping the oldest', () => {
    const q = new ActionQueue({ maxPlays: 2 });
    for (const anim of ['a', 'b', 'c', 'd']) q.push({ type: 'play', anim });
    expect(q.drain()).toEqual([
      { type: 'play', anim: 'c' },
      { type: 'play', anim: 'd' },
    ]);
  });

  test('next() hands out actions in order and returns undefined when empty', () => {
    const q = new ActionQueue();
    q.push({ type: 'play', anim: 'x' });
    q.push({ type: 'walkTo', spot: 'bar' });
    const first = q.next();
    const second = q.next();
    expect([first, second]).toEqual<(SceneAction | undefined)[]>([
      { type: 'walkTo', spot: 'bar' },
      { type: 'play', anim: 'x' },
    ]);
    expect(q.next()).toBeUndefined();
  });

  test('a burst never grows the queue beyond its cap, and nothing is awaited', () => {
    const q = new ActionQueue();
    for (let i = 0; i < 10_000; i++) q.push(i % 2 ? { type: 'play', anim: 'drink' } : { type: 'walkTo', spot: `s${i}` });
    expect(q.length).toBeLessThanOrEqual(4);
  });
});

describe('resolveHead', () => {
  test('uses the photo when the file is available', () => {
    expect(resolveHead('homayoon.png', new Set(['homayoon.png']))).toEqual({ kind: 'photo', file: 'homayoon.png' });
  });

  test('falls back to a coloured head with the initial when the photo is missing', () => {
    const h = resolveHead('homayoon.png', new Set());
    expect(h.kind).toBe('placeholder');
    if (h.kind === 'placeholder') {
      expect(h.initial).toBe('H');
      expect(h.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('the placeholder colour is stable per character and differs between characters', () => {
    const color = (f: string) => {
      const h = resolveHead(f, new Set());
      return h.kind === 'placeholder' ? h.color : '';
    };
    expect(color('aleksander.png')).toBe(color('aleksander.png'));
    expect(new Set([color('homayoon.png'), color('aleksander.png'), color('eeman.png')]).size).toBe(3);
  });
});
