'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useLayerStore } from '@/store/layerStore';
import type { StationFeatureCollection } from '@/types';

export function useStations() {
  const [data, setData] = useState<Record<string, StationFeatureCollection>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeLayers, setSourceError } = useLayerStore();

  const fetchStations = useCallback(async (sourceKeys: string[]) => {
    if (sourceKeys.length === 0) return;

    try {
      const { data: geojson, error: rpcError } = await supabase.rpc('get_stations_geojson', {
        source_keys: sourceKeys,
      });

      if (rpcError) throw rpcError;

      // We get a single FeatureCollection, split by source_key
      const collection = geojson as StationFeatureCollection;
      const bySource: Record<string, StationFeatureCollection> = {};

      for (const key of sourceKeys) {
        bySource[key] = {
          type: 'FeatureCollection',
          features: collection.features.filter(
            (f) => f.properties.source_key === key
          ),
        };
      }

      setData((prev) => ({ ...prev, ...bySource }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      setError(message);
      for (const key of sourceKeys) {
        setSourceError(key, message);
      }
    } finally {
      setLoading(false);
    }
  }, [setSourceError]);

  useEffect(() => {
    const keys = Array.from(activeLayers);
    setLoading(true);
    fetchStations(keys);
  }, [activeLayers, fetchStations]);

  const refetch = useCallback(() => {
    const keys = Array.from(activeLayers);
    setLoading(true);
    fetchStations(keys);
  }, [activeLayers, fetchStations]);

  return { data, loading, error, refetch };
}
