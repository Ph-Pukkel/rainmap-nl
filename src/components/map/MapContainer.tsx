'use client';

import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '@/store/mapStore';
import { useLayerStore } from '@/store/layerStore';
import { useUIStore } from '@/store/uiStore';
import { getMapStyleUrl } from '@/lib/map/styles';
import { MARKER_CONFIGS } from '@/lib/map/markers';
import { createGeoJSONSourceSpec } from '@/lib/map/clustering';
import { supabase } from '@/lib/supabase/client';
import { SOURCE_KEYS } from '@/lib/constants';
import type { StationFeatureCollection } from '@/types';

export default function MapContainer() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);

  const { center, zoom, mapStyle } = useMapStore();
  const { activeLayers, setSourceError } = useLayerStore();
  const { setSelectedStationId } = useUIStore();

  const loadSourceData = useCallback(async (sourceKey: string) => {
    try {
      const { data, error } = await supabase.rpc('get_stations_geojson', {
        source_keys: [sourceKey],
      });
      if (error) throw error;
      return data as StationFeatureCollection;
    } catch (err) {
      console.error(`Fout bij laden ${sourceKey}:`, err);
      setSourceError(sourceKey, err instanceof Error ? err.message : 'Onbekende fout');
      return null;
    }
  }, [setSourceError]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

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
      // Load data for each source
      for (const sourceKey of SOURCE_KEYS) {
        const data = await loadSourceData(sourceKey);
        if (!data) continue;

        const sourceSpec = createGeoJSONSourceSpec(sourceKey, data);
        m.addSource(sourceKey, sourceSpec);

        const markerConfig = MARKER_CONFIGS[sourceKey];
        const color = markerConfig?.color || '#888888';

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
        });

        // Cluster count labels
        m.addLayer({
          id: `${sourceKey}-cluster-count`,
          type: 'symbol',
          source: sourceKey,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Open Sans Bold'],
            'text-size': 12,
          },
          paint: {
            'text-color': '#FFFFFF',
          },
        });

        // Set initial visibility
        const isActive = activeLayers.has(sourceKey);
        const visibility = isActive ? 'visible' : 'none';
        m.setLayoutProperty(`${sourceKey}-points`, 'visibility', visibility);
        m.setLayoutProperty(`${sourceKey}-clusters`, 'visibility', visibility);
        m.setLayoutProperty(`${sourceKey}-cluster-count`, 'visibility', visibility);
      }
    });

    // Handle station clicks
    m.on('click', (e) => {
      const features = m.queryRenderedFeatures(e.point, {
        layers: SOURCE_KEYS.map((key) => `${key}-points`),
      });

      if (features.length > 0) {
        const feature = features[0];
        const props = feature.properties;
        if (props?.id) {
          setSelectedStationId(props.id);
        }
      }
    });

    // Change cursor on hover
    const pointLayers = SOURCE_KEYS.map((key) => `${key}-points`);
    m.on('mouseenter', pointLayers[0], () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', pointLayers[0], () => { m.getCanvas().style.cursor = ''; });

    // Sync map state back to store
    m.on('moveend', () => {
      const c = m.getCenter();
      const z = m.getZoom();
      useMapStore.getState().setViewport({
        center: [c.lng, c.lat],
        zoom: z,
      });
    });

    map.current = m;

    return () => {
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Sync map style
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.setStyle(getMapStyleUrl(mapStyle));
  }, [mapStyle]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
