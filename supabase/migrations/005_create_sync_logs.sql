CREATE TABLE sync_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_key      TEXT NOT NULL REFERENCES data_sources(source_key),
  started_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          TEXT DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'error')),
  stations_synced INTEGER DEFAULT 0,
  measurements_synced INTEGER DEFAULT 0,
  error_message   TEXT,
  duration_ms     INTEGER
);

CREATE INDEX idx_sync_logs_source ON sync_logs (source_key, started_at DESC);
