import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { runSync, type StationRecord } from '../_shared/sync-utils.ts';

const SOURCE_KEY = 'agro';

async function fetchAgroStations(): Promise<StationRecord[]> {
  // Agro data sources are not yet available
  // This is a placeholder that returns empty data
  console.log('Agro sync: bron nog niet beschikbaar');
  return [];
}

serve(async (_req) => {
  try {
    const result = await runSync(SOURCE_KEY, fetchAgroStations);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
