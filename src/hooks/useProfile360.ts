import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { DayKind } from "@/lib/attendanceKinds";
import type { GoalStatusRow } from "@/lib/goalStatus";

interface Basics {
  id: string;
  full_name: string;
  employee_code: string | null;
  title: string | null;
  department: string | null;
  role: string;
  status: string;
  joined_on: string | null;
  exited_on: string | null;
  weekly_off: string | null;
  avatar_url: string | null;
  manager_id: string | null;
  manager_name: string | null;
  hr_contact: { id: string; full_name: string } | null;
}

export interface Profile360Directory extends Basics {
  access: "directory";
}

export interface Profile360Full extends Basics {
  access: "full";
  probation: {
    start_date: string;
    end_date: string;
    status: "on_probation" | "under_review" | "confirmed";
    days_left: number;
    decisions: number;
  } | null;
  attendance: {
    today: DayKind;
    month_start: string;
    present: number;
    late: number;
    wfh: number;
    half_day: number;
    leave: number;
    absent: number;
    working_days: number;
  };
  leave: {
    balances: { type: string; entitled: number; used: number; pending: number; balance: number }[];
    pending: number;
    recent: {
      id: string;
      type: string;
      from_date: string;
      to_date: string;
      days: number;
      status: string;
    }[];
  };
  tasks: {
    total: number;
    completed: number;
    pending: number;
    in_review: number;
    overdue: number;
    completion_rate: number | null;
  };
  goals: GoalStatusRow[];
  recent: { at: string; kind: "task" | "goal_comment"; text: string }[];
}

export type Profile360 = Profile360Directory | Profile360Full;

/** One call for a person: the directory card for everybody, the full picture for those allowed it. */
export function useProfile360(profileId: string) {
  return useQuery({
    queryKey: ["profile-360", profileId],
    staleTime: 60_000,
    queryFn: async (): Promise<Profile360> => {
      const { data, error } = await supabase.rpc("profile_360", { p_profile_id: profileId });
      if (error) throw error;
      return data as unknown as Profile360;
    },
  });
}
