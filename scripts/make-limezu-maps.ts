/**
 * Generates the three LimeZu levels as Tiled JSON into public/maps (tile indices only, no art).
 * Run: npx tsx scripts/make-limezu-maps.ts
 *
 * TypeScript port of docs/superpowers/plans/2026-10-18-level-layouts.py (the coordinates are the same).
 * The Python draws one flat image; here every tile goes to a Tiled layer instead:
 *   ground     floors
 *   walls      two-tile-high wall faces, doors and windows (behind the character)
 *   furniture  behind the character
 *   above      drawn over the character: shelf tops, plant crowns, couch backs, food on tables
 *   collision  derived: no floor, wall tile, or blocking furniture
 *   spots      named points the tasks walk to
 *   sprites    custom sprites (toilet, bathtub) and static characters (bartender, cashiers)
 * Empty cells are the dark ceiling; the map's `backgroundcolor` paints it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const T = 16;
const OUT = 'public/maps';

type Sheet = 'I' | 'R';
const COLS: Record<Sheet, number> = { I: 16, R: 17 };
const ROWS: Record<Sheet, number> = { I: 89, R: 23 };
const FIRSTGID: Record<Sheet, number> = { I: 1, R: 1 + 16 * 89 };
const TILESETS = [
  { sheet: 'I' as const, name: 'Interiors_free_16x16', image: '../../assets/limezu/Interiors_free/16x16/Interiors_free_16x16.png', w: 256, h: 1424 },
  { sheet: 'R' as const, name: 'Room_Builder_free_16x16', image: '../../assets/limezu/Interiors_free/16x16/Room_Builder_free_16x16.png', w: 272, h: 368 },
];
const gid = (s: Sheet, col: number, row: number) => FIRSTGID[s] + row * COLS[s] + col;

// Room Builder bases (col, row) used by the layout script.
const WOOD_PLANK: [number, number] = [4, 11];
const DARK_WOOD: [number, number] = [4, 13];
const HERRING: [number, number] = [11, 13];
const YELLOW_TILE: [number, number] = [11, 7];
const TEAL_TILE: [number, number] = [11, 9];
const GREY_FLOOR: [number, number] = [11, 11];

type Facing = 'right' | 'up' | 'left' | 'down';
type Layer = 'ground' | 'walls' | 'furniture' | 'above';

interface Furniture {
  sheet: Sheet;
  col: number;
  row: number;
  w: number;
  h: number;
  x: number;
  y: number;
  /** Cells that stop the character. Only the rows below `aboveRows` block. */
  blocks: boolean;
  /** Top rows drawn over the character (shelf tops, plant crowns, couch backs). They don't block. */
  aboveRows?: number;
  /** Put every tile on this layer (food on tables to `above`). `walls` is wall decoration: drawn on `furniture`, over the wall tile it hangs on. */
  layer?: Layer;
  /** Painter order like the Python `sort`: later objects overwrite earlier ones in the same cell. Default y + h. */
  sort?: number;
}

interface SpriteObj {
  name: string;
  /** Tile the sprite stands on (its feet). */
  x: number;
  y: number;
  facing?: Facing;
  depth?: number;
  /** Extra tiles the sprite blocks, relative to the feet tile (the feet tile always blocks). */
  blocksTo?: number;
  /** Bank staff: stays when the bank is robbed. */
  staff?: boolean;
}

class Level {
  readonly ground: number[];
  readonly walls: number[];
  readonly furniture: number[];
  readonly above: number[];
  readonly extraBlocked = new Set<number>();
  readonly furn: Furniture[] = [];
  readonly sprites: SpriteObj[] = [];
  spots: [string, number, number][] = [];
  areas: [string, number, number, number, number][] = [];

  constructor(readonly w: number, readonly h: number) {
    const empty = () => new Array(w * h).fill(0);
    this.ground = empty();
    this.walls = empty();
    this.furniture = empty();
    this.above = empty();
  }

  private i = (x: number, y: number) => y * this.w + x;

