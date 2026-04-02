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

// --- sync-waterschappen business logic (KNMI Data Platform) ---
// Source: KNMI combined waterboard rain gauge dataset
// Dataset: waterboard_raingauge_quality_controlled_all_combined
// Contains 5-minute accumulated rainfall from rain gauges operated by
// 10 waterschappen, collected and quality-controlled by KNMI.
// Verified working 2026-04-02. XML is FEWS PI TimeSeries format.

const SOURCE_KEY = 'waterschappen';

// Combined dataset + individual waterschap datasets not in the combined file
const KNMI_DATASETS = [
  'waterboard_raingauge_quality_controlled_all_combined',
  'waterboard_raingauge_quality_controlled_dommel',
  'waterboard_raingauge_quality_controlled_limburg',
] as const;
const KNMI_API_BASE = 'https://api.dataplatform.knmi.nl/open-data/v1';

// Map location ID prefixes to waterschap operators
function getOperator(locationId: string, _name: string, dataset: string): string {
  // Stations from individual datasets are always that waterschap
  if (dataset.includes('_dommel')) return 'Waterschap De Dommel';
  if (dataset.includes('_limburg')) return 'Waterschap Limburg';

  // Combined dataset — match by location ID pattern
  if (/^(020|094|097|180|239|249|448|462)-/.test(locationId)) return 'Hoogheemraadschap van Rijnland';
  if (/^65[01]\d$/.test(locationId)) return 'Hoogheemraadschap De Stichtse Rijnlanden';
  if (/^(meetlocatie_rgn|tcn_)/.test(locationId)) return 'Hoogheemraadschap van Delfland';
  if (/^s\d+ki$/.test(locationId)) return 'Hoogheemraadschap Hollands Noorderkwartier';
  if (locationId.startsWith('nl33')) return "Waterschap Hunze en Aa's";
  if (locationId.startsWith('nl34')) return 'Waterschap Noorderzijlvest';
  if (locationId.startsWith('nrs_wdod')) return 'Waterschap Drents Overijsselse Delta';
  if (locationId.startsWith('mpn')) return 'Hoogheemraadschap Hollands Noorderkwartier';
  if (/^(rwzi_|p_|riool_gemaal_|rosmalen|nistelrode|mill|holthees|boxmeer|elshout|hutten_|peelse_|snelleloop)/.test(locationId)) return 'Waterschap Aa en Maas';
  if (locationId.startsWith('tml')) return 'Wetterskip Fryslân';
  return 'Waterschap (onbekend)';
}

// KNMI Data Platform API key (free, public registration)
const KNMI_API_KEY_DEFAULT = 'eyJvcmciOiI1ZTU1NGUxOTI3NGE5NjAwMDEyYTNlYjEiLCJpZCI6ImYzYWQzMTQyZmEwYzQ5MTRiNDc5NmE4NjYxYjk4NDgzIiwiaCI6Im11cm11cjEyOCJ9';

async function fetchLatestKNMIFile(dataset: string): Promise<string> {
  const apiKey = Deno.env.get('KNMI_API_KEY') || KNMI_API_KEY_DEFAULT;

  // List most recent file
  const listUrl = `${KNMI_API_BASE}/datasets/${dataset}/versions/1.0/files?maxKeys=1&orderBy=lastModified&sorting=desc`;
  const listResp = await fetch(listUrl, { headers: { Authorization: apiKey } });
  if (!listResp.ok) throw new Error(`KNMI file list mislukt voor ${dataset}: ${listResp.status}`);
  const listData = await listResp.json();
  const filename = listData.files?.[0]?.filename;
  if (!filename) throw new Error(`Geen KNMI bestanden gevonden voor ${dataset}`);
  console.log(`[${dataset}] Nieuwste bestand: ${filename}`);

  // Get temporary download URL
  const urlResp = await fetch(`${KNMI_API_BASE}/datasets/${dataset}/versions/1.0/files/${filename}/url`, {
    headers: { Authorization: apiKey },
  });
  if (!urlResp.ok) throw new Error(`KNMI download URL mislukt voor ${dataset}: ${urlResp.status}`);
  const urlData = await urlResp.json();
  return urlData.temporaryDownloadUrl;
}

