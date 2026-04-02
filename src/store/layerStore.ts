import { create } from 'zustand';

type FilterMode = 'alle' | 'professioneel' | 'amateur';

interface SourceError {
  message: string;
  timestamp: number;
}

interface LayerState {
  activeLayers: Set<string>;
  filterMode: FilterMode;
  sourceErrors: Record<string, SourceError>;
  toggleLayer: (sourceKey: string) => void;
  setLayerActive: (sourceKey: string, active: boolean) => void;
  setFilterMode: (mode: FilterMode) => void;
  setSourceError: (sourceKey: string, message: string) => void;
  clearSourceError: (sourceKey: string) => void;
  isLayerActive: (sourceKey: string) => boolean;
}

const DEFAULT_ACTIVE_LAYERS = new Set([
  'knmi_aws',
  'waterschappen',
]);

export const useLayerStore = create<LayerState>((set, get) => ({
  activeLayers: new Set(DEFAULT_ACTIVE_LAYERS),
  filterMode: 'alle',
  sourceErrors: {},
  toggleLayer: (sourceKey) =>
    set((state) => {
      const next = new Set(state.activeLayers);
      if (next.has(sourceKey)) {
        next.delete(sourceKey);
      } else {
        next.add(sourceKey);
      }
      return { activeLayers: next };
    }),
  setLayerActive: (sourceKey, active) =>
    set((state) => {
      const next = new Set(state.activeLayers);
      if (active) {
        next.add(sourceKey);
      } else {
        next.delete(sourceKey);
      }
      return { activeLayers: next };
    }),
  setFilterMode: (filterMode) => set({ filterMode }),
  setSourceError: (sourceKey, message) =>
    set((state) => ({
      sourceErrors: {
        ...state.sourceErrors,
        [sourceKey]: { message, timestamp: Date.now() },
      },
    })),
  clearSourceError: (sourceKey) =>
    set((state) => {
      const { [sourceKey]: _, ...rest } = state.sourceErrors;
      return { sourceErrors: rest };
    }),
  isLayerActive: (sourceKey) => get().activeLayers.has(sourceKey),
}));
