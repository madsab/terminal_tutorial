import type { SpriteObject } from './map-data.js';

const BODIES = ['Adam', 'Alex', 'Amelia', 'Bob'];

/** The body characters who run out when the bank is robbed: everyone except the staff. */
export function fleeing(sprites: SpriteObject[]): SpriteObject[] {
  return sprites.filter((s) => BODIES.includes(s.name) && !s.staff);
}
