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

// --- RWS DDL API business logic ---

const SOURCE_KEY = 'rws_waterinfo';

// New DDL API (primary)
const DDL_BASE = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl';
// Old API (fallback, available until 2026-04-30)
const OLD_BASE = 'https://waterwebservices.rijkswaterstaat.nl';

interface DDLLocatie {
  Locatie_MessageID: number;
  Coordinatenstelsel: string;
  X: number;
  Y: number;
  Code: string;
  Naam: string;
}

interface DDLCatalogusEntry {
  AquoMetadata_MessageID: number;
  Locatie_MessageID: number;
  Coordinatenstelsel: string;
  X: number;
  Y: number;
  Code: string;
  Naam: string;
  Compartiment?: { Code: string; Omschrijving: string };
  Eenheid?: { Code: string; Omschrijving: string };
  Grootheid?: { Code: string; Omschrijving: string };
  Hoedanigheid?: { Code: string; Omschrijving: string };
  Parameter_Wat_Omschrijving?: string;
}

interface DDLWaarneming {
  Locatie_MessageID: number;
  Coordinatenstelsel: string;
  X: number;
  Y: number;
  Code: string;
  Naam: string;
  AquoMetadata_MessageID: number;
  Compartiment?: { Code: string };
  Eenheid?: { Code: string };
  Grootheid?: { Code: string };
  Hoedanigheid?: { Code: string };
  Tijdstip: string;
  Meetwaarde?: { Waarde_Numeriek: number };
  WaarnemingMetadata?: { StatuswaardeLijst: string[] };
}

