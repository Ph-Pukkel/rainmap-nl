import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { stationId, stationName, sourceKey, sessionId } = await req.json();

    if (!stationId) {
      return NextResponse.json({ error: 'stationId required' }, { status: 400 });
    }

    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    const country = req.headers.get('x-vercel-ip-country') || null;
    const city = req.headers.get('x-vercel-ip-city');

    await supabase.from('station_clicks').insert({
      station_id: stationId,
      station_name: stationName || null,
      source_key: sourceKey || null,
      ip_address: ipAddress,
      country,
      city: city ? decodeURIComponent(city) : null,
      session_id: sessionId || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
