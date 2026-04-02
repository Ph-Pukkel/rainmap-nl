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

// --- sync-knmi business logic ---

const SOURCE_KEY_AWS = 'knmi_aws';
const SOURCE_KEY_NEERSLAG = 'knmi_neerslag';

// All KNMI automated weather stations (AWS) with their official coordinates.
// Source: KNMI stationslijst (https://www.knmi.nl/over-het-knmi/about/meteo-data)
// These locations are stable and rarely change.
const KNMI_AWS_STATIONS: Array<{
  code: number;
  name: string;
  lat: number;
  lon: number;
  elevation_m: number;
  municipality?: string;
  province?: string;
}> = [
  { code: 210, name: 'Valkenburg', lat: 52.171, lon: 4.419, elevation_m: 0, municipality: 'Katwijk', province: 'Zuid-Holland' },
  { code: 215, name: 'Voorschoten', lat: 52.121, lon: 4.430, elevation_m: -1, municipality: 'Voorschoten', province: 'Zuid-Holland' },
  { code: 225, name: 'IJmuiden', lat: 52.463, lon: 4.555, elevation_m: 4, municipality: 'Velsen', province: 'Noord-Holland' },
  { code: 229, name: 'IJmuiden (WP)', lat: 52.462, lon: 4.515, elevation_m: 0, province: 'Noord-Holland' },
  { code: 235, name: 'De Kooy', lat: 52.924, lon: 4.785, elevation_m: 0, municipality: 'Den Helder', province: 'Noord-Holland' },
  { code: 240, name: 'Schiphol', lat: 52.318, lon: 4.790, elevation_m: -3, municipality: 'Haarlemmermeer', province: 'Noord-Holland' },
  { code: 242, name: 'Vlieland', lat: 53.241, lon: 4.921, elevation_m: 9, municipality: 'Vlieland', province: 'Friesland' },
  { code: 248, name: 'Wijdenes', lat: 52.635, lon: 5.173, elevation_m: -2, municipality: 'Drechterland', province: 'Noord-Holland' },
  { code: 249, name: 'Berkhout', lat: 52.644, lon: 4.979, elevation_m: -2, municipality: 'Koggenland', province: 'Noord-Holland' },
  { code: 251, name: 'Hoorn (Terschelling)', lat: 53.392, lon: 5.346, elevation_m: 1, municipality: 'Terschelling', province: 'Friesland' },
  { code: 252, name: 'K13 Platform', lat: 53.219, lon: 3.221, elevation_m: 0 },
  { code: 257, name: 'Wijk aan Zee', lat: 52.503, lon: 4.574, elevation_m: 4, municipality: 'Beverwijk', province: 'Noord-Holland' },
  { code: 258, name: 'Houtribdijk', lat: 52.649, lon: 5.401, elevation_m: 0, province: 'Flevoland' },
  { code: 260, name: 'De Bilt', lat: 52.101, lon: 5.177, elevation_m: 2, municipality: 'De Bilt', province: 'Utrecht' },
  { code: 265, name: 'Soesterberg', lat: 52.127, lon: 5.275, elevation_m: 14, municipality: 'Soest', province: 'Utrecht' },
  { code: 267, name: 'Stavoren', lat: 52.899, lon: 5.384, elevation_m: 0, municipality: 'Sudwest-Fryslan', province: 'Friesland' },
  { code: 269, name: 'Lelystad', lat: 52.458, lon: 5.520, elevation_m: -4, municipality: 'Lelystad', province: 'Flevoland' },
  { code: 270, name: 'Leeuwarden', lat: 53.224, lon: 5.752, elevation_m: 1, municipality: 'Leeuwarden', province: 'Friesland' },
  { code: 273, name: 'Marknesse', lat: 52.703, lon: 5.889, elevation_m: -3, municipality: 'Noordoostpolder', province: 'Flevoland' },
  { code: 275, name: 'Deelen', lat: 52.060, lon: 5.873, elevation_m: 48, municipality: 'Arnhem', province: 'Gelderland' },
  { code: 277, name: 'Lauwersoog', lat: 53.409, lon: 6.199, elevation_m: 1, municipality: 'Het Hogeland', province: 'Groningen' },
  { code: 278, name: 'Heino', lat: 52.435, lon: 6.259, elevation_m: 4, municipality: 'Raalte', province: 'Overijssel' },
  { code: 279, name: 'Hoogeveen', lat: 52.730, lon: 6.574, elevation_m: 15, municipality: 'Hoogeveen', province: 'Drenthe' },
  { code: 280, name: 'Eelde', lat: 53.125, lon: 6.585, elevation_m: 5, municipality: 'Tynaarlo', province: 'Drenthe' },
  { code: 283, name: 'Hupsel', lat: 52.069, lon: 6.657, elevation_m: 29, municipality: 'Berkelland', province: 'Gelderland' },
  { code: 286, name: 'Nieuw Beerta', lat: 53.196, lon: 7.150, elevation_m: 0, municipality: 'Oldambt', province: 'Groningen' },
  { code: 290, name: 'Twenthe', lat: 52.274, lon: 6.891, elevation_m: 34, municipality: 'Enschede', province: 'Overijssel' },
  { code: 310, name: 'Vlissingen', lat: 51.442, lon: 3.596, elevation_m: 8, municipality: 'Vlissingen', province: 'Zeeland' },
  { code: 311, name: 'Hoofdplaat', lat: 51.379, lon: 3.672, elevation_m: 0, municipality: 'Terneuzen', province: 'Zeeland' },
  { code: 312, name: 'Oosterschelde', lat: 51.768, lon: 3.622, elevation_m: 0, province: 'Zeeland' },
  { code: 313, name: 'Vlakte van de Raan', lat: 51.496, lon: 3.242, elevation_m: 0 },
  { code: 315, name: 'Hansweert', lat: 51.442, lon: 4.003, elevation_m: 0, municipality: 'Reimerswaal', province: 'Zeeland' },
  { code: 316, name: 'Schaar', lat: 51.658, lon: 3.698, elevation_m: 0, province: 'Zeeland' },
  { code: 319, name: 'Westdorpe', lat: 51.226, lon: 3.862, elevation_m: 1, municipality: 'Terneuzen', province: 'Zeeland' },
  { code: 320, name: 'Goeree (LE)', lat: 51.926, lon: 3.668, elevation_m: 12, province: 'Zuid-Holland' },
  { code: 323, name: 'Wilhelminadorp', lat: 51.527, lon: 3.884, elevation_m: 1, municipality: 'Goes', province: 'Zeeland' },
  { code: 324, name: 'Stavenisse', lat: 51.596, lon: 4.008, elevation_m: 0, municipality: 'Tholen', province: 'Zeeland' },
  { code: 330, name: 'Hoek van Holland', lat: 51.992, lon: 4.120, elevation_m: 4, municipality: 'Rotterdam', province: 'Zuid-Holland' },
  { code: 331, name: 'Tholen', lat: 51.528, lon: 4.130, elevation_m: 0, municipality: 'Tholen', province: 'Zeeland' },
  { code: 340, name: 'Woensdrecht', lat: 51.449, lon: 4.342, elevation_m: 15, municipality: 'Woensdrecht', province: 'Noord-Brabant' },
  { code: 343, name: 'Rotterdam Geulhaven', lat: 51.893, lon: 4.313, elevation_m: -3, municipality: 'Rotterdam', province: 'Zuid-Holland' },
  { code: 344, name: 'Rotterdam', lat: 51.962, lon: 4.447, elevation_m: -5, municipality: 'Rotterdam', province: 'Zuid-Holland' },
  { code: 348, name: 'Cabauw', lat: 51.970, lon: 4.926, elevation_m: -1, municipality: 'Lopik', province: 'Utrecht' },
  { code: 350, name: 'Gilze-Rijen', lat: 51.566, lon: 4.936, elevation_m: 11, municipality: 'Gilze en Rijen', province: 'Noord-Brabant' },
  { code: 356, name: 'Herwijnen', lat: 51.859, lon: 5.146, elevation_m: 1, municipality: 'West Betuwe', province: 'Gelderland' },
  { code: 370, name: 'Eindhoven', lat: 51.451, lon: 5.377, elevation_m: 23, municipality: 'Eindhoven', province: 'Noord-Brabant' },
  { code: 375, name: 'Volkel', lat: 51.659, lon: 5.707, elevation_m: 20, municipality: 'Uden', province: 'Noord-Brabant' },
  { code: 377, name: 'Ell', lat: 51.198, lon: 5.764, elevation_m: 30, municipality: 'Leudal', province: 'Limburg' },
  { code: 380, name: 'Maastricht', lat: 50.906, lon: 5.762, elevation_m: 114, municipality: 'Maastricht', province: 'Limburg' },
  { code: 391, name: 'Arcen', lat: 51.498, lon: 6.197, elevation_m: 19, municipality: 'Venlo', province: 'Limburg' },
  { code: 205, name: 'Borkum', lat: 53.575, lon: 6.748, elevation_m: 3 },
  { code: 208, name: 'Lichteiland Goeree', lat: 51.926, lon: 3.669, elevation_m: 12, province: 'Zuid-Holland' },
];

