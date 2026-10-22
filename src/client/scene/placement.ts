import type { Point, Rect } from './map-data.js';

/** The key a tile has in the `taken` set. */
export const tileKey = (p: Point) => `${p.x},${p.y}`;

/** `area` as a 5 x 3 box of tiles around `spot`, for rooms without a `<spot>-area` object. */
export const defaultArea = (spot: Point): Rect => ({ x: spot.x - 2, y: spot.y - 1, w: 5, h: 3 });

/**
 * The walkable, untaken tile in `area` nearest to `spot` (Manhattan distance, ties broken by row, then column).
 * Tiles outside the map count as blocked. Returns null when nothing is free.
 */
export function nextFreeTile(area: Rect, spot: Point, taken: ReadonlySet<string>, blocked: boolean[][]): Point | null {
  let best: Point | null = null;
  let bestDist = Infinity;
  for (let y = area.y; y < area.y + area.h; y++) {
    for (let x = area.x; x < area.x + area.w; x++) {
      if (blocked[y]?.[x] !== false || taken.has(tileKey({ x, y }))) continue;
      const dist = Math.abs(x - spot.x) + Math.abs(y - spot.y);
      // Rows and columns are visited in order, so a strict `<` keeps the first (row, then column) of equal tiles.
      if (dist < bestDist) {
        best = { x, y };
        bestDist = dist;
      }
    }
  }
  return best;
}
