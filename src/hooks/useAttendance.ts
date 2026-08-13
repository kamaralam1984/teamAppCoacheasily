import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** Everything the app knows about a warrior's attendance — computed once, in Postgres. */
export interface AttendanceSummary {
  profile_id: string;
  today: string;
  marked_today: boolean;
  days_marked: number;
  opening_earned_leave: number;
  earned_available: number;
  to_next_leave: number;
  streak: number;
  comp_off_available: number;
}

export function useAttendanceSummary(profileId?: string | null) {
  return useQuery({
    queryKey: ["attendance-summary", profileId ?? "me"],
    enabled: profileId !== null,
    queryFn: async (): Promise<AttendanceSummary | null> => {
      const { data, error } = await supabase.rpc(
        "attendance_summary",
        profileId ? { p_profile_id: profileId } : {},
      );
      if (error) throw error;
      return (data as unknown as AttendanceSummary) ?? null;
    },
  });
}

/** Attendance history, newest first. */
export function useAttendanceHistory(profileId?: string | null, limit = 14) {
  return useQuery({
    queryKey: ["attendance-history", profileId ?? "none", limit],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, date, marked_at")
        .eq("profile_id", profileId!)
        .order("date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface MarkResult {
  date: string;
  compOffReason: string | null;
  milestone: boolean;
  daysMarked: number;
}

export function useMarkAttendance(profileId?: string | null, orgId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (focus?: string): Promise<MarkResult> => {
      if (!profileId || !orgId) throw new Error("Your profile isn't set up yet.");

      const { data: row, error } = await supabase
        .from("attendance")
        .insert({ profile_id: profileId, org_id: orgId, focus: focus?.trim() || null })
        .select("date")
        .single();
      if (error) throw error;

      // The comp-off, if any, was created by the database on the write itself.
      const { data: credit } = await supabase
        .from("comp_off_credits")
        .select("reason")
        .eq("profile_id", profileId)
        .eq("earned_on", row.date)
        .maybeSingle();

      const { data: summary } = await supabase.rpc("attendance_summary", {});
      const days = (summary as unknown as AttendanceSummary | null)?.days_marked ?? 0;

      return {
        date: row.date,
        compOffReason: credit?.reason ?? null,
        milestone: days > 0 && days % 20 === 0,
        daysMarked: days,
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["attendance-summary"] });
      void qc.invalidateQueries({ queryKey: ["attendance-history"] });
      void qc.invalidateQueries({ queryKey: ["presence-today"] });
    },
  });
}

export function useHolidays() {
  return useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("id, date, name")
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
