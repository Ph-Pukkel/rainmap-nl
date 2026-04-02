export const DEFAULT_CENTER: [number, number] = [5.2913, 52.1326];
export const DEFAULT_ZOOM = 7;

// Map styles are defined in src/lib/map/styles.ts (with free-tile fallback).
// Re-export for backwards compatibility.
export { MAP_STYLES, getMapStyleUrl } from '@/lib/map/styles';
export type { MapStyleKey } from '@/lib/map/styles';

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
