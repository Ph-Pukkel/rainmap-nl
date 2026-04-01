'use client';

import { useCallback } from 'react';
import { useMapStore } from '@/store/mapStore';

export default function MapControls() {
  const { zoom, setZoom } = useMapStore();

  const handleZoomIn = useCallback(() => {
    setZoom(Math.min(zoom + 1, 18));
  }, [zoom, setZoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(Math.max(zoom - 1, 6));
  }, [zoom, setZoom]);

  return (
    <div className="absolute bottom-24 right-4 flex flex-col gap-2 md:hidden z-10">
      <button
        onClick={handleZoomIn}
        className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        aria-label="Inzoomen"
      >
        +
      </button>
      <button
        onClick={handleZoomOut}
        className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        aria-label="Uitzoomen"
      >
        −
      </button>
    </div>
  );
}
