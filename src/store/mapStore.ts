import { create } from 'zustand';

interface MapState {
  center: [number, number]; // [lng, lat]
  zoom: number;
  bearing: number;
  pitch: number;
  mapStyle: 'standaard' | 'licht' | 'donker' | 'satelliet';
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setBearing: (bearing: number) => void;
  setPitch: (pitch: number) => void;
  setMapStyle: (style: MapState['mapStyle']) => void;
  setViewport: (viewport: { center: [number, number]; zoom: number; bearing?: number; pitch?: number }) => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [5.2913, 52.1326],
  zoom: 7,
  bearing: 0,
  pitch: 0,
  mapStyle: 'standaard',
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setBearing: (bearing) => set({ bearing }),
  setPitch: (pitch) => set({ pitch }),
  setMapStyle: (mapStyle) => set({ mapStyle }),
  setViewport: (viewport) => set({
    center: viewport.center,
    zoom: viewport.zoom,
    ...(viewport.bearing !== undefined && { bearing: viewport.bearing }),
    ...(viewport.pitch !== undefined && { pitch: viewport.pitch }),
  }),
}));
