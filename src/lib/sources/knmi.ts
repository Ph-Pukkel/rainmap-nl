import type { StationRecord } from './types';

const KNMI_BASE_URL = 'https://api.dataplatform.knmi.nl/open-data/v1/';

interface KNMIStationRaw {
  stationcode: string;
  stationname: string;
  lat: number;
  lon: number;
  alt: number;
  municipality?: string;
  province?: string;
}

export function transformKNMIStation(raw: KNMIStationRaw): StationRecord {
  return {
    external_id: raw.stationcode,
    name: raw.stationname,
    latitude: raw.lat,
    longitude: raw.lon,
    elevation_m: raw.alt,
    municipality: raw.municipality,
    province: raw.province,
    operator: 'KNMI',
    sensor_type: 'Automatisch weerstation',
    metadata: {},
  };
}

export function getKNMIApiHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': apiKey,
    'Content-Type': 'application/json',
  };
}

export { KNMI_BASE_URL };
