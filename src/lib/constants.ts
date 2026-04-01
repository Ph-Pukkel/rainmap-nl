export const DEFAULT_CENTER: [number, number] = [5.2913, 52.1326];
export const DEFAULT_ZOOM = 7;

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

export const CLUSTER_CONFIG: Record<string, { cluster: boolean; clusterMaxZoom: number; clusterRadius: number }> = {
  knmi_aws:      { cluster: false, clusterMaxZoom: 14, clusterRadius: 50 },
  knmi_neerslag: { cluster: true,  clusterMaxZoom: 12, clusterRadius: 50 },
  rws_waterinfo: { cluster: true,  clusterMaxZoom: 12, clusterRadius: 50 },
  waterschappen: { cluster: true,  clusterMaxZoom: 12, clusterRadius: 50 },
  wow_nl:        { cluster: true,  clusterMaxZoom: 14, clusterRadius: 60 },
  netatmo:       { cluster: true,  clusterMaxZoom: 15, clusterRadius: 80 },
  agro:          { cluster: false, clusterMaxZoom: 14, clusterRadius: 50 },
};

export const SOURCE_KEYS = [
  'knmi_aws',
  'knmi_neerslag',
  'rws_waterinfo',
  'waterschappen',
  'wow_nl',
  'netatmo',
  'agro',
] as const;

export type SourceKey = (typeof SOURCE_KEYS)[number];
