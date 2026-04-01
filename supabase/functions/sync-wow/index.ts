import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { runSync, type StationRecord } from '../_shared/sync-utils.ts';

const SOURCE_KEY = 'wow_nl';

async function fetchWOWStations(): Promise<StationRecord[]> {
  // Try the WOW-NL public data feed
  // The wow.knmi.nl site serves GeoJSON to its map — use the public endpoint
  const response = await fetch('https://wow.knmi.nl/api/observations/recent');

  if (!response.ok) {
    // Fallback: try UK Met Office WOW API filtered for Netherlands bounds
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

  // Handle both GeoJSON FeatureCollection and array formats
  const features = Array.isArray(data)
    ? data
    : (data as { features?: unknown[] }).features || [];

  for (const item of features as Record<string, unknown>[]) {
    try {
      let lat: number, lon: number, id: string, name: string;
      let rainfall: number | undefined;
      let timestamp: string | undefined;

      if (item.geometry) {
        // GeoJSON format
        const geometry = item.geometry as { coordinates: [number, number] };
        [lon, lat] = geometry.coordinates;
        const props = (item.properties as Record<string, unknown>) || {};
        id = String(props.site_id || props.id || `wow-${lon.toFixed(4)}-${lat.toFixed(4)}`);
        name = String(props.naam || props.name || props.site_name || `WOW Station ${id}`);
        rainfall = (props.laatste_neerslag ?? props.rainfall ?? props.rain) as number | undefined;
        timestamp = props.timestamp as string | undefined || props.observation_time as string | undefined;
      } else {
        // Flat object format
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

serve(async (_req) => {
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
