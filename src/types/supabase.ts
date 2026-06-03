export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      access_policies: {
        Row: {
          active: boolean | null
          applies_to: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          priority: number | null
          rules: Json
          target_groups: string[] | null
          target_users: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          applies_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          priority?: number | null
          rules?: Json
          target_groups?: string[] | null
          target_users?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          applies_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          priority?: number | null
          rules?: Json
          target_groups?: string[] | null
          target_users?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      account_changes: {
        Row: {
          change_type: string
          created_at: string | null
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          change_type: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          change_type?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      account_health_logs: {
        Row: {
          account_id: string | null
          additional_metrics: Json | null
          check_timestamp: string | null
          errors_encountered: Json | null
          health_score: number | null
          id: string
          rate_limit_remaining: number | null
          rate_limit_reset: string | null
          response_time_ms: number | null
          warnings_encountered: Json | null
        }
        Insert: {
          account_id?: string | null
          additional_metrics?: Json | null
          check_timestamp?: string | null
          errors_encountered?: Json | null
          health_score?: number | null
          id?: string
          rate_limit_remaining?: number | null
          rate_limit_reset?: string | null
          response_time_ms?: number | null
          warnings_encountered?: Json | null
        }
        Update: {
          account_id?: string | null
          additional_metrics?: Json | null
          check_timestamp?: string | null
          errors_encountered?: Json | null
          health_score?: number | null
          id?: string
          rate_limit_remaining?: number | null
          rate_limit_reset?: string | null
          response_time_ms?: number | null
          warnings_encountered?: Json | null
        }
        Relationships: []
      }
      admin_access_logs: {
        Row: {
          access_purpose: string
          access_timestamp: string
          id: string
          ip_address: unknown
          session_id: string | null
          step_completed: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          access_purpose: string
          access_timestamp?: string
          id?: string
          ip_address?: unknown
          session_id?: string | null
          step_completed?: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          access_purpose?: string
          access_timestamp?: string
          id?: string
          ip_address?: unknown
          session_id?: string | null
          step_completed?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          session_id: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          session_id: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          session_id?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          key_salt: string | null
          last_used_at: string | null
          name: string
          scopes: string[] | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          key_salt?: string | null
          last_used_at?: string | null
          name: string
          scopes?: string[] | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          key_salt?: string | null
          last_used_at?: string | null
          name?: string
          scopes?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      api_request_logs: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          error_message: string | null
          file_name: string | null
          file_size: number | null
          id: string
          ip_address: unknown
          method: string
          response_time_ms: number | null
          status_code: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          ip_address?: unknown
          method: string
          response_time_ms?: number | null
          status_code: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          ip_address?: unknown
          method?: string
          response_time_ms?: number | null
          status_code?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_extractions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          destination_folder: string | null
          error_message: string | null
          extracted_file_ids: string[] | null
          extracted_files: number | null
          id: string
          progress: number | null
          source_file_id: string
          source_file_name: string
          started_at: string | null
          status: string
          total_files: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          destination_folder?: string | null
          error_message?: string | null
          extracted_file_ids?: string[] | null
          extracted_files?: number | null
          id?: string
          progress?: number | null
          source_file_id: string
          source_file_name: string
          started_at?: string | null
          status?: string
          total_files?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          destination_folder?: string | null
          error_message?: string | null
          extracted_file_ids?: string[] | null
          extracted_files?: number | null
          id?: string
          progress?: number | null
          source_file_id?: string
          source_file_name?: string
          started_at?: string | null
          status?: string
          total_files?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_extractions_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_extractions_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          compliance_tags: string[] | null
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action: string
          compliance_tags?: string[] | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          compliance_tags?: string[] | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      downloads: {
        Row: {
          bytes_downloaded: number | null
          completed_at: string | null
          created_at: string
          download_speed: number | null
          estimated_time: number | null
          file_id: string
          id: string
          progress: number
          started_at: string | null
          status: string
          total_bytes: number
          user_id: string
        }
        Insert: {
          bytes_downloaded?: number | null
          completed_at?: string | null
          created_at?: string
          download_speed?: number | null
          estimated_time?: number | null
          file_id: string
          id?: string
          progress?: number
          started_at?: string | null
          status?: string
          total_bytes: number
          user_id: string
        }
        Update: {
          bytes_downloaded?: number | null
          completed_at?: string | null
          created_at?: string
          download_speed?: number | null
          estimated_time?: number | null
          file_id?: string
          id?: string
          progress?: number
          started_at?: string | null
          status?: string
          total_bytes?: number
          user_id?: string
        }
        Relationships: []
      }
      encrypted_keys: {
        Row: {
          created_at: string
          file_id: string
          id: string
          key_iv: string
          key_version: number
          user_id: string
          wrapped_key: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          key_iv: string
          key_version?: number
          user_id: string
          wrapped_key: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          key_iv?: string
          key_version?: number
          user_id?: string
          wrapped_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "encrypted_keys_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encrypted_keys_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
      extension_analytics: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          extension_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          extension_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          extension_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extension_analytics_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_approval_history: {
        Row: {
          admin_id: string
          created_at: string | null
          extension_id: string
          id: string
          new_status: string
          notes: string | null
          previous_status: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          extension_id: string
          id?: string
          new_status: string
          notes?: string | null
          previous_status?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          extension_id?: string
          id?: string
          new_status?: string
          notes?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extension_approval_history_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_ratings: {
        Row: {
          created_at: string | null
          extension_id: string
          id: string
          rating: number
          review: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          extension_id: string
          id?: string
          rating: number
          review?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          extension_id?: string
          id?: string
          rating?: number
          review?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extension_ratings_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
        ]
      }
      extensions: {
        Row: {
          approval: string
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          author: string
          author_id: string
          category: string
          created_at: string | null
          description: string
          downloads: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          manifest_url: string
          name: string
          permissions: string[] | null
          rating: number | null
          repository_url: string | null
          screenshots: string[] | null
          total_ratings: number | null
          updated_at: string | null
          version: string
        }
        Insert: {
          approval?: string
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          author: string
          author_id: string
          category?: string
          created_at?: string | null
          description: string
          downloads?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          manifest_url: string
          name: string
          permissions?: string[] | null
          rating?: number | null
          repository_url?: string | null
          screenshots?: string[] | null
          total_ratings?: number | null
          updated_at?: string | null
          version?: string
        }
        Update: {
          approval?: string
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          author?: string
          author_id?: string
          category?: string
          created_at?: string | null
          description?: string
          downloads?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          manifest_url?: string
          name?: string
          permissions?: string[] | null
          rating?: number | null
          repository_url?: string | null
          screenshots?: string[] | null
          total_ratings?: number | null
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      files: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          encrypted: boolean | null
          encryption_key: string | null
          encryption_key_salt: string | null
          id: string
          in_vault: boolean | null
          is_deleted: boolean
          is_public: boolean | null
          name: string
          original_parent_folder: string | null
          parent_folder: string | null
          shared: boolean | null
          size: number
          storage_path: string
          tags: string[] | null
          type: string
          updated_at: string | null
          user_id: string
          vault_previous_folder: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          encrypted?: boolean | null
          encryption_key?: string | null
          encryption_key_salt?: string | null
          id?: string
          in_vault?: boolean | null
          is_deleted?: boolean
          is_public?: boolean | null
          name: string
          original_parent_folder?: string | null
          parent_folder?: string | null
          shared?: boolean | null
          size: number
          storage_path: string
          tags?: string[] | null
          type: string
          updated_at?: string | null
          user_id: string
          vault_previous_folder?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          encrypted?: boolean | null
          encryption_key?: string | null
          encryption_key_salt?: string | null
          id?: string
          in_vault?: boolean | null
          is_deleted?: boolean
          is_public?: boolean | null
          name?: string
          original_parent_folder?: string | null
          parent_folder?: string | null
          shared?: boolean | null
          size?: number
          storage_path?: string
          tags?: string[] | null
          type?: string
          updated_at?: string | null
          user_id?: string
          vault_previous_folder?: string | null
        }
        Relationships: []
      }
      folders: {
        Row: {
          created_at: string
          id: string
          is_public: boolean | null
          name: string
          parent_folder: string | null
          path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean | null
          name: string
          parent_folder?: string | null
          path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean | null
          name?: string
          parent_folder?: string | null
          path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      installed_extensions: {
        Row: {
          extension_id: string
          id: string
          installed_at: string | null
          is_enabled: boolean | null
          settings: Json | null
          user_id: string
        }
        Insert: {
          extension_id: string
          id?: string
          installed_at?: string | null
          is_enabled?: boolean | null
          settings?: Json | null
          user_id: string
        }
        Update: {
          extension_id?: string
          id?: string
          installed_at?: string | null
          is_enabled?: boolean | null
          settings?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installed_extensions_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "extensions"
            referencedColumns: ["id"]
          },
        ]
      }
      key_access_logs: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          ip_address: unknown
          key_id: string
          key_type: string
          success: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          key_id: string
          key_type: string
          success?: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          key_id?: string
          key_type?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      login_sessions: {
        Row: {
          created_at: string | null
          device_name: string | null
          expires_at: string | null
          id: string
          ip_address: unknown
          last_active: string | null
          remember_device: boolean | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_name?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          last_active?: string | null
          remember_device?: boolean | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_name?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          last_active?: string | null
          remember_device?: boolean | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      maintenance_mode: {
        Row: {
          created_at: string | null
          created_by: string | null
          estimated_duration: number | null
          id: string
          is_enabled: boolean | null
          maintenance_type: string | null
          message: string | null
          services_status: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          estimated_duration?: number | null
          id?: string
          is_enabled?: boolean | null
          maintenance_type?: string | null
          message?: string | null
          services_status?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          estimated_duration?: number | null
          id?: string
          is_enabled?: boolean | null
          maintenance_type?: string | null
          message?: string | null
          services_status?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      maintenance_schedules: {
        Row: {
          affected_services: string[] | null
          created_at: string | null
          created_by: string | null
          end_time: string | null
          id: string
          is_active: boolean | null
          maintenance_type: string
          reason: string
          scheduled_for: string | null
          start_time: string | null
          updated_at: string | null
        }
        Insert: {
          affected_services?: string[] | null
          created_at?: string | null
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          maintenance_type: string
          reason: string
          scheduled_for?: string | null
          start_time?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_services?: string[] | null
          created_at?: string | null
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          maintenance_type?: string
          reason?: string
          scheduled_for?: string | null
          start_time?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      master_keys: {
        Row: {
          created_at: string
          encrypted_master_key: string
          id: string
          kdf_iterations: number
          kdf_salt: string
          key_version: number
          last_rotated: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_master_key: string
          id?: string
          kdf_iterations?: number
          kdf_salt: string
          key_version?: number
          last_rotated?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_master_key?: string
          id?: string
          kdf_iterations?: number
          kdf_salt?: string
          key_version?: number
          last_rotated?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      media_playback_logs: {
        Row: {
          created_at: string
          event_type: string
          file_id: string
          id: string
          ip_address: unknown
          metadata: Json | null
          position: number | null
          session_id: string
          timestamp: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          file_id: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          position?: number | null
          session_id: string
          timestamp?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          file_id?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          position?: number | null
          session_id?: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_playback_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_playback_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
      migration_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_files: number | null
          id: string
          processed_files: number | null
          settings: Json | null
          source_platform: string
          status: string
          total_files: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_files?: number | null
          id?: string
          processed_files?: number | null
          settings?: Json | null
          source_platform: string
          status?: string
          total_files?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_files?: number | null
          id?: string
          processed_files?: number | null
          settings?: Json | null
          source_platform?: string
          status?: string
          total_files?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      migration_logs: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          level: string
          message: string
          metadata: Json | null
          migration_job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          level?: string
          message: string
          metadata?: Json | null
          migration_job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          migration_job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_logs_migration_job_id_fkey"
            columns: ["migration_job_id"]
            isOneToOne: false
            referencedRelation: "migration_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          duration_months: number
          id: string
          is_used: boolean | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          duration_months: number
          id?: string
          is_used?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          duration_months?: number
          id?: string
          is_used?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      pdf_secure_urls: {
        Row: {
          created_at: string | null
          expires_at: string
          file_id: string
          id: string
          secure_url: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          file_id: string
          id?: string
          secure_url: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          file_id?: string
          id?: string
          secure_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_secure_urls_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_secure_urls_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
      pin_attempt_logs: {
        Row: {
          attempt_type: string
          created_at: string | null
          id: string
          ip_address: string | null
          location: Json | null
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          attempt_type: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          location?: Json | null
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          attempt_type?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          location?: Json | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      playback_resume: {
        Row: {
          created_at: string
          duration: number | null
          file_id: string
          id: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration?: number | null
          file_id: string
          id?: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration?: number | null
          file_id?: string
          id?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playback_resume_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playback_resume_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          encrypted_mfa_secret: string | null
          full_name: string | null
          id: string
          is_admin: boolean | null
          is_premium: boolean | null
          mfa_enabled: boolean | null
          mfa_secret: string | null
          mfa_secret_iv: string | null
          onboarding_complete: boolean
          pin_enabled: boolean | null
          pin_hash: string | null
          pin_salt: string | null
          repo_count: number
          storage_used: number | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          encrypted_mfa_secret?: string | null
          full_name?: string | null
          id: string
          is_admin?: boolean | null
          is_premium?: boolean | null
          mfa_enabled?: boolean | null
          mfa_secret?: string | null
          mfa_secret_iv?: string | null
          onboarding_complete?: boolean
          pin_enabled?: boolean | null
          pin_hash?: string | null
          pin_salt?: string | null
          repo_count?: number
          storage_used?: number | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          encrypted_mfa_secret?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          is_premium?: boolean | null
          mfa_enabled?: boolean | null
          mfa_secret?: string | null
          mfa_secret_iv?: string | null
          onboarding_complete?: boolean
          pin_enabled?: boolean | null
          pin_hash?: string | null
          pin_salt?: string | null
          repo_count?: number
          storage_used?: number | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      repositories: {
        Row: {
          account_id: string | null
          created_at: string
          file_count: number | null
          health_status: string | null
          id: string
          last_health_check: string | null
          last_used: string | null
          repo_name: string
          repository_size: number | null
          status: Json | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          file_count?: number | null
          health_status?: string | null
          id?: string
          last_health_check?: string | null
          last_used?: string | null
          repo_name: string
          repository_size?: number | null
          status?: Json | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          file_count?: number | null
          health_status?: string | null
          id?: string
          last_health_check?: string | null
          last_used?: string | null
          repo_name?: string
          repository_size?: number | null
          status?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          risk_level: string | null
          status: string | null
          timestamp: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          risk_level?: string | null
          status?: string | null
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          risk_level?: string | null
          status?: string | null
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      share_audit_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string
          geo_city: string | null
          geo_country: string | null
          id: string
          ip_address: unknown
          referrer: string | null
          share_id: string | null
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type: string
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_address?: unknown
          referrer?: string | null
          share_id?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_address?: unknown
          referrer?: string | null
          share_id?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_audit_logs_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "shares"
            referencedColumns: ["share_id"]
          },
        ]
      }
      share_collection_files: {
        Row: {
          added_at: string | null
          collection_id: string
          file_id: string
        }
        Insert: {
          added_at?: string | null
          collection_id: string
          file_id: string
        }
        Update: {
          added_at?: string | null
          collection_id?: string
          file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_collection_files_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "share_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_collection_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_collection_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
      share_collections: {
        Row: {
          access_code: string | null
          collection_name: string
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          share_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_code?: string | null
          collection_name: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          share_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_code?: string | null
          collection_name?: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          share_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      shares: {
        Row: {
          access_code: string
          allowed_ips: string[] | null
          allowed_users: string[] | null
          created_at: string | null
          custom_message: string | null
          download_count: number | null
          download_limit: number | null
          expires_at: string | null
          file_id: string
          id: string
          is_active: boolean | null
          require_email: boolean | null
          share_id: string | null
          share_type: string | null
          share_views: number | null
          user_id: string
          view_only: boolean | null
        }
        Insert: {
          access_code: string
          allowed_ips?: string[] | null
          allowed_users?: string[] | null
          created_at?: string | null
          custom_message?: string | null
          download_count?: number | null
          download_limit?: number | null
          expires_at?: string | null
          file_id: string
          id?: string
          is_active?: boolean | null
          require_email?: boolean | null
          share_id?: string | null
          share_type?: string | null
          share_views?: number | null
          user_id: string
          view_only?: boolean | null
        }
        Update: {
          access_code?: string
          allowed_ips?: string[] | null
          allowed_users?: string[] | null
          created_at?: string | null
          custom_message?: string | null
          download_count?: number | null
          download_limit?: number | null
          expires_at?: string | null
          file_id?: string
          id?: string
          is_active?: boolean | null
          require_email?: boolean | null
          share_id?: string | null
          share_type?: string | null
          share_views?: number | null
          user_id?: string
          view_only?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "shares_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shares_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
      squid_vaults: {
        Row: {
          created_at: string | null
          id: string
          password_hash: string
          updated_at: string | null
          user_id: string
          vault_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          password_hash: string
          updated_at?: string | null
          user_id: string
          vault_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          password_hash?: string
          updated_at?: string | null
          user_id?: string
          vault_name?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string | null
          description: string | null
          discount_active: boolean | null
          discounted_price: number | null
          features: string[] | null
          id: string
          name: string
          original_price: number
          storage_limit: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_active?: boolean | null
          discounted_price?: number | null
          features?: string[] | null
          id?: string
          name: string
          original_price: number
          storage_limit?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_active?: boolean | null
          discounted_price?: number | null
          features?: string[] | null
          id?: string
          name?: string
          original_price?: number
          storage_limit?: number | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          attachments: string[] | null
          created_at: string | null
          id: string
          is_internal: boolean | null
          message: string
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Insert: {
          attachments?: string[] | null
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          message: string
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Update: {
          attachments?: string[] | null
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          message?: string
          sender_id?: string
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          attachments: string[] | null
          category: string
          created_at: string | null
          description: string
          id: string
          priority: string | null
          rating: number | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          attachments?: string[] | null
          category: string
          created_at?: string | null
          description: string
          id?: string
          priority?: string | null
          rating?: number | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          attachments?: string[] | null
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          priority?: string | null
          rating?: number | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      threat_alerts: {
        Row: {
          actions_taken: Json | null
          created_at: string
          description: string | null
          id: string
          severity: string | null
          status: string | null
          timestamp: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          actions_taken?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          severity?: string | null
          status?: string | null
          timestamp?: string
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          actions_taken?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          severity?: string | null
          status?: string | null
          timestamp?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transcode_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          estimated_time: number | null
          file_id: string
          id: string
          output_files: Json | null
          output_qualities: string[]
          priority: string
          progress: number
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          estimated_time?: number | null
          file_id: string
          id?: string
          output_files?: Json | null
          output_qualities?: string[]
          priority?: string
          progress?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          estimated_time?: number | null
          file_id?: string
          id?: string
          output_files?: Json | null
          output_qualities?: string[]
          priority?: string
          progress?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcode_jobs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcode_jobs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
      upload_stats: {
        Row: {
          account_id: string | null
          chunks_uploaded: number | null
          error_message: string | null
          file_size: number | null
          id: string
          repository_id: string | null
          success: boolean | null
          upload_duration_ms: number | null
          upload_metadata: Json | null
          upload_timestamp: string | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          chunks_uploaded?: number | null
          error_message?: string | null
          file_size?: number | null
          id?: string
          repository_id?: string | null
          success?: boolean | null
          upload_duration_ms?: number | null
          upload_metadata?: Json | null
          upload_timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          chunks_uploaded?: number | null
          error_message?: string | null
          file_size?: number | null
          id?: string
          repository_id?: string | null
          success?: boolean | null
          upload_duration_ms?: number | null
          upload_metadata?: Json | null
          upload_timestamp?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_stats_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_encryption_settings: {
        Row: {
          created_at: string
          id: string
          settings: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          settings?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          settings?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_passkeys: {
        Row: {
          created_at: string | null
          credential_id: string
          email: string
          id: string
          last_used_at: string | null
          public_key: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credential_id: string
          email: string
          id?: string
          last_used_at?: string | null
          public_key?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credential_id?: string
          email?: string
          id?: string
          last_used_at?: string | null
          public_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          code_editor: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          code_editor?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          code_editor?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_security_settings: {
        Row: {
          biometric_enabled: boolean | null
          created_at: string | null
          id: string
          last_pin_auth: string | null
          pin_attempts: number | null
          pin_enabled: boolean | null
          pin_hash: string
          pin_locked_until: string | null
          pin_timeout: number | null
          require_pin_for_settings: boolean | null
          require_pin_for_shares: boolean | null
          require_pin_for_vault: boolean | null
          require_pin_on_startup: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          biometric_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_pin_auth?: string | null
          pin_attempts?: number | null
          pin_enabled?: boolean | null
          pin_hash: string
          pin_locked_until?: string | null
          pin_timeout?: number | null
          require_pin_for_settings?: boolean | null
          require_pin_for_shares?: boolean | null
          require_pin_for_vault?: boolean | null
          require_pin_on_startup?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          biometric_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_pin_auth?: string | null
          pin_attempts?: number | null
          pin_enabled?: boolean | null
          pin_hash?: string
          pin_locked_until?: string | null
          pin_timeout?: number | null
          require_pin_for_settings?: boolean | null
          require_pin_for_shares?: boolean | null
          require_pin_for_vault?: boolean | null
          require_pin_on_startup?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string
          payment_id: string | null
          payment_status: string | null
          start_date: string | null
          subscription_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          payment_id?: string | null
          payment_status?: string | null
          start_date?: string | null
          subscription_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          payment_id?: string | null
          payment_status?: string | null
          start_date?: string | null
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_terms_acceptance: {
        Row: {
          accepted_at: string
          created_at: string
          id: string
          ip_address: unknown
          privacy_version: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          privacy_version: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          privacy_version?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_files: {
        Row: {
          added_at: string | null
          file_id: string
          id: string
          original_parent_folder: string | null
          user_id: string
          vault_id: string
        }
        Insert: {
          added_at?: string | null
          file_id: string
          id?: string
          original_parent_folder?: string | null
          user_id: string
          vault_id: string
        }
        Update: {
          added_at?: string | null
          file_id?: string
          id?: string
          original_parent_folder?: string | null
          user_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
          {
            foreignKeyName: "vault_files_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vaults: {
        Row: {
          created_at: string | null
          id: string
          is_fingerprint_enabled: boolean | null
          name: string
          passkey_credential_id: string | null
          password_hash: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_fingerprint_enabled?: boolean | null
          name: string
          passkey_credential_id?: string | null
          password_hash: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_fingerprint_enabled?: boolean | null
          name?: string
          passkey_credential_id?: string | null
          password_hash?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      video_processing_queue: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          file_id: string
          id: string
          job_type: string
          max_attempts: number
          parameters: Json
          priority: number
          scheduled_for: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_id: string
          id?: string
          job_type: string
          max_attempts?: number
          parameters?: Json
          priority?: number
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_id?: string
          id?: string
          job_type?: string
          max_attempts?: number
          parameters?: Json
          priority?: number
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_processing_queue_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_processing_queue_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
      video_quality_metrics: {
        Row: {
          bandwidth: number | null
          buffer_level: number | null
          dropped_frames: number | null
          id: string
          quality: string
          rebuffer_count: number | null
          session_id: string
          startup_time: number | null
          timestamp: string
        }
        Insert: {
          bandwidth?: number | null
          buffer_level?: number | null
          dropped_frames?: number | null
          id?: string
          quality: string
          rebuffer_count?: number | null
          session_id: string
          startup_time?: number | null
          timestamp?: string
        }
        Update: {
          bandwidth?: number | null
          buffer_level?: number | null
          dropped_frames?: number | null
          id?: string
          quality?: string
          rebuffer_count?: number | null
          session_id?: string
          startup_time?: number | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_quality_metrics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "video_stream_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      video_stream_sessions: {
        Row: {
          bandwidth_used: number | null
          completed: boolean | null
          created_at: string
          errors_count: number | null
          file_id: string
          id: string
          last_activity: string
          quality: string | null
          session_id: string
          stream_duration: number | null
          user_id: string
        }
        Insert: {
          bandwidth_used?: number | null
          completed?: boolean | null
          created_at?: string
          errors_count?: number | null
          file_id: string
          id?: string
          last_activity?: string
          quality?: string | null
          session_id: string
          stream_duration?: number | null
          user_id: string
        }
        Update: {
          bandwidth_used?: number | null
          completed?: boolean | null
          created_at?: string
          errors_count?: number | null
          file_id?: string
          id?: string
          last_activity?: string
          quality?: string | null
          session_id?: string
          stream_duration?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_stream_sessions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_stream_sessions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "video_analytics_summary"
            referencedColumns: ["file_id"]
          },
        ]
      }
    }
    Views: {
      video_analytics_summary: {
        Row: {
          avg_completion_time: number | null
          avg_watch_time: number | null
          completion_count: number | null
          error_count: number | null
          file_id: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          last_viewed: string | null
          total_bandwidth: number | null
          total_sessions: number | null
          unique_viewers: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_file_to_collection: {
        Args: { collection_id_param: string; file_id_param: string }
        Returns: boolean
      }
      cleanup_expired_pdf_urls: { Args: never; Returns: undefined }
      cleanup_old_processing_jobs: {
        Args: { days_to_keep?: number }
        Returns: number
      }
      cleanup_old_video_logs: {
        Args: { days_to_keep?: number }
        Returns: number
      }
      cleanup_trashed_files: { Args: never; Returns: undefined }
      complete_processing_job: {
        Args: { p_error_message?: string; p_job_id: string; p_status: string }
        Returns: undefined
      }
      create_collection: {
        Args: {
          collection_color?: string
          collection_description?: string
          collection_icon?: string
          collection_name: string
        }
        Returns: string
      }
      create_file_record: {
        Args: {
          p_encrypted?: boolean
          p_encryption_key?: string
          p_metadata?: string
          p_name: string
          p_size: number
          p_storage_path: string
          p_type: string
          p_user_id: string
        }
        Returns: Json
      }
      create_file_share: {
        Args: { file_id_param: string }
        Returns: {
          share_id: string
        }[]
      }
      exec_sql: { Args: { params?: Json; sql: string }; Returns: Json[] }
      gen_random_bytes: { Args: { len: number }; Returns: string }
      generate_api_key: { Args: never; Returns: string }
      generate_share_id: { Args: never; Returns: string }
      get_best_account_for_upload: {
        Args: { p_min_health_score?: number; p_user_id: string }
        Returns: {
          account_id: string
          current_repositories: number
          github_token: string
          github_username: string
          health_score: number
          rate_limit_remaining: number
        }[]
      }
      get_collection_files: {
        Args: { collection_id_param: string }
        Returns: {
          added_to_collection_at: string
          created_at: string
          encrypted: boolean
          id: string
          name: string
          parent_folder: string
          shared: boolean
          size: number
          storage_path: string
          tags: string[]
          type: string
          updated_at: string
        }[]
      }
      get_file_share_id: { Args: { file_id_param: string }; Returns: string }
      get_hls_files: {
        Args: { p_file_id: string }
        Returns: {
          bandwidth: number
          created_at: string
          duration: number
          file_size: number
          manifest_path: string
          quality: string
          resolution: string
        }[]
      }
      get_next_processing_job: {
        Args: { p_worker_id: string }
        Returns: {
          file_id: string
          job_id: string
          job_type: string
          parameters: Json
          user_id: string
        }[]
      }
      get_optimal_node: {
        Args: { p_file_size?: number; p_user_id: string }
        Returns: string
      }
      get_playback_resume: {
        Args: { p_file_id: string }
        Returns: {
          duration: number
          position: number
          updated_at: string
        }[]
      }
      get_public_file_info: {
        Args: { file_uuid: string }
        Returns: {
          file_id: string
          file_name: string
          file_size: number
          file_type: string
          is_public: boolean
          shared: boolean
        }[]
      }
      get_public_folder_contents: {
        Args: { folder_uuid: string }
        Returns: {
          created_at: string
          is_folder: boolean
          item_id: string
          item_name: string
          item_size: number
          item_type: string
        }[]
      }
      get_secret: { Args: { secret_name: string }; Returns: string }
      get_shared_file_info: {
        Args: { share_id_param: string }
        Returns: {
          encryption_key: string
          file_created_at: string
          file_id: string
          file_name: string
          file_size: number
          file_type: string
          file_updated_at: string
          is_encrypted: boolean
          owner_id: string
          share_created_at: string
          share_expires_at: string
          storage_path: string
        }[]
      }
      get_transcode_job_status: {
        Args: { p_file_id: string }
        Returns: {
          created_at: string
          error: string
          estimated_time: number
          job_id: string
          output_qualities: string[]
          progress: number
          status: string
          updated_at: string
        }[]
      }
      get_user_collections: {
        Args: never
        Returns: {
          color: string
          created_at: string
          description: string
          file_count: number
          icon: string
          id: string
          name: string
          updated_at: string
        }[]
      }
      increment_pin_attempts: {
        Args: { user_id_param: string }
        Returns: number
      }
      increment_share_download: {
        Args: { p_share_id: string }
        Returns: undefined
      }
      increment_share_view: { Args: { p_share_id: string }; Returns: undefined }
      is_archive_file: { Args: { file_name: string }; Returns: boolean }
      lock_pin: {
        Args: { lock_duration_minutes?: number; user_id_param: string }
        Returns: undefined
      }
      log_key_access: {
        Args: {
          p_action: string
          p_error_message?: string
          p_key_id: string
          p_key_type: string
          p_success?: boolean
        }
        Returns: undefined
      }
      log_playback_event: {
        Args: {
          p_event_type: string
          p_file_id: string
          p_ip_address?: unknown
          p_metadata?: Json
          p_position?: number
          p_session_id: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      log_share_event: {
        Args: {
          p_error_message?: string
          p_event_type: string
          p_geo_city?: string
          p_geo_country?: string
          p_ip?: unknown
          p_referrer?: string
          p_share_id: string
          p_success?: boolean
          p_user_agent?: string
        }
        Returns: undefined
      }
      log_upload_stats: {
        Args: {
          p_account_id: string
          p_chunks_uploaded?: number
          p_error_message?: string
          p_file_size: number
          p_metadata?: Json
          p_repository_id: string
          p_success?: boolean
          p_upload_duration_ms: number
          p_user_id: string
        }
        Returns: undefined
      }
      mark_app_startup_auth: {
        Args: { user_id_param: string }
        Returns: undefined
      }
      move_to_trash: { Args: { file_uuid: string }; Returns: undefined }
      queue_transcode_job: {
        Args: {
          p_file_id: string
          p_output_qualities: string[]
          p_priority?: string
        }
        Returns: string
      }
      remove_file_from_collection: {
        Args: { collection_id_param: string; file_id_param: string }
        Returns: boolean
      }
      requires_pin_auth: {
        Args: { operation_type: string; user_id_param: string }
        Returns: boolean
      }
      reset_pin_attempts: {
        Args: { user_id_param: string }
        Returns: undefined
      }
      restore_from_trash: { Args: { file_uuid: string }; Returns: undefined }
      revoke_file_share: { Args: { file_id_param: string }; Returns: boolean }
      rotate_master_key: {
        Args: {
          p_new_salt: string
          p_new_wrapped_key: string
          p_old_wrapped_key: string
        }
        Returns: boolean
      }
      update_account_health: {
        Args: {
          p_account_id: string
          p_errors?: Json
          p_health_score: number
          p_metrics?: Json
          p_rate_limit_remaining?: number
          p_rate_limit_reset?: string
          p_response_time_ms?: number
          p_warnings?: Json
        }
        Returns: undefined
      }
      update_playback_resume: {
        Args: { p_duration?: number; p_file_id: string; p_position: number }
        Returns: undefined
      }
      update_repository_usage: {
        Args: {
          p_file_count_delta?: number
          p_file_size_delta?: number
          p_repository_id: string
        }
        Returns: undefined
      }
      upsert_stream_session: {
        Args: {
          p_bandwidth_used?: number
          p_completed?: boolean
          p_errors_count?: number
          p_file_id: string
          p_quality?: string
          p_session_id: string
          p_stream_duration?: number
        }
        Returns: undefined
      }
      user_has_vault: { Args: { p_user_id: string }; Returns: boolean }
      verify_user_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: boolean
      }
      verify_vault_password: {
        Args: { p_password: string; p_user_id: string; p_vault_name: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
