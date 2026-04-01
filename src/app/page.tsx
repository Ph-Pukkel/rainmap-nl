'use client';

import dynamic from 'next/dynamic';
import Sidebar from '@/components/sidebar/Sidebar';
import SearchBar from '@/components/search/SearchBar';
import StationPopup from '@/components/map/StationPopup';
import MapControls from '@/components/map/MapControls';
import BasemapSwitcher from '@/components/map/BasemapSwitcher';
import { useUrlState } from '@/hooks/useUrlState';
import { useUIStore } from '@/store/uiStore';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Kaart laden...</p>
      </div>
    </div>
  ),
});

export default function HomePage() {
  useUrlState();
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main map area */}
      <main className="flex-1 relative">
        {/* Sidebar toggle button (when sidebar is closed) */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Zijbalk openen"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Search bar */}
        <SearchBar />

        {/* Map */}
        <MapContainer />

        {/* Map controls */}
        <MapControls />
        <BasemapSwitcher />

        {/* Station popup */}
        <StationPopup />
      </main>
    </div>
  );
}
