export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      analysis_runs: {
        Row: {
          algorithm_key: string;
          algorithm_version: string;
          created_at: string;
          error_code: string | null;
          finished_at: string | null;
          id: string;
          input_manifest: Json;
          inspection_id: string;
          organization_id: string;
          requested_at: string;
          requested_by: string | null;
          result_summary: Json | null;
          started_at: string | null;
          status: string;
        };
        Insert: {
          algorithm_key: string;
          algorithm_version: string;
          created_at?: string;
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          input_manifest?: Json;
          inspection_id: string;
          organization_id: string;
          requested_at?: string;
          requested_by?: string | null;
          result_summary?: Json | null;
          started_at?: string | null;
          status?: string;
        };
        Update: {
          algorithm_key?: string;
          algorithm_version?: string;
          created_at?: string;
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          input_manifest?: Json;
          inspection_id?: string;
          organization_id?: string;
          requested_at?: string;
          requested_by?: string | null;
          result_summary?: Json | null;
          started_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'analysis_runs_inspection_id_fkey';
            columns: ['inspection_id'];
            isOneToOne: false;
            referencedRelation: 'inspections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'analysis_runs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_user_id: string | null;
          entity_id: string | null;
          entity_type: string;
          id: number;
          metadata: Json;
          occurred_at: string;
          organization_id: string;
          request_id: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          metadata?: Json;
          occurred_at?: string;
          organization_id: string;
          request_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          metadata?: Json;
          occurred_at?: string;
          organization_id?: string;
          request_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      findings: {
        Row: {
          analysis_run_id: string | null;
          created_at: string;
          disposition: string;
          expert_note: string | null;
          id: string;
          inspection_id: string;
          kind: string;
          organization_id: string;
          region: Json | null;
          relative_heat_score: number | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          severity: string;
          source: string;
          temperature_delta_c: number | null;
          temperature_max_c: number | null;
          updated_at: string;
        };
        Insert: {
          analysis_run_id?: string | null;
          created_at?: string;
          disposition?: string;
          expert_note?: string | null;
          id?: string;
          inspection_id: string;
          kind: string;
          organization_id: string;
          region?: Json | null;
          relative_heat_score?: number | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          severity?: string;
          source: string;
          temperature_delta_c?: number | null;
          temperature_max_c?: number | null;
          updated_at?: string;
        };
        Update: {
          analysis_run_id?: string | null;
          created_at?: string;
          disposition?: string;
          expert_note?: string | null;
          id?: string;
          inspection_id?: string;
          kind?: string;
          organization_id?: string;
          region?: Json | null;
          relative_heat_score?: number | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          severity?: string;
          source?: string;
          temperature_delta_c?: number | null;
          temperature_max_c?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'findings_analysis_run_id_fkey';
            columns: ['analysis_run_id'];
            isOneToOne: false;
            referencedRelation: 'analysis_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'findings_inspection_id_fkey';
            columns: ['inspection_id'];
            isOneToOne: false;
            referencedRelation: 'inspections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'findings_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inspection_files: {
        Row: {
          bytes: number | null;
          capture_timezone: string;
          captured_at: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          inspection_id: string;
          kind: string;
          mime_type: string | null;
          organization_id: string;
          original_name: string;
          paired_file_id: string | null;
          quality_status: string;
          sha256: string | null;
          storage_bucket: string;
          storage_path: string;
        };
        Insert: {
          bytes?: number | null;
          capture_timezone?: string;
          captured_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inspection_id: string;
          kind: string;
          mime_type?: string | null;
          organization_id: string;
          original_name: string;
          paired_file_id?: string | null;
          quality_status?: string;
          sha256?: string | null;
          storage_bucket: string;
          storage_path: string;
        };
        Update: {
          bytes?: number | null;
          capture_timezone?: string;
          captured_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inspection_id?: string;
          kind?: string;
          mime_type?: string | null;
          organization_id?: string;
          original_name?: string;
          paired_file_id?: string | null;
          quality_status?: string;
          sha256?: string | null;
          storage_bucket?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inspection_files_inspection_id_fkey';
            columns: ['inspection_id'];
            isOneToOne: false;
            referencedRelation: 'inspections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inspection_files_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inspection_files_paired_file_id_fkey';
            columns: ['paired_file_id'];
            isOneToOne: false;
            referencedRelation: 'inspection_files';
            referencedColumns: ['id'];
          },
        ];
      };
      inspections: {
        Row: {
          assigned_expert_user_id: string | null;
          assigned_field_user_id: string | null;
          capture_timezone: string;
          created_at: string;
          created_by: string | null;
          due_at: string | null;
          id: string;
          inspection_code: string;
          notes: string | null;
          organization_id: string;
          plant_id: string;
          purpose: string | null;
          requested_on: string;
          scheduled_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          assigned_expert_user_id?: string | null;
          assigned_field_user_id?: string | null;
          capture_timezone?: string;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          inspection_code: string;
          notes?: string | null;
          organization_id: string;
          plant_id: string;
          purpose?: string | null;
          requested_on?: string;
          scheduled_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          assigned_expert_user_id?: string | null;
          assigned_field_user_id?: string | null;
          capture_timezone?: string;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          inspection_code?: string;
          notes?: string | null;
          organization_id?: string;
          plant_id?: string;
          purpose?: string | null;
          requested_on?: string;
          scheduled_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inspections_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inspections_plant_id_fkey';
            columns: ['plant_id'];
            isOneToOne: false;
            referencedRelation: 'plants';
            referencedColumns: ['id'];
          },
        ];
      };
      maintenance_requests: {
        Row: {
          assignee_user_id: string | null;
          completed_at: string | null;
          completion_note: string | null;
          created_at: string;
          created_by: string | null;
          finding_id: string | null;
          id: string;
          inspection_id: string;
          organization_id: string;
          priority: string;
          scheduled_at: string | null;
          status: string;
          title: string;
          updated_at: string;
          vendor_name: string | null;
        };
        Insert: {
          assignee_user_id?: string | null;
          completed_at?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          finding_id?: string | null;
          id?: string;
          inspection_id: string;
          organization_id: string;
          priority?: string;
          scheduled_at?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
          vendor_name?: string | null;
        };
        Update: {
          assignee_user_id?: string | null;
          completed_at?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          finding_id?: string | null;
          id?: string;
          inspection_id?: string;
          organization_id?: string;
          priority?: string;
          scheduled_at?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          vendor_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'maintenance_requests_finding_id_fkey';
            columns: ['finding_id'];
            isOneToOne: false;
            referencedRelation: 'findings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_requests_inspection_id_fkey';
            columns: ['inspection_id'];
            isOneToOne: false;
            referencedRelation: 'inspections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_requests_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          joined_at: string | null;
          organization_id: string;
          role: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          joined_at?: string | null;
          organization_id: string;
          role: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          joined_at?: string | null;
          organization_id?: string;
          role?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          default_timezone: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_timezone?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_timezone?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plants: {
        Row: {
          address: string | null;
          capacity_kw: number | null;
          code: string | null;
          commissioned_on: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          name: string;
          organization_id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          capacity_kw?: number | null;
          code?: string | null;
          commissioned_on?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name: string;
          organization_id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          capacity_kw?: number | null;
          code?: string | null;
          commissioned_on?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name?: string;
          organization_id?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plants_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          email: string | null;
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          email?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          email?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          change_reason: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          inspection_id: string;
          organization_id: string;
          published_at: string | null;
          status: string;
          storage_bucket: string | null;
          storage_path: string | null;
          title: string;
          updated_at: string;
          version: number;
          withdrawn_at: string | null;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          change_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inspection_id: string;
          organization_id: string;
          published_at?: string | null;
          status?: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          title: string;
          updated_at?: string;
          version?: number;
          withdrawn_at?: string | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          change_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inspection_id?: string;
          organization_id?: string;
          published_at?: string | null;
          status?: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          title?: string;
          updated_at?: string;
          version?: number;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_inspection_id_fkey';
            columns: ['inspection_id'];
            isOneToOne: false;
            referencedRelation: 'inspections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_organization_member_by_email: {
        Args: { p_email: string; p_organization_id: string; p_role: string };
        Returns: {
          email: string;
          member_role: string;
          user_id: string;
        }[];
      };
      bootstrap_organization: {
        Args: { p_name: string; p_setup_code: string; p_slug: string };
        Returns: {
          member_role: string;
          organization_id: string;
          organization_name: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
