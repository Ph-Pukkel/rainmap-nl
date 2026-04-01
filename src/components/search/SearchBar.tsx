'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearch } from '@/hooks/useSearch';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import SearchResults from './SearchResults';

export default function SearchBar() {
  const { query, setQuery, results, isLoading, clear } = useSearch();
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setViewport } = useMapStore();
  const { setSelectedStationId } = useUIStore();

  const showResults = isFocused && (results.length > 0 || isLoading);

  const handleSelect = useCallback((result: { id: string; latitude: number; longitude: number }) => {
    setViewport({ center: [result.longitude, result.latitude], zoom: 14 });
    setSelectedStationId(result.id);
    clear();
    setIsFocused(false);
    inputRef.current?.blur();
  }, [setViewport, setSelectedStationId, clear]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      clear();
      setIsFocused(false);
      inputRef.current?.blur();
    }
  }, [results, selectedIndex, handleSelect, clear]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  return (
    <div className="absolute top-4 left-14 right-4 md:left-auto md:right-4 md:w-80 z-20">
      <div className="relative">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder="Zoek station, gemeente of postcode..."
            className="w-full pl-10 pr-8 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {query && (
            <button
              onClick={clear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {showResults && (
          <SearchResults
            results={results}
            isLoading={isLoading}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
          />
        )}
      </div>
    </div>
  );
}
