import { STATIONS } from './stations';
import { DATA_SOURCES } from './sources';
import type { Station, StationFeatureCollection, StationWithLatest } from '@/types';

/**
 * Get all stations as a GeoJSON FeatureCollection,
 * optionally filtered by source keys
 */
export function getStationsGeoJSON(sourceKeys?: string[]): StationFeatureCollection {
  let filtered = STATIONS;

  if (sourceKeys && sourceKeys.length > 0) {
    filtered = STATIONS.filter(station => sourceKeys.includes(station.source_key));
  }

  return {
    type: 'FeatureCollection',
    features: filtered.map(station => {
      const source = DATA_SOURCES.find(s => s.source_key === station.source_key);
      const properties: StationWithLatest = {
        ...station,
        source_display_name: source?.display_name || station.source_key,
        source_type: source?.source_type || 'professioneel',
        source_color: source?.color || '#888888',
        icon_marker: source?.icon_marker || 'circle',
        latest_rainfall_mm: null,
        latest_rainfall_period: null,
        latest_measured_at: null,
        latest_temperature_c: null,
      };
      return {
        type: 'Feature' as const,
        properties,
        geometry: {
          type: 'Point' as const,
          coordinates: [station.longitude, station.latitude],
        },
      };
    }),
  };
}

/**
 * Search stations by query string (name, municipality, province)
 */
export function searchStations(query: string, limit: number = 10) {
  if (query.length < 2) return [];

  const q = query.toLowerCase();
  const results = STATIONS.filter(station => {
    const name = station.name?.toLowerCase() || '';
    const municipality = station.municipality?.toLowerCase() || '';
    const province = station.province?.toLowerCase() || '';
    return name.includes(q) || municipality.includes(q) || province.includes(q);
  });

  return results.slice(0, limit).map((station, index) => ({
    id: station.id,
    name: station.name,
    municipality: station.municipality,
    province: station.province,
    source_key: station.source_key,
    latitude: station.latitude,
    longitude: station.longitude,
    rank: index,
  }));
}

/**
 * Get a single station by ID with source display info
 */
export function getStationById(id: string) {
  const station = STATIONS.find(s => s.id === id);
  if (!station) return null;

  const source = DATA_SOURCES.find(s => s.source_key === station.source_key);

  return {
    ...station,
    source_display_name: source?.display_name || station.source_key,
    source_type: source?.source_type || 'professioneel',
    source_color: source?.color || '#888888',
    icon_marker: source?.icon_marker || 'circle',
    // These would come from live data in a real app
    latest_rainfall_mm: null,
    latest_rainfall_period: null,
    latest_measured_at: null,
    latest_temperature_c: null,
  };
}

/**
 * Get station count by source key
 */
export function getStationCountBySource(sourceKey: string): number {
  return STATIONS.filter(s => s.source_key === sourceKey).length;
}

/**
 * Export data sources with calculated station counts
 */
export function getDataSources() {
  return DATA_SOURCES.map(source => ({
    ...source,
    station_count: getStationCountBySource(source.source_key),
  }));
}
