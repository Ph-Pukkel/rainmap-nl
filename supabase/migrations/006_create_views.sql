CREATE OR REPLACE VIEW stations_with_latest AS
SELECT
  s.id,
  s.source_key,
  s.external_id,
  s.name,
  s.latitude,
  s.longitude,
  s.municipality,
  s.province,
  s.operator,
  s.sensor_type,
  s.elevation_m,
  s.is_active,
  s.metadata,
  ds.display_name AS source_display_name,
  ds.source_type,
  ds.color AS source_color,
  ds.icon_marker,
  m.rainfall_mm AS latest_rainfall_mm,
  m.rainfall_period AS latest_rainfall_period,
  m.measured_at AS latest_measured_at,
  m.temperature_c AS latest_temperature_c
FROM stations s
JOIN data_sources ds ON s.source_key = ds.source_key
LEFT JOIN LATERAL (
  SELECT rainfall_mm, rainfall_period, measured_at, temperature_c
  FROM measurements
  WHERE station_id = s.id
  ORDER BY measured_at DESC
  LIMIT 1
) m ON true
WHERE s.is_active = true;
