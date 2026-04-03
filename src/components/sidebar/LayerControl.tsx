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
    if (!source.is_active && source.station_count === 0) return false;
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
    </div>
  );
}
