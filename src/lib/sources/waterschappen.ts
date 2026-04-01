import type { StationRecord } from './types';

interface WFSFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id?: string;
    name?: string;
    naam?: string;
    meetpuntcode?: string;
    beheerder?: string;
    [key: string]: unknown;
  };
}

export const WATERSCHAP_WFS_ENDPOINTS: Record<string, string> = {
  'Waterschap Limburg': 'https://geodata.waterschaplimburg.nl/geoserver/wfs',
  'Waterschap Aa en Maas': 'https://geodata.aaenmaas.nl/geoserver/wfs',
  'Waterschap De Dommel': 'https://geodata.dommel.nl/geoserver/wfs',
  'Hoogheemraadschap van Rijnland': 'https://geodata.rijnland.net/geoserver/wfs',
  'Waterschap Rivierenland': 'https://geodata.wsrl.nl/geoserver/wfs',
};

export function buildWFSUrl(baseUrl: string, typeName: string): string {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  });
  return `${baseUrl}?${params.toString()}`;
}

export function transformWFSFeature(feature: WFSFeature, waterschap: string): StationRecord {
  const props = feature.properties;
  const [lon, lat] = feature.geometry.coordinates;

  return {
    external_id: props.meetpuntcode || props.id || `${waterschap}-${lon}-${lat}`,
    name: props.naam || props.name || `Meetpunt ${waterschap}`,
    latitude: lat,
    longitude: lon,
    operator: waterschap,
    sensor_type: 'Neerslagmeter',
    metadata: { ...props },
  };
}
