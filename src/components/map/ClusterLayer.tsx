'use client';

import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { SOURCE_KEYS } from '@/lib/constants';

interface ClusterLayerProps {
  map: maplibregl.Map | null;
}

export default function ClusterLayer({ map }: ClusterLayerProps) {
  useEffect(() => {
    if (!map) return;

    const handleClusterClick = async (e: maplibregl.MapMouseEvent) => {
      for (const sourceKey of SOURCE_KEYS) {
        const layerId = `${sourceKey}-clusters`;
        const features = map.queryRenderedFeatures(e.point, { layers: [layerId] });

        if (features.length > 0) {
          const feature = features[0];
          const clusterId = feature.properties?.cluster_id;
          const source = map.getSource(sourceKey);

          if (source && 'getClusterExpansionZoom' in source && clusterId !== undefined) {
            try {
              const zoom = await (source as maplibregl.GeoJSONSource).getClusterExpansionZoom(clusterId);
              const geometry = feature.geometry;
              if (geometry.type === 'Point') {
                map.flyTo({
                  center: geometry.coordinates as [number, number],
                  zoom: zoom,
                  duration: 500,
                });
              }
            } catch {
              // Cluster may have been removed
            }
          }
          break;
        }
      }
    };

    map.on('click', handleClusterClick);

    // Cursor change on cluster hover
    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    for (const sourceKey of SOURCE_KEYS) {
      const layerId = `${sourceKey}-clusters`;
      map.on('mouseenter', layerId, handleMouseEnter);
      map.on('mouseleave', layerId, handleMouseLeave);
    }

    return () => {
      map.off('click', handleClusterClick);
      for (const sourceKey of SOURCE_KEYS) {
        const layerId = `${sourceKey}-clusters`;
        map.off('mouseenter', layerId, handleMouseEnter);
        map.off('mouseleave', layerId, handleMouseLeave);
      }
    };
  }, [map]);

  return null;
}
