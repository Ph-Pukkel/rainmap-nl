'use client';

import { useEffect, useRef } from 'react';
import { useMapStore } from '@/store/mapStore';
import { useLayerStore } from '@/store/layerStore';
import { useUIStore } from '@/store/uiStore';
import type { MapStyleKey } from '@/lib/map/styles';

const VALID_STYLES: MapStyleKey[] = ['standaard', 'licht', 'donker', 'satelliet'];

function parseUrlParams(): {
  lat?: number;
  lng?: number;
  z?: number;
  lagen?: string[];
  stijl?: MapStyleKey;
  station?: string;
} {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const result: ReturnType<typeof parseUrlParams> = {};

  const lat = params.get('lat');
  const lng = params.get('lng');
  const z = params.get('z');
  const lagen = params.get('lagen');
  const stijl = params.get('stijl');
  const station = params.get('station');

  if (lat && lng) {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      result.lat = parsedLat;
      result.lng = parsedLng;
    }
  }

  if (z) {
    const parsedZ = parseFloat(z);
    if (!isNaN(parsedZ) && parsedZ >= 0 && parsedZ <= 18) {
      result.z = parsedZ;
    }
  }

  if (lagen) {
    result.lagen = lagen.split(',').filter(Boolean);
  }

  if (stijl && VALID_STYLES.includes(stijl as MapStyleKey)) {
    result.stijl = stijl as MapStyleKey;
  }

  if (station) {
    result.station = station;
  }

  return result;
}

export function useUrlState() {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const initializedRef = useRef(false);

  const { center, zoom, mapStyle, setViewport, setMapStyle } = useMapStore();
  const { activeLayers, setLayerActive } = useLayerStore();
  const { selectedStationId, setSelectedStationId } = useUIStore();

  // Initialize stores from URL on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const params = parseUrlParams();

    if (params.lat !== undefined && params.lng !== undefined) {
      setViewport({
        center: [params.lng, params.lat],
        zoom: params.z ?? zoom,
      });
    } else if (params.z !== undefined) {
      setViewport({ center, zoom: params.z });
    }

    if (params.stijl) {
      setMapStyle(params.stijl);
    }

    if (params.lagen) {
      // Disable all layers first, then enable only the specified ones
      const allKeys = ['knmi_aws', 'knmi_neerslag', 'rws_waterinfo', 'waterschappen', 'wow_nl', 'netatmo', 'agro'];
      for (const key of allKeys) {
        setLayerActive(key, params.lagen.includes(key));
      }
    }

    if (params.station) {
      setSelectedStationId(params.station);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update URL when state changes (debounced 500ms)
  useEffect(() => {
    if (!initializedRef.current) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();

      params.set('lat', center[1].toFixed(4));
      params.set('lng', center[0].toFixed(4));
      params.set('z', zoom.toFixed(1));

      const activeKeys = Array.from(activeLayers).sort();
      if (activeKeys.length > 0) {
        params.set('lagen', activeKeys.join(','));
      }

      if (mapStyle !== 'standaard') {
        params.set('stijl', mapStyle);
      }

      if (selectedStationId) {
        params.set('station', selectedStationId);
      }

      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [center, zoom, mapStyle, activeLayers, selectedStationId]);
}
