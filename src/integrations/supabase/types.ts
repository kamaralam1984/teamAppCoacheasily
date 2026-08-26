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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          created_at: string
          date: string
          focus: string | null
          id: string
          marked_at: string
          on_time: boolean | null
          org_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          focus?: string | null
          id?: string
          marked_at?: string
          on_time?: boolean | null
          org_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          date?: string
          focus?: string | null
          id?: string
          marked_at?: string
          on_time?: boolean | null
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
      calendar_attendees: {
        Row: {
          created_at: string
          id: string
          kind: string
          org_id: string
          profile_id: string
          ref_id: string
          required: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          org_id: string
          profile_id: string
          ref_id: string
          required?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          profile_id?: string
          ref_id?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "calendar_attendees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tokens: {
        Row: {
          created_at: string
          org_id: string
          profile_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          org_id: string
          profile_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          org_id?: string
          profile_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_requests: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          created_at: string
          id: string
          org_id: string
          profile_id: string
          requested_at: string
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          created_at?: string
          id?: string
          org_id: string
          profile_id: string
          requested_at?: string
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          created_at?: string
          id?: string
          org_id?: string
          profile_id?: string
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_requests_actioned_by_fkey"
            columns: ["actioned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_requests_profile_id_fkey"
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
      cycles: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          name: string
          no: number
          org_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          name: string
          no: number
          org_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          name?: string
          no?: number
          org_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_codes: {
        Row: {
          body: string
          created_at: string
          day_no: number
          department: string | null
          id: string
          org_id: string
          pledge: string
          title: string
          updated_at: string
          value: string
        }
        Insert: {
          body: string
          created_at?: string
          day_no: number
          department?: string | null
          id?: string
          org_id: string
          pledge: string
          title: string
          updated_at?: string
          value: string
        }
        Update: {
          body?: string
          created_at?: string
          day_no?: number
          department?: string | null
          id?: string
          org_id?: string
          pledge?: string
          title?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reflections: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string
          org_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          note: string
          org_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string
          org_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_reflections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reflections_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      day_plans: {
        Row: {
          closed_at: string | null
          committed_at: string | null
          created_at: string
          day: string
          id: string
          note: string | null
          org_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          committed_at?: string | null
          created_at?: string
          day: string
          id?: string
          note?: string | null
          org_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          committed_at?: string | null
          created_at?: string
          day?: string
          id?: string
          note?: string | null
          org_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_plans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string | null
          cycle_id: string | null
          date: string
          description: string | null
          end_date: string | null
          from_time: string | null
          host_id: string | null
          id: string
          location: string | null
          name: string
          org_id: string
          sequence: number
          series_id: string | null
          session_no: number | null
          status: string
          to_time: string | null
          type: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          date: string
          description?: string | null
          end_date?: string | null
          from_time?: string | null
          host_id?: string | null
          id?: string
          location?: string | null
          name: string
          org_id: string
          sequence?: number
          series_id?: string | null
          session_no?: number | null
          status?: string
          to_time?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          date?: string
          description?: string | null
          end_date?: string | null
          from_time?: string | null
          host_id?: string | null
          id?: string
          location?: string | null
          name?: string
          org_id?: string
          sequence?: number
          series_id?: string | null
          session_no?: number | null
          status?: string
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
            foreignKeyName: "events_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
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
      goal_advice: {
        Row: {
          advice: string
          created_at: string
          goal_id: string
          id: string
          org_id: string
          step_key: string
          week_start: string
        }
        Insert: {
          advice: string
          created_at?: string
          goal_id: string
          id?: string
          org_id: string
          step_key: string
          week_start: string
        }
        Update: {
          advice?: string
          created_at?: string
          goal_id?: string
          id?: string
          org_id?: string
          step_key?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_advice_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_advice_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_entries: {
        Row: {
          amount: number | null
          counts: number[] | null
          created_at: string
          date: string
          goal_id: string
          id: string
          note: string | null
          org_id: string
          updated_at: string
          value: number | null
        }
        Insert: {
          amount?: number | null
          counts?: number[] | null
          created_at?: string
          date?: string
          goal_id: string
          id?: string
          note?: string | null
          org_id: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          amount?: number | null
          counts?: number[] | null
          created_at?: string
          date?: string
          goal_id?: string
          id?: string
          note?: string | null
          org_id?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_entries_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          archived: boolean
          baseline: number
          created_at: string
          cycle_id: string
          id: string
          kind: string
          learnings: string | null
          metric: string | null
          name: string
          org_id: string
          plan: string | null
          profile_id: string
          stages: string[] | null
          target: number
          tracks_revenue: boolean
          unit: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          baseline?: number
          created_at?: string
          cycle_id: string
          id?: string
          kind?: string
          learnings?: string | null
          metric?: string | null
          name: string
          org_id: string
          plan?: string | null
          profile_id: string
          stages?: string[] | null
          target?: number
          tracks_revenue?: boolean
          unit?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          baseline?: number
          created_at?: string
          cycle_id?: string
          id?: string
          kind?: string
          learnings?: string | null
          metric?: string | null
          name?: string
          org_id?: string
          plan?: string | null
          profile_id?: string
          stages?: string[] | null
          target?: number
          tracks_revenue?: boolean
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      idea_votes: {
        Row: {
          created_at: string
          idea_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          idea_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          idea_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_votes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detail: string | null
          device: string | null
          id: string
          is_anonymous: boolean
          kind: string
          org_id: string
          profile_id: string | null
          screen: string | null
          screenshot_path: string | null
          source: string
          status: string
          status_note: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detail?: string | null
          device?: string | null
          id?: string
          is_anonymous?: boolean
          kind: string
          org_id: string
          profile_id?: string | null
          screen?: string | null
          screenshot_path?: string | null
          source?: string
          status?: string
          status_note?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detail?: string | null
          device?: string | null
          id?: string
          is_anonymous?: boolean
          kind?: string
          org_id?: string
          profile_id?: string | null
          screen?: string | null
          screenshot_path?: string | null
          source?: string
          status?: string
          status_note?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          handover_task_ids: string[] | null
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
          handover_task_ids?: string[] | null
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
          handover_task_ids?: string[] | null
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
      profile_education: {
        Row: {
          created_at: string
          end_year: number | null
          field: string | null
          id: string
          institution: string
          org_id: string
          profile_id: string
          qualification: string | null
          sort_order: number
          start_year: number | null
        }
        Insert: {
          created_at?: string
          end_year?: number | null
          field?: string | null
          id?: string
          institution: string
          org_id: string
          profile_id: string
          qualification?: string | null
          sort_order?: number
          start_year?: number | null
        }
        Update: {
          created_at?: string
          end_year?: number | null
          field?: string | null
          id?: string
          institution?: string
          org_id?: string
          profile_id?: string
          qualification?: string | null
          sort_order?: number
          start_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_education_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_education_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_employment: {
        Row: {
          created_at: string
          designation: string | null
          employer: string
          from_date: string | null
          id: string
          notes: string | null
          org_id: string
          profile_id: string
          sort_order: number
          to_date: string | null
        }
        Insert: {
          created_at?: string
          designation?: string | null
          employer: string
          from_date?: string | null
          id?: string
          notes?: string | null
          org_id: string
          profile_id: string
          sort_order?: number
          to_date?: string | null
        }
        Update: {
          created_at?: string
          designation?: string | null
          employer?: string
          from_date?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          profile_id?: string
          sort_order?: number
          to_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_employment_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_employment_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_milestones: {
        Row: {
          created_at: string
          designation: string | null
          effective_on: string
          id: string
          kind: string
          note: string | null
          org_id: string
          profile_id: string
          recorded_by: string | null
        }
        Insert: {
          created_at?: string
          designation?: string | null
          effective_on: string
          id?: string
          kind: string
          note?: string | null
          org_id: string
          profile_id: string
          recorded_by?: string | null
        }
        Update: {
          created_at?: string
          designation?: string | null
          effective_on?: string
          id?: string
          kind?: string
          note?: string | null
          org_id?: string
          profile_id?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_milestones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_milestones_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_milestones_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          aadhaar_doc_path: string | null
          aadhaar_last4: string | null
          address_correspondence: string | null
          address_permanent: string | null
          blood_group: string | null
          created_at: string
          emergency_name: string | null
          emergency_phone: string | null
          emergency_relationship: string | null
          gender: string | null
          marital_status: string | null
          notes: string | null
          org_id: string
          pan_doc_path: string | null
          pan_number: string | null
          profile_id: string
          same_address: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aadhaar_doc_path?: string | null
          aadhaar_last4?: string | null
          address_correspondence?: string | null
          address_permanent?: string | null
          blood_group?: string | null
          created_at?: string
          emergency_name?: string | null
          emergency_phone?: string | null
          emergency_relationship?: string | null
          gender?: string | null
          marital_status?: string | null
          notes?: string | null
          org_id: string
          pan_doc_path?: string | null
          pan_number?: string | null
          profile_id: string
          same_address?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aadhaar_doc_path?: string | null
          aadhaar_last4?: string | null
          address_correspondence?: string | null
          address_permanent?: string | null
          blood_group?: string | null
          created_at?: string
          emergency_name?: string | null
          emergency_phone?: string | null
          emergency_relationship?: string | null
          gender?: string | null
          marital_status?: string | null
          notes?: string | null
          org_id?: string
          pan_doc_path?: string | null
          pan_number?: string | null
          profile_id?: string
          same_address?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_private_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_private_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          bio: string | null
          birthday: string | null
          can_manage_calendar: boolean
          created_at: string
          date_of_birth: string | null
          department: string | null
          email: string | null
          exited_on: string | null
          full_name: string
          fun_fact: string | null
          id: string
          invited_at: string | null
          joined_on: string | null
          manager_id: string | null
          new_badge: string
          opening_earned_leave: number
          org_id: string
          phone: string | null
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
          bio?: string | null
          birthday?: string | null
          can_manage_calendar?: boolean
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          exited_on?: string | null
          full_name: string
          fun_fact?: string | null
          id?: string
          invited_at?: string | null
          joined_on?: string | null
          manager_id?: string | null
          new_badge?: string
          opening_earned_leave?: number
          org_id: string
          phone?: string | null
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
          bio?: string | null
          birthday?: string | null
          can_manage_calendar?: boolean
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          exited_on?: string | null
          full_name?: string
          fun_fact?: string | null
          id?: string
          invited_at?: string | null
          joined_on?: string | null
          manager_id?: string | null
          new_badge?: string
          opening_earned_leave?: number
          org_id?: string
          phone?: string | null
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
          cover_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          from_date: string
          from_time: string | null
          host_id: string | null
          id: string
          language: string | null
          location: string | null
          name: string
          org_id: string
          sequence: number
          series_id: string | null
          session_no: number | null
          status: string
          to_date: string
          to_time: string | null
          type: string
          updated_at: string
        }
        Insert: {
          cover_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          from_date: string
          from_time?: string | null
          host_id?: string | null
          id?: string
          language?: string | null
          location?: string | null
          name: string
          org_id: string
          sequence?: number
          series_id?: string | null
          session_no?: number | null
          status?: string
          to_date: string
          to_time?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          cover_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          from_date?: string
          from_time?: string | null
          host_id?: string | null
          id?: string
          language?: string | null
          location?: string | null
          name?: string
          org_id?: string
          sequence?: number
          series_id?: string | null
          session_no?: number | null
          status?: string
          to_date?: string
          to_time?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_cover_id_fkey"
            columns: ["cover_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      pulse_done: {
        Row: {
          done_on: string
          profile_id: string
          round_id: string
        }
        Insert: {
          done_on?: string
          profile_id: string
          round_id: string
        }
        Update: {
          done_on?: string
          profile_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pulse_done_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulse_done_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "pulse_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      pulse_responses: {
        Row: {
          answers: Json
          id: string
          round_id: string
          submitted_on: string
        }
        Insert: {
          answers: Json
          id?: string
          round_id: string
          submitted_on?: string
        }
        Update: {
          answers?: Json
          id?: string
          round_id?: string
          submitted_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "pulse_responses_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "pulse_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      pulse_rounds: {
        Row: {
          active: boolean
          closes_on: string | null
          created_at: string
          id: string
          kind: string
          label: string
          opens_on: string
          org_id: string
          questions: Json
        }
        Insert: {
          active?: boolean
          closes_on?: string | null
          created_at?: string
          id?: string
          kind: string
          label: string
          opens_on: string
          org_id: string
          questions: Json
        }
        Update: {
          active?: boolean
          closes_on?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string
          opens_on?: string
          org_id?: string
          questions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pulse_rounds_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      recognitions: {
        Row: {
          badge_name: string | null
          created_at: string
          from_id: string | null
          id: string
          kind: string
          org_id: string
          text: string
          to_id: string
        }
        Insert: {
          badge_name?: string | null
          created_at?: string
          from_id?: string | null
          id?: string
          kind: string
          org_id: string
          text: string
          to_id: string
        }
        Update: {
          badge_name?: string | null
          created_at?: string
          from_id?: string | null
          id?: string
          kind?: string
          org_id?: string
          text?: string
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recognitions_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognitions_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      release_announced: {
        Row: {
          announced_at: string
          release_id: string
        }
        Insert: {
          announced_at?: string
          release_id: string
        }
        Update: {
          announced_at?: string
          release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_announced_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: true
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      release_items: {
        Row: {
          created_at: string
          how_to_use: string | null
          id: string
          idea_id: string | null
          release_id: string
          sort_order: number
          title: string
          what_it_does: string | null
          why_it_helps: string | null
        }
        Insert: {
          created_at?: string
          how_to_use?: string | null
          id?: string
          idea_id?: string | null
          release_id: string
          sort_order?: number
          title: string
          what_it_does?: string | null
          why_it_helps?: string | null
        }
        Update: {
          created_at?: string
          how_to_use?: string | null
          id?: string
          idea_id?: string | null
          release_id?: string
          sort_order?: number
          title?: string
          what_it_does?: string | null
          why_it_helps?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "release_items_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_items_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      release_seen: {
        Row: {
          profile_id: string
          release_id: string
          seen_at: string
        }
        Insert: {
          profile_id: string
          release_id: string
          seen_at?: string
        }
        Update: {
          profile_id?: string
          release_id?: string
          seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_seen_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_seen_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      releases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          published: boolean
          published_at: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          published?: boolean
          published_at?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          published?: boolean
          published_at?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "releases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      ritual_logs: {
        Row: {
          created_at: string
          date: string
          done: boolean
          id: string
          org_id: string
          ritual_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          done?: boolean
          id?: string
          org_id: string
          ritual_id: string
        }
        Update: {
          created_at?: string
          date?: string
          done?: boolean
          id?: string
          org_id?: string
          ritual_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ritual_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ritual_logs_ritual_id_fkey"
            columns: ["ritual_id"]
            isOneToOne: false
            referencedRelation: "rituals"
            referencedColumns: ["id"]
          },
        ]
      }
      rituals: {
        Row: {
          created_at: string
          id: string
          org_id: string
          profile_id: string
          sort_order: number
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          profile_id: string
          sort_order?: number
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          profile_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "rituals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rituals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_items: {
        Row: {
          created_at: string
          department: string
          id: string
          org_id: string
          sort_order: number
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: string
          id?: string
          org_id: string
          sort_order?: number
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          id?: string
          org_id?: string
          sort_order?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_logs: {
        Row: {
          created_at: string
          date: string
          done: boolean
          id: string
          org_id: string
          profile_id: string
          sop_item_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          done?: boolean
          id?: string
          org_id: string
          profile_id: string
          sop_item_id: string
        }
        Update: {
          created_at?: string
          date?: string
          done?: boolean
          id?: string
          org_id?: string
          profile_id?: string
          sop_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_logs_sop_item_id_fkey"
            columns: ["sop_item_id"]
            isOneToOne: false
            referencedRelation: "sop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      task_days: {
        Row: {
          day: string
          done: boolean
          done_at: string | null
          id: string
          org_id: string
          profile_id: string
          task_id: string
        }
        Insert: {
          day: string
          done?: boolean
          done_at?: string | null
          id?: string
          org_id: string
          profile_id: string
          task_id: string
        }
        Update: {
          day?: string
          done?: boolean
          done_at?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_days_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_days_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_days_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          blocked_by: string | null
          blocked_notified_on: string | null
          carried_count: number
          committed_on: string | null
          created_at: string
          created_by: string | null
          description: string | null
          done: boolean
          done_at: string | null
          due_date: string | null
          goal_id: string | null
          id: string
          org_id: string
          owner_id: string
          priority: string
          repeats: string
          slot: string
          title: string
          updated_at: string
        }
        Insert: {
          blocked_by?: string | null
          blocked_notified_on?: string | null
          carried_count?: number
          committed_on?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done?: boolean
          done_at?: string | null
          due_date?: string | null
          goal_id?: string | null
          id?: string
          org_id: string
          owner_id: string
          priority?: string
          repeats?: string
          slot?: string
          title: string
          updated_at?: string
        }
        Update: {
          blocked_by?: string | null
          blocked_notified_on?: string | null
          carried_count?: number
          committed_on?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done?: boolean
          done_at?: string | null
          due_date?: string | null
          goal_id?: string | null
          id?: string
          org_id?: string
          owner_id?: string
          priority?: string
          repeats?: string
          slot?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          created_at: string
          dates: string[]
          emoji: string
          greeting: string
          id: string
          key: string
          name: string
          org_id: string
          particles: string
          patch: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          dates?: string[]
          emoji?: string
          greeting?: string
          id?: string
          key: string
          name: string
          org_id: string
          particles?: string
          patch?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          dates?: string[]
          emoji?: string
          greeting?: string
          id?: string
          key?: string
          name?: string
          org_id?: string
          particles?: string
          patch?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "themes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_seen: {
        Row: {
          created_at: string
          org_id: string
          profile_id: string
          seen_at: string
        }
        Insert: {
          created_at?: string
          org_id: string
          profile_id: string
          seen_at?: string
        }
        Update: {
          created_at?: string
          org_id?: string
          profile_id?: string
          seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_seen_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_seen_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reviews: {
        Row: {
          created_at: string
          cycle_id: string | null
          id: string
          note: string | null
          org_id: string
          profile_id: string
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          cycle_id?: string | null
          id?: string
          note?: string | null
          org_id: string
          profile_id: string
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          cycle_id?: string | null
          id?: string
          note?: string | null
          org_id?: string
          profile_id?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      appraisal_matrix: { Args: never; Returns: Json }
      attendance_summary: { Args: { p_profile_id?: string }; Returns: Json }
      birthday_nudges: { Args: never; Returns: number }
      calendar_feed: { Args: { p_token: string }; Returns: Json }
      calendar_leave: { Args: { p_from: string; p_to: string }; Returns: Json }
      calendar_prep_nudges: { Args: never; Returns: number }
      can_keep_calendar: { Args: never; Returns: boolean }
      can_read_goal: { Args: { p_goal_id: string }; Returns: boolean }
      checkin_talked: { Args: { p_id: string }; Returns: undefined }
      claim_invite: { Args: { p_email: string }; Returns: Json }
      close_day: { Args: { p_note?: string }; Returns: Json }
      commit_day: { Args: { p_task_ids: string[] }; Returns: Json }
      daily_code_today: { Args: never; Returns: Json }
      day_report: {
        Args: { p_from: string; p_profile_id: string; p_to: string }
        Returns: Json
      }
      digest_daily: {
        Args: never
        Returns: {
          email: string
          full_name: string
          payload: Json
          profile_id: string
        }[]
      }
      digest_weekly_manager: {
        Args: never
        Returns: {
          email: string
          full_name: string
          payload: Json
          profile_id: string
        }[]
      }
      digest_weekly_self: {
        Args: never
        Returns: {
          email: string
          full_name: string
          payload: Json
          profile_id: string
        }[]
      }
      digests_enabled: { Args: never; Returns: boolean }
      goal_nudge_me: { Args: never; Returns: boolean }
      goal_owner: { Args: { p_goal_id: string }; Returns: string }
      goal_pct: { Args: { p_goal_id: string }; Returns: number }
      goal_progress: { Args: { p_goal_id: string }; Returns: Json }
      goals_for: {
        Args: { p_cycle_id?: string; p_profile_id?: string }
        Returns: Json
      }
      goals_remind_pending: { Args: { p_cycle_id?: string }; Returns: number }
      has_fixed_weekly_off: { Args: { p_off: string }; Returns: boolean }
      ideas_board: { Args: never; Returns: Json }
      is_ordinary_event_type: { Args: { p_type: string }; Returns: boolean }
      latest_unseen_release: { Args: never; Returns: Json }
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
      leave_cover_conflicts: {
        Args: { p_from: string; p_profile_id: string; p_to: string }
        Returns: Json
      }
      leave_days_for: {
        Args: {
          p_from: string
          p_half: boolean
          p_profile_id: string
          p_to: string
          p_type: string
        }
        Returns: number
      }
      leave_host_conflicts: {
        Args: { p_from: string; p_profile_id: string; p_to: string }
        Returns: Json
      }
      leave_ledger: { Args: never; Returns: Json }
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
      link_claimed_profile: { Args: never; Returns: Json }
      log_goal_entry: {
        Args: {
          p_amount?: number
          p_counts?: number[]
          p_date?: string
          p_goal_id: string
          p_note?: string
          p_notify?: boolean
          p_value?: number
        }
        Returns: Json
      }
      manages: { Args: { target_id: string }; Returns: boolean }
      mark_release_seen: { Args: { p_release_id: string }; Returns: undefined }
      my_day: { Args: { p_day?: string }; Returns: Json }
      my_org: { Args: never; Returns: string }
      my_profile_id: { Args: never; Returns: string }
      my_pulse: { Args: never; Returns: Json }
      my_role: { Args: never; Returns: string }
      open_cycle: {
        Args: { p_end_date: string; p_name?: string }
        Returns: Json
      }
      org_settings: { Args: never; Returns: Json }
      presence_today: { Args: never; Returns: Json }
      pulse_results: { Args: { p_round_id: string }; Returns: Json }
      punctuality_me: { Args: never; Returns: Json }
      punctuality_rows: { Args: { p_month?: string }; Returns: Json }
      quota_for: {
        Args: { p_settings: Json; p_type: string; p_year: number }
        Returns: number
      }
      reconcile_roster: { Args: never; Returns: Json }
      release_history: { Args: never; Returns: Json }
      request_checkin: { Args: { p_note?: string }; Returns: string }
      revenue_summary: { Args: never; Returns: Json }
      save_weekly_review: {
        Args: { p_note: string; p_week_start?: string }
        Returns: string
      }
      set_idea_status: {
        Args: { p_idea_id: string; p_note?: string; p_status: string }
        Returns: Json
      }
      set_leave_quotas: {
        Args: { p_casual: number; p_effective_from?: string; p_sick: number }
        Returns: Json
      }
      submit_idea: {
        Args: {
          p_anonymous?: boolean
          p_detail?: string
          p_device?: string
          p_kind: string
          p_screen?: string
          p_screenshot_path?: string
          p_title: string
        }
        Returns: string
      }
      submit_pulse: {
        Args: { p_answers: Json; p_round_id: string }
        Returns: undefined
      }
      tasks_blocked_nudges: { Args: never; Returns: number }
      team_goals: { Args: { p_cycle_id?: string }; Returns: Json }
      team_health: { Args: never; Returns: Json }
      theme_patch_is_safe: { Args: { p: Json }; Returns: boolean }
      update_org_settings: { Args: { p_patch: Json }; Returns: Json }
      vote_idea: { Args: { p_idea_id: string }; Returns: number }
      week_start_ist: { Args: never; Returns: string }
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
