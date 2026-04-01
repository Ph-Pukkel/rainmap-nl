import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { runSync, type StationRecord } from '../_shared/sync-utils.ts';

const SOURCE_KEY = 'waterschappen';

const WFS_ENDPOINTS: Record<string, { url: string; typeName: string }> = {
  'Waterschap Limburg': {
    url: 'https://geodata.waterschaplimburg.nl/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
  'Waterschap Aa en Maas': {
    url: 'https://geodata.aaenmaas.nl/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
  'Waterschap De Dommel': {
    url: 'https://geodata.dommel.nl/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
  'Hoogheemraadschap van Rijnland': {
    url: 'https://geodata.rijnland.net/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
  'Waterschap Rivierenland': {
    url: 'https://geodata.wsrl.nl/geoserver/wfs',
    typeName: 'meetpunten_neerslag',
  },
};

function buildWFSUrl(baseUrl: string, typeName: string): string {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  });
  return `${baseUrl}?${params.toString()}`;
}

async function fetchWaterschappenStations(): Promise<StationRecord[]> {
  const allStations: StationRecord[] = [];

  for (const [name, config] of Object.entries(WFS_ENDPOINTS)) {
    try {
      const url = buildWFSUrl(config.url, config.typeName);
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`WFS fout voor ${name}: ${response.status}`);
        continue;
      }

      const geojson = await response.json();

      if (geojson.features) {
        for (const feature of geojson.features) {
          if (feature.geometry?.type !== 'Point') continue;

          const [lon, lat] = feature.geometry.coordinates;
          const props = feature.properties || {};

          allStations.push({
            external_id: props.meetpuntcode || props.id || `${name}-${lon.toFixed(4)}-${lat.toFixed(4)}`,
            name: props.naam || props.name || `Meetpunt ${name}`,
            latitude: lat,
            longitude: lon,
            operator: name,
            sensor_type: 'Neerslagmeter',
            metadata: { ...props, waterschap: name },
          });
        }
      }
    } catch (error) {
      console.error(`Fout bij ophalen ${name}:`, error);
    }
  }

  return allStations;
}

serve(async (_req) => {
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
