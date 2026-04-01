import type { SourceSpecification } from 'maplibre-gl';

export interface ClusterConfig {
  cluster: boolean;
  clusterMaxZoom: number;
  clusterRadius: number;
}

export const CLUSTER_CONFIGS: Record<string, ClusterConfig> = {
  knmi_aws:      { cluster: false, clusterMaxZoom: 14, clusterRadius: 50 },
  knmi_neerslag: { cluster: true,  clusterMaxZoom: 12, clusterRadius: 50 },
  rws_waterinfo: { cluster: true,  clusterMaxZoom: 12, clusterRadius: 50 },
  waterschappen: { cluster: true,  clusterMaxZoom: 12, clusterRadius: 50 },
  wow_nl:        { cluster: true,  clusterMaxZoom: 14, clusterRadius: 60 },
  netatmo:       { cluster: true,  clusterMaxZoom: 15, clusterRadius: 80 },
  agro:          { cluster: false, clusterMaxZoom: 14, clusterRadius: 50 },
};

export function createGeoJSONSourceSpec(
  sourceKey: string,
  data: GeoJSON.FeatureCollection
): SourceSpecification {
  const config = CLUSTER_CONFIGS[sourceKey] || { cluster: false, clusterMaxZoom: 14, clusterRadius: 50 };

  return {
    type: 'geojson',
    data,
    cluster: config.cluster,
    clusterMaxZoom: config.clusterMaxZoom,
    clusterRadius: config.clusterRadius,
    buffer: 128,
    tolerance: 0.5,
  };
}
