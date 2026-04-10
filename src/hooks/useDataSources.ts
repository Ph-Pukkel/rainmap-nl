'use client';

import { useEffect, useState } from 'react';
import { getDataSources } from '@/data';
import type { DataSource } from '@/types';

export function useDataSources() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const sources = getDataSources();
      setDataSources(sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }, []);

  return { dataSources, loading, error };
}
