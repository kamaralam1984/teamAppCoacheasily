import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { DayInfo } from "@/lib/attendanceKinds";

export interface TeamRow {
  profile_id: string;
  full_name: string;
  department: string | null;
  title: string | null;
  role: string;
  manager_id: string | null;
  manager_name: string | null;
  today: DayInfo;
  tasks: {
    open: number;
    assigned: number;
    in_progress: number;
    review: number;
    overdue: number;
    completed_7d: number;
  };
  goals: { total: number; on_track: number; at_risk: number; overdue: number; completed: number };
  pending_leave: number;
}

export interface DashTeam {
  scope: "organisation" | "line";
  today: string;
  rows: TeamRow[];
}

export interface DashHr {
  today: string;
  headcount: { active: number; exited: number };
  new_joiners: { profile_id: string; full_name: string; joined_on: string }[];
  probation: {
    on_probation: number;
    ending_soon: {
      profile_id: string;
      full_name: string;
      end_date: string;
      days_left: number;
      status: string;
    }[];
  };
  leave: {
    pending_count: number;
    pending: {
      id: string;
      profile_id: string;
      full_name: string;
      type: string;
      from_date: string;
      to_date: string;
      days: number;
    }[];
  };
  attendance: {
    today: Record<string, number>;
    last_working_day: string;
    absent: { profile_id: string; full_name: string }[];
    late: { profile_id: string; full_name: string; check_in: string | null }[];
  };
  earned_leave: {
    credits_30d: number;
    lapses_30d: number;
    exceptions: {
      profile_id: string;
      full_name: string;
      kind: "capped" | "lapsed";
      days: number;
      created_at: string;
    }[];
  };
  goals: { total: number; on_track: number; at_risk: number; overdue: number; completed: number };
  tasks: {
    open: number;
    in_progress: number;
    review: number;
    overdue: number;
    completed_7d: number;
  };
}

/** One row per person in scope (everyone for HR and admin, the line for a manager). */
export function useDashTeam(enabled: boolean) {
  return useQuery({
    queryKey: ["dash-team"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<DashTeam> => {
      const { data, error } = await supabase.rpc("dash_team");
      if (error) throw error;
      return data as unknown as DashTeam;
    },
  });
}

export function useDashHr(enabled: boolean) {
  return useQuery({
    queryKey: ["dash-hr"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<DashHr> => {
      const { data, error } = await supabase.rpc("dash_hr");
      if (error) throw error;
      return data as unknown as DashHr;
    },
  });
}

export type PersonTask = Tables<"tasks">;

export function usePersonTasks(profileId: string | null) {
  return useQuery({
    queryKey: ["person-tasks", profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<PersonTask[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("owner_id", profileId!)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}
