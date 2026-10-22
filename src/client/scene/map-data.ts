export interface Point {
  x: number;
  y: number;
}

/** A rectangle in tile coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapData {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  /** Named points in tile coordinates. */
  spots: Record<string, Point>;
  /** Optional `<spot>-area` rectangles of the `spots` layer: where things spawned at that spot may spread out. */
  areas: Record<string, Rect>;
  /** blocked[y][x]: true where the collision layer has a tile. */
  blocked: boolean[][];
  /** filled[y][x]: true where any drawn tile layer (not the invisible collision one) has a tile, so the empty outer ring can be cropped away. */
  filled: boolean[][];
  /** Names of the tile layers present, so optional ones (walls, above) can be skipped when absent. */
  tileLayers: string[];
  /** Objects of the optional `sprites` layer: custom textures (toilet, bathtub) or static characters (Bob, Amelia). */
  sprites: SpriteObject[];
}

/**
 * A point at the bottom centre of the sprite's feet tile, in pixels. `name` is a texture of the scene
 * or a LimeZu body (Adam, Alex, Amelia, Bob), which draws that character standing still.
 */
export interface SpriteObject {
  name: string;
  x: number;
  y: number;
  facing?: 'right' | 'up' | 'left' | 'down';
  depth?: number;
  /** True for bank staff: they stay when the bank is robbed. */
  staff?: boolean;
  /** Marks a character a task can single out, e.g. `girl` (see the `girl-flee` play). */
  role?: string;
}

interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: { name: string; x: number; y: number; width?: number; height?: number; properties?: { name: string; value: unknown }[] }[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
}

/** Reads what the scene needs from a Tiled JSON map: the `spots` object layer and the `collision` tile layer. */
export function parseMap(json: TiledMap): MapData {
  const collision = json.layers.find((l) => l.name === 'collision' && l.type === 'tilelayer');
  const spotsLayer = json.layers.find((l) => l.name === 'spots' && l.type === 'objectgroup');
  const spritesLayer = json.layers.find((l) => l.name === 'sprites' && l.type === 'objectgroup');
  const blocked = Array.from({ length: json.height }, (_, y) =>
    Array.from({ length: json.width }, (_, x) => (collision?.data?.[y * json.width + x] ?? 0) !== 0),
  );
  const tileLayers = json.layers.filter((l) => l.type === 'tilelayer');
  const filled = Array.from({ length: json.height }, (_, y) =>
    Array.from({ length: json.width }, (_, x) => tileLayers.some((l) => l.name !== 'collision' && (l.data?.[y * json.width + x] ?? 0) !== 0)),
  );
  const spots: Record<string, Point> = {};
  const areas: Record<string, Rect> = {};
  for (const o of spotsLayer?.objects ?? []) {
    if (o.name.endsWith('-area')) {
      const x = Math.floor(o.x / json.tilewidth);
      const y = Math.floor(o.y / json.tileheight);
      areas[o.name.slice(0, -'-area'.length)] = {
        x, y,
        w: Math.max(1, Math.ceil(((o.width ?? 0) + o.x - x * json.tilewidth) / json.tilewidth)),
        h: Math.max(1, Math.ceil(((o.height ?? 0) + o.y - y * json.tileheight) / json.tileheight)),
      };
    } else spots[o.name] = { x: Math.floor(o.x / json.tilewidth), y: Math.floor(o.y / json.tileheight) };
  }
  const sprites: SpriteObject[] = (spritesLayer?.objects ?? []).map((o) => {
    const prop = (n: string) => o.properties?.find((p) => p.name === n)?.value;
    const facing = prop('facing');
    const depth = prop('depth');
    const staff = prop('staff');
    const role = prop('role');
    return {
      name: o.name, x: o.x, y: o.y,
      ...(typeof facing === 'string' ? { facing: facing as SpriteObject['facing'] } : {}),
      ...(typeof depth === 'number' ? { depth } : {}),
      ...(staff === true ? { staff } : {}),
      ...(typeof role === 'string' ? { role } : {}),
    };
  });
  return { width: json.width, height: json.height, tileWidth: json.tilewidth, tileHeight: json.tileheight, spots, areas, blocked, filled, tileLayers: tileLayers.map((l) => l.name), sprites };
}

/**
 * The tight box of non-empty tiles over all tile layers. No extra margin: every real map keeps a one tile
 * empty ring, so a margin would put the bounds back at the full map and crop nothing.
 */
export function contentBounds(data: Pick<MapData, 'width' | 'height' | 'filled'>): Rect {
  let x0 = data.width, y0 = data.height, x1 = -1, y1 = -1;
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      if (!data.filled[y]?.[x]) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: data.width, h: data.height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The largest zoom (at least 1, fractions allowed) at which `bounds` fit in the host, and the scroll that centres them. */
export function fitView(host: { w: number; h: number }, bounds: Rect, tile: number): { zoom: number; scrollX: number; scrollY: number } {
  const zoom = Math.max(1, Math.min(host.w / (bounds.w * tile), host.h / (bounds.h * tile)));
  return {
    zoom,
    scrollX: (bounds.x + bounds.w / 2) * tile - host.w / 2,
    scrollY: (bounds.y + bounds.h / 2) * tile - host.h / 2,
  };
}
