import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { runSync, type StationRecord } from '../_shared/sync-utils.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';

const SOURCE_KEY_AWS = 'knmi_aws';
const SOURCE_KEY_NEERSLAG = 'knmi_neerslag';

async function getKNMIApiKey(): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('data_sources')
    .select('api_key')
    .eq('source_key', SOURCE_KEY_AWS)
    .single();
  return data?.api_key || Deno.env.get('KNMI_API_KEY') || '';
}

async function fetchKNMIAWSStations(): Promise<StationRecord[]> {
  const apiKey = await getKNMIApiKey();
  if (!apiKey) throw new Error('KNMI API-key niet geconfigureerd');

  const baseUrl = 'https://api.dataplatform.knmi.nl/open-data/v1/';

  // Fetch list of files for actuele waarnemingen
  const listResp = await fetch(`${baseUrl}datasets/Actuele10telegraafdata/versions/2/files`, {
    headers: { Authorization: apiKey },
  });

  if (!listResp.ok) throw new Error(`KNMI API fout: ${listResp.status}`);
  const listData = await listResp.json();

  // Get the latest file
  const files = listData.files || [];
  if (files.length === 0) throw new Error('Geen KNMI data bestanden gevonden');

  const latestFile = files[files.length - 1];

  // Get download URL
  const urlResp = await fetch(
    `${baseUrl}datasets/Actuele10telegraafdata/versions/2/files/${latestFile.filename}/url`,
    { headers: { Authorization: apiKey } }
  );

  if (!urlResp.ok) throw new Error(`KNMI download URL fout: ${urlResp.status}`);
  const urlData = await urlResp.json();

  // Download and parse the data
  const dataResp = await fetch(urlData.temporaryDownloadUrl);
  const rawText = await dataResp.text();

  return parseKNMIData(rawText);
}

function parseKNMIData(text: string): StationRecord[] {
  const stations: StationRecord[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith('# STN')) {
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!line.trim()) continue;

    const values = line.split(',').map(v => v.trim());

    if (values.length < 5) continue;

    const stnCode = values[0];

    // Parse known KNMI station metadata (simplified)
    stations.push({
      external_id: stnCode,
      name: `KNMI Station ${stnCode}`,
      latitude: 0, // Will be filled from station metadata
      longitude: 0,
      operator: 'KNMI',
      sensor_type: 'Automatisch weerstation',
      metadata: { raw_values: values },
    });
  }

  return stations;
}

async function fetchKNMINeerslagStations(): Promise<StationRecord[]> {
  const apiKey = await getKNMIApiKey();
  if (!apiKey) throw new Error('KNMI API-key niet geconfigureerd');

  const baseUrl = 'https://api.dataplatform.knmi.nl/open-data/v1/';

  const listResp = await fetch(`${baseUrl}datasets/neerslagstations_metadata/versions/1/files`, {
    headers: { Authorization: apiKey },
  });

  if (!listResp.ok) throw new Error(`KNMI Neerslag API fout: ${listResp.status}`);
  const listData = await listResp.json();

  const files = listData.files || [];
  if (files.length === 0) return [];

  const latestFile = files[files.length - 1];

  const urlResp = await fetch(
    `${baseUrl}datasets/neerslagstations_metadata/versions/1/files/${latestFile.filename}/url`,
    { headers: { Authorization: apiKey } }
  );

  if (!urlResp.ok) throw new Error(`KNMI Neerslag URL fout: ${urlResp.status}`);
  const urlData = await urlResp.json();

  const dataResp = await fetch(urlData.temporaryDownloadUrl);
  const data = await dataResp.json();

  const stations: StationRecord[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      stations.push({
        external_id: item.stationcode || item.code || String(item.id),
        name: item.stationname || item.naam || `Neerslagstation ${item.stationcode}`,
        latitude: item.lat || item.latitude || 0,
        longitude: item.lon || item.longitude || 0,
        municipality: item.municipality || item.gemeente,
        province: item.province || item.provincie,
        operator: 'KNMI Vrijwilliger',
        sensor_type: 'Handmatige neerslagmeter',
        elevation_m: item.alt || item.hoogte,
      });
    }
  }

  return stations;
}

serve(async (req) => {
  const url = new URL(req.url);
  const sourceType = url.searchParams.get('type') || 'aws';

  try {
    let result;
    if (sourceType === 'neerslag') {
      result = await runSync(SOURCE_KEY_NEERSLAG, fetchKNMINeerslagStations);
    } else {
      result = await runSync(SOURCE_KEY_AWS, fetchKNMIAWSStations);
    }

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
