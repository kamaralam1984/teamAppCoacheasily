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
  /** the policy's working days per credit, and how many of them are done */
  el_required_days: number;
  el_progress: number;
  streak: number;
  comp_off_available: number;
  /** how many days have counted so far, and whether they are counted from the joining date or from attendance */
  el_days_total?: number;
  count_from?: "punches" | "joining_date";
  joined_on?: string | null;
  /** how today was marked, and whether the person has checked out */
  today_status?: WorkMode | null;
  checked_out?: boolean;
  check_out_at?: string | null;
}

/** How a day was worked. Late is worked out from the check-in time, not chosen. */
export type WorkMode = "present" | "wfh" | "half_day";

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  present: "In the office",
  wfh: "Work from home",
  half_day: "Half day",
};

export function useAttendanceSummary(profileId?: string | null) {
  return useQuery({
    queryKey: ["attendance-summary", profileId ?? "me"],
    enabled: profileId !== null,
    staleTime: 15 * 60_000,
    gcTime: 15 * 60_000,
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
  /** exactly when the punch landed, in Mumbai time (HH:MM) */
  at: string;
  onTime: boolean;
  status: WorkMode;
  compOffReason: string | null;
  milestone: boolean;
  daysMarked: number;
}

export function useMarkAttendance(profileId?: string | null, orgId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      focus?: string;
      status?: WorkMode;
      /** required on the person's own weekly off: why they are working today */
      offReason?: string;
    }): Promise<MarkResult & { summary: AttendanceSummary | null }> => {
      if (!profileId || !orgId) throw new Error("Your profile isn't set up yet.");

      // One trip: the insert, the comp-off look-up and the summary all happen in Postgres.
      const { data, error } = await supabase.rpc(
        "mark_attendance" as never,
        {
          p_focus: input.focus?.trim() || null,
          p_status: input.status ?? "present",
          p_off_reason: input.offReason?.trim() || null,
        } as never,
      );
      if (error) throw error;

      const res = data as unknown as {
        date: string;
        at: string;
        onTime: boolean;
        status?: WorkMode;
        compOffReason: string | null;
        daysMarked: number;
        milestone: boolean;
        summary: AttendanceSummary | null;
      };

      return {
        date: res.date,
        at: res.at,
        onTime: res.onTime ?? true,
        status: res.status ?? "present",
        compOffReason: res.compOffReason ?? null,
        milestone: Boolean(res.milestone),
        daysMarked: res.daysMarked ?? 0,
        summary: res.summary ?? null,
      };
    },
    // The punch must feel instant — flip the summary now, roll back on failure.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["attendance-summary"] });
      const snapshot = qc.getQueriesData<AttendanceSummary | null>({
        queryKey: ["attendance-summary"],
      });
      for (const [key, value] of snapshot) {
        if (!value) continue;
        qc.setQueryData<AttendanceSummary>(key, { ...value, marked_today: true });
      }
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      for (const [key, value] of context?.snapshot ?? []) qc.setQueryData(key, value);
    },
    onSuccess: (result) => {
      // The truth came back with the write — write it straight in, no refetch.
      if (result.summary) {
        qc.setQueryData(["attendance-summary", "me"], result.summary);
        if (profileId) qc.setQueryData(["attendance-summary", profileId], result.summary);
      } else {
        void qc.invalidateQueries({ queryKey: ["attendance-summary"] });
      }
      // Background refreshes — nobody waits on these.
      void qc.invalidateQueries({ queryKey: ["attendance-history"] });
      void qc.invalidateQueries({ queryKey: ["presence-today"] });
      void qc.invalidateQueries({ queryKey: ["punctuality-me"] });
      void qc.invalidateQueries({ queryKey: ["punctuality-rows"] });
      void qc.invalidateQueries({ queryKey: ["attendance-month"] });
      void qc.invalidateQueries({ queryKey: ["el-ledger"] });
    },
  });
}

/** End of day: records the check-out time. Allowed once, after marking in. */
export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ check_out: string; hours: number }> => {
      const { data, error } = await supabase.rpc("check_out_attendance");
      if (error) throw error;
      return data as unknown as { check_out: string; hours: number };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["attendance-summary"] });
      void qc.invalidateQueries({ queryKey: ["attendance-month"] });
      void qc.invalidateQueries({ queryKey: ["attendance-history"] });
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
