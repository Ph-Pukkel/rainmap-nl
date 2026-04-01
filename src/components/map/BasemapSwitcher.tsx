'use client';

import { useMapStore } from '@/store/mapStore';
import type { MapStyleKey } from '@/lib/map/styles';

const STYLE_LABELS: Record<MapStyleKey, string> = {
  standaard: 'Standaard',
  licht: 'Licht',
  donker: 'Donker',
  satelliet: 'Satelliet',
};

const STYLE_ORDER: MapStyleKey[] = ['standaard', 'licht', 'donker', 'satelliet'];

export default function BasemapSwitcher() {
  const { mapStyle, setMapStyle } = useMapStore();

  const handleCycle = () => {
    const currentIndex = STYLE_ORDER.indexOf(mapStyle);
    const nextIndex = (currentIndex + 1) % STYLE_ORDER.length;
    setMapStyle(STYLE_ORDER[nextIndex]);
  };

  return (
    <button
      onClick={handleCycle}
      className="absolute bottom-6 right-4 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      aria-label="Kaartstijl wisselen"
      title={`Huidige stijl: ${STYLE_LABELS[mapStyle]}`}
    >
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        {STYLE_LABELS[mapStyle]}
      </span>
    </button>
  );
}
