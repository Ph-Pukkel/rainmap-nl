// Generated types placeholder - replace with `supabase gen types typescript` output
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      data_sources: {
        Row: {
          id: string;
          source_key: string;
          display_name: string;
          description: string | null;
          source_type: string;
          api_base_url: string | null;
          api_key: string | null;
          is_active: boolean;
          requires_key: boolean;
          is_configured: boolean;
          sync_interval: string;
          last_sync_at: string | null;
          last_sync_status: string;
          last_error: string | null;
          station_count: number;
          icon_marker: string;
          color: string;
          layer_order: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['data_sources']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_configured'>;
        Update: Partial<Database['public']['Tables']['data_sources']['Insert']>;
      };
      stations: {
        Row: {
          id: string;
          source_key: string;
          external_id: string;
          name: string;
          latitude: number;
          longitude: number;
          municipality: string | null;
          province: string | null;
          operator: string | null;
          sensor_type: string | null;
          elevation_m: number | null;
          is_active: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['stations']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['stations']['Insert']>;
      };
      measurements: {
        Row: {
          id: string;
          station_id: string;
          source_key: string;
          measured_at: string;
          rainfall_mm: number | null;
          rainfall_period: string | null;
          temperature_c: number | null;
          raw_data: Json;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['measurements']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['measurements']['Insert']>;
      };
      sync_logs: {
        Row: {
          id: string;
          source_key: string;
          started_at: string;
          completed_at: string | null;
          status: string;
          stations_synced: number;
          measurements_synced: number;
          error_message: string | null;
          duration_ms: number | null;
        };
        Insert: Omit<Database['public']['Tables']['sync_logs']['Row'], 'id' | 'started_at'>;
        Update: Partial<Database['public']['Tables']['sync_logs']['Insert']>;
      };
    };
    Views: {
      stations_with_latest: {
        Row: {
          id: string;
          source_key: string;
          external_id: string;
          name: string;
          latitude: number;
          longitude: number;
          municipality: string | null;
          province: string | null;
          operator: string | null;
          sensor_type: string | null;
          elevation_m: number | null;
          is_active: boolean;
          metadata: Json;
          source_display_name: string;
          source_type: string;
          source_color: string;
          icon_marker: string;
          latest_rainfall_mm: number | null;
          latest_rainfall_period: string | null;
          latest_measured_at: string | null;
          latest_temperature_c: number | null;
        };
      };
    };
    Functions: {
      get_stations_geojson: {
        Args: { source_keys?: string[] };
        Returns: Json;
      };
      search_stations: {
        Args: { search_query: string; result_limit?: number };
        Returns: {
          id: string;
          name: string;
          municipality: string | null;
          province: string | null;
          source_key: string;
          latitude: number;
          longitude: number;
          rank: number;
        }[];
      };
    };
  };
}
