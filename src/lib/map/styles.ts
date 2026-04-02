import type { StyleSpecification } from 'maplibre-gl';

// OpenFreeMap styles — free, no API key, no limits
export const MAP_STYLES = {
  standaard: 'https://tiles.openfreemap.org/styles/liberty',
  licht: 'https://tiles.openfreemap.org/styles/bright',
  donker: 'https://tiles.openfreemap.org/styles/dark',
  satelliet: 'https://tiles.openfreemap.org/styles/liberty',
} as const;

export type MapStyleKey = keyof typeof MAP_STYLES;

// Cache fetched styles to avoid re-fetching
const styleCache: Partial<Record<MapStyleKey, StyleSpecification>> = {};

/**
 * Fetch and return a style object with projection set.
 * MapLibre GL v5 requires projection in the style; OpenFreeMap styles
 * don't include it, causing "this.style.projection" errors.
 */
export async function fetchMapStyle(style: MapStyleKey): Promise<StyleSpecification> {
  if (styleCache[style]) return styleCache[style];

  const resp = await fetch(MAP_STYLES[style]);
  const json = await resp.json() as StyleSpecification;
  // Ensure projection is set for MapLibre v5 compatibility
  if (!json.projection) {
    json.projection = { type: 'mercator' };
  }
  styleCache[style] = json;
  return json;
}

export function getMapStyleUrl(style: MapStyleKey): string {
  return MAP_STYLES[style];
}
