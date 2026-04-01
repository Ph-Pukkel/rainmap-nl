'use client';

import { useRef, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';

export function useMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);

  const setMap = useCallback((map: maplibregl.Map | null) => {
    mapRef.current = map;
  }, []);

  const flyTo = useCallback((lat: number, lng: number, zoom: number = 14) => {
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom,
      duration: 1500,
    });
  }, []);

  const fitBounds = useCallback((bounds: [[number, number], [number, number]], padding: number = 50) => {
    mapRef.current?.fitBounds(bounds, { padding, duration: 1000 });
  }, []);

  return {
    map: mapRef.current,
    mapRef,
    setMap,
    flyTo,
    fitBounds,
  };
}
