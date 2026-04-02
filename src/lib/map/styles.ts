const MAPTILER_STYLES = {
  standaard: 'https://api.maptiler.com/maps/streets-v2/style.json?key={key}',
  licht: 'https://api.maptiler.com/maps/dataviz-light/style.json?key={key}',
  donker: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key={key}',
  satelliet: 'https://api.maptiler.com/maps/hybrid/style.json?key={key}',
} as const;

// Free fallback styles (no API key needed)
const FREE_STYLES = {
  standaard: 'https://tiles.openfreemap.org/styles/liberty',
  licht: 'https://tiles.openfreemap.org/styles/bright',
  donker: 'https://tiles.openfreemap.org/styles/dark',
  satelliet: 'https://tiles.openfreemap.org/styles/liberty',
} as const;

export const MAP_STYLES = MAPTILER_STYLES;

export type MapStyleKey = keyof typeof MAP_STYLES;

let _maptilerKeyValid: boolean | null = null;

export function getMapStyleUrl(style: MapStyleKey): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || '';

  // If no key or we already know it's invalid, use free tiles
  if (!key || _maptilerKeyValid === false) {
    return FREE_STYLES[style];
  }

  return MAPTILER_STYLES[style].replace('{key}', key);
}

// Validate the MapTiler key once on first load and switch to free tiles if invalid
export async function validateMapTilerKey(): Promise<boolean> {
  if (_maptilerKeyValid !== null) return _maptilerKeyValid;

  const key = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || '';
  if (!key) {
    _maptilerKeyValid = false;
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(
      `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`,
      { method: 'HEAD', signal: controller.signal }
    );
    clearTimeout(timeout);
    _maptilerKeyValid = resp.ok;
  } catch {
    _maptilerKeyValid = false;
  }

  return _maptilerKeyValid;
}
