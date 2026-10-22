/**
 * Generates the placeholder Tiled maps and their tileset PNG into public/maps.
 * Run: npx tsx scripts/make-maps.ts
 * The owner's real maps replace these files; the contract is a `collision` tile layer
 * and a `spots` object layer with named points.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const T = 16;
const OUT = 'public/maps';

// Tile ids (1-based, as in Tiled). 0 = empty.
const FLOOR = 1, WALL = 2, COUNTER = 3, STOOL = 4, TABLE = 5, TOILET = 6, BED = 7, SOFA = 8, BATH = 9, KITCHEN = 10, MAT = 11, BANKC = 12, CARPET = 13;
const SOLID = new Set([WALL, COUNTER, STOOL, TABLE, TOILET, BED, SOFA, BATH, KITCHEN, BANKC]);
const COLS = 8;
const TILE_COUNT = 16;

// ---------- tileset PNG ----------

const colors: Record<number, [number, number, number]> = {
  [FLOOR]: [196, 164, 120], [WALL]: [90, 70, 60], [COUNTER]: [120, 72, 40], [STOOL]: [200, 60, 60], [TABLE]: [150, 100, 60],
  [TOILET]: [235, 235, 240], [BED]: [90, 120, 200], [SOFA]: [160, 80, 140], [BATH]: [170, 215, 230], [KITCHEN]: [190, 190, 195],
  [MAT]: [140, 60, 60], [BANKC]: [70, 110, 90], [CARPET]: [120, 140, 170],
};

function tilesetPng(): Buffer {
  const w = COLS * T;
  const h = Math.ceil(TILE_COUNT / COLS) * T;
  const px = Buffer.alloc(w * h * 4);
  const put = (x: number, y: number, c: [number, number, number], a = 255) => {
    const i = (y * w + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = a;
  };
  for (let id = 1; id <= TILE_COUNT; id++) {
    const base = colors[id];
    if (!base) continue;
    const ox = ((id - 1) % COLS) * T;
    const oy = Math.floor((id - 1) / COLS) * T;
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const edge = x === 0 || y === 0 || x === T - 1 || y === T - 1;
        const shade = edge ? -25 : (x + y) % 7 === 0 ? 8 : 0;
        const inset = x > 3 && x < 12 && y > 3 && y < 12;
        const c = base.map((v) => Math.max(0, Math.min(255, v + shade + (inset && (id === STOOL || id === TOILET || id === BED) ? 25 : 0)))) as [number, number, number];
        put(ox + x, oy + y, c);
      }
    }
  }
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- maps ----------

class Grid {
  ground: number[];
  furniture: number[];
  constructor(readonly w: number, readonly h: number) {
    this.ground = new Array(w * h).fill(FLOOR);
    this.furniture = new Array(w * h).fill(0);
  }
  set(x: number, y: number, id: number) {
    if (id === WALL || SOLID.has(id) || id === MAT || id === CARPET) this.furniture[y * this.w + x] = id;
    else this.ground[y * this.w + x] = id;
  }
  rect(x0: number, y0: number, x1: number, y1: number, id: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, id);
  }
  border(id: number) {
    this.rect(0, 0, this.w - 1, 0, id);
    this.rect(0, this.h - 1, this.w - 1, this.h - 1, id);
    this.rect(0, 0, 0, this.h - 1, id);
    this.rect(this.w - 1, 0, this.w - 1, this.h - 1, id);
  }
  /** Walkable decoration (mat, carpet) lives on the ground layer so it never blocks. */
  floor(x: number, y: number, id: number) {
    this.ground[y * this.w + x] = id;
    this.furniture[y * this.w + x] = 0;
  }
}

type Spots = Record<string, [number, number]>;

