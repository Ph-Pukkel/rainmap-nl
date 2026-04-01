export type RainfallPeriod = '10min' | '1h' | '24h' | 'cumulative';

export interface Measurement {
  id: string;
  station_id: string;
  source_key: string;
  measured_at: string;
  rainfall_mm: number | null;
  rainfall_period: RainfallPeriod | null;
  temperature_c: number | null;
  raw_data: Record<string, unknown>;
  created_at: string;
}
