import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface SearchResult {
  id: string;
  name: string;
  municipality: string | null;
  province: string | null;
  source_key: string;
  latitude: number;
  longitude: number;
}

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  selectedIndex: number;
  onSelect: (result: SearchResult) => void;
}

export default function SearchResults({ results, isLoading, selectedIndex, onSelect }: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 flex justify-center">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
      {results.map((result, index) => (
        <button
          key={result.id}
          onClick={() => onSelect(result)}
          className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
            index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : ''
          }`}
        >
          <div className="font-medium text-gray-900 dark:text-white">{result.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {[result.municipality, result.province].filter(Boolean).join(', ')}
            {result.source_key && (
              <span className="ml-2 text-gray-400">({result.source_key})</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
