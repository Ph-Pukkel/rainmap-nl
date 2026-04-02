import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceRoleKey);
}

// --- sync-all orchestration logic ---

interface SyncResult {
  source_key: string;
  status: 'success' | 'error' | 'skipped';
  message?: string;
}

Deno.serve(async (_req) => {
  const supabase = createServiceClient();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Get all active, configured data sources
  const { data: sources } = await supabase
    .from('data_sources')
    .select('source_key, is_configured, is_active')
    .eq('is_active', true);

  const results: SyncResult[] = [];

  const syncFunctions: Record<string, string> = {
    knmi_aws: 'sync-knmi?type=aws',
    knmi_neerslag: 'sync-knmi?type=neerslag',
    rws_waterinfo: 'sync-buienradar',
    waterschappen: 'sync-waterschappen',
    wow_nl: 'sync-wow',
    netatmo: 'sync-netatmo',
    agro: 'sync-agro',
  };

  for (const source of sources || []) {
    if (!source.is_configured) {
      results.push({
        source_key: source.source_key,
        status: 'skipped',
        message: 'Niet geconfigureerd',
      });
      continue;
    }

    const funcPath = syncFunctions[source.source_key];
    if (!funcPath) {
      results.push({
        source_key: source.source_key,
        status: 'skipped',
        message: 'Geen sync-functie beschikbaar',
      });
      continue;
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${funcPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        results.push({
          source_key: source.source_key,
          status: 'success',
          message: `${data.stations_synced} stations, ${data.measurements_synced} metingen`,
        });
      } else {
        results.push({
          source_key: source.source_key,
          status: 'error',
          message: `HTTP ${response.status}`,
        });
      }
    } catch (error) {
      results.push({
        source_key: source.source_key,
        status: 'error',
        message: (error as Error).message,
      });
    }
  }

  return new Response(JSON.stringify({ results, timestamp: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
