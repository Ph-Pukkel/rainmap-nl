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

// --- sync-wow business logic ---

const SOURCE_KEY = 'wow_nl';

async function fetchWOWStations(): Promise<StationRecord[]> {
  const response = await fetch('https://wow.knmi.nl/api/observations/recent');

  if (!response.ok) {
    const fallbackUrl =
      'https://wow.metoffice.gov.uk/api/observations?' +
      'lat_sw=50.75&lon_sw=3.31&lat_ne=53.47&lon_ne=7.09&' +
      'parameter=rainfall';

    const fbResponse = await fetch(fallbackUrl);
    if (!fbResponse.ok) throw new Error(`WOW API fout: ${fbResponse.status}`);

    const fbData = await fbResponse.json();
    return parseWOWData(fbData);
  }

  const data = await response.json();
  return parseWOWData(data);
}

function parseWOWData(data: unknown): StationRecord[] {
  const stations: StationRecord[] = [];

  const features = Array.isArray(data)
    ? data
    : (data as { features?: unknown[] }).features || [];

  for (const item of features as Record<string, unknown>[]) {
    try {
      let lat: number, lon: number, id: string, name: string;
      let rainfall: number | undefined;
      let timestamp: string | undefined;

      if (item.geometry) {
        const geometry = item.geometry as { coordinates: [number, number] };
        [lon, lat] = geometry.coordinates;
        const props = (item.properties as Record<string, unknown>) || {};
        id = String(props.site_id || props.id || `wow-${lon.toFixed(4)}-${lat.toFixed(4)}`);
        name = String(props.naam || props.name || props.site_name || `WOW Station ${id}`);
        rainfall = (props.laatste_neerslag ?? props.rainfall ?? props.rain) as number | undefined;
        timestamp = props.timestamp as string | undefined || props.observation_time as string | undefined;
      } else {
        lat = item.lat as number || item.latitude as number;
        lon = item.lon as number || item.longitude as number;
        id = String(item.site_id || item.id);
        name = String(item.naam || item.name || `WOW Station ${id}`);
        rainfall = (item.laatste_neerslag ?? item.rainfall) as number | undefined;
        timestamp = item.timestamp as string | undefined;
      }

      if (!lat || !lon || !id) continue;

      // Filter to Netherlands bounds
      if (lat < 50.75 || lat > 53.47 || lon < 3.31 || lon > 7.09) continue;

      stations.push({
        external_id: id,
        name,
        latitude: lat,
        longitude: lon,
        operator: 'WOW-NL',
        sensor_type: 'Amateur weerstation',
        measurement: rainfall !== undefined
          ? {
              measured_at: timestamp || new Date().toISOString(),
              rainfall_mm: rainfall,
              rainfall_period: '1h',
            }
          : undefined,
      });
    } catch {
      continue;
    }
  }

  return stations;
}

Deno.serve(async (_req) => {
  try {
    const result = await runSync(SOURCE_KEY, fetchWOWStations);
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
