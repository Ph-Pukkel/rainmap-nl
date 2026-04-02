'use client';

import { useEffect, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { supabase } from '@/lib/supabase/client';
import type { StationWithLatest } from '@/types';
import { formatDate, formatRainfall } from '@/lib/utils';

export default function StationPopup() {
  const { selectedStationId, setSelectedStationId } = useUIStore();
  const [station, setStation] = useState<StationWithLatest | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!selectedStationId) {
      setStation(null);
      return;
    }

    setLoading(true);
    async function fetchStation() {
      const { data, error } = await supabase
        .from('stations_with_latest')
        .select('*')
        .eq('id', selectedStationId)
        .single();

      if (!error && data) {
        setStation(data as StationWithLatest);
      }
      setLoading(false);
    }
    fetchStation();
  }, [selectedStationId]);

  if (!selectedStationId) return null;

  const handleClose = () => setSelectedStationId(null);

  const content = (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
            {station?.name || 'Laden...'}
          </h3>
          {station?.external_id && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({station.external_id})
            </span>
          )}
        </div>
        {station && (
          <span
            className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full text-white flex-shrink-0"
            style={{ backgroundColor: station.source_color }}
          >
            {station.source_display_name}
          </span>
        )}
        <button
          onClick={handleClose}
          className="ml-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
          aria-label="Sluiten"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      ) : station ? (
        <>
          {/* Metadata */}
          <div className="space-y-1.5 text-sm border-b border-gray-100 dark:border-gray-700 pb-3 mb-3">
            {station.operator && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Beheerder</span>
                <span className="text-gray-900 dark:text-white">{station.operator}</span>
              </div>
            )}
            {station.sensor_type && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Type sensor</span>
                <span className="text-gray-900 dark:text-white">{station.sensor_type}</span>
              </div>
            )}
            {station.municipality && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Gemeente</span>
                <span className="text-gray-900 dark:text-white">{station.municipality}</span>
              </div>
            )}
            {station.province && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Provincie</span>
                <span className="text-gray-900 dark:text-white">{station.province}</span>
              </div>
            )}
            {station.elevation_m !== null && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Hoogte</span>
                <span className="text-gray-900 dark:text-white">{station.elevation_m}m NAP</span>
              </div>
            )}
          </div>

          {/* Latest measurement */}
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Laatste meting
            </h4>
            {station.latest_rainfall_mm !== null ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {formatRainfall(station.latest_rainfall_mm)}
                  </span>
                  {station.latest_rainfall_period && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ({station.latest_rainfall_period === '10min' ? 'afgelopen 10 min' :
                        station.latest_rainfall_period === '1h' ? 'afgelopen uur' :
                        station.latest_rainfall_period === '24h' ? 'afgelopen 24 uur' :
                        station.latest_rainfall_period})
                    </span>
                  )}
                </div>
                {station.latest_temperature_c !== null && (
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {station.latest_temperature_c.toFixed(1)} °C
                  </div>
                )}
                <div className="text-xs text-gray-400">
                  {formatDate(station.latest_measured_at)}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Geen recente meetdata beschikbaar</p>
            )}
          </div>

          {/* Google Maps links */}
          <div className="flex gap-2 mb-3">
            <a
              href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${station.latitude},${station.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              Street View
            </a>
            <a
              href={`https://www.google.com/maps/@${station.latitude},${station.longitude},17z/data=!3m1!1e1`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/>
              </svg>
              Satelliet
            </a>
          </div>

          {/* Coordinates */}
          <div className="text-xs text-gray-400 mb-3">
            {station.latitude.toFixed(4)}°N, {station.longitude.toFixed(4)}°E
          </div>

          {/* Link to source */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
            <span className="text-xs text-gray-400">
              Bron: {station.source_display_name}
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500">Station niet gevonden</p>
      )}
    </>
  );

  // Mobile: bottom-sheet
  if (isMobile) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 bg-white dark:bg-gray-900 rounded-t-2xl shadow-lg p-4 max-h-[60vh] overflow-y-auto animate-slide-up">
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>
        {content}
      </div>
    );
  }

  // Desktop: floating card
  return (
    <div className="absolute bottom-6 left-4 z-20 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 w-80 max-h-[70vh] overflow-y-auto">
      {content}
    </div>
  );
}
