import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Fetch all page views within the period
  const { data: views, error } = await supabase
    .from('page_views')
    .select('path, referrer, country, city, screen_width, session_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = views || [];

  // Total page views
  const totalViews = rows.length;

  // Unique sessions
  const uniqueSessions = new Set(rows.map((r) => r.session_id)).size;

  // Views per day
  const perDay: Record<string, number> = {};
  const sessionsPerDay: Record<string, Set<string>> = {};
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    perDay[day] = (perDay[day] || 0) + 1;
    if (!sessionsPerDay[day]) sessionsPerDay[day] = new Set();
    sessionsPerDay[day].add(r.session_id);
  }

  const viewsPerDay = Object.entries(perDay)
    .map(([date, count]) => ({ date, views: count, sessions: sessionsPerDay[date]?.size || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top pages
  const pageCounts: Record<string, number> = {};
  for (const r of rows) {
    pageCounts[r.path] = (pageCounts[r.path] || 0) + 1;
  }
  const topPages = Object.entries(pageCounts)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top referrers
  const refCounts: Record<string, number> = {};
  for (const r of rows) {
    if (r.referrer) {
      try {
        const host = new URL(r.referrer).hostname;
        refCounts[host] = (refCounts[host] || 0) + 1;
      } catch {
        refCounts[r.referrer] = (refCounts[r.referrer] || 0) + 1;
      }
    }
  }
  const topReferrers = Object.entries(refCounts)
    .map(([referrer, count]) => ({ referrer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Countries
  const countryCounts: Record<string, number> = {};
  for (const r of rows) {
    if (r.country) {
      countryCounts[r.country] = (countryCounts[r.country] || 0) + 1;
    }
  }
  const topCountries = Object.entries(countryCounts)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Cities
  const cityCounts: Record<string, number> = {};
  for (const r of rows) {
    if (r.city) {
      cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
    }
  }
  const topCities = Object.entries(cityCounts)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Screen sizes (buckets)
  const screenBuckets: Record<string, number> = {};
  for (const r of rows) {
    if (r.screen_width) {
      const bucket =
        r.screen_width < 768 ? 'Mobiel (<768)' :
        r.screen_width < 1024 ? 'Tablet (768-1023)' :
        r.screen_width < 1440 ? 'Desktop (1024-1439)' :
        'Groot (1440+)';
      screenBuckets[bucket] = (screenBuckets[bucket] || 0) + 1;
    }
  }
  const devices = Object.entries(screenBuckets)
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    period: { days, since },
    totalViews,
    uniqueSessions,
    viewsPerDay,
    topPages,
    topReferrers,
    topCountries,
    topCities,
    devices,
  });
}
