import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseMap } from '../../src/client/scene/map-data.js';
import { findPath } from '../../src/client/scene/pathfinder.js';

const load = (name: string) => parseMap(JSON.parse(readFileSync(`public/maps/${name}`, 'utf8')));

const REQUIRED: Record<string, string[]> = {
  'homayoon-bar.json': ['inngang', 'bar', 'bord', 'toalett', 'bar-omrade', 'bord-inngang', 'sofakrok'],
  'aleksander-house.json': ['stue', 'soverom', 'kjokken', 'bad'],
  'eeman-bank.json': ['inngang', 'skranke', 'sofa', 'plante', 'safe'],
};

const ALL = Object.entries(REQUIRED).flatMap(([file, spots]) => [
  [file, spots] as const,
  [file.replace('.json', '.placeholder.json'), spots] as const,
]);

describe.each(ALL)('map %s', (file, spots) => {
  const map = load(file);

  test('has the named spots', () => {
    for (const s of spots) expect(map.spots[s], s).toBeDefined();
  });

  test('every spot is on a walkable tile', () => {
    for (const s of spots) {
      const { x, y } = map.spots[s];
      expect(map.blocked[y][x], s).toBe(false);
    }
  });

  test('every spot can reach every other spot', async () => {
    for (const a of spots) {
      for (const b of spots) {
        if (a === b) continue;
        const path = await findPath(map.blocked, map.spots[a], map.spots[b]);
        expect(path, `${a} -> ${b}`).not.toBeNull();
      }
    }
  });
});

describe('findPath', () => {
  test('routes around obstacles and returns null when walled in', async () => {
    const grid = [
      [false, true, false],
      [false, true, false],
      [false, false, false],
    ];
    const path = await findPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(path?.at(-1)).toEqual({ x: 2, y: 0 });
    expect(path?.some((p) => p.x === 1 && p.y === 1)).toBe(false);
    const walled = [
      [false, true, false],
      [true, true, true],
      [false, true, false],
    ];
    expect(await findPath(walled, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });
});

const rawMap = (name: string) => JSON.parse(readFileSync(`public/maps/${name}`, 'utf8'));
const LIMEZU = Object.keys(REQUIRED);

describe.each(LIMEZU)('LimeZu map %s', (file) => {
  const json = rawMap(file);
  const map = parseMap(json);
  const tileCount = json.tilesets.reduce((n: number, t: { tilecount: number }) => n + t.tilecount, 0);

  test('has every layer and tile ids inside its tilesets', () => {
    for (const l of ['ground', 'walls', 'furniture', 'above', 'collision']) expect(map.tileLayers, l).toContain(l);
    for (const l of json.layers.filter((x: { type: string }) => x.type === 'tilelayer')) {
      expect(l.data.length).toBe(json.width * json.height);
      for (const g of l.data as number[]) expect(g >= 0 && g <= tileCount).toBe(true);
    }
  });

  test('static characters and sprites stand inside the map', () => {
    for (const s of map.sprites) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(map.width * 16);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThanOrEqual(map.height * 16);
    }
  });

  test('the first spot is where the hero starts, on a walkable tile', () => {
    const first = Object.values(map.spots)[0];
    expect(map.blocked[first.y][first.x]).toBe(false);
  });
});

describe('house rooms keep their middle open', () => {
  const map = parseMap(rawMap('aleksander-house.json'));
  test.each(['stue', 'soverom', 'kjokken', 'bad'])('%s has a free 3x2 around its spot', (spot) => {
    const { x, y } = map.spots[spot];
    let found = false;
    for (let x0 = x - 2; x0 <= x && !found; x0++) {
      for (let y0 = y - 1; y0 <= y && !found; y0++) {
        let free = true;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) if (map.blocked[y0 + dy]?.[x0 + dx] !== false) free = false;
        found = free;
      }
    }
    expect(found).toBe(true);
  });
});

describe('bar layout', () => {
  const map = parseMap(rawMap('homayoon-bar.json'));
  test('is 20 x 14 with the bartender behind the counter', () => {
    expect([map.width, map.height]).toEqual([20, 14]);
    expect(map.sprites.some((s) => s.name === 'Bob')).toBe(true);
  });
});

describe('bank layout', () => {
  const map = parseMap(rawMap('eeman-bank.json'));
  test('has the cashiers, the old man by the sofa and customers in the lobby', () => {
    expect(map.sprites.filter((s) => s.name === 'Bob').length).toBe(2);
    expect(map.sprites.length).toBe(5);
  });
  test('marks exactly the two cashiers as staff, on the feet row', () => {
    const staff = map.sprites.filter((s) => s.staff === true);
    expect(staff.length).toBe(2);
    for (const s of staff) expect(s.y).toBe(64);
    expect(map.sprites.filter((s) => s.y !== 64).every((s) => s.staff === undefined)).toBe(true);
  });
  test('a sprite without the property has no staff flag', () => {
    const raw = {
      width: 1, height: 1, tilewidth: 16, tileheight: 16,
      layers: [{ name: 'sprites', type: 'objectgroup', objects: [{ name: 'Bob', x: 8, y: 16 }] }],
    };
    expect(parseMap(raw as never).sprites[0].staff).toBeUndefined();
  });
  test('no one stands on a spot tile', () => {
    const spots = Object.values(map.spots).map((p) => `${p.x},${p.y}`);
    for (const s of map.sprites) expect(spots).not.toContain(`${Math.floor(s.x / 16)},${Math.floor(s.y / 16) - 1}`);
  });
});

describe('area objects', () => {
  test('the house rooms have <spot>-area rectangles that are not spots', () => {
    const house = load('aleksander-house.json');
    expect(house.areas.soverom).toEqual({ x: 3, y: 4, w: 6, h: 3 });
    expect(house.spots['soverom-area']).toBeUndefined();
    for (const room of ['soverom', 'stue', 'kjokken', 'bad']) {
      const a = house.areas[room];
      const s = house.spots[room];
      expect(s.x >= a.x && s.x < a.x + a.w && s.y >= a.y && s.y < a.y + a.h, room).toBe(true);
    }
  });

  test('maps without area objects (placeholders) have none, so the scene uses the 5 x 3 fallback', () => {
    expect(load('aleksander-house.placeholder.json').areas).toEqual({});
  });
});

describe.each(Object.keys(REQUIRED))('wall decorations in %s', (file) => {
  const json = JSON.parse(readFileSync(`public/maps/${file}`, 'utf8')) as { width: number; layers: { name: string; data?: number[] }[] };
  const layer = (n: string) => json.layers.find((l) => l.name === n)!.data!;
  const at = (n: string, x: number, y: number) => layer(n)[y * json.width + x];

  test('every cell of the wall row that holds a decoration keeps its wall tile', () => {
    const decorated = layer('furniture').flatMap((g, i) => (g && layer('walls')[i] ? [i] : []));
    expect(decorated.length).toBeGreaterThan(0);
    for (const i of decorated) expect(layer('walls')[i], `cell ${i}`).not.toBe(0);
  });
});

test('the bank world map and window hang on wall tiles', () => {
  const json = JSON.parse(readFileSync('public/maps/eeman-bank.json', 'utf8')) as { width: number; layers: { name: string; data?: number[] }[] };
  const cell = (n: string, x: number, y: number) => json.layers.find((l) => l.name === n)!.data![y * json.width + x];
  for (const x of [3, 4, 9, 10]) for (const y of [1, 2]) {
    expect(cell('walls', x, y), `wall ${x},${y}`).not.toBe(0);
    expect(cell('furniture', x, y), `decoration ${x},${y}`).not.toBe(0);
  }
});
