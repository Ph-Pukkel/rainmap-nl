'use client';

import { useEffect, useState } from 'react';
import { usePageTracking } from '@/hooks/usePageTracking';

interface Stats {
  period: { days: number; since: string };
  totalViews: number;
  uniqueSessions: number;
  viewsPerDay: { date: string; views: number; sessions: number }[];
  topPages: { path: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  topCountries: { country: string; count: number }[];
  topCities: { city: string; count: number }[];
  devices: { device: string; count: number }[];
  topIPs: { ip: string; count: number; lastSeen: string; city?: string; country?: string }[];
  stationClicks: { station: string; source: string; ip: string; location: string | null; time: string }[];
}

const COUNTRY_NAMES: Record<string, string> = {
  NL: 'Nederland', BE: 'Belgie', DE: 'Duitsland', FR: 'Frankrijk',
  GB: 'Verenigd Koninkrijk', US: 'Verenigde Staten', ES: 'Spanje',
  IT: 'Italie', AT: 'Oostenrijk', CH: 'Zwitserland', PL: 'Polen',
  SE: 'Zweden', NO: 'Noorwegen', DK: 'Denemarken', FI: 'Finland',
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function BarChart({ data, maxVal }: { data: { label: string; value: number }[]; maxVal: number }) {
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-300 w-40 truncate flex-shrink-0" title={item.label}>
            {item.label}
          </span>
          <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${maxVal > 0 ? (item.value / maxVal) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-900 dark:text-white w-10 text-right flex-shrink-0">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function DayChart({ data }: { data: { date: string; views: number; sessions: number }[] }) {
  const maxViews = Math.max(...data.map((d) => d.views), 1);

  return (
    <div className="flex items-end gap-2 h-48 px-2">
      {data.map((d) => {
        const pct = (d.views / maxViews) * 100;
        const dateStr = new Date(d.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 max-w-16 group relative">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{d.views}</span>
            <div
              className="w-full bg-blue-500 dark:bg-blue-400 rounded-t min-h-[4px]"
              style={{ height: `${pct}%` }}
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{dateStr}</span>
            <div className="absolute -top-10 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
              {d.views} views, {d.sessions} sessies
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StatsPage() {
  usePageTracking();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              RainMap NL — Statistieken
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Bezoekersstatistieken (privacyvriendelijk, geen cookies)
            </p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  days === d
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-white dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <StatCard label="Paginaweergaven" value={stats.totalViews.toLocaleString('nl-NL')} />
              <StatCard label="Unieke sessies" value={stats.uniqueSessions.toLocaleString('nl-NL')} />
              <StatCard
                label="Gem. per dag"
                value={stats.viewsPerDay.length > 0
                  ? Math.round(stats.totalViews / stats.viewsPerDay.length).toLocaleString('nl-NL')
                  : '0'}
              />
            </div>

            {/* Views per day chart */}
            {stats.viewsPerDay.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                  Weergaven per dag
                </h2>
                <DayChart data={stats.viewsPerDay} />
              </div>
            )}

            {/* Grids */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Top pages */}
              {stats.topPages.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                    Pagina&apos;s
                  </h2>
                  <BarChart
                    data={stats.topPages.map((p) => ({ label: p.path, value: p.count }))}
                    maxVal={stats.topPages[0]?.count || 1}
                  />
                </div>
              )}

              {/* Top referrers */}
              {stats.topReferrers.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                    Verwijzers
                  </h2>
                  <BarChart
                    data={stats.topReferrers.map((r) => ({ label: r.referrer, value: r.count }))}
                    maxVal={stats.topReferrers[0]?.count || 1}
                  />
                </div>
              )}

              {/* Countries */}
              {stats.topCountries.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                    Landen
                  </h2>
                  <BarChart
                    data={stats.topCountries.map((c) => ({
                      label: COUNTRY_NAMES[c.country] || c.country,
                      value: c.count,
                    }))}
                    maxVal={stats.topCountries[0]?.count || 1}
                  />
                </div>
              )}

              {/* Cities */}
              {stats.topCities.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                    Steden
                  </h2>
                  <BarChart
                    data={stats.topCities.map((c) => ({ label: c.city, value: c.count }))}
                    maxVal={stats.topCities[0]?.count || 1}
                  />
                </div>
              )}

              {/* Devices */}
              {stats.devices.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                    Apparaten
                  </h2>
                  <BarChart
                    data={stats.devices.map((d) => ({ label: d.device, value: d.count }))}
                    maxVal={stats.devices[0]?.count || 1}
                  />
                </div>
              )}
            </div>

            {/* IP Addresses */}
            {stats.topIPs && stats.topIPs.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                  IP-adressen
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="pb-2 font-medium">IP-adres</th>
                        <th className="pb-2 font-medium">Locatie</th>
                        <th className="pb-2 font-medium text-right">Weergaven</th>
                        <th className="pb-2 font-medium text-right">Laatst gezien</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topIPs.map((entry) => (
                        <tr key={entry.ip} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="py-2 font-mono text-gray-900 dark:text-white">{entry.ip}</td>
                          <td className="py-2 text-gray-600 dark:text-gray-300">
                            {[entry.city, entry.country].filter(Boolean).join(', ') || '-'}
                          </td>
                          <td className="py-2 text-right text-gray-900 dark:text-white">{entry.count}</td>
                          <td className="py-2 text-right text-gray-500 dark:text-gray-400">
                            {new Date(entry.lastSeen).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Station clicks */}
            {stats.stationClicks && stats.stationClicks.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                  Stationklikken
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="pb-2 font-medium">Station</th>
                        <th className="pb-2 font-medium">Bron</th>
                        <th className="pb-2 font-medium">IP-adres</th>
                        <th className="pb-2 font-medium">Locatie</th>
                        <th className="pb-2 font-medium text-right">Tijdstip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.stationClicks.map((click, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="py-2 text-gray-900 dark:text-white">{click.station || '-'}</td>
                          <td className="py-2 text-gray-600 dark:text-gray-300">{click.source || '-'}</td>
                          <td className="py-2 font-mono text-gray-900 dark:text-white">{click.ip || '-'}</td>
                          <td className="py-2 text-gray-600 dark:text-gray-300">{click.location || '-'}</td>
                          <td className="py-2 text-right text-gray-500 dark:text-gray-400">
                            {new Date(click.time).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              Geen cookies, geen persoonlijke gegevens. Sessie-ID wordt opgeslagen in sessionStorage en verdwijnt bij het sluiten van de browser.
            </p>
          </>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">Kon statistieken niet laden.</p>
        )}
      </div>
    </div>
  );
}
