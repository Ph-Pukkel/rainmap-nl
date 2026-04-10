'use client';

import { useState, useEffect, useCallback } from 'react';
import { getStationsGeoJSON } from '@/data';
import { useLayerStore } from '@/store/layerStore';
import type { StationFeatureCollection } from '@/types';

export function useStations() {
  const [data, setData] = useState<Record<string, StationFeatureCollection>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeLayers } = useLayerStore();

  const fetchStations = useCallback((sourceKeys: string[]) => {
    if (sourceKeys.length === 0) return;

    try {
      const geojson = getStationsGeoJSON(sourceKeys);
      const bySource: Record<string, StationFeatureCollection> = {};

      for (const key of sourceKeys) {
        bySource[key] = {
          type: 'FeatureCollection',
          features: geojson.features.filter(
            (f) => f.properties.source_key === key
          ),
        };
      }

      setData((prev) => ({ ...prev, ...bySource }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

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
