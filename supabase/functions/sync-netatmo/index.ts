import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { runSync, type StationRecord } from '../_shared/sync-utils.ts';

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

serve(async (_req) => {
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
