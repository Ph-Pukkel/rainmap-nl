import type { StationRecord } from './types';

// Agro data sources are not yet available
// This is a placeholder for future implementation

export function transformAgroStation(_raw: Record<string, unknown>): StationRecord {
  throw new Error('Agro data source is not yet implemented');
}

export const AGRO_STATUS = 'Binnenkort beschikbaar' as const;
