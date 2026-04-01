import type { StationRecord } from './types';

interface WOWSiteRaw {
  site_id: string;
  name?: string;
  naam?: string;
  lat: number;
  lon: number;
  type_station?: string;
  laatste_neerslag?: number;
  timestamp?: string;
}

export function transformWOWStation(raw: WOWSiteRaw): StationRecord {
  return {
    external_id: raw.site_id,
    name: raw.naam || raw.name || `WOW Station ${raw.site_id}`,
    latitude: raw.lat,
    longitude: raw.lon,
    sensor_type: raw.type_station || 'Amateur weerstation',
    operator: 'WOW-NL',
    metadata: {},
    measurement: raw.laatste_neerslag !== undefined ? {
      measured_at: raw.timestamp || new Date().toISOString(),
      rainfall_mm: raw.laatste_neerslag,
      rainfall_period: '1h',
    } : undefined,
  };
}
