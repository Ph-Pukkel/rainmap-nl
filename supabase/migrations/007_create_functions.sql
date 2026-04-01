CREATE OR REPLACE FUNCTION get_stations_geojson(source_keys TEXT[] DEFAULT NULL)
RETURNS JSON AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(
      json_build_object(
        'type', 'Feature',
        'geometry', json_build_object(
          'type', 'Point',
          'coordinates', json_build_array(s.longitude, s.latitude)
        ),
        'properties', json_build_object(
          'id', s.id,
          'source_key', s.source_key,
          'external_id', s.external_id,
          'name', s.name,
          'municipality', s.municipality,
          'province', s.province,
          'operator', s.operator,
          'sensor_type', s.sensor_type,
          'source_display_name', s.source_display_name,
          'source_type', s.source_type,
          'source_color', s.source_color,
          'icon_marker', s.icon_marker,
          'latest_rainfall_mm', s.latest_rainfall_mm,
          'latest_rainfall_period', s.latest_rainfall_period,
          'latest_measured_at', s.latest_measured_at,
          'latest_temperature_c', s.latest_temperature_c
        )
      )
    ), '[]'::json)
  )
  FROM stations_with_latest s
  WHERE (source_keys IS NULL OR s.source_key = ANY(source_keys));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION search_stations(search_query TEXT, result_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  name TEXT,
  municipality TEXT,
  province TEXT,
  source_key TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  rank REAL
) AS $$
  SELECT
    s.id, s.name, s.municipality, s.province, s.source_key,
    s.latitude, s.longitude,
    ts_rank(to_tsvector('dutch', COALESCE(s.name, '') || ' ' || COALESCE(s.municipality, '') || ' ' || COALESCE(s.province, '')),
            plainto_tsquery('dutch', search_query)) AS rank
  FROM stations s
  WHERE to_tsvector('dutch', COALESCE(s.name, '') || ' ' || COALESCE(s.municipality, '') || ' ' || COALESCE(s.province, ''))
        @@ plainto_tsquery('dutch', search_query)
    OR s.name ILIKE '%' || search_query || '%'
    OR s.municipality ILIKE '%' || search_query || '%'
    OR s.external_id ILIKE '%' || search_query || '%'
  ORDER BY rank DESC
  LIMIT result_limit;
$$ LANGUAGE sql STABLE;
