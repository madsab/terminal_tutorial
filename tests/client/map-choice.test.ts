import { describe, expect, test } from 'vitest';
import { chooseMap, tilesetUrlPath } from '../../src/client/scene/map-choice.js';

describe('chooseMap', () => {
  test('keeps the map when every tileset loaded', () => {
    expect(chooseMap('homayoon-bar.json', new Set())).toBe('homayoon-bar.json');
  });

  test('uses the placeholder twin when a tileset is missing', () => {
    expect(chooseMap('homayoon-bar.json', new Set(['Interiors_free_16x16']))).toBe('homayoon-bar.placeholder.json');
    expect(chooseMap('eeman-bank.json', new Set(['a', 'b']))).toBe('eeman-bank.placeholder.json');
  });
});

describe('tilesetUrlPath', () => {
  test('keeps the folders below limezu/', () => {
    expect(tilesetUrlPath('../local-assets/limezu/Interiors_free/16x16/Interiors_free_16x16.png')).toBe(
      'local-assets/limezu/Interiors_free/16x16/Interiors_free_16x16.png',
    );
  });

  test('a bare file name is looked up directly below limezu/', () => {
    expect(tilesetUrlPath('tiles.png')).toBe('local-assets/limezu/tiles.png');
  });

  test('the placeholder tileset sits next to the maps', () => {
    expect(tilesetUrlPath('placeholder.png', true)).toBe('maps/placeholder.png');
  });
});
