'use client';

import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '@/store/mapStore';
import { useLayerStore } from '@/store/layerStore';
import { useUIStore } from '@/store/uiStore';
import { MAP_STYLES } from '@/lib/map/styles';
import { MARKER_CONFIGS } from '@/lib/map/markers';
import { createGeoJSONSourceSpec } from '@/lib/map/clustering';
import { getStationsGeoJSON } from '@/data';
import { SOURCE_KEYS } from '@/lib/constants';
import type { StationFeatureCollection } from '@/types';

const sourceDataCache: Record<string, StationFeatureCollection> = {};

// Module-level init lock to prevent multiple map instances
let mapInitLock = false;

export default function MapContainer() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const isMovingProgrammatically = useRef(false);
  const initialStyleRef = useRef(true);

  const { center, zoom, mapStyle } = useMapStore();
  const { activeLayers, setSourceError } = useLayerStore();
  const { setSelectedStationId } = useUIStore();

  const loadSourceData = useCallback((sourceKey: string) => {
    try {
      const geojson = getStationsGeoJSON([sourceKey]);
      sourceDataCache[sourceKey] = geojson;
      return geojson;
    } catch (err) {
      console.error(`Fout bij laden ${sourceKey}:`, err);
      setSourceError(sourceKey, err instanceof Error ? err.message : 'Onbekende fout');
      return null;
    }
  }, [setSourceError]);

  const addAllLayers = useCallback((m: maplibregl.Map) => {
    const currentActiveLayers = useLayerStore.getState().activeLayers;
    for (const sourceKey of SOURCE_KEYS) {
      const data = sourceDataCache[sourceKey];
      if (!data) continue;
      try { if (m.getSource(sourceKey)) continue; } catch { continue; }

      m.addSource(sourceKey, createGeoJSONSourceSpec(sourceKey, data));
      const mc = MARKER_CONFIGS[sourceKey];
      const color = mc?.color || '#888888';
      const vis = currentActiveLayers.has(sourceKey) ? 'visible' as const : 'none' as const;

      m.addLayer({
        id: `${sourceKey}-points`, type: 'circle', source: sourceKey,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': mc?.size || 8, 'circle-color': color, 'circle-stroke-width': mc?.strokeWidth || 1, 'circle-stroke-color': mc?.strokeColor || '#FFFFFF' },
        layout: { visibility: vis },
      });
      m.addLayer({
        id: `${sourceKey}-clusters`, type: 'circle', source: sourceKey,
        filter: ['has', 'point_count'],
        paint: { 'circle-color': color, 'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 50, 25, 100, 30], 'circle-opacity': 0.8, 'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF' },
        layout: { visibility: vis },
      });
      m.addLayer({
        id: `${sourceKey}-cluster-count`, type: 'symbol', source: sourceKey,
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['Noto Sans Bold'], 'text-size': 12, visibility: vis },
        paint: { 'text-color': '#FFFFFF' },
      });
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current || mapInitLock) return;
    mapInitLock = true;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLES[mapStyle],
      center,
      zoom,
      minZoom: 5,
      maxZoom: 18,
      maxBounds: [[1.0, 49.5], [9.5, 55.0]],
    });

    map.current = m;

    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    m.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }), 'top-right');

    m.once('style.load', async () => {
      await Promise.all(SOURCE_KEYS.map(key => loadSourceData(key)));
      addAllLayers(m);

      // Register interaction handlers AFTER layers exist
      m.on('click', (e) => {
        const pointLayers = SOURCE_KEYS
          .map(key => `${key}-points`)
          .filter(id => { try { return !!m.getLayer(id); } catch { return false; } });
        if (!pointLayers.length) return;
        const features = m.queryRenderedFeatures(e.point, { layers: pointLayers });
        if (features.length > 0 && features[0].properties?.id) {
          setSelectedStationId(features[0].properties.id);
        }
      });

      for (const sourceKey of SOURCE_KEYS) {
        try {
          if (m.getLayer(`${sourceKey}-points`)) {
            m.on('mouseenter', `${sourceKey}-points`, () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', `${sourceKey}-points`, () => { m.getCanvas().style.cursor = ''; });
          }
          if (m.getLayer(`${sourceKey}-clusters`)) {
            m.on('click', `${sourceKey}-clusters`, (e) => {
              const features = m.queryRenderedFeatures(e.point, { layers: [`${sourceKey}-clusters`] });
              if (!features.length) return;
              const clusterId = features[0].properties?.cluster_id;
              const source = m.getSource(sourceKey) as maplibregl.GeoJSONSource;
              if (source && clusterId !== undefined) {
                source.getClusterExpansionZoom(clusterId).then(z => {
                  const geom = features[0].geometry;
                  if (geom.type === 'Point') m.easeTo({ center: geom.coordinates as [number, number], zoom: z });
                });
              }
            });
          }
        } catch { /* layer doesn't exist for this source */ }
      }
    });

    m.on('moveend', () => {
      if (isMovingProgrammatically.current) { isMovingProgrammatically.current = false; return; }
      const c = m.getCenter();
      useMapStore.getState().setViewport({ center: [c.lng, c.lat], zoom: m.getZoom() });
    });

    return () => {
      map.current = null;
      mapInitLock = false;
      m.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync viewport
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    try {
      const cur = m.getCenter();
      const [lng, lat] = center;
      if (Math.abs(cur.lng - lng) > 0.0001 || Math.abs(cur.lat - lat) > 0.0001 || Math.abs(m.getZoom() - zoom) > 0.01) {
        isMovingProgrammatically.current = true;
        m.flyTo({ center: [lng, lat], zoom, duration: 800 });
      }
    } catch { /* not ready */ }
  }, [center, zoom]);

  // Sync layer visibility
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    try { if (!m.isStyleLoaded()) return; } catch { return; }
    for (const sourceKey of SOURCE_KEYS) {
      const vis = activeLayers.has(sourceKey) ? 'visible' : 'none';
      try {
        for (const sfx of ['-points', '-clusters', '-cluster-count']) {
          if (m.getLayer(`${sourceKey}${sfx}`)) m.setLayoutProperty(`${sourceKey}${sfx}`, 'visibility', vis);
        }
      } catch { /* not ready */ }
    }
  }, [activeLayers]);

  // Sync map style
  useEffect(() => {
    if (initialStyleRef.current) { initialStyleRef.current = false; return; }
    const m = map.current;
    if (!m) return;
    m.setStyle(MAP_STYLES[mapStyle]);
    m.once('style.load', () => addAllLayers(m));
  }, [mapStyle, addAllLayers]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
