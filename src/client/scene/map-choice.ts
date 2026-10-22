/** The placeholder twin of a map file: `homayoon-bar.json` -> `homayoon-bar.placeholder.json`. */
export function placeholderTwin(map: string): string {
  return map.replace(/\.json$/, '.placeholder.json');
}

/** The map itself when every tileset loaded, otherwise its placeholder twin (drawn with the generated tileset). */
export function chooseMap(map: string, missingTilesets: ReadonlySet<string>): string {
  return missingTilesets.size === 0 ? map : placeholderTwin(map);
}

/**
 * Where a tileset image is served from, relative to the page. LimeZu sheets keep their folders below `limezu/`
 * (`…/limezu/Interiors_free/16x16/x.png` -> `local-assets/limezu/Interiors_free/16x16/x.png`).
 */
export function tilesetUrlPath(image: string, placeholder = false): string {
  if (placeholder) return `maps/${image.split('/').pop()}`;
  const i = image.lastIndexOf('limezu/');
  const below = i >= 0 ? image.slice(i + 'limezu/'.length) : image.split('/').pop()!;
  return `local-assets/limezu/${below}`;
}