  /** Floor tiles from a Room Builder base, repeating `cols` x `rows`. A floor tile replaces any wall tile. */
  floor(x0: number, y0: number, x1: number, y1: number, base: [number, number], cols = 3, rows = 1) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.ground[this.i(x, y)] = gid('R', base[0] + (x % cols), base[1] + (y % rows));
        this.walls[this.i(x, y)] = 0;
      }
    }
  }

  /** Two-tile-high wall face (left end, middle, right end) from Room Builder row `styleRow`. */
  wall(x0: number, x1: number, y: number, styleRow: number) {
    for (let x = x0; x <= x1; x++) {
      const c = x === x0 ? 0 : x === x1 ? 2 : 1;
      this.walls[this.i(x, y)] = gid('R', c, styleRow);
      this.walls[this.i(x, y + 1)] = gid('R', c, styleRow + 1);
      this.ground[this.i(x, y)] = 0;
      this.ground[this.i(x, y + 1)] = 0;
    }
  }

  /** Ceiling: clears floor and wall tiles so the dark background shows. */
  ceil(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.ground[this.i(x, y)] = 0;
        this.walls[this.i(x, y)] = 0;
      }
    }
  }

  obj(sheet: Sheet, col: number, row: number, w: number, h: number, x: number, y: number, blocks: boolean, opts: Partial<Furniture> = {}) {
    this.furn.push({ sheet, col, row, w, h, x, y, blocks, ...opts });
  }

  sprite(s: SpriteObj) {
    this.sprites.push(s);
  }

  spot(name: string, x: number, y: number) {
    this.spots.push([name, x, y]);
  }

  /** Where things spawned at spot `name` may spread out (tiles). Without one the scene uses a 5 x 3 box around the spot. */
  area(name: string, x: number, y: number, w: number, h: number) {
    this.areas.push([name, x, y, w, h]);
  }

  /** Paints the furniture in painter order and fills the layers. */
  private place(): void {
    const sorted = this.furn
      .map((f, n) => ({ f, n }))
      .sort((a, b) => (a.f.sort ?? a.f.y + a.f.h) - (b.f.sort ?? b.f.y + b.f.h) || a.n - b.n);
    for (const { f } of sorted) {
      const above = f.aboveRows ?? 0;
      for (let dy = 0; dy < f.h; dy++) {
        for (let dx = 0; dx < f.w; dx++) {
          const x = f.x + dx;
          const y = f.y + dy;
          if (x < 0 || y < 0 || x >= this.w || y >= this.h) throw new Error(`furniture off the map at ${x},${y}`);
          const layer: Layer = f.layer ?? (dy < above ? 'above' : 'furniture');
          const at = this.i(x, y);
          const g = gid(f.sheet, f.col + dx, f.row + dy);
          if (layer === 'above') this.above[at] = g;
          else this.furniture[at] = g;
          if (f.blocks && dy >= above) this.extraBlocked.add(at);
        }
      }
    }
    for (const s of this.sprites) {
      for (let dx = 0; dx <= (s.blocksTo ?? 0); dx++) this.extraBlocked.add(this.i(s.x + dx, s.y));
    }
  }

  toTiled(backgroundcolor: string) {
    this.place();
    const collision = this.ground.map((g, at) => (g === 0 || this.walls[at] !== 0 || this.extraBlocked.has(at) ? 1 : 0));
    const tile = (name: string, id: number, data: number[]) => ({
      data, height: this.h, id, name, opacity: 1, type: 'tilelayer', visible: name !== 'collision', width: this.w, x: 0, y: 0,
    });
    let oid = 1;
    const spots = {
      draworder: 'topdown', id: 6, name: 'spots', opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0,
      objects: [
        ...this.spots.map(([name, x, y]) => ({
          height: 0, id: oid++, name, point: true, rotation: 0, type: '', visible: true, width: 0, x: x * T + T / 2, y: y * T + T / 2,
        })),
        // `<spot>-area`: plain rectangles (not points) in pixels.
        ...this.areas.map(([name, x, y, w, h]) => ({
          height: h * T, id: oid++, name: `${name}-area`, rotation: 0, type: '', visible: true, width: w * T, x: x * T, y: y * T,
        })),
      ],
    };
    // Sprites: point at the bottom centre of the sprite's feet tiles. A body name (Adam, Alex, Amelia, Bob) is a static
    // character, anything else is a texture of the scene (toilet, bathtub).
    const sprites = {
      draworder: 'topdown', id: 7, name: 'sprites', opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0,
      objects: this.sprites.map((s) => {
        const properties: { name: string; type: string; value: string | number | boolean }[] = [];
        if (s.facing) properties.push({ name: 'facing', type: 'string', value: s.facing });
        if (s.depth !== undefined) properties.push({ name: 'depth', type: 'float', value: s.depth });
        if (s.staff) properties.push({ name: 'staff', type: 'bool', value: true });
        return {
          height: 0, id: oid++, name: s.name, point: true, rotation: 0, type: '', visible: true, width: 0,
          x: (s.x + 0.5 + (s.blocksTo ?? 0) / 2) * T, y: (s.y + 1) * T, ...(properties.length ? { properties } : {}),
        };
      }),
    };
    return {
      backgroundcolor,
      compressionlevel: -1, height: this.h, infinite: false,
      layers: [
        tile('ground', 1, this.ground),
        tile('walls', 2, this.walls),
        tile('furniture', 3, this.furniture),
        tile('above', 4, this.above),
        tile('collision', 5, collision),
        spots,
        sprites,
      ],
      nextlayerid: 8, nextobjectid: oid, orientation: 'orthogonal', renderorder: 'right-down', tiledversion: '1.10.2',
      tileheight: T,
      tilesets: TILESETS.map((t) => ({
        columns: COLS[t.sheet], firstgid: FIRSTGID[t.sheet], image: t.image, imageheight: t.h, imagewidth: t.w,
        margin: 0, name: t.name, spacing: 0, tilecount: COLS[t.sheet] * ROWS[t.sheet], tileheight: T, tilewidth: T,
      })),
      tilewidth: T, type: 'map', version: '1.10', width: this.w,
    };
  }
}

