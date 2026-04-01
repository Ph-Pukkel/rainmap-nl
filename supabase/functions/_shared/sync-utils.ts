import { createServiceClient } from './supabase-client.ts';

export interface StationRecord {
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

export interface SyncResult {
  source_key: string;
  stations_synced: number;
  measurements_synced: number;
  errors: string[];
}

export async function getDataSource(sourceKey: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('data_sources')
    .select('*')
    .eq('source_key', sourceKey)
    .single();
  if (error) throw new Error(`Bron ${sourceKey} niet gevonden: ${error.message}`);
  return data;
}

export async function startSyncLog(sourceKey: string): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('sync_logs')
    .insert({ source_key: sourceKey, status: 'running' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function completeSyncLog(
  logId: string,
  status: 'success' | 'error',
  stationsSynced: number,
  measurementsSynced: number,
  errorMessage?: string
) {
  const supabase = createServiceClient();
  const startedAt = await supabase
    .from('sync_logs')
    .select('started_at')
    .eq('id', logId)
    .single();

  const durationMs = startedAt.data
    ? Date.now() - new Date(startedAt.data.started_at).getTime()
    : 0;

  await supabase
    .from('sync_logs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      stations_synced: stationsSynced,
      measurements_synced: measurementsSynced,
      error_message: errorMessage,
      duration_ms: durationMs,
    })
    .eq('id', logId);
}

export async function upsertStations(sourceKey: string, stations: StationRecord[]): Promise<number> {
  const supabase = createServiceClient();
  let count = 0;

  for (const station of stations) {
    const { error } = await supabase
      .from('stations')
      .upsert(
        {
          source_key: sourceKey,
          external_id: station.external_id,
          name: station.name,
          location: `POINT(${station.longitude} ${station.latitude})`,
          latitude: station.latitude,
          longitude: station.longitude,
          municipality: station.municipality || null,
          province: station.province || null,
          operator: station.operator || null,
          sensor_type: station.sensor_type || null,
          elevation_m: station.elevation_m || null,
          metadata: station.metadata || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source_key,external_id' }
      );

    if (!error) count++;
  }

  return count;
}

export async function upsertMeasurements(sourceKey: string, stations: StationRecord[]): Promise<number> {
  const supabase = createServiceClient();
  let count = 0;

  for (const station of stations) {
    if (!station.measurement) continue;

    // First get the station ID
    const { data: stationRow } = await supabase
      .from('stations')
      .select('id')
      .eq('source_key', sourceKey)
      .eq('external_id', station.external_id)
      .single();

    if (!stationRow) continue;

    const { error } = await supabase
      .from('measurements')
      .upsert(
        {
          station_id: stationRow.id,
          source_key: sourceKey,
          measured_at: station.measurement.measured_at,
          rainfall_mm: station.measurement.rainfall_mm ?? null,
          rainfall_period: station.measurement.rainfall_period ?? null,
          temperature_c: station.measurement.temperature_c ?? null,
          raw_data: station.measurement.raw_data || {},
        },
        { onConflict: 'station_id,measured_at,rainfall_period' }
      );

    if (!error) count++;
  }

  return count;
}

export async function updateSourceStatus(
  sourceKey: string,
  status: 'success' | 'error',
  stationCount?: number,
  errorMessage?: string
) {
  const supabase = createServiceClient();
  const update: Record<string, unknown> = {
    last_sync_at: new Date().toISOString(),
    last_sync_status: status,
    updated_at: new Date().toISOString(),
  };
  if (stationCount !== undefined) update.station_count = stationCount;
  if (status === 'error') update.last_error = errorMessage;
  if (status === 'success') update.last_error = null;

  await supabase
    .from('data_sources')
    .update(update)
    .eq('source_key', sourceKey);
}

export async function runSync(
  sourceKey: string,
  fetchFn: () => Promise<StationRecord[]>
): Promise<SyncResult> {
  const source = await getDataSource(sourceKey);
  if (!source.is_configured) {
    return { source_key: sourceKey, stations_synced: 0, measurements_synced: 0, errors: ['Niet geconfigureerd'] };
  }

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
