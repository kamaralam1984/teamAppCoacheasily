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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          marked_at: string
          org_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          marked_at?: string
          org_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          marked_at?: string
          org_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_off_credits: {
        Row: {
          consumed: boolean
          consumed_by: string | null
          created_at: string
          earned_on: string
          id: string
          org_id: string
          profile_id: string
          reason: string
        }
        Insert: {
          consumed?: boolean
          consumed_by?: string | null
          created_at?: string
          earned_on: string
          id?: string
          org_id: string
          profile_id: string
          reason: string
        }
        Update: {
          consumed?: boolean
          consumed_by?: string | null
          created_at?: string
          earned_on?: string
          id?: string
          org_id?: string
          profile_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_off_credits_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_off_credits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_off_credits_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          end_date: string | null
          from_time: string | null
          id: string
          location: string | null
          name: string
          org_id: string
          series_id: string | null
          to_time: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          end_date?: string | null
          from_time?: string | null
          id?: string
          location?: string | null
          name: string
          org_id: string
          series_id?: string | null
          to_time?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          end_date?: string | null
          from_time?: string | null
          id?: string
          location?: string | null
          name?: string
          org_id?: string
          series_id?: string | null
          to_time?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approver_id: string | null
          created_at: string
          days: number
          decided_at: string | null
          decided_by: string | null
          from_date: string
          half_day: boolean
          handover_to: string | null
          id: string
          org_id: string
          profile_id: string
          reason: string | null
          reminded_at: string | null
          status: string
          to_date: string
          type: string
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          days?: number
          decided_at?: string | null
          decided_by?: string | null
          from_date: string
          half_day?: boolean
          handover_to?: string | null
          id?: string
          org_id: string
          profile_id: string
          reason?: string | null
          reminded_at?: string | null
          status?: string
          to_date: string
          type: string
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          days?: number
          decided_at?: string | null
          decided_by?: string | null
          from_date?: string
          half_day?: boolean
          handover_to?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          reason?: string | null
          reminded_at?: string | null
          status?: string
          to_date?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_handover_to_fkey"
            columns: ["handover_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          org_id: string
          profile_id: string
          read: boolean
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          org_id: string
          profile_id: string
          read?: boolean
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          org_id?: string
          profile_id?: string
          read?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          settings: Json
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          settings?: Json
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          settings?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          birthday: string | null
          created_at: string
          department: string | null
          exited_on: string | null
          full_name: string
          fun_fact: string | null
          id: string
          joined_on: string | null
          manager_id: string | null
          new_badge: string
          opening_earned_leave: number
          org_id: string
          responsibilities: string | null
          role: string
          sort_order: number
          status: string
          title: string | null
          wedding_anniversary: string | null
          weekly_off: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          department?: string | null
          exited_on?: string | null
          full_name: string
          fun_fact?: string | null
          id?: string
          joined_on?: string | null
          manager_id?: string | null
          new_badge?: string
          opening_earned_leave?: number
          org_id: string
          responsibilities?: string | null
          role?: string
          sort_order?: number
          status?: string
          title?: string | null
          wedding_anniversary?: string | null
          weekly_off?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          department?: string | null
          exited_on?: string | null
          full_name?: string
          fun_fact?: string | null
          id?: string
          joined_on?: string | null
          manager_id?: string | null
          new_badge?: string
          opening_earned_leave?: number
          org_id?: string
          responsibilities?: string | null
          role?: string
          sort_order?: number
          status?: string
          title?: string | null
          wedding_anniversary?: string | null
          weekly_off?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string
          created_by: string | null
          from_date: string
          host_id: string | null
          id: string
          language: string | null
          location: string | null
          name: string
          org_id: string
          series_id: string | null
          session_no: number | null
          to_date: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_date: string
          host_id?: string | null
          id?: string
          language?: string | null
          location?: string | null
          name: string
          org_id: string
          series_id?: string | null
          session_no?: number | null
          to_date: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_date?: string
          host_id?: string | null
          id?: string
          language?: string | null
          location?: string | null
          name?: string
          org_id?: string
          series_id?: string | null
          session_no?: number | null
          to_date?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attendance_summary: { Args: { p_profile_id?: string }; Returns: Json }
      calendar_leave: { Args: { p_from: string; p_to: string }; Returns: Json }
      leave_approver_for: { Args: { p_profile_id: string }; Returns: string }
      leave_balances: { Args: { p_profile_id?: string }; Returns: Json }
      leave_check: {
        Args: {
          p_from: string
          p_half?: boolean
          p_profile_id?: string
          p_to: string
          p_type: string
        }
        Returns: Json
      }
      leave_host_conflicts: {
        Args: { p_from: string; p_profile_id: string; p_to: string }
        Returns: Json
      }
      leave_remind_approvers: { Args: never; Returns: number }
      leave_sandwich_conflict: {
        Args: {
          p_exclude?: string
          p_from: string
          p_profile_id: string
          p_to: string
        }
        Returns: string
      }
      manages: { Args: { target_id: string }; Returns: boolean }
      my_org: { Args: never; Returns: string }
      my_profile_id: { Args: never; Returns: string }
      my_role: { Args: never; Returns: string }
      reconcile_roster: { Args: never; Returns: Json }
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