const CEILING = '#342f40';

/** Bane 1, after the owner's sketch (`homayoon_bar_v2`). */
function bar() {
  const m = new Level(20, 14);
  m.floor(1, 3, 18, 12, DARK_WOOD, 3, 1);
  m.wall(1, 18, 1, 13);
  // Toilet room bottom left: ceiling strip on top (door gap at col 2); its right wall (col 3) runs up from row 5.
  m.ceil(1, 8, 3, 8);
  m.ceil(3, 5, 3, 12);
  m.floor(1, 9, 2, 12, TEAL_TILE, 3, 2);
  m.floor(2, 8, 2, 8, TEAL_TILE, 3, 2);
  m.sprite({ name: 'toilet', x: 1, y: 10 });
  m.spot('inngang', 16, 3);
  m.spot('bar', 10, 7);
  m.spot('bord', 11, 9);
  m.spot('toalett', 2, 11);
  m.spot('bar-omrade', 13, 7);
  m.spot('bord-inngang', 17, 5);
  m.spot('sofakrok', 7, 9);
  // Entrance: double door in the top wall, top right. A window by the hallway.
  m.obj('I', 11, 24, 2, 2, 15, 1, false, { layer: 'walls', sort: 0 });
  m.obj('I', 7, 24, 2, 2, 2, 1, false, { layer: 'walls', sort: 0 });
  // U-shaped bar: bottle shelves on the wall, arms down both sides, front counter, the bartender inside.
  [10, 12, 14, 10].forEach((c, i) => m.obj('I', c, 68, 2, 3, 6 + i * 2, 1, true, { aboveRows: 2 }));
  m.obj('I', 4, 10, 1, 3, 5, 3, true);
  m.obj('I', 4, 10, 1, 3, 14, 3, true);
  for (const x of [6, 8, 10, 12]) m.obj('I', 5, 55, 2, 2, x, 5, true);
  m.sprite({ name: 'Bob', x: 9, y: 4, facing: 'down' });
  // Customers: one at the counter, one on a right-wall stool, one on a stool at the bottom tables, one on the sofa.
  m.sprite({ name: 'Adam', x: 8, y: 7, facing: 'up' });
  m.sprite({ name: 'Amelia', x: 17, y: 7, facing: 'left' });
  m.sprite({ name: 'Alex', x: 10, y: 9, facing: 'down' });
  m.sprite({ name: 'Amelia', x: 5, y: 9, facing: 'right' });
  // Couch corner: sofa facing down on top (its back is drawn over the character and does not block, so the
  // hallway on the left stays reachable) joined to a sofa facing right, around a coffee table.
  m.obj('I', 7, 72, 3, 2, 4, 7, true, { aboveRows: 1, sort: 8.5 });
  m.obj('I', 9, 80, 2, 4, 4, 8, true, { aboveRows: 1, sort: 8.6 });
  m.obj('I', 7, 13, 3, 2, 6, 10, true);
  // Two tables against the right wall, a stool at each.
  for (const y of [3, 6]) {
    m.obj('I', 4, 10, 1, 3, 18, y, true);
    m.obj('I', 6, 13, 1, 1, 17, y + 1, true);
  }
  // Three tables against the bottom wall, stools on top.
  for (const x of [9, 12, 15]) {
    m.obj('I', 1, 10, 3, 3, x, 10, true);
    m.obj('I', 6, 13, 1, 1, x, 9, true);
    m.obj('I', 6, 13, 1, 1, x + 1, 9, true);
  }
  m.obj('I', 11, 13, 1, 1, 9, 10, false, { layer: 'above', sort: 99 });
  m.obj('I', 12, 14, 1, 1, 16, 10, false, { layer: 'above', sort: 99 });
  // Corner table bottom right with a stool (in the script the stool sits under the neighbouring table).
  m.obj('I', 4, 10, 1, 3, 18, 10, true);
  m.obj('I', 6, 13, 1, 1, 17, 9, true);
  return m.toTiled(CEILING);
}

