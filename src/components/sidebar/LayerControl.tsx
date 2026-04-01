'use client';

import { useEffect, useState } from 'react';
import { useLayerStore } from '@/store/layerStore';
import { supabase } from '@/lib/supabase/client';
import type { DataSource, SourceType } from '@/types';
import LayerItem from './LayerItem';
import FilterPanel from './FilterPanel';

const TYPE_LABELS: Record<SourceType, string> = {
  professioneel: 'Professioneel',
  vrijwilliger: 'Vrijwilliger',
  consument: 'Consument',
};

const TYPE_ORDER: SourceType[] = ['professioneel', 'vrijwilliger', 'consument'];

function HeatmapToggle() {
  const { heatmapEnabled, setHeatmapEnabled } = useLayerStore();
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Overlays
      </h3>
      <button
        onClick={() => setHeatmapEnabled(!heatmapEnabled)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
          heatmapEnabled
            ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
            : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
        }`}
      >
        <div className={`w-4 h-4 rounded flex items-center justify-center text-xs ${
          heatmapEnabled ? 'bg-blue-500 text-white' : 'bg-gray-300 dark:bg-gray-600'
        }`}>
          {heatmapEnabled && '✓'}
        </div>
        <span className="text-sm text-gray-700 dark:text-gray-300">Dichtheids-heatmap</span>
      </button>
    </div>
  );
}

export default function LayerControl() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const { filterMode } = useLayerStore();

  useEffect(() => {
    async function fetchSources() {
      const { data, error } = await supabase
        .from('data_sources')
        .select('*')
        .order('layer_order');

      if (!error && data) {
        setDataSources(data as DataSource[]);
      }
      setLoading(false);
    }
    fetchSources();
  }, []);

  const filteredSources = dataSources.filter((source) => {
    if (filterMode === 'alle') return true;
    if (filterMode === 'professioneel') return source.source_type === 'professioneel';
    if (filterMode === 'amateur') return source.source_type === 'vrijwilliger' || source.source_type === 'consument';
    return true;
  });

  const groupedSources = TYPE_ORDER.reduce((acc, type) => {
    const sources = filteredSources.filter((s) => s.source_type === type);
    if (sources.length > 0) acc.push({ type, sources });
    return acc;
  }, [] as { type: SourceType; sources: DataSource[] }[]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterPanel />
      {groupedSources.map(({ type, sources }) => (
        <div key={type}>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {TYPE_LABELS[type]}
          </h3>
          <div className="space-y-1">
            {sources.map((source) => (
              <LayerItem key={source.source_key} source={source} />
            ))}
          </div>
        </div>
      ))}
      <HeatmapToggle />
    </div>
  );
}
