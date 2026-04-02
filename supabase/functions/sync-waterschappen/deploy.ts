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

// --- sync-waterschappen business logic (Lizard API) ---
// Verified working 2026-04-02. Each waterschap has its own Lizard subdomain.
// The timeseries endpoint returns abbreviated locations (no geometry/organisation),
// so we fetch each location individually by UUID to get coordinates.

const SOURCE_KEY = 'waterschappen';

// Waterschap Lizard configs. Each uses a different subdomain and obs type code.
// WNS1400 (id=36) is exclusively KNMI radar data and is NOT included here.
// Verified 2026-04-02: these are the only 4 waterschappen with publicly
// accessible rain gauge data via Lizard API. Other waterschappen either
// don't publish via Lizard, require authentication, or use the closed
// WIWB/HydroNET system via Het Waterschapshuis.
const WATERSCHAP_CONFIGS: {
  operator: string;
  baseUrl: string;
  obsTypeCode: string;
  rainfallPeriod: string;
}[] = [
  {
    operator: 'Hoogheemraadschap Hollands Noorderkwartier',
    baseUrl: 'https://hhnk.lizard.net/api/v4',
    obsTypeCode: 'P.meting.1m',
    rainfallPeriod: '1min',
  },
  {
    operator: "Waterschap Hunze en Aa's",
    baseUrl: 'https://hunzeenaas.lizard.net/api/v4',
    obsTypeCode: 'WNS9028',
    rainfallPeriod: 'cumulative',
  },
  {
    operator: 'Waterschap Zuiderzeeland',
    baseUrl: 'https://zuiderzeeland.lizard.net/api/v4',
    obsTypeCode: 'WNS3380',
    rainfallPeriod: 'cumulative',
  },
  {
    operator: 'Hoogheemraadschap De Stichtse Rijnlanden',
    baseUrl: 'https://hdsr.lizard.net/api/v4',
    obsTypeCode: 'Rh.5',
    rainfallPeriod: '5min',
  },
];

interface LizardTimeseriesShort {
  uuid: string;
  location: {
    url: string;
    uuid: string;
    name: string;
    code: string;
  } | null;
  observation_type: {
    code: string;
    parameter: string;
    unit: string;
  } | null;
  last_value: number | null;
  last_value_timestamp: string | null;
}

interface LizardLocation {
  uuid: string;
  name: string;
  code: string;
  geometry: { type: string; coordinates: number[] } | null;
  organisation?: { name: string; uuid: string } | null;
}

interface LizardPageResponse {
  count: number;
  next: string | null;
  results: LizardTimeseriesShort[];
}

async function fetchAllTimeseries(baseUrl: string, obsTypeCode: string): Promise<LizardTimeseriesShort[]> {
  const all: LizardTimeseriesShort[] = [];
  let url: string | null = `${baseUrl}/timeseries/?format=json&observation_type__code=${encodeURIComponent(obsTypeCode)}&page_size=100`;

  while (url) {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`Lizard API fout ${obsTypeCode}: ${resp.status}`);
      break;
    }
    const page: LizardPageResponse = await resp.json();
    all.push(...page.results);
    url = page.next;
  }
  return all;
}

async function fetchLocation(locationUrl: string): Promise<LizardLocation | null> {
  try {
    const resp = await fetch(locationUrl);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function fetchWaterschappenStations(): Promise<StationRecord[]> {
  const allStations: StationRecord[] = [];
  const seenLocations = new Set<string>();

  for (const config of WATERSCHAP_CONFIGS) {
    try {
      const timeseries = await fetchAllTimeseries(config.baseUrl, config.obsTypeCode);
      console.log(`Lizard ${config.operator}: ${timeseries.length} timeseries gevonden`);

      for (const ts of timeseries) {
        if (!ts.location) continue;

        const locUuid = ts.location.uuid;
        if (seenLocations.has(locUuid)) continue;
        seenLocations.add(locUuid);

        // Fetch full location to get geometry
        const loc = await fetchLocation(ts.location.url);
        if (!loc?.geometry || loc.geometry.type !== 'Point') continue;

        const [lon, lat] = loc.geometry.coordinates;

        // Skip coordinates outside Netherlands
        if (lat < 50.5 || lat > 53.7 || lon < 3.0 || lon > 7.3) continue;

        const orgName = loc.organisation?.name || config.operator;

        allStations.push({
          external_id: `lizard-${locUuid}`,
          name: loc.name,
          latitude: lat,
          longitude: lon,
          operator: orgName,
          sensor_type: 'rain_gauge',
          metadata: {
            lizard_timeseries_uuid: ts.uuid,
            location_uuid: locUuid,
            location_code: loc.code,
            obs_type_code: config.obsTypeCode,
            obs_unit: ts.observation_type?.unit || 'mm',
            organisation: orgName,
          },
          ...(ts.last_value != null && ts.last_value_timestamp ? {
            measurement: {
              measured_at: ts.last_value_timestamp,
              rainfall_mm: ts.last_value,
              rainfall_period: config.rainfallPeriod,
              raw_data: {
                lizard_timeseries_uuid: ts.uuid,
                obs_type_code: config.obsTypeCode,
              },
            },
          } : {}),
        });
      }

      console.log(`${config.operator}: ${allStations.length} stations met coordinaten`);
    } catch (error) {
      console.error(`Fout bij ophalen ${config.operator}:`, error);
    }
  }

  console.log(`Waterschappen totaal: ${allStations.length} stations via Lizard API`);
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
