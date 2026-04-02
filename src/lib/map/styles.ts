// OpenFreeMap styles — free, no API key, no limits
export const MAP_STYLES = {
  standaard: 'https://tiles.openfreemap.org/styles/liberty',
  licht: 'https://tiles.openfreemap.org/styles/bright',
  donker: 'https://tiles.openfreemap.org/styles/dark',
  satelliet: 'https://tiles.openfreemap.org/styles/liberty',
} as const;

export type MapStyleKey = keyof typeof MAP_STYLES;
