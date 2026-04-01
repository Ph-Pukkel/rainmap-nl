'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { DataSource } from '@/types';

export function useDataSources() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      try {
        const { data, error: fetchError } = await supabase
          .from('data_sources')
          .select('*')
          .order('layer_order');

        if (fetchError) throw fetchError;
        setDataSources((data as DataSource[]) || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Onbekende fout');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  return { dataSources, loading, error };
}