async function getKNMIApiKey(): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('data_sources')
    .select('api_key')
    .eq('source_key', SOURCE_KEY_AWS)
    .single();
  return data?.api_key || Deno.env.get('KNMI_API_KEY') || '';
}

// Buienradar JSON feed provides live measurements for KNMI AWS stations.
// Buienradar stationid = 6000 + KNMI station code (e.g. 6240 = KNMI 240 = Schiphol).
const BUIENRADAR_URL = 'https://data.buienradar.nl/2.0/feed/json';

interface BuienradarMeasurement {
  stationid: number;
  stationname: string;
  temperature: number | null;
  rainFallLastHour: number | null;
  rainFallLast24Hour: number | null;
  timestamp: string;
  [key: string]: unknown;
}

async function fetchBuienradarLive(): Promise<Map<number, BuienradarMeasurement>> {
  const map = new Map<number, BuienradarMeasurement>();
  try {
    const resp = await fetch(BUIENRADAR_URL);
    if (!resp.ok) return map;
    const json = await resp.json();
    const measurements: BuienradarMeasurement[] = json?.actual?.stationmeasurements || [];
    for (const m of measurements) {
      // Buienradar stationid 6240 -> KNMI code 240
      // These are the SAME physical stations; Buienradar rounds coords to 2 decimals
      const knmiCode = m.stationid - 6000;
      if (knmiCode > 0 && knmiCode < 1000) {
        map.set(knmiCode, m);
      }
    }
    console.log(`Buienradar: ${map.size} live metingen opgehaald voor KNMI stations`);
  } catch (err) {
    console.warn(`Buienradar ophalen mislukt: ${(err as Error).message}`);
  }
  return map;
}

