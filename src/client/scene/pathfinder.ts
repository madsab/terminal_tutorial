import EasyStar from 'easystarjs';
import type { Point } from './map-data.js';

/** Shortest walkable path (4-neighbour) including the start, or null when unreachable. */
export function findPath(blocked: boolean[][], from: Point, to: Point): Promise<Point[] | null> {
  const es = new EasyStar.js();
  es.setGrid(blocked.map((row) => row.map((b) => (b ? 1 : 0))));
  es.setAcceptableTiles([0]);
  es.enableSync();
  return new Promise((resolve) => {
    es.findPath(from.x, from.y, to.x, to.y, (path) => resolve(path));
    es.calculate();
  });
}
