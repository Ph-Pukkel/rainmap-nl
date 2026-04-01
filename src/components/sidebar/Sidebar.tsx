'use client';

import { useEffect, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import LayerControl from './LayerControl';
import Legend from './Legend';

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, sidebarMode, setSidebarMode } = useUIStore();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (isMobile) {
    return (
      <div
        className={`fixed inset-x-0 bottom-0 z-30 transition-transform duration-300 ${
          sidebarMode === 'closed' ? 'translate-y-full' :
          sidebarMode === 'half' ? 'translate-y-1/2' :
          'translate-y-0'
        }`}
      >
        {/* Sleepgreep */}
        <div
          className="flex justify-center py-2 bg-white dark:bg-gray-900 rounded-t-2xl shadow-lg cursor-grab"
          onClick={() => {
            if (sidebarMode === 'closed') setSidebarMode('half');
            else if (sidebarMode === 'half') setSidebarMode('full');
            else setSidebarMode('closed');
          }}
        >
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>
        <div className="bg-white dark:bg-gray-900 h-[70vh] overflow-y-auto px-4 pb-safe">
          <LayerControl />
          <Legend />
        </div>
      </div>
    );
  }

  return (
    <aside
      className={`h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto transition-all duration-300 ${
        sidebarOpen ? 'w-[360px] lg:w-[360px] md:w-[280px]' : 'w-0'
      }`}
    >
      {sidebarOpen && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Lagen</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Zijbalk sluiten"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <LayerControl />
          <Legend />
        </div>
      )}
    </aside>
  );
}
