import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceRoleKey);
}

interface StationRecord {
  external_id: string;
  name: string;
  latitude: number;
  longitude: number;
  municipality?: string;
  province?: string;
  operator?: string;
  sensor_type?: string;
  elevation_m?: number;
  metadata?: Record<string, unknown>;
  measurement?: {
    measured_at: string;
    rainfall_mm?: number;
    rainfall_period?: string;
    temperature_c?: number;
    raw_data?: Record<string, unknown>;
  };
}

interface SyncResult {
  source_key: string;
  stations_synced: number;
  measurements_synced: number;
  errors: string[];
}

async function getDataSource(sourceKey: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('data_sources').select('*').eq('source_key', sourceKey).single();
  if (error) throw new Error(`Bron ${sourceKey} niet gevonden: ${error.message}`);
  return data;
}

async function startSyncLog(sourceKey: string): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('sync_logs').insert({ source_key: sourceKey, status: 'running' }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function completeSyncLog(logId: string, status: 'success' | 'error', stationsSynced: number, measurementsSynced: number, errorMessage?: string) {
  const supabase = createServiceClient();
  const startedAt = await supabase.from('sync_logs').select('started_at').eq('id', logId).single();
  const durationMs = startedAt.data ? Date.now() - new Date(startedAt.data.started_at).getTime() : 0;
  await supabase.from('sync_logs').update({ status, completed_at: new Date().toISOString(), stations_synced: stationsSynced, measurements_synced: measurementsSynced, error_message: errorMessage, duration_ms: durationMs }).eq('id', logId);
}

async function upsertStations(sourceKey: string, stations: StationRecord[]): Promise<number> {
  const supabase = createServiceClient();
  let count = 0;
  for (const station of stations) {
    const { error } = await supabase.from('stations').upsert({ source_key: sourceKey, external_id: station.external_id, name: station.name, location: `POINT(${station.longitude} ${station.latitude})`, latitude: station.latitude, longitude: station.longitude, municipality: station.municipality || null, province: station.province || null, operator: station.operator || null, sensor_type: station.sensor_type || null, elevation_m: station.elevation_m || null, metadata: station.metadata || {}, updated_at: new Date().toISOString() }, { onConflict: 'source_key,external_id' });
    if (!error) count++;
  }
  return count;
}

async function upsertMeasurements(sourceKey: string, stations: StationRecord[]): Promise<number> {
  const supabase = createServiceClient();
  let count = 0;
  for (const station of stations) {
    if (!station.measurement) continue;
    const { data: stationRow } = await supabase.from('stations').select('id').eq('source_key', sourceKey).eq('external_id', station.external_id).single();
    if (!stationRow) continue;
    const { error } = await supabase.from('measurements').upsert({ station_id: stationRow.id, source_key: sourceKey, measured_at: station.measurement.measured_at, rainfall_mm: station.measurement.rainfall_mm ?? null, rainfall_period: station.measurement.rainfall_period ?? null, temperature_c: station.measurement.temperature_c ?? null, raw_data: station.measurement.raw_data || {} }, { onConflict: 'station_id,measured_at,rainfall_period' });
    if (!error) count++;
  }
  return count;
}

async function updateSourceStatus(sourceKey: string, status: 'success' | 'error', stationCount?: number, errorMessage?: string) {
  const supabase = createServiceClient();
  const update: Record<string, unknown> = { last_sync_at: new Date().toISOString(), last_sync_status: status, updated_at: new Date().toISOString() };
  if (stationCount !== undefined) update.station_count = stationCount;
  if (status === 'error') update.last_error = errorMessage;
  if (status === 'success') update.last_error = null;
  await supabase.from('data_sources').update(update).eq('source_key', sourceKey);
}

async function runSync(sourceKey: string, fetchFn: () => Promise<StationRecord[]>): Promise<SyncResult> {
  const source = await getDataSource(sourceKey);
  if (!source.is_configured) return { source_key: sourceKey, stations_synced: 0, measurements_synced: 0, errors: ['Niet geconfigureerd'] };
  const logId = await startSyncLog(sourceKey);
  try {
    const stations = await fetchFn();
    const stationCount = await upsertStations(sourceKey, stations);
    const measurementCount = await upsertMeasurements(sourceKey, stations);
    await updateSourceStatus(sourceKey, 'success', stationCount);
    await completeSyncLog(logId, 'success', stationCount, measurementCount);
    return { source_key: sourceKey, stations_synced: stationCount, measurements_synced: measurementCount, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    await completeSyncLog(logId, 'error', 0, 0, message);
    await updateSourceStatus(sourceKey, 'error', undefined, message);
    return { source_key: sourceKey, stations_synced: 0, measurements_synced: 0, errors: [message] };
  }
}

// --- sync-waterschappen business logic ---

const SOURCE_KEY = 'waterschappen';

const WFS_ENDPOINTS: Record<string, { url: string; typeName: string }> = {
  'Waterschap Limburg': {
    url: 'https://geodata.waterschaplimburg.nl/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
  'Waterschap Aa en Maas': {
    url: 'https://geodata.aaenmaas.nl/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
  'Waterschap De Dommel': {
    url: 'https://geodata.dommel.nl/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
  'Hoogheemraadschap van Rijnland': {
    url: 'https://geodata.rijnland.net/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
  'Waterschap Rivierenland': {
    url: 'https://geodata.wsrl.nl/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
};

function buildWFSUrl(baseUrl: string, typeName: string): string {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  });
  return `${baseUrl}?${params.toString()}`;
}

async function fetchWaterschappenStations(): Promise<StationRecord[]> {
  const allStations: StationRecord[] = [];

  for (const [name, config] of Object.entries(WFS_ENDPOINTS)) {
    try {
      const url = buildWFSUrl(config.url, config.typeName);
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`WFS fout voor ${name}: ${response.status}`);
        continue;
      }

      const geojson = await response.json();

      if (geojson.features) {
        for (const feature of geojson.features) {
          if (feature.geometry?.type !== 'Point') continue;

          const [lon, lat] = feature.geometry.coordinates;
          const props = feature.properties || {};

          allStations.push({
            external_id: props.meetpuntcode || props.id || `${name}-${lon.toFixed(4)}-${lat.toFixed(4)}`,
            name: props.naam || props.name || `Meetpunt ${name}`,
            latitude: lat,
            longitude: lon,
            operator: name,
            sensor_type: 'Neerslagmeter',
            metadata: { ...props, waterschap: name },
          });
        }
      }
    } catch (error) {
      console.error(`Fout bij ophalen ${name}:`, error);
    }
  }

  return allStations;
}

Deno.serve(async (_req) => {
  try {
    const result = await runSync(SOURCE_KEY, fetchWaterschappenStations);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: result.errors.length > 0 ? 500 : 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
