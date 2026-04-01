export type SourceType = 'professioneel' | 'vrijwilliger' | 'consument';
export type SyncStatus = 'success' | 'error' | 'pending';

export interface DataSource {
  id: string;
  source_key: string;
  display_name: string;
  description: string | null;
  source_type: SourceType;
  api_base_url: string | null;
  is_active: boolean;
  requires_key: boolean;
  is_configured: boolean;
  sync_interval: string;
  last_sync_at: string | null;
  last_sync_status: SyncStatus;
  last_error: string | null;
  station_count: number;
  icon_marker: string;
  color: string;
  layer_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
