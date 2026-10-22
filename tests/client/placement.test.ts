import { describe, expect, test } from 'vitest';
import { nextFreeTile } from '../../src/client/scene/placement.js';

const open = (w: number, h: number) => Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
const area = { x: 3, y: 4, w: 5, h: 3 };
const spot = { x: 5, y: 5 };

describe('nextFreeTile (Review Focus 5)', () => {
  test('an empty 5x3 area gives the spot itself', () => {
    expect(nextFreeTile(area, spot, new Set(), open(12, 10))).toEqual(spot);
  });

  test('a taken spot gives an orthogonal neighbour (row before column on ties)', () => {
    const got = nextFreeTile(area, spot, new Set(['5,5']), open(12, 10))!;
    expect(Math.abs(got.x - spot.x) + Math.abs(got.y - spot.y)).toBe(1);
    expect(got).toEqual({ x: 5, y: 4 });
  });

  test('skips blocked tiles', () => {
    const blocked = open(12, 10);
    blocked[5][5] = true;
    blocked[4][5] = true;
    expect(nextFreeTile(area, spot, new Set(), blocked)).toEqual({ x: 4, y: 5 });
  });

  test('12 cages fill 12 distinct tiles inside the area', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const p = nextFreeTile(area, spot, taken, open(12, 10))!;
      expect(p).not.toBeNull();
      expect(p.x >= 3 && p.x < 8 && p.y >= 4 && p.y < 7).toBe(true);
      taken.add(`${p.x},${p.y}`);
    }
    expect(taken.size).toBe(12);
  });

  test('whole area taken or blocked gives null', () => {
    const taken = new Set<string>();
    for (let y = 4; y < 7; y++) for (let x = 3; x < 8; x++) taken.add(`${x},${y}`);
    expect(nextFreeTile(area, spot, taken, open(12, 10))).toBeNull();
    const blocked = Array.from({ length: 10 }, () => new Array<boolean>(12).fill(true));
    expect(nextFreeTile(area, spot, new Set(), blocked)).toBeNull();
  });

  test('tiles outside the map are ignored', () => {
    expect(nextFreeTile({ x: -2, y: -2, w: 3, h: 3 }, { x: -1, y: -1 }, new Set(), open(4, 4))).toEqual({ x: 0, y: 0 });
  });
});
