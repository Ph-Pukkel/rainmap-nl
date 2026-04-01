CREATE TABLE stations (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_key        TEXT NOT NULL REFERENCES data_sources(source_key) ON DELETE CASCADE,
  external_id       TEXT NOT NULL,
  name              TEXT NOT NULL,
  location          GEOGRAPHY(Point, 4326) NOT NULL,
  latitude          DOUBLE PRECISION NOT NULL,
  longitude         DOUBLE PRECISION NOT NULL,
  municipality      TEXT,
  province          TEXT,
  operator          TEXT,
  sensor_type       TEXT,
  elevation_m       DOUBLE PRECISION,
  is_active         BOOLEAN DEFAULT true,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(source_key, external_id)
);

CREATE INDEX idx_stations_location ON stations USING GIST (location);
CREATE INDEX idx_stations_source ON stations (source_key);
CREATE INDEX idx_stations_name_search ON stations USING GIN (to_tsvector('dutch', name));
CREATE INDEX idx_stations_municipality ON stations (municipality);