/** Bane 2: Eeman in the bank (`eeman_bank`). */
function bank() {
  const m = new Level(16, 10);
  m.floor(1, 3, 14, 8, GREY_FLOOR, 3, 2);
  m.floor(1, 3, 14, 4, HERRING, 3, 2); // staff side behind the counter
  m.wall(1, 14, 1, 17);
  m.floor(7, 9, 8, 9, GREY_FLOOR, 3, 2); // entrance gap
  m.spot('inngang', 7, 9);
  m.spot('skranke', 7, 6);
  m.spot('sofa', 2, 8); // in front of the waiting sofa
  m.spot('plante', 12, 8); // by the right plant
  m.spot('safe', 14, 3); // staff side, next to the grey cabinet; reached through the open column at x = 14
  // Teller counter with glass windows (12 tiles) and the cashiers behind it.
  [[2, 6], [3, 8], [4, 6], [5, 7], [6, 8], [7, 6], [8, 7], [9, 8], [10, 6], [11, 7], [12, 8], [13, 6]].forEach(([x, c]) =>
    m.obj('I', c, 33, 1, 2, x, 4, true),
  );
  // One row up from the script (feet on the staff walkway, not inside the counter), or the counter hides all but their hair.
  m.sprite({ name: 'Amelia', x: 6, y: 3, facing: 'down', staff: true });
  m.sprite({ name: 'Bob', x: 9, y: 3, facing: 'down', staff: true });
  // Lobby: the old man on the sofa side, one customer queuing at the counter, one by the plant.
  m.sprite({ name: 'Bob', x: 4, y: 7, facing: 'left' });
  m.sprite({ name: 'Adam', x: 10, y: 5, facing: 'up' });
  m.sprite({ name: 'Amelia', x: 12, y: 6, facing: 'right' });
  // Safe (the grey cabinet), world map and window on the wall.
  m.obj('I', 12, 40, 1, 2, 13, 2, true);
  m.obj('I', 10, 66, 2, 2, 3, 1, false, { layer: 'walls' });
  m.obj('I', 9, 24, 2, 2, 9, 1, false, { layer: 'walls' });
  // Lobby: rug (walkable), waiting sofa, plants.
  m.obj('I', 3, 42, 3, 2, 6, 6, false, { layer: 'furniture', sort: 0 });
  m.obj('I', 1, 72, 3, 2, 1, 6, true);
  m.obj('I', 13, 44, 2, 2, 13, 7, true, { aboveRows: 1 });
  m.obj('I', 12, 45, 1, 2, 1, 3, true, { aboveRows: 1 });
  return m.toTiled(CEILING);
}

