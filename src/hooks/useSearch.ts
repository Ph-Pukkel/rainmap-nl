'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { searchStations } from '@/data';

interface SearchResult {
  id: string;
  name: string;
  municipality: string | null;
  province: string | null;
  source_key: string;
  latitude: number;
  longitude: number;
  rank: number;
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback((searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const data = searchStations(searchQuery, 10);
      setResults(data);
    } catch (err) {
      console.error('Zoekfout:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
  }, []);

  return { query, setQuery, results, isLoading, clear };
}
