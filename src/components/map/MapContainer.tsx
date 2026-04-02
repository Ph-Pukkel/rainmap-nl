'use client';

import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '@/store/mapStore';
import { useLayerStore } from '@/store/layerStore';
import { useUIStore } from '@/store/uiStore';
import { getMapStyleUrl, validateMapTilerKey } from '@/lib/map/styles';
import { MARKER_CONFIGS } from '@/lib/map/markers';
import { createGeoJSONSourceSpec } from '@/lib/map/clustering';
import { supabase } from '@/lib/supabase/client';
import { SOURCE_KEYS } from '@/lib/constants';
import type { StationFeatureCollection } from '@/types';

// Cache loaded source data for re-adding after style changes
const sourceDataCache: Record<string, StationFeatureCollection> = {};

export default function MapContainer() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const isMovingProgrammatically = useRef(false);
  const initialStyleRef = useRef(true);

  const { center, zoom, mapStyle } = useMapStore();
  const { activeLayers, setSourceError } = useLayerStore();
  const { setSelectedStationId } = useUIStore();

  const loadSourceData = useCallback(async (sourceKey: string) => {
    try {
      const { data, error } = await supabase.rpc('get_stations_geojson', {
        source_keys: [sourceKey],
      });
      if (error) throw error;
      const geojson = data as StationFeatureCollection;
      sourceDataCache[sourceKey] = geojson;
      return geojson;
    } catch (err) {
      console.error(`Fout bij laden ${sourceKey}:`, err);
      setSourceError(sourceKey, err instanceof Error ? err.message : 'Onbekende fout');
      return null;
    }
  }, [setSourceError]);

  // Add all source layers to the map (used on initial load and after style change)
  const addAllLayers = useCallback((m: maplibregl.Map) => {
    const currentActiveLayers = useLayerStore.getState().activeLayers;

    for (const sourceKey of SOURCE_KEYS) {
      const data = sourceDataCache[sourceKey];
      if (!data) continue;

      // Skip if source already exists
      if (m.getSource(sourceKey)) continue;

      const sourceSpec = createGeoJSONSourceSpec(sourceKey, data);
      m.addSource(sourceKey, sourceSpec);

      const markerConfig = MARKER_CONFIGS[sourceKey];
      const color = markerConfig?.color || '#888888';
      const isActive = currentActiveLayers.has(sourceKey);
      const visibility = isActive ? 'visible' : 'none';

      // Unclustered points
      m.addLayer({
        id: `${sourceKey}-points`,
        type: 'circle',
        source: sourceKey,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': markerConfig?.size || 8,
          'circle-color': color,
          'circle-stroke-width': markerConfig?.strokeWidth || 1,
          'circle-stroke-color': markerConfig?.strokeColor || '#FFFFFF',
        },
        layout: { visibility },
      });

      // Cluster circles
      m.addLayer({
        id: `${sourceKey}-clusters`,
        type: 'circle',
        source: sourceKey,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': color,
          'circle-radius': [
            'step', ['get', 'point_count'],
            15, 10,
            20, 50,
            25, 100,
            30,
          ],
          'circle-opacity': 0.8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
        layout: { visibility },
      });

      // Cluster count labels
      m.addLayer({
        id: `${sourceKey}-cluster-count`,
        type: 'symbol',
        source: sourceKey,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Bold', 'Open Sans Bold'],
          'text-size': 12,
          visibility,
        },
        paint: {
          'text-color': '#FFFFFF',
        },
      });
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    let cancelled = false;

    // Validate MapTiler key before creating the map, fall back to free tiles if invalid
    const initMap = async () => {
      if (!mapContainer.current || map.current) return;
      await validateMapTilerKey();
      if (cancelled || !mapContainer.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapStyleUrl(mapStyle),
      center: center,
      zoom: zoom,
      minZoom: 6,
      maxZoom: 18,
      maxBounds: [[2.5, 50.5], [7.8, 54.0]],
    });

    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    m.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right'
    );

    m.on('load', async () => {
      // Load all sources in parallel
      await Promise.all(SOURCE_KEYS.map((key) => loadSourceData(key)));
      addAllLayers(m);
    });

    // Handle station clicks
    m.on('click', (e) => {
      const pointLayers = SOURCE_KEYS.map((key) => `${key}-points`).filter((id) => m.getLayer(id));
      if (pointLayers.length === 0) return;

      const features = m.queryRenderedFeatures(e.point, { layers: pointLayers });

      if (features.length > 0) {
        const feature = features[0];
        const props = feature.properties;
        if (props?.id) {
          setSelectedStationId(props.id);
        }
      }
    });

    // Change cursor on hover for ALL point layers
    for (const sourceKey of SOURCE_KEYS) {
      m.on('mouseenter', `${sourceKey}-points`, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', `${sourceKey}-points`, () => { m.getCanvas().style.cursor = ''; });
    }

    // Cluster click-to-zoom
    for (const sourceKey of SOURCE_KEYS) {
      m.on('click', `${sourceKey}-clusters`, (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: [`${sourceKey}-clusters`] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        const source = m.getSource(sourceKey) as maplibregl.GeoJSONSource;
        if (source && clusterId !== undefined) {
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            const geometry = features[0].geometry;
            if (geometry.type === 'Point') {
              m.easeTo({ center: geometry.coordinates as [number, number], zoom });
            }
          });
        }
      });
    }

    // Sync map state back to store
    m.on('moveend', () => {
      if (isMovingProgrammatically.current) {
        isMovingProgrammatically.current = false;
        return;
      }
      const c = m.getCenter();
      const z = m.getZoom();
      useMapStore.getState().setViewport({
        center: [c.lng, c.lat],
        zoom: z,
      });
    });

    map.current = m;
    }; // end initMap

    initMap();

    return () => {
      cancelled = true;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync store viewport changes to map (for search flyTo, zoom buttons, etc.)
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const currentCenter = m.getCenter();
    const currentZoom = m.getZoom();
    const [lng, lat] = center;

    // Only fly if the store value meaningfully differs from the map's current state
    const centerChanged = Math.abs(currentCenter.lng - lng) > 0.0001 || Math.abs(currentCenter.lat - lat) > 0.0001;
    const zoomChanged = Math.abs(currentZoom - zoom) > 0.01;

    if (centerChanged || zoomChanged) {
      isMovingProgrammatically.current = true;
      m.flyTo({ center: [lng, lat], zoom, duration: 800 });
    }
  }, [center, zoom]);

  // Sync layer visibility
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    for (const sourceKey of SOURCE_KEYS) {
      const visibility = activeLayers.has(sourceKey) ? 'visible' : 'none';
      try {
        if (m.getLayer(`${sourceKey}-points`)) {
          m.setLayoutProperty(`${sourceKey}-points`, 'visibility', visibility);
        }
        if (m.getLayer(`${sourceKey}-clusters`)) {
          m.setLayoutProperty(`${sourceKey}-clusters`, 'visibility', visibility);
        }
        if (m.getLayer(`${sourceKey}-cluster-count`)) {
          m.setLayoutProperty(`${sourceKey}-cluster-count`, 'visibility', visibility);
        }
      } catch {
        // Layer may not exist yet
      }
    }
  }, [activeLayers]);

  // Sync map style - re-add layers after style change (skip initial mount)
  useEffect(() => {
    if (initialStyleRef.current) {
      initialStyleRef.current = false;
      return;
    }
    const m = map.current;
    if (!m) return;
    m.setStyle(getMapStyleUrl(mapStyle));
    m.once('style.load', () => {
      addAllLayers(m);
    });
  }, [mapStyle, addAllLayers]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
