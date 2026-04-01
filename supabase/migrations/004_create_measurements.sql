CREATE TABLE measurements (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id      UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  source_key      TEXT NOT NULL,
  measured_at     TIMESTAMPTZ NOT NULL,
  rainfall_mm     DOUBLE PRECISION,
  rainfall_period TEXT,
  temperature_c   DOUBLE PRECISION,
  raw_data        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(station_id, measured_at, rainfall_period)
);

CREATE INDEX idx_measurements_recent ON measurements (station_id, measured_at DESC);