async function fetchKNMIAWSStations(): Promise<StationRecord[]> {
  // Fetch live Buienradar data to enrich KNMI stations
  const liveData = await fetchBuienradarLive();

  const stations: StationRecord[] = KNMI_AWS_STATIONS.map((s) => {
    const live = liveData.get(s.code);

    const record: StationRecord = {
      external_id: String(s.code),
      name: s.name,
      latitude: s.lat,
      longitude: s.lon,
      municipality: s.municipality,
      province: s.province,
      operator: 'KNMI',
      sensor_type: 'Automatisch weerstation',
      elevation_m: s.elevation_m,
      metadata: {
        station_code: s.code,
        wmo_code: `06${String(s.code).padStart(3, '0')}`,
        google_maps_satellite: `https://maps.google.com/maps?t=k&q=${s.lat},${s.lon}&z=17`,
        google_streetview: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${s.lat},${s.lon}`,
        // Buienradar uses the same stations with stationid = 6000 + KNMI code
        buienradar_stationid: 6000 + s.code,
        ...(live ? { buienradar_naam: live.stationname.replace(/^Meetstation\s+/i, '') } : {}),
      },
    };

    // Add live measurement from Buienradar if available
    if (live) {
      record.measurement = {
        measured_at: live.timestamp,
        rainfall_mm: live.rainFallLastHour ?? undefined,
        rainfall_period: '1h',
        temperature_c: live.temperature ?? undefined,
        raw_data: {
          buienradar_stationid: live.stationid,
          rainFallLast24Hour: live.rainFallLast24Hour,
          source: 'buienradar',
        },
      };
    }

    return record;
  });

  const withData = stations.filter((s) => s.measurement).length;
  console.log(`KNMI AWS: ${stations.length} stations, ${withData} met actuele meetdata via Buienradar`);
  return stations;
}

async function fetchKNMINeerslagStations(): Promise<StationRecord[]> {
  // The KNMI neerslag station metadata is now provided in NetCDF format,
  // which cannot be parsed in a Deno Edge Function. Return empty with a note.
  console.log('KNMI Neerslag: data-formaat is gewijzigd naar NetCDF, kan niet worden geparseerd in Edge Function');
  return [];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sourceType = url.searchParams.get('type') || 'aws';

  try {
    let result: SyncResult;
    if (sourceType === 'neerslag') {
      result = await runSync(SOURCE_KEY_NEERSLAG, fetchKNMINeerslagStations);
    } else {
      result = await runSync(SOURCE_KEY_AWS, fetchKNMIAWSStations);
    }

    // Add informational message for neerslag
    const response: Record<string, unknown> = { ...result };
    if (sourceType === 'neerslag') {
      response.message = 'KNMI neerslagstations metadata is nu in NetCDF-formaat. Handmatige import of alternatieve bron nodig.';
    }

    return new Response(JSON.stringify(response), {
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
