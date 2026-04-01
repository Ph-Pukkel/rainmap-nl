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

// --- sync-netatmo business logic ---

const SOURCE_KEY = 'netatmo';

// Netherlands bounding box grid cells (~50km each)
const NL_GRID = [
  { lat_sw: 50.75, lon_sw: 3.31, lat_ne: 51.50, lon_ne: 4.50 },
  { lat_sw: 50.75, lon_sw: 4.50, lat_ne: 51.50, lon_ne: 5.70 },
  { lat_sw: 50.75, lon_sw: 5.70, lat_ne: 51.50, lon_ne: 7.09 },
  { lat_sw: 51.50, lon_sw: 3.31, lat_ne: 52.25, lon_ne: 4.50 },
  { lat_sw: 51.50, lon_sw: 4.50, lat_ne: 52.25, lon_ne: 5.70 },
  { lat_sw: 51.50, lon_sw: 5.70, lat_ne: 52.25, lon_ne: 7.09 },
  { lat_sw: 52.25, lon_sw: 3.31, lat_ne: 53.00, lon_ne: 4.50 },
  { lat_sw: 52.25, lon_sw: 4.50, lat_ne: 53.00, lon_ne: 5.70 },
  { lat_sw: 52.25, lon_sw: 5.70, lat_ne: 53.00, lon_ne: 7.09 },
  { lat_sw: 53.00, lon_sw: 3.31, lat_ne: 53.47, lon_ne: 5.20 },
  { lat_sw: 53.00, lon_sw: 5.20, lat_ne: 53.47, lon_ne: 7.09 },
];

async function getNetatmoCredentials() {
  const clientId = Deno.env.get('NETATMO_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('NETATMO_CLIENT_SECRET') || '';
  const refreshToken = Deno.env.get('NETATMO_REFRESH_TOKEN') || '';
  return { clientId, clientSecret, refreshToken };
}

async function getNetatmoAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = await getNetatmoCredentials();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Netatmo OAuth2 credentials niet geconfigureerd');
  }

  const response = await fetch('https://api.netatmo.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) throw new Error(`Netatmo OAuth fout: ${response.status}`);
  const data = await response.json();
  return data.access_token;
}

async function fetchNetatmoStations(): Promise<StationRecord[]> {
  const accessToken = await getNetatmoAccessToken();
  const allStations: StationRecord[] = [];
  const seenIds = new Set<string>();

  for (const cell of NL_GRID) {
    try {
      const params = new URLSearchParams({
        lat_ne: String(cell.lat_ne),
        lon_ne: String(cell.lon_ne),
        lat_sw: String(cell.lat_sw),
        lon_sw: String(cell.lon_sw),
        required_data: 'rain',
        filter: 'true',
      });

      const response = await fetch(
        `https://api.netatmo.com/api/getpublicdata?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        console.warn(`Netatmo grid cell fout: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const devices = data.body || [];

      for (const device of devices) {
        if (seenIds.has(device._id)) continue;
        seenIds.add(device._id);

        const [lon, lat] = device.place?.location || [0, 0];
        if (!lat || !lon) continue;

        const measures = device.measures || {};
        let rainfall: number | undefined;
        let rainTimestamp: number | undefined;

        for (const moduleData of Object.values(measures) as Record<string, unknown>[]) {
          if (moduleData.rain_60min !== undefined) {
            rainfall = moduleData.rain_60min as number;
            rainTimestamp = moduleData.rain_timeutc as number;
          }
        }

        allStations.push({
          external_id: device._id,
          name: device.place?.city
            ? `Netatmo ${device.place.city}`
            : `Netatmo ${device._id.slice(-6)}`,
          latitude: lat,
          longitude: lon,
          municipality: device.place?.city,
          operator: 'Netatmo',
          sensor_type: 'Netatmo regenmodule',
          measurement: rainfall !== undefined ? {
            measured_at: rainTimestamp
              ? new Date(rainTimestamp * 1000).toISOString()
              : new Date().toISOString(),
            rainfall_mm: rainfall,
            rainfall_period: '1h',
            raw_data: { rain_24h: (Object.values(measures)[0] as Record<string, unknown>)?.rain_24h },
          } : undefined,
        });
      }

      // Respect rate limits: small delay between cells
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Netatmo grid cell fout:`, error);
    }
  }

  return allStations;
}

Deno.serve(async (_req) => {
  try {
    const result = await runSync(SOURCE_KEY, fetchNetatmoStations);
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
