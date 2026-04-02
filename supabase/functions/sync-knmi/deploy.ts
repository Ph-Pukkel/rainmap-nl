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
// Coordinates from KNMI INSPIRE WFS (6-decimal precision, sub-meter accuracy)
// via Nationaal GeoRegister: nationaalgeoregister.nl/geonetwork/srv/api/records/1e01d173-96f4-40b1-8236-c6a9cfdac252
// Fallback to KNMI daggegevens API (3-decimal) for stations not in WFS.
// Photo URLs verified from Wikimedia Commons, KNMI.nl, and other public sources.
const KNMI_AWS_STATIONS: Array<{
  code: number;
  name: string;
  lat: number;
  lon: number;
  elevation_m: number;
  municipality?: string;
  province?: string;
  photo_url?: string;
  buienradar_naam?: string;
  station_type?: string;
}> = [
  // --- Land-based full meteo stations (WFS precision where available) ---
  { code: 210, name: 'Valkenburg', lat: 52.171, lon: 4.430, elevation_m: -0.2, municipality: 'Katwijk', province: 'Zuid-Holland', station_type: 'meteo', buienradar_naam: undefined /* niet in Buienradar, vervangen door 215 */ },
  { code: 215, name: 'Voorschoten', lat: 52.139722, lon: 4.436389, elevation_m: -1.1, municipality: 'Voorschoten', province: 'Zuid-Holland', station_type: 'meteo', photo_url: 'https://cdn.knmi.nl/system/bloxy/images/images/000/001/070/xlarge/120372.jpeg' },
  { code: 225, name: 'IJmuiden', lat: 52.462243, lon: 4.554901, elevation_m: 4.4, municipality: 'Velsen', province: 'Noord-Holland', station_type: 'wind' },
  { code: 235, name: 'De Kooy Airport', lat: 52.926865, lon: 4.781145, elevation_m: 1.2, municipality: 'Den Helder', province: 'Noord-Holland', station_type: 'aerodrome', buienradar_naam: 'Den Helder' },
  { code: 240, name: 'Schiphol Airport', lat: 52.315408, lon: 4.790223, elevation_m: -3.3, municipality: 'Haarlemmermeer', province: 'Noord-Holland', station_type: 'aerodrome' },
  { code: 242, name: 'Vlieland Vliehors', lat: 53.240027, lon: 4.920791, elevation_m: 10.8, municipality: 'Vlieland', province: 'Friesland', station_type: 'meteo' },
  { code: 248, name: 'Wijdenes', lat: 52.632431, lon: 5.173474, elevation_m: 0.8, municipality: 'Drechterland', province: 'Noord-Holland', station_type: 'wind' },
  { code: 249, name: 'Berkhout', lat: 52.642697, lon: 4.978757, elevation_m: -2.4, municipality: 'Koggenland', province: 'Noord-Holland', station_type: 'meteo' },
  { code: 251, name: 'Hoorn Terschelling', lat: 53.391266, lon: 5.345801, elevation_m: 0.7, municipality: 'Terschelling', province: 'Friesland', station_type: 'meteo' },
  { code: 257, name: 'Wijk aan Zee', lat: 52.505334, lon: 4.602930, elevation_m: 8.5, municipality: 'Beverwijk', province: 'Noord-Holland', station_type: 'meteo' },
  { code: 260, name: 'De Bilt', lat: 52.098822, lon: 5.179706, elevation_m: 1.9, municipality: 'De Bilt', province: 'Utrecht', station_type: 'meteo', photo_url: 'https://cdn.knmi.nl/knmi/map/page/weer/actueel-weer/webcam/webcam.jpg' },
  { code: 265, name: 'Soesterberg', lat: 52.130, lon: 5.274, elevation_m: 13.9, municipality: 'Soest', province: 'Utrecht', station_type: 'meteo' },
  { code: 267, name: 'Stavoren', lat: 52.896644, lon: 5.383479, elevation_m: -1.3, municipality: 'Sudwest-Fryslan', province: 'Friesland', station_type: 'meteo', photo_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d2/20180719_Weerstation_KNMI_Stavoren.jpg' },
  { code: 269, name: 'Lelystad Airport', lat: 52.457270, lon: 5.519632, elevation_m: -3.7, municipality: 'Lelystad', province: 'Flevoland', station_type: 'aerodrome' },
  { code: 270, name: 'Leeuwarden Airport', lat: 53.223000, lon: 5.751574, elevation_m: 1.2, municipality: 'Leeuwarden', province: 'Friesland', station_type: 'aerodrome' },
  { code: 273, name: 'Marknesse', lat: 52.701902, lon: 5.887446, elevation_m: -3.3, municipality: 'Noordoostpolder', province: 'Flevoland', station_type: 'meteo' },
  { code: 275, name: 'Deelen Airport', lat: 52.054862, lon: 5.872323, elevation_m: 48.2, municipality: 'Ede', province: 'Gelderland', station_type: 'aerodrome', buienradar_naam: 'Arnhem' },
  { code: 277, name: 'Lauwersoog', lat: 53.411581, lon: 6.199099, elevation_m: 2.9, municipality: 'Het Hogeland', province: 'Groningen', station_type: 'meteo' },
  { code: 278, name: 'Heino', lat: 52.434562, lon: 6.258977, elevation_m: 3.6, municipality: 'Raalte', province: 'Overijssel', station_type: 'meteo' },
  { code: 279, name: 'Hoogeveen', lat: 52.749056, lon: 6.572970, elevation_m: 15.8, municipality: 'Hoogeveen', province: 'Drenthe', station_type: 'meteo' },
  { code: 280, name: 'Groningen Airport Eelde', lat: 53.123676, lon: 6.584847, elevation_m: 5.2, municipality: 'Tynaarlo', province: 'Drenthe', station_type: 'aerodrome', buienradar_naam: 'Groningen' },
  { code: 283, name: 'Hupsel', lat: 52.067534, lon: 6.656725, elevation_m: 29.1, municipality: 'Berkelland', province: 'Gelderland', station_type: 'meteo', buienradar_naam: 'Groenlo-Hupsel' },
  { code: 286, name: 'Nieuw Beerta', lat: 53.194410, lon: 7.149322, elevation_m: -0.2, municipality: 'Oldambt', province: 'Groningen', station_type: 'meteo', photo_url: 'https://upload.wikimedia.org/wikipedia/commons/6/68/Weerstation_Nieuw_Beerta.jpg' },
  { code: 290, name: 'Twenthe Airport', lat: 52.273148, lon: 6.890875, elevation_m: 34.8, municipality: 'Enschede', province: 'Overijssel', station_type: 'aerodrome', buienradar_naam: 'Twente' },
  { code: 310, name: 'Vlissingen', lat: 51.441334, lon: 3.595824, elevation_m: 8.0, municipality: 'Vlissingen', province: 'Zeeland', station_type: 'meteo' },
  { code: 319, name: 'Westdorpe', lat: 51.224758, lon: 3.860966, elevation_m: 1.7, municipality: 'Terneuzen', province: 'Zeeland', station_type: 'meteo' },
  { code: 323, name: 'Wilhelminadorp', lat: 51.525957, lon: 3.883534, elevation_m: 1.4, municipality: 'Goes', province: 'Zeeland', station_type: 'meteo', buienradar_naam: 'Goes' },
  { code: 330, name: 'Hoek van Holland', lat: 51.990942, lon: 4.121850, elevation_m: 11.9, municipality: 'Rotterdam', province: 'Zuid-Holland', station_type: 'meteo' },
  { code: 340, name: 'Woensdrecht Airport', lat: 51.447744, lon: 4.342014, elevation_m: 19.2, municipality: 'Woensdrecht', province: 'Noord-Brabant', station_type: 'aerodrome' },
  { code: 343, name: 'Rotterdam Geulhaven', lat: 51.891831, lon: 4.312664, elevation_m: 3.5, municipality: 'Rotterdam', province: 'Zuid-Holland', station_type: 'wind' },
  { code: 344, name: 'Rotterdam The Hague Airport', lat: 51.960667, lon: 4.446901, elevation_m: -4.3, municipality: 'Rotterdam', province: 'Zuid-Holland', station_type: 'aerodrome' },
  { code: 348, name: 'Cabauw', lat: 51.969031, lon: 4.925922, elevation_m: -0.7, municipality: 'Lopik', province: 'Utrecht', station_type: 'meteo', buienradar_naam: 'Lopik-Cabauw' },
  { code: 350, name: 'Gilze-Rijen Airport', lat: 51.564889, lon: 4.935239, elevation_m: 14.9, municipality: 'Gilze en Rijen', province: 'Noord-Brabant', station_type: 'aerodrome', buienradar_naam: 'Gilze Rijen' },
  { code: 356, name: 'Herwijnen', lat: 51.857594, lon: 5.145399, elevation_m: 0.7, municipality: 'West Betuwe', province: 'Gelderland', station_type: 'meteo' },
  { code: 370, name: 'Eindhoven Airport', lat: 51.451, lon: 5.377, elevation_m: 22.6, municipality: 'Eindhoven', province: 'Noord-Brabant', station_type: 'aerodrome' },
  { code: 375, name: 'Volkel', lat: 51.658528, lon: 5.706595, elevation_m: 22.0, municipality: 'Uden', province: 'Noord-Brabant', station_type: 'aerodrome' },
  { code: 377, name: 'Ell', lat: 51.196700, lon: 5.762545, elevation_m: 30.0, municipality: 'Leudal', province: 'Limburg', station_type: 'meteo' },
  { code: 380, name: 'Maastricht Airport', lat: 50.905256, lon: 5.761783, elevation_m: 114.3, municipality: 'Beek', province: 'Limburg', station_type: 'aerodrome' },
  { code: 391, name: 'Arcen', lat: 51.497306, lon: 6.196107, elevation_m: 19.5, municipality: 'Venlo', province: 'Limburg', station_type: 'meteo' },
  { code: 392, name: 'Horst', lat: 51.486836, lon: 6.056189, elevation_m: 21.88, municipality: 'Horst aan de Maas', province: 'Limburg', station_type: 'meteo' },
  // --- Wind-only / coastal stations (daggegevens API precision) ---
  { code: 209, name: 'IJmond', lat: 52.465, lon: 4.518, elevation_m: 0, municipality: 'Velsen', province: 'Noord-Holland', station_type: 'wind' },
  { code: 229, name: 'Texelhors', lat: 52.995016, lon: 4.719876, elevation_m: 0, municipality: 'Texel', province: 'Noord-Holland', station_type: 'wind' },
  { code: 258, name: 'Houtribdijk', lat: 52.648187, lon: 5.400388, elevation_m: 7.3, municipality: 'Lelystad', province: 'Flevoland', station_type: 'wind' },
  { code: 285, name: 'Huibertgat', lat: 53.575, lon: 6.399, elevation_m: 0, station_type: 'wind' },
  { code: 308, name: 'Cadzand', lat: 51.381, lon: 3.379, elevation_m: 0, municipality: 'Sluis', province: 'Zeeland', station_type: 'wind' },
  { code: 311, name: 'Hoofdplaat', lat: 51.379, lon: 3.672, elevation_m: 0, municipality: 'Sluis', province: 'Zeeland', station_type: 'wind' },
  { code: 312, name: 'Oosterschelde', lat: 51.768, lon: 3.622, elevation_m: 0, province: 'Zeeland', station_type: 'wind' },
  { code: 313, name: 'Vlakte van de Raan', lat: 51.505, lon: 3.242, elevation_m: 0, station_type: 'wind' },
  { code: 315, name: 'Hansweert', lat: 51.447, lon: 3.998, elevation_m: 0, municipality: 'Reimerswaal', province: 'Zeeland', station_type: 'wind' },
  { code: 316, name: 'Schaar', lat: 51.657, lon: 3.694, elevation_m: 0, province: 'Zeeland', station_type: 'wind' },
  { code: 320, name: 'Lichteiland Goeree', lat: 51.925472, lon: 3.669861, elevation_m: 24.6, province: 'Zuid-Holland', station_type: 'platform' },
  { code: 321, name: 'Euro Platform', lat: 51.997951, lon: 3.274938, elevation_m: 0, province: 'Zuid-Holland', station_type: 'platform' },
  { code: 324, name: 'Stavenisse', lat: 51.596, lon: 4.006, elevation_m: 0, municipality: 'Tholen', province: 'Zeeland', station_type: 'wind' },
  { code: 331, name: 'Tholen', lat: 51.480, lon: 4.193, elevation_m: 0, municipality: 'Tholen', province: 'Zeeland', station_type: 'wind' },
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
        station_type: s.station_type ?? 'meteo',
        google_maps_satellite: `https://maps.google.com/maps?t=k&q=${s.lat},${s.lon}&z=17`,
        google_streetview: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${s.lat},${s.lon}`,
        buienradar_stationid: 6000 + s.code,
        // Use static buienradar_naam from station definition, fall back to live data
        buienradar_naam: s.buienradar_naam ?? (live ? live.stationname.replace(/^Meetstation\s+/i, '') : undefined),
        ...(s.photo_url ? { photo_url: s.photo_url } : {}),
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
