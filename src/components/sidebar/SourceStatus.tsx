import type { DataSource } from '@/types';

interface SourceStatusProps {
  source: DataSource;
}

export default function SourceStatus({ source }: SourceStatusProps) {
  if (!source.is_configured && source.requires_key) {
    if (source.source_key === 'agro') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Nog in te stellen
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
        Niet geconfigureerd
      </span>
    );
  }

  if (source.last_sync_status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Tijdelijk niet beschikbaar
      </span>
    );
  }

  if (source.last_sync_at) {
    const lastSync = new Date(source.last_sync_at);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (lastSync < hourAgo) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
          Data mogelijk verouderd
        </span>
      );
    }
  }

  if (!source.is_active) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Uitgeschakeld
      </span>
    );
  }

  if (source.last_sync_status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Online
      </span>
    );
  }

  return null;
}
