import { describe, expect, test } from 'vitest';
import { Vfs } from '../../src/shell/vfs.js';

function sample() {
  const v = new Vfs();
  v.mkdir('/home/u/bar');
  v.addScript('/home/u/bar', 'kjop');
  v.mkdir('/home/u/.hemmelig');
  return v;
}

describe('Vfs', () => {
  test('mkdir creates parents and exists/isDir report them', () => {
    const v = sample();
    expect(v.exists('/home/u')).toBe(true);
    expect(v.isDir('/home/u/bar')).toBe(true);
    expect(v.isDir('/home/u/bar/kjop')).toBe(false);
    expect(v.exists('/nope')).toBe(false);
  });

  test('list hides dot entries unless all is set', () => {
    const v = sample();
    expect(v.list('/home/u', { all: false }).map((e) => e.name)).toEqual(['bar']);
    expect(v.list('/home/u', { all: true }).map((e) => e.name)).toEqual(['bar', '.hemmelig']);
  });

  test('setForceVisible shows a dot entry in plain list', () => {
    const v = sample();
    v.setForceVisible('/home/u/.hemmelig', true);
    expect(v.list('/home/u', { all: false }).map((e) => e.name)).toEqual(['bar', '.hemmelig']);
  });

  test('setHidden hides a normal entry from plain list only', () => {
    const v = sample();
    v.setHidden('/home/u/bar', true);
    expect(v.list('/home/u', { all: false })).toEqual([]);
    expect(v.list('/home/u', { all: true }).length).toBe(2);
  });

  test('entries carry kind and effective hidden flag', () => {
    const v = sample();
    const e = v.list('/home/u/bar', { all: true });
    expect(e).toEqual([{ name: 'kjop', kind: 'script', hidden: false }]);
    expect(v.list('/home/u', { all: true })[1]).toEqual({ name: '.hemmelig', kind: 'dir', hidden: true });
  });

  test('remove deletes recursively', () => {
    const v = sample();
    v.remove('/home/u/bar');
    expect(v.exists('/home/u/bar/kjop')).toBe(false);
    expect(v.exists('/home/u/bar')).toBe(false);
  });

  test('addScript twice does not duplicate', () => {
    const v = sample();
    v.addScript('/home/u/bar', 'kjop');
    expect(v.list('/home/u/bar', { all: true }).length).toBe(1);
  });

  test('find matches names case-insensitively on request', () => {
    const v = sample();
    expect(v.find('/home/u', 'BAR', true)).toBe('bar');
    expect(v.find('/home/u', 'BAR', false)).toBeUndefined();
  });
});

describe('Vfs links', () => {
  function linked() {
    const v = new Vfs();
    v.mkdir('/h/stue');
    v.mkdir('/h/kjokken');
    v.addFile('/h/kjokken', 'brod', 'm');
    v.link('/h/stue', 'kjokken', '/h/kjokken');
    return v;
  }

  test('a link is a directory with a target and shows the target contents', () => {
    const v = linked();
    expect(v.stat('/h/stue/kjokken')).toMatchObject({ kind: 'dir', target: '/h/kjokken' });
    expect(v.isDir('/h/stue/kjokken')).toBe(true);
    expect(v.list('/h/stue', { all: false }).map((e) => e.name)).toEqual(['kjokken']);
    expect(v.list('/h/stue/kjokken', { all: false }).map((e) => e.name)).toEqual(['brod']);
    expect(v.exists('/h/stue/kjokken/brod')).toBe(true);
    expect(v.find('/h/stue', 'KJOKKEN', true)).toBe('kjokken');
  });

  test('removing a link keeps its target', () => {
    const v = linked();
    v.remove('/h/stue/kjokken');
    expect(v.exists('/h/stue/kjokken')).toBe(false);
    expect(v.exists('/h/kjokken/brod')).toBe(true);
  });

  test('removing through a link never removes the link target itself', () => {
    const v = linked();
    v.remove('/h/stue/kjokken/brod');
    expect(v.exists('/h/kjokken')).toBe(true);
  });

  test('a link cycle does not hang', () => {
    const v = linked();
    v.link('/h/kjokken', 'stue', '/h/stue');
    expect(v.exists('/h/stue/kjokken/stue/kjokken/stue/kjokken/brod')).toBe(true);
    v.link('/h', 'a', '/h/b');
    v.link('/h', 'b', '/h/a');
    expect(v.exists('/h/a/x')).toBe(false);
  });
});
