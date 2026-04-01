import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceKeys = searchParams.get('sources')?.split(',').filter(Boolean);

  try {
    const supabase = createServerClient();

    const { data, error } = await supabase.rpc('get_stations_geojson', {
      source_keys: sourceKeys || null,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Server fout' },
      { status: 500 }
    );
  }
}
