'use client';

import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { useLayerStore } from '@/store/layerStore';
import { SOURCE_KEYS } from '@/lib/constants';

const HEATMAP_SOURCE_ID = 'heatmap-combined';
const HEATMAP_LAYER_ID = 'heatmap-layer';

interface HeatmapLayerProps {
  map: maplibregl.Map | null;
}

export default function HeatmapLayer({ map }: HeatmapLayerProps) {
  const { heatmapEnabled, activeLayers } = useLayerStore();

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;

    // Combine features from all active sources
    const allFeatures: GeoJSON.Feature[] = [];
    for (const sourceKey of SOURCE_KEYS) {
      if (!activeLayers.has(sourceKey)) continue;
      const source = map.getSource(sourceKey) as maplibregl.GeoJSONSource | undefined;
      if (!source) continue;

      // We can't directly get data from a GeoJSONSource after it's been added
      // Instead, use querySourceFeatures
      try {
        const features = map.querySourceFeatures(sourceKey, {
          sourceLayer: '',
        });
        allFeatures.push(...features);
      } catch {
        // Source may not be ready
      }
    }

    const combinedGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: allFeatures,
    };

    // Add or update heatmap source
    if (map.getSource(HEATMAP_SOURCE_ID)) {
      (map.getSource(HEATMAP_SOURCE_ID) as maplibregl.GeoJSONSource).setData(combinedGeoJSON);
    } else {
      map.addSource(HEATMAP_SOURCE_ID, {
        type: 'geojson',
        data: combinedGeoJSON,
      });
    }

    // Add heatmap layer if not exists
    if (!map.getLayer(HEATMAP_LAYER_ID)) {
      map.addLayer({
        id: HEATMAP_LAYER_ID,
        type: 'heatmap',
        source: HEATMAP_SOURCE_ID,
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(33,102,172,0)',
            0.2, 'rgb(103,169,207)',
            0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)',
            0.8, 'rgb(239,138,98)',
            1, 'rgb(178,24,43)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
          'heatmap-opacity': 0.6,
        },
      });
    }

    // Toggle visibility
    map.setLayoutProperty(
      HEATMAP_LAYER_ID,
      'visibility',
      heatmapEnabled ? 'visible' : 'none'
    );
  }, [map, heatmapEnabled, activeLayers]);

  return null;
}
