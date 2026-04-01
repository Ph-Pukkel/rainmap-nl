'use client';

import { useLayerStore } from '@/store/layerStore';
import type { DataSource } from '@/types';
import SourceStatus from './SourceStatus';

interface LayerItemProps {
  source: DataSource;
}

export default function LayerItem({ source }: LayerItemProps) {
  const { activeLayers, toggleLayer } = useLayerStore();
  const isActive = activeLayers.has(source.source_key);

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-gray-50 dark:bg-gray-800'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
      onClick={() => toggleLayer(source.source_key)}
    >
      {/* Kleurstip en schakelaar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className="w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 shadow-sm"
          style={{ backgroundColor: isActive ? source.color : '#D1D5DB' }}
        />
        <div
          className={`relative w-9 h-5 rounded-full transition-colors ${
            isActive ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <div
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              isActive ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </div>
      </div>

      {/* Informatie */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {source.display_name}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{source.station_count.toLocaleString('nl-NL')} stations</span>
          <SourceStatus source={source} />
        </div>
      </div>
    </div>
  );
}
