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
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      module_connection_secrets: {
        Row: {
          api_key_ciphertext: string
          connection_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          api_key_ciphertext: string
          connection_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          api_key_ciphertext?: string
          connection_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "module_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      module_connections: {
        Row: {
          connected_at: string | null
          connected_by: string | null
          created_at: string
          error_message: string | null
          external_base_url: string
          external_org_id: string
          external_org_name: string | null
          id: string
          last_verified_at: string | null
          module_id: string
          module_slug: string | null
          org_id: string
          resolved_org_home_url: string | null
          status: Database["public"]["Enums"]["module_connection_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          error_message?: string | null
          external_base_url: string
          external_org_id: string
          external_org_name?: string | null
          id?: string
          last_verified_at?: string | null
          module_id: string
          module_slug?: string | null
          org_id: string
          resolved_org_home_url?: string | null
          status?: Database["public"]["Enums"]["module_connection_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          error_message?: string | null
          external_base_url?: string
          external_org_id?: string
          external_org_name?: string | null
          id?: string
          last_verified_at?: string | null
          module_id?: string
          module_slug?: string | null
          org_id?: string
          resolved_org_home_url?: string | null
          status?: Database["public"]["Enums"]["module_connection_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_connections_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          api_endpoint: string | null
          created_at: string
          default_url: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["module_status"]
          version: string
        }
        Insert: {
          api_endpoint?: string | null
          created_at?: string
          default_url?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["module_status"]
          version?: string
        }
        Update: {
          api_endpoint?: string | null
          created_at?: string
          default_url?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["module_status"]
          version?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
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
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      themes: {
        Row: {
          background: string
          body_font: string
          card: string
          favicon_url: string | null
          heading_font: string
          id: string
          logo_url: string | null
          primary_color: string
          radius: string
          secondary_color: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          background?: string
          body_font?: string
          card?: string
          favicon_url?: string | null
          heading_font?: string
          id?: string
          logo_url?: string | null
          primary_color?: string
          radius?: string
          secondary_color?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          background?: string
          body_font?: string
          card?: string
          favicon_url?: string | null
          heading_font?: string
          id?: string
          logo_url?: string | null
          primary_color?: string
          radius?: string
          secondary_color?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "themes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_modules: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          module_id: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          module_id: string
          workspace_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          module_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_modules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          org_id: string
          slug: string
          updated_at: string
          workspace_type: Database["public"]["Enums"]["workspace_type"]
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          org_id: string
          slug: string
          updated_at?: string
          workspace_type?: Database["public"]["Enums"]["workspace_type"]
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          org_id?: string
          slug?: string
          updated_at?: string
          workspace_type?: Database["public"]["Enums"]["workspace_type"]
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_org_admin: { Args: { _org: string; _user: string }; Returns: boolean }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      org_role: {
        Args: { _org: string; _user: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "editor" | "viewer"
      module_connection_status:
        | "pending"
        | "connected"
        | "error"
        | "disconnected"
      module_status: "available" | "beta" | "coming_soon"
      workspace_type:
        | "drift"
        | "produksjon"
        | "nettside"
        | "catering"
        | "studio"
        | "garage"
        | "event"
        | "annet"
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
    Enums: {
      app_role: ["owner", "admin", "editor", "viewer"],
      module_connection_status: [
        "pending",
        "connected",
        "error",
        "disconnected",
      ],
      module_status: ["available", "beta", "coming_soon"],
      workspace_type: [
        "drift",
        "produksjon",
        "nettside",
        "catering",
        "studio",
        "garage",
        "event",
        "annet",
      ],
    },
  },
} as const
