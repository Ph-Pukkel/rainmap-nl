import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { path, referrer, screenWidth, screenHeight, sessionId } = body;

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path required' }, { status: 400 });
    }

    const forwarded = req.headers.get('x-forwarded-for');
    const country = req.headers.get('x-vercel-ip-country') || undefined;
    const city = req.headers.get('x-vercel-ip-city') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    await supabase.from('page_views').insert({
      path: path.slice(0, 500),
      referrer: referrer?.slice(0, 1000) || null,
      user_agent: userAgent?.slice(0, 500) || null,
      country: country || null,
      city: city ? decodeURIComponent(city) : null,
      screen_width: screenWidth || null,
      screen_height: screenHeight || null,
      session_id: sessionId || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // fail silently
  }
}
