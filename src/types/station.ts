export interface Station {
  id: string;
  source_key: string;
  external_id: string;
  name: string;
  latitude: number;
  longitude: number;
  municipality: string | null;
  province: string | null;
  operator: string | null;
  sensor_type: string | null;
  elevation_m: number | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface StationWithLatest extends Station {
  source_display_name: string;
  source_type: string;
  source_color: string;
  icon_marker: string;
  latest_rainfall_mm: number | null;
  latest_rainfall_period: string | null;
  latest_measured_at: string | null;
  latest_temperature_c: number | null;
}