async function postDDL(endpoint: string, body: Record<string, unknown>, useOldApi = false): Promise<unknown> {
  const base = useOldApi ? OLD_BASE : DDL_BASE;
  const url = `${base}${endpoint}`;
  console.log(`RWS DDL POST: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`RWS DDL API fout: ${response.status} ${response.statusText} - ${text.slice(0, 500)}`);
  }

  return response.json();
}

async function fetchCatalogus(useOldApi: boolean): Promise<DDLCatalogusEntry[]> {
  const endpoint = useOldApi
    ? '/METADATASERVICES_DBO/OphalenCatalogus'
    : '/METADATASERVICES/OphalenCatalogus';

  const body = {
    CatalogusFilter: {
      Grootheden: [{ Code: 'NEERSG' }],
    },
  };

  const result = await postDDL(endpoint, body, useOldApi) as {
    CatalogusLijst?: DDLCatalogusEntry[];
  };

  return result.CatalogusLijst ?? [];
}

async function fetchLaatsteWaarnemingen(
  locations: DDLLocatie[],
  useOldApi: boolean,
): Promise<DDLWaarneming[]> {
  if (locations.length === 0) return [];

  const endpoint = useOldApi
    ? '/ONLINEWAARNEMINGENSERVICES_DBO/OphalenLaatsteWaarnemingen'
    : '/ONLINEWAARNEMINGENSERVICES/OphalenLaatsteWaarnemingen';

  // The API may have limits on batch size; send in chunks of 50
  const chunkSize = 50;
  const allWaarnemingen: DDLWaarneming[] = [];

  for (let i = 0; i < locations.length; i += chunkSize) {
    const chunk = locations.slice(i, i + chunkSize);

    const body = {
      LocatieLijst: chunk.map((loc) => ({
        Code: loc.Code,
        X: loc.X,
        Y: loc.Y,
        Coordinatenstelsel: loc.Coordinatenstelsel,
      })),
      AquoPlusWaarwordenFilter: {
        AquoMetadata: {
          Grootheid: { Code: 'NEERSG' },
        },
      },
      Periode: {
        Begindatumtijd: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        Einddatumtijd: new Date().toISOString(),
      },
    };

    try {
      const result = await postDDL(endpoint, body, useOldApi) as {
        WaarnemingenLijst?: Array<{
          Locatie: { Code: string; Naam: string; X: number; Y: number; Coordinatenstelsel: string };
          AquoMetadata: { Grootheid?: { Code: string }; Eenheid?: { Code: string } };
          MetingenLijst?: Array<{
            Tijdstip: string;
            Meetwaarde: { Waarde_Numeriek: number };
            WaarnemingMetadata?: { StatuswaardeLijst: string[] };
          }>;
        }>;
      };

      if (result.WaarnemingenLijst) {
        for (const w of result.WaarnemingenLijst) {
          if (!w.MetingenLijst || w.MetingenLijst.length === 0) continue;
          // Take the latest measurement
          const latest = w.MetingenLijst[w.MetingenLijst.length - 1];
          allWaarnemingen.push({
            Locatie_MessageID: 0,
            Coordinatenstelsel: w.Locatie.Coordinatenstelsel,
            X: w.Locatie.X,
            Y: w.Locatie.Y,
            Code: w.Locatie.Code,
            Naam: w.Locatie.Naam,
            AquoMetadata_MessageID: 0,
            Grootheid: w.AquoMetadata.Grootheid,
            Eenheid: w.AquoMetadata.Eenheid,
            Tijdstip: latest.Tijdstip,
            Meetwaarde: latest.Meetwaarde,
            WaarnemingMetadata: latest.WaarnemingMetadata,
          });
        }
      }
    } catch (err) {
      console.warn(`Waarnemingen ophalen mislukt voor chunk ${i}-${i + chunk.length}: ${err}`);
      // Continue with other chunks
    }
  }

  return allWaarnemingen;
}

function catalogusToLocations(entries: DDLCatalogusEntry[]): DDLLocatie[] {
  // Deduplicate by station Code
  const seen = new Map<string, DDLLocatie>();
  for (const entry of entries) {
    if (!seen.has(entry.Code)) {
      seen.set(entry.Code, {
        Locatie_MessageID: entry.Locatie_MessageID,
        Coordinatenstelsel: entry.Coordinatenstelsel,
        X: entry.X,
        Y: entry.Y,
        Code: entry.Code,
        Naam: entry.Naam,
      });
    }
  }
  return Array.from(seen.values());
}

function parseCoordinates(entry: { X: number; Y: number; Coordinatenstelsel: string }): { lat: number; lon: number } {
  // The new DDL API uses ETRS89 (lat/lon) coordinates by default.
  // Coordinatenstelsel 25831 = ETRS89 / UTM zone 31N
  // Coordinatenstelsel 4258 = ETRS89 geographic (lat/lon)
  // Coordinatenstelsel 28992 = RD New (Amersfoort)
  const stelsel = String(entry.Coordinatenstelsel);

  if (stelsel === '25831') {
    // ETRS89 UTM zone 31N: X = easting, Y = northing
    // Approximate conversion to WGS84 lat/lon for the Netherlands
    // For proper conversion we'd need a full UTM library, but a good
    // approximation for NL (zone 31N): lat ~ Y/111320, lon ~ (X - 500000) / (111320 * cos(52deg)) + 3
    // This is a rough estimate; the exact formula is more complex.
    // Better approach: use a simplified UTM to lat/lon conversion.
    const lat = utmToLatLon(entry.X, entry.Y, 31).lat;
    const lon = utmToLatLon(entry.X, entry.Y, 31).lon;
    return { lat, lon };
  }

  if (stelsel === '4258' || stelsel === 'EPSG:4258' || stelsel === 'WGS84' || stelsel === '4326') {
    // ETRS89 geographic or WGS84 - X is typically longitude, Y is latitude
    // But in RWS data, X and Y can be swapped depending on the context
    // Check: if X is in range 50-54 (latitude range for NL), swap
    if (entry.X > 50 && entry.X < 54 && entry.Y > 3 && entry.Y < 8) {
      return { lat: entry.X, lon: entry.Y };
    }
    return { lat: entry.Y, lon: entry.X };
  }

  if (stelsel === '28992' || stelsel === 'RD') {
    // Rijksdriehoek to WGS84 approximation
    return rdToWgs84(entry.X, entry.Y);
  }

  // Default: assume X=lon, Y=lat (ETRS89/WGS84 convention)
  // Sanity check for Netherlands coordinates
  if (entry.Y > 50 && entry.Y < 54 && entry.X > 3 && entry.X < 8) {
    return { lat: entry.Y, lon: entry.X };
  }
  if (entry.X > 50 && entry.X < 54 && entry.Y > 3 && entry.Y < 8) {
    return { lat: entry.X, lon: entry.Y };
  }

  // Fall through: assume Y=lat, X=lon
  return { lat: entry.Y, lon: entry.X };
}

function utmToLatLon(easting: number, northing: number, zone: number): { lat: number; lon: number } {
  // Simplified UTM to WGS84 conversion
  // Based on Karney's method, simplified for Netherlands region
  const k0 = 0.9996;
  const a = 6378137.0; // WGS84 semi-major axis
  const e = 0.0818192; // WGS84 eccentricity
  const e2 = e * e;
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  const lonOrigin = (zone - 1) * 6 - 180 + 3; // Central meridian

  const M = northing / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
    + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu);

  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T1 = tanPhi * tanPhi;
  const C1 = (e2 / (1 - e2)) * cosPhi * cosPhi;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const D = (easting - 500000) / (N1 * k0);

  const lat = phi1 - (N1 * tanPhi / R1) * (
    D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * (e2 / (1 - e2))) * D * D * D * D / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * (e2 / (1 - e2)) - 3 * C1 * C1) * D * D * D * D * D * D / 720
  );

  const lon = (
    D
    - (1 + 2 * T1 + C1) * D * D * D / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * (e2 / (1 - e2)) + 24 * T1 * T1) * D * D * D * D * D / 120
  ) / cosPhi;

  return {
    lat: lat * (180 / Math.PI),
    lon: lonOrigin + lon * (180 / Math.PI),
  };
}

function rdToWgs84(x: number, y: number): { lat: number; lon: number } {
  // Rijksdriehoek to WGS84 approximation using the standard Dutch formula
  const dX = (x - 155000) * 1e-5;
  const dY = (y - 463000) * 1e-5;

  const lat = 52.15517440 +
    (dY * 3235.65389) +
    (dX * dX * -32.58297) +
    (dY * dY * -0.24750) +
    (dX * dX * dY * -0.84978) +
    (dY * dY * dY * -0.06550) +
    (dX * dX * dY * dY * -0.01709) +
    (dX * dX * dX * dX * -0.00738) +
    (dY * dY * dY * dY * 0.00530) +
    (dX * dX * dY * dY * dY * -0.00039) +
    (dX * dX * dX * dX * dY * 0.00033) +
    (dX * dX * dY * dY * dY * dY * -0.00012);

  const lon = 5.38720621 +
    (dX * 5260.52916) +
    (dX * dY * 105.94684) +
    (dX * dY * dY * 2.45656) +
    (dX * dX * dX * -0.81885) +
    (dX * dY * dY * dY * 0.05594) +
    (dX * dX * dX * dY * -0.05607) +
    (dY * 0.01199) +
    (dX * dX * dX * dY * dY * -0.00256) +
    (dX * dY * dY * dY * dY * 0.00128) +
    (dX * dX * dX * dX * dX * 0.00022) +
    (dY * dY * -0.00022) +
    (dX * dX * dX * dY * dY * dY * 0.00026);

  return {
    lat: lat / 3600,
    lon: lon / 3600,
  };
}

async function fetchRWSStations(): Promise<StationRecord[]> {
  let catalogus: DDLCatalogusEntry[] = [];
  let usedOldApi = false;

  // Try new DDL API first
  try {
    console.log('Catalogus ophalen via nieuwe DDL API...');
    catalogus = await fetchCatalogus(false);
    console.log(`Nieuwe DDL API: ${catalogus.length} catalogus-entries gevonden`);
  } catch (err) {
    console.warn(`Nieuwe DDL API mislukt: ${err}`);
  }

  // Fall back to old API if new one fails or returns empty
  if (catalogus.length === 0) {
    try {
      console.log('Terugvallen op oude waterwebservices API...');
      catalogus = await fetchCatalogus(true);
      usedOldApi = true;
      console.log(`Oude API: ${catalogus.length} catalogus-entries gevonden`);
    } catch (err) {
      throw new Error(`Beide RWS APIs gefaald. Nieuwe API: eerder gefaald. Oude API: ${err}`);
    }
  }

  if (catalogus.length === 0) {
    console.log('Geen neerslag-meetlocaties gevonden in catalogus');
    return [];
  }

  // Extract unique locations from catalogus
  const locations = catalogusToLocations(catalogus);
  console.log(`${locations.length} unieke meetlocaties gevonden`);

  // Build station records from catalogus
  const stationMap = new Map<string, StationRecord>();

  for (const entry of catalogus) {
    if (stationMap.has(entry.Code)) continue;

    const coords = parseCoordinates(entry);

    // Validate coordinates are within Netherlands bounding box (roughly)
    if (coords.lat < 50.5 || coords.lat > 53.7 || coords.lon < 3.2 || coords.lon > 7.3) {
      console.warn(`Station ${entry.Code} (${entry.Naam}) heeft ongeldige coordinaten: ${coords.lat}, ${coords.lon} - overgeslagen`);
      continue;
    }

    stationMap.set(entry.Code, {
      external_id: entry.Code,
      name: entry.Naam || `RWS ${entry.Code}`,
      latitude: coords.lat,
      longitude: coords.lon,
      operator: 'Rijkswaterstaat',
      sensor_type: 'Neerslagmeter',
      metadata: {
        coordinatenstelsel: entry.Coordinatenstelsel,
        original_x: entry.X,
        original_y: entry.Y,
        eenheid: entry.Eenheid?.Code,
        grootheid: entry.Grootheid?.Code,
        hoedanigheid: entry.Hoedanigheid?.Code,
        compartiment: entry.Compartiment?.Code,
        parameter_omschrijving: entry.Parameter_Wat_Omschrijving,
        api_versie: usedOldApi ? 'old_waterwebservices' : 'ddapi20',
      },
    });
  }

  // Try to fetch latest measurements
  try {
    console.log('Laatste waarnemingen ophalen...');
    const waarnemingen = await fetchLaatsteWaarnemingen(locations, usedOldApi);
    console.log(`${waarnemingen.length} waarnemingen ontvangen`);

    for (const w of waarnemingen) {
      const station = stationMap.get(w.Code);
      if (!station) continue;

      const value = w.Meetwaarde?.Waarde_Numeriek;
      if (value === undefined || value === null) continue;

      station.measurement = {
        measured_at: w.Tijdstip,
        rainfall_mm: value,
        rainfall_period: '10min',
        raw_data: {
          grootheid: w.Grootheid?.Code,
          eenheid: w.Eenheid?.Code,
          statuswaarden: w.WaarnemingMetadata?.StatuswaardeLijst,
        },
      };
    }
  } catch (err) {
    console.warn(`Waarnemingen ophalen mislukt (stations worden wel opgeslagen): ${err}`);
    // Continue - we still have station data from catalogus
  }

  const stations = Array.from(stationMap.values());
  console.log(`${stations.length} stations klaar voor sync, ${stations.filter(s => s.measurement).length} met meetwaarden`);
  return stations;
}

Deno.serve(async (_req) => {
  try {
    const result = await runSync(SOURCE_KEY, fetchRWSStations);
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