function toMap(g: Grid, spots: Spots) {
  const collision = g.furniture.map((id) => (SOLID.has(id) ? 1 : 0));
  const tile = (name: string, id: number, data: number[]) => ({
    data, height: g.h, id, name, opacity: 1, type: 'tilelayer', visible: name !== 'collision', width: g.w, x: 0, y: 0,
  });
  let oid = 1;
  return {
    compressionlevel: -1, height: g.h, infinite: false,
    layers: [
      tile('ground', 1, g.ground),
      tile('furniture', 2, g.furniture),
      tile('collision', 3, collision),
      {
        draworder: 'topdown', id: 4, name: 'spots', opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0,
        objects: Object.entries(spots).map(([name, [x, y]]) => ({
          height: 0, id: oid++, name, point: true, rotation: 0, type: '', visible: true, width: 0, x: x * T + T / 2, y: y * T + T / 2,
        })),
      },
    ],
    nextlayerid: 5, nextobjectid: oid, orientation: 'orthogonal', renderorder: 'right-down', tiledversion: '1.10.2',
    tileheight: T, tilesets: [{
      columns: COLS, firstgid: 1, image: 'placeholder.png', imageheight: Math.ceil(TILE_COUNT / COLS) * T, imagewidth: COLS * T,
      margin: 0, name: 'placeholder', spacing: 0, tilecount: TILE_COUNT, tileheight: T, tilewidth: T,
    }],
    tilewidth: T, type: 'map', version: '1.10', width: g.w,
  };
}

/** Only what the owner described: entrance, bar counter with stools, tables, toilet. */
function bar() {
  const g = new Grid(20, 12);
  g.border(WALL);
  g.rect(1, 1, 9, 1, COUNTER);
  for (const x of [2, 4, 6, 8]) g.set(x, 2, STOOL);
  g.rect(14, 1, 14, 4, WALL);
  g.rect(15, 4, 18, 4, WALL);
  g.floor(16, 4, FLOOR);
  g.furniture[4 * 20 + 16] = 0;
  g.set(17, 1, TOILET);
  g.rect(3, 7, 4, 7, TABLE);
  g.rect(11, 7, 12, 7, TABLE);
  g.rect(3, 9, 4, 9, TABLE);
  g.rect(11, 9, 12, 9, TABLE);
  g.furniture[11 * 20 + 9] = 0;
  g.furniture[11 * 20 + 10] = 0;
  g.floor(9, 11, MAT);
  g.floor(10, 11, MAT);
  return toMap(g, { inngang: [9, 10], bar: [5, 3], bord: [7, 8], toalett: [16, 2], 'bar-omrade': [7, 5], 'bord-inngang': [13, 8], sofakrok: [1, 6] });
}

/** Rooms are placeholders until the owner's map exists. */
function house() {
  const g = new Grid(20, 14);
  g.border(WALL);
  g.rect(10, 0, 10, 13, WALL);
  g.rect(0, 7, 19, 7, WALL);
  for (const [x, y] of [[10, 3], [10, 10], [4, 7], [15, 7]]) g.furniture[y * 20 + x] = 0;
  g.rect(1, 1, 2, 2, BED);
  g.rect(12, 1, 15, 1, SOFA);
  g.rect(1, 8, 6, 8, KITCHEN);
  g.rect(12, 12, 13, 12, BATH);
  return toMap(g, { stue: [14, 4], soverom: [5, 4], kjokken: [5, 10], bad: [15, 10] });
}

function bank() {
  const g = new Grid(16, 10);
  g.border(WALL);
  g.rect(2, 2, 13, 2, BANKC);
  g.furniture[2 * 16 + 7] = 0;
  g.furniture[2 * 16 + 8] = 0;
  g.furniture[9 * 16 + 7] = 0;
  g.furniture[9 * 16 + 8] = 0;
  g.floor(7, 9, MAT);
  g.floor(8, 9, MAT);
  return toMap(g, { inngang: [7, 8], skranke: [7, 3], sofa: [2, 6], plante: [13, 6], safe: [14, 1] });
}

/** Writes the placeholder twin; the main file starts identical and is replaced by the LimeZu map later. */
function writeMap(name: string, map: unknown): void {
  const json = JSON.stringify(map);
  writeFileSync(`${OUT}/${name}.placeholder.json`, json);
  writeFileSync(`${OUT}/${name}.json`, json);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/placeholder.png`, tilesetPng());
writeMap('homayoon-bar', bar());
writeMap('aleksander-house', house());
writeMap('eeman-bank', bank());
console.log('Maps written to', OUT);
