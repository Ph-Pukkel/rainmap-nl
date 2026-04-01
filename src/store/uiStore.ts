import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  sidebarMode: 'closed' | 'half' | 'full';
  selectedStationId: string | null;
  searchQuery: string;
  isSearching: boolean;
  setSidebarOpen: (open: boolean) => void;
  setSidebarMode: (mode: UIState['sidebarMode']) => void;
  setSelectedStationId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (searching: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarMode: 'full',
  selectedStationId: null,
  searchQuery: '',
  isSearching: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
  setSelectedStationId: (selectedStationId) => set({ selectedStationId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsSearching: (isSearching) => set({ isSearching }),
}));