interface ParsedStation {
  locationId: string;
  name: string;
  lat: number;
  lon: number;
  lastValue: number | null;
  lastTimestamp: string | null;
  flag: string | null;
}

function parseKNMIXml(xml: string): ParsedStation[] {
  const stations: ParsedStation[] = [];
  const seen = new Set<string>();

  // Parse each <series> block using regex (reliable for this well-structured XML)
  const seriesPattern = /<series>\s*<header>([\s\S]*?)<\/header>\s*([\s\S]*?)<\/series>/g;
  let match;

  while ((match = seriesPattern.exec(xml)) !== null) {
    const header = match[1];
    const body = match[2];

    const locationId = header.match(/<locationId>(.*?)<\/locationId>/)?.[1];
    const name = header.match(/<stationName>(.*?)<\/stationName>/)?.[1];
    const lat = header.match(/<lat>(.*?)<\/lat>/)?.[1];
    const lon = header.match(/<lon>(.*?)<\/lon>/)?.[1];

    if (!locationId || !name || !lat || !lon) continue;
    if (seen.has(locationId)) continue;
    seen.add(locationId);

    // Parse the latest event
    const eventMatch = body.match(/<event\s+date="([^"]+)"\s+time="([^"]+)"\s+value="([^"]+)"\s+flag="([^"]+)"/);
    let lastValue: number | null = null;
    let lastTimestamp: string | null = null;
    let flag: string | null = null;

    if (eventMatch) {
      const val = parseFloat(eventMatch[3]);
      lastValue = isNaN(val) ? null : val;
      lastTimestamp = `${eventMatch[1]}T${eventMatch[2]}Z`;
      flag = eventMatch[4];
    }

    // Decode HTML entities
    const decodedName = name.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    stations.push({
      locationId,
      name: decodedName,
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      lastValue,
      lastTimestamp,
      flag,
    });
  }

  return stations;
}

async function fetchWaterschappenStations(): Promise<StationRecord[]> {
  const allStations: StationRecord[] = [];
  const seen = new Set<string>();

  for (const dataset of KNMI_DATASETS) {
    try {
      const downloadUrl = await fetchLatestKNMIFile(dataset);

      console.log(`[${dataset}] XML downloaden...`);
      const xmlResp = await fetch(downloadUrl);
      if (!xmlResp.ok) throw new Error(`XML download mislukt: ${xmlResp.status}`);
      const xml = await xmlResp.text();
      console.log(`[${dataset}] XML ontvangen: ${xml.length} bytes`);

      const parsed = parseKNMIXml(xml);
      console.log(`[${dataset}] ${parsed.length} unieke stations geparsed`);

      for (const station of parsed) {
        // Skip coordinates outside Netherlands
        if (station.lat < 50.5 || station.lat > 53.7 || station.lon < 3.0 || station.lon > 7.3) continue;
        // Skip duplicates across datasets
        if (seen.has(station.locationId)) continue;
        seen.add(station.locationId);

        const operator = getOperator(station.locationId, station.name, dataset);

        allStations.push({
          external_id: `knmi-ws-${station.locationId}`,
          name: station.name,
          latitude: station.lat,
          longitude: station.lon,
          operator,
          sensor_type: 'rain_gauge',
          metadata: {
            knmi_location_id: station.locationId,
            dataset,
            organisation: operator,
          },
          ...(station.lastValue != null && station.lastTimestamp ? {
            measurement: {
              measured_at: station.lastTimestamp,
              rainfall_mm: station.lastValue,
              rainfall_period: '5min',
              raw_data: {
                knmi_location_id: station.locationId,
                flag: station.flag,
              },
            },
          } : {}),
        });
      }
    } catch (err) {
      console.error(`[${dataset}] Fout: ${err instanceof Error ? err.message : err}`);
      // Continue with other datasets even if one fails
    }
  }

  // Group counts per operator for logging
  const opCounts: Record<string, number> = {};
  for (const s of allStations) {
    opCounts[s.operator || 'onbekend'] = (opCounts[s.operator || 'onbekend'] || 0) + 1;
  }
  for (const [op, count] of Object.entries(opCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${op}: ${count} stations`);
  }
  console.log(`Waterschappen totaal: ${allStations.length} stations via KNMI Data Platform`);

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
