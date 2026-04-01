'use client';

import { useLayerStore } from '@/store/layerStore';

type FilterMode = 'alle' | 'professioneel' | 'amateur';

const FILTERS: { value: FilterMode; label: string }[] = [
  { value: 'alle', label: 'Alle' },
  { value: 'professioneel', label: 'Professioneel' },
  { value: 'amateur', label: 'Amateur' },
];

export default function FilterPanel() {
  const { filterMode, setFilterMode } = useLayerStore();

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Snelfilters
      </h3>
      <div className="flex gap-1">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilterMode(value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filterMode === value
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
