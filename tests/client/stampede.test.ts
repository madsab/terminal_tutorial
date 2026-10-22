import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseMap, type SpriteObject } from '../../src/client/scene/map-data.js';
import { fleeing } from '../../src/client/scene/stampede.js';

describe('fleeing', () => {
  test('is the three lobby characters of the bank, not the cashiers', () => {
    const { sprites } = parseMap(JSON.parse(readFileSync('public/maps/eeman-bank.json', 'utf8')));
    const out = fleeing(sprites);
    expect(out).toHaveLength(3);
    expect(out.every((s) => !s.staff)).toBe(true);
    expect(sprites.filter((s) => s.staff)).toHaveLength(2);
  });

  test('is empty for a map with no body sprites, or only staff', () => {
    const toilet: SpriteObject = { name: 'toilet', x: 0, y: 0 };
    expect(fleeing([])).toEqual([]);
    expect(fleeing([toilet])).toEqual([]);
    expect(fleeing([toilet, { name: 'Bob', x: 0, y: 0, staff: true }])).toEqual([]);
  });
});
