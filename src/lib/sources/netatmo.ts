import type { StationRecord } from './types';

interface NetatmoDeviceRaw {
  _id: string;
  place: {
    location: [number, number]; // [lon, lat]
    city?: string;
  };
  measures: Record<string, {
    rain_60min?: number;
    rain_24h?: number;
    rain_timeutc?: number;
  }>;
}

export function transformNetatmoDevice(raw: NetatmoDeviceRaw): StationRecord {
  const [lon, lat] = raw.place.location;
  const measureValues = Object.values(raw.measures)[0];

  return {
    external_id: raw._id,
    name: raw.place.city ? `Netatmo ${raw.place.city}` : `Netatmo ${raw._id.slice(-6)}`,
    latitude: lat,
    longitude: lon,
    municipality: raw.place.city,
    operator: 'Netatmo',
    sensor_type: 'Netatmo regenmodule',
    metadata: {},
    measurement: measureValues ? {
      measured_at: measureValues.rain_timeutc
        ? new Date(measureValues.rain_timeutc * 1000).toISOString()
        : new Date().toISOString(),
      rainfall_mm: measureValues.rain_60min,
      rainfall_period: '1h',
      raw_data: { rain_24h: measureValues.rain_24h },
    } : undefined,
  };
}
