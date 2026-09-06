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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      automation_versions: {
        Row: {
          automation_id: string
          change_summary: string | null
          created_at: string
          created_by: string
          flow_json: Json
          id: string
          version_number: number
          workspace_id: string | null
        }
        Insert: {
          automation_id: string
          change_summary?: string | null
          created_at?: string
          created_by?: string
          flow_json: Json
          id?: string
          version_number: number
          workspace_id?: string | null
        }
        Update: {
          automation_id?: string
          change_summary?: string | null
          created_at?: string
          created_by?: string
          flow_json?: Json
          id?: string
          version_number?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_versions_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          created_at: string
          description: string | null
          flow_json: Json
          health_score: number
          id: string
          last_run_at: string | null
          name: string
          status: Database["public"]["Enums"]["automation_status"]
          updated_at: string
          user_id: string
          version: number
          vertical: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          flow_json?: Json
          health_score?: number
          id?: string
          last_run_at?: string | null
          name?: string
          status?: Database["public"]["Enums"]["automation_status"]
          updated_at?: string
          user_id?: string
          version?: number
          vertical?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          flow_json?: Json
          health_score?: number
          id?: string
          last_run_at?: string | null
          name?: string
          status?: Database["public"]["Enums"]["automation_status"]
          updated_at?: string
          user_id?: string
          version?: number
          vertical?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      flow_connections: {
        Row: {
          automation_id: string
          condition_json: Json | null
          created_at: string
          id: string
          source_node_id: string
          target_node_id: string
          workspace_id: string | null
        }
        Insert: {
          automation_id: string
          condition_json?: Json | null
          created_at?: string
          id?: string
          source_node_id: string
          target_node_id: string
          workspace_id?: string | null
        }
        Update: {
          automation_id?: string
          condition_json?: Json | null
          created_at?: string
          id?: string
          source_node_id?: string
          target_node_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_connections_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_connections_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "flow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_connections_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "flow_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_nodes: {
        Row: {
          automation_id: string
          config_json: Json
          created_at: string
          def_id: string
          id: string
          label: string | null
          position_x: number
          position_y: number
          type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          automation_id: string
          config_json?: Json
          created_at?: string
          def_id: string
          id?: string
          label?: string | null
          position_x?: number
          position_y?: number
          type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          automation_id?: string
          config_json?: Json
          created_at?: string
          def_id?: string
          id?: string
          label?: string | null
          position_x?: number
          position_y?: number
          type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_nodes_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          account_label: string | null
          auth_kind: string
          created_at: string
          display_name: string | null
          id: string
          last_verified_at: string | null
          provider: string
          scopes: string[]
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          account_label?: string | null
          auth_kind?: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_verified_at?: string | null
          provider: string
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Update: {
          account_label?: string | null
          auth_kind?: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_verified_at?: string | null
          provider?: string
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      run_logs: {
        Row: {
          automation_id: string
          created_at: string
          duration_ms: number | null
          error_summary: string | null
          finished_at: string | null
          id: string
          is_dry_run: boolean
          started_at: string
          status: Database["public"]["Enums"]["run_status"]
          trigger_type: string | null
          workspace_id: string | null
        }
        Insert: {
          automation_id: string
          created_at?: string
          duration_ms?: number | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          is_dry_run?: boolean
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          trigger_type?: string | null
          workspace_id?: string | null
        }
        Update: {
          automation_id?: string
          created_at?: string
          duration_ms?: number | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          is_dry_run?: boolean
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          trigger_type?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "run_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      run_step_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_detail: string | null
          id: string
          input_snapshot: Json | null
          node_id: string | null
          node_label: string | null
          output_snapshot: Json | null
          run_id: string
          status: Database["public"]["Enums"]["run_status"]
          step_index: number
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_detail?: string | null
          id?: string
          input_snapshot?: Json | null
          node_id?: string | null
          node_label?: string | null
          output_snapshot?: Json | null
          run_id: string
          status?: Database["public"]["Enums"]["run_status"]
          step_index?: number
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_detail?: string | null
          id?: string
          input_snapshot?: Json | null
          node_id?: string | null
          node_label?: string | null
          output_snapshot?: Json | null
          run_id?: string
          status?: Database["public"]["Enums"]["run_status"]
          step_index?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "run_step_logs_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "flow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_step_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "run_logs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owns_automation: { Args: { _automation_id: string }; Returns: boolean }
      owns_run: { Args: { _run_id: string }; Returns: boolean }
    }
    Enums: {
      automation_status: "draft" | "live" | "paused"
      integration_status: "connected" | "needs_reauth" | "revoked" | "error"
      run_status:
        | "queued"
        | "running"
        | "success"
        | "failed"
        | "halted"
        | "dry_run"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      automation_status: ["draft", "live", "paused"],
      integration_status: ["connected", "needs_reauth", "revoked", "error"],
      run_status: [
        "queued",
        "running",
        "success",
        "failed",
        "halted",
        "dry_run",
      ],
    },
  },
} as const
