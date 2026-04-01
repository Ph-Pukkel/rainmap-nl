export const MAP_STYLES = {
  standaard: 'https://api.maptiler.com/maps/streets-v2/style.json?key={key}',
  licht: 'https://api.maptiler.com/maps/dataviz-light/style.json?key={key}',
  donker: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key={key}',
  satelliet: 'https://api.maptiler.com/maps/hybrid/style.json?key={key}',
} as const;

export type MapStyleKey = keyof typeof MAP_STYLES;

export function getMapStyleUrl(style: MapStyleKey): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || '';
  return MAP_STYLES[style].replace('{key}', key);
}
