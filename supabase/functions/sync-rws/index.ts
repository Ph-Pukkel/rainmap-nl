import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { runSync, type StationRecord } from '../_shared/sync-utils.ts';
import { rdToWgs84 } from '../_shared/geo-utils.ts';

const SOURCE_KEY = 'rws_waterinfo';
const BASE_URL = 'https://waterinfo.rws.nl/api/';

async function fetchRWSStations(): Promise<StationRecord[]> {
  // Fetch measurement locations for rainfall
  const response = await fetch(`${BASE_URL}meetlocaties?categorieId=1`);
  if (!response.ok) throw new Error(`RWS API fout: ${response.status}`);

  const locations = await response.json();
  const stations: StationRecord[] = [];

  for (const loc of locations) {
    const { lat, lon } = rdToWgs84(loc.x_coordinaat || loc.X, loc.y_coordinaat || loc.Y);

    const station: StationRecord = {
      external_id: loc.meetlocatie_code || loc.Code,
      name: loc.naam || loc.Naam || `RWS ${loc.meetlocatie_code || loc.Code}`,
      latitude: lat,
      longitude: lon,
      operator: 'Rijkswaterstaat',
      sensor_type: 'Neerslagmeter',
      metadata: {
        original_x: loc.x_coordinaat || loc.X,
        original_y: loc.y_coordinaat || loc.Y,
        beheerder: loc.beheerder,
      },
    };

    // Try to get latest measurement
    try {
      const code = loc.meetlocatie_code || loc.Code;
      const mResp = await fetch(`${BASE_URL}meetgegevens?meetlocatieCode=${code}&parameterId=Regen`);
      if (mResp.ok) {
        const mData = await mResp.json();
        if (mData && mData.length > 0) {
          const latest = mData[mData.length - 1];
          station.measurement = {
            measured_at: latest.tijdstip || new Date().toISOString(),
            rainfall_mm: parseFloat(latest.waarde) || 0,
            rainfall_period: '10min',
          };
        }
      }
    } catch {
      // Measurement fetch failed, continue without
    }

    stations.push(station);
  }

  return stations;
}

serve(async (_req) => {
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