/** Bane 3: Aleksanders hus (`aleksander_house`). Room middles stay open for cages and snakes. */
function house() {
  const m = new Level(20, 14);
  m.floor(1, 3, 8, 6, WOOD_PLANK, 3, 1);
  m.floor(10, 3, 18, 6, HERRING, 3, 2);
  m.floor(1, 10, 8, 12, YELLOW_TILE, 3, 2);
  m.floor(10, 10, 18, 12, TEAL_TILE, 3, 2);
  m.wall(1, 8, 1, 7);
  m.wall(10, 18, 1, 11);
  m.wall(1, 8, 8, 19);
  m.wall(10, 18, 8, 9);
  // Doors between neighbouring rooms.
  m.floor(9, 4, 9, 5, WOOD_PLANK, 3, 1); // soverom <-> stue
  m.floor(4, 7, 5, 9, YELLOW_TILE, 3, 2); // soverom <-> kjokken
  m.floor(13, 7, 14, 9, HERRING, 3, 2); // stue <-> bad
  m.floor(9, 11, 9, 11, YELLOW_TILE, 3, 2); // kjokken <-> bad
  m.spot('stue', 13, 5); // the start
  m.spot('soverom', 5, 5);
  m.spot('kjokken', 6, 11);
  m.spot('bad', 14, 11);
  // Floor where cages may stand (blocked furniture tiles are skipped by the scene).
  m.area('soverom', 3, 4, 6, 3);
  m.area('stue', 10, 4, 9, 3);
  m.area('kjokken', 2, 10, 7, 3);
  m.area('bad', 10, 10, 9, 3);
  // Soverom: bed, window, plant.
  m.obj('I', 0, 0, 3, 5, 1, 1, true);
  m.obj('I', 4, 24, 3, 2, 5, 1, false, { layer: 'walls' });
  m.obj('I', 12, 45, 1, 2, 8, 3, true, { aboveRows: 1 });
  // Stue: sofa, fireplace, bookshelf, palm, rug (walkable).
  m.obj('I', 4, 68, 2, 2, 11, 1, true, { aboveRows: 1 });
  m.obj('I', 5, 14, 2, 2, 14, 1, true, { aboveRows: 1 });
  m.obj('I', 7, 72, 3, 2, 15, 4, true, { aboveRows: 1 });
  m.obj('I', 0, 42, 3, 2, 11, 4, false, { layer: 'furniture', sort: 0 });
  m.obj('I', 13, 44, 2, 2, 17, 3, true, { aboveRows: 1 });
  // Kjokken: fridge, counters with fruit, table.
  m.obj('I', 12, 40, 1, 2, 1, 8, true);
  m.obj('I', 3, 55, 2, 2, 2, 9, true, { aboveRows: 1 });
  m.obj('I', 5, 55, 2, 2, 6, 9, true, { aboveRows: 1 });
  m.obj('I', 0, 53, 1, 1, 6, 9, false, { layer: 'above', sort: 50 });
  m.obj('I', 7, 13, 3, 2, 2, 11, true);
  // Bad: mirror, toilet and bathtub (custom sprites).
  m.obj('I', 3, 66, 1, 2, 16, 8, false, { layer: 'walls' });
  m.sprite({ name: 'toilet', x: 17, y: 10 });
  m.sprite({ name: 'bathtub', x: 10, y: 12, blocksTo: 1 });
  return m.toTiled(CEILING);
}

mkdirSync(OUT, { recursive: true });
for (const [name, map] of [['homayoon-bar', bar()], ['eeman-bank', bank()], ['aleksander-house', house()]] as const) {
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(map));
}
console.log('LimeZu maps written to', OUT);
