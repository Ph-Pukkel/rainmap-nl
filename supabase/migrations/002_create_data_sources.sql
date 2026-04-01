CREATE TABLE data_sources (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_key      TEXT UNIQUE NOT NULL,
  display_name    TEXT NOT NULL,
  description     TEXT,
  source_type     TEXT NOT NULL
    CHECK (source_type IN ('professioneel', 'vrijwilliger', 'consument')),
  api_base_url    TEXT,
  api_key         TEXT,
  is_active       BOOLEAN DEFAULT true,
  requires_key    BOOLEAN DEFAULT false,
  is_configured   BOOLEAN GENERATED ALWAYS AS (
    CASE WHEN requires_key = false THEN true
         WHEN api_key IS NOT NULL AND api_key != '' THEN true
         ELSE false
    END
  ) STORED,
  sync_interval   INTERVAL DEFAULT '15 minutes',
  last_sync_at    TIMESTAMPTZ,
  last_sync_status TEXT DEFAULT 'pending'
    CHECK (last_sync_status IN ('success', 'error', 'pending')),
  last_error      TEXT,
  station_count   INTEGER DEFAULT 0,
  icon_marker     TEXT NOT NULL,
  color           TEXT NOT NULL,
  layer_order     INTEGER DEFAULT 0,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
