'use client';

import { useEffect, useState } from 'react';
import { useLayerStore } from '@/store/layerStore';
import { getDataSources } from '@/data';
import type { DataSource } from '@/types';

export default function Legend() {
  const { activeLayers } = useLayerStore();
  const [sources, setSources] = useState<DataSource[]>([]);

  useEffect(() => {
    try {
      const sources = getDataSources();
      setSources(sources);
    } catch (err) {
      console.error('Fout bij laden databronnen:', err);
    }
  }, []);

  const activeSources = sources.filter((s) => activeLayers.has(s.source_key));

  if (activeSources.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Legenda
      </h3>
      <div className="space-y-1.5">
        {activeSources.map((source) => (
          <div key={source.source_key} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full shadow-sm"
              style={{ backgroundColor: source.color }}
            />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {source.display_name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
