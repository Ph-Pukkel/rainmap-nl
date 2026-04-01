import type { StationWithLatest } from './station';

export interface StationFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: StationWithLatest;
}

export interface StationFeatureCollection {
  type: 'FeatureCollection';
  features: StationFeature[];
}
