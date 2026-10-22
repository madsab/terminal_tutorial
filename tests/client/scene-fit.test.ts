import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { contentBounds, fitView, parseMap } from '../../src/client/scene/map-data.js';

const load = (name: string) => parseMap(JSON.parse(readFileSync(`public/maps/${name}`, 'utf8')));

describe('contentBounds', () => {
  test.each(['homayoon-bar.json', 'aleksander-house.json', 'eeman-bank.json'])('%s excludes the empty outer ring', (file) => {
    const map = load(file);
    const b = contentBounds(map);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(map.width);
    expect(b.y + b.h).toBeLessThanOrEqual(map.height);
    expect(b.w * b.h).toBeLessThan(map.width * map.height);
  });

  test('is the tight box of filled tiles', () => {
    const filled = Array.from({ length: 10 }, (_, y) => Array.from({ length: 10 }, (_, x) => x >= 3 && x <= 5 && y >= 0 && y <= 4));
    const map = { width: 10, height: 10, filled } as unknown as Parameters<typeof contentBounds>[0];
    expect(contentBounds(map)).toEqual({ x: 3, y: 0, w: 3, h: 5 });
  });
});

describe('fitView', () => {
  test('picks the largest zoom that fits, fractions allowed, minimum 1', () => {
    const r = fitView({ w: 800, h: 400 }, { x: 0, y: 0, w: 10, h: 10 }, 16);
    expect(r.zoom).toBeCloseTo(2.5);
    expect(fitView({ w: 50, h: 50 }, { x: 0, y: 0, w: 10, h: 10 }, 16).zoom).toBe(1);
  });

  test('centres the bounds in the host', () => {
    const { scrollX, scrollY } = fitView({ w: 800, h: 400 }, { x: 2, y: 3, w: 10, h: 10 }, 16);
    // Phaser camera: zoom is about the viewport centre, so the world point shown there is scroll + host/2.
    expect(scrollX + 800 / 2).toBeCloseTo((2 + 5) * 16);
    expect(scrollY + 400 / 2).toBeCloseTo((3 + 5) * 16);
  });
});
