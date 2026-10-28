import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** One quarter and one year, both counted from the joining date. Pending shifts count too. */
export interface ShiftUsage {
  quarter_from: string;
  quarter_to: string;
  quarter_used: number;
  free_per_quarter: number;
  free_left: number;
  year_from: string;
  year_to: string;
  year_used: number;
  per_year: number;
  year_left: number;
}

export type ShiftStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface WeeklyOffShift {
  id: string;
  /** the weekly off that becomes a working day */
  off_date: string;
  /** the day taken off instead */
  new_date: string;
  reason: string | null;
  status: ShiftStatus;
  needs_hr: boolean;
  decision_note: string | null;
  created_at: string;
}

export interface MyShifts {
  today: string;
  /** today is my weekly off once shifts are counted */
  off_today: boolean;
  usage: ShiftUsage | null;
  shifts: WeeklyOffShift[];
}

export interface ShiftCheck {
  problem: string | null;
  needs_hr: boolean;
  usage: ShiftUsage | null;
}

export interface PendingShift {
  id: string;
  profile_id: string;
  full_name: string;
  title: string | null;
  department: string | null;
  weekly_off: string | null;
  off_date: string;
  new_date: string;
  reason: string | null;
  created_at: string;
  /** the person's quarter and year without this request */
  usage: ShiftUsage;
}

/** A shift changes which days are working days, so every attendance view reads again. */
function touchesAttendance(q: { queryKey: readonly unknown[] }) {
  const k = q.queryKey[0];
  return typeof k === "string" && (k.startsWith("attendance") || k === "presence-today");
}

/** My weekly off shifts and how many are left this quarter and year. */
export function useMyShifts(enabled: boolean) {
  return useQuery({
    queryKey: ["weekly-off-shifts", "mine"],
    enabled,
    queryFn: async (): Promise<MyShifts | null> => {
      const { data, error } = await supabase.rpc("weekly_off_shifts_mine");
      if (error) throw error;
      return (data as unknown as MyShifts | null) ?? null;
    },
  });
}

/** What is wrong with a shift, or whether HR has to approve it — asked as the form changes. */
export function useShiftCheck(off: string, next: string, enabled: boolean) {
  return useQuery({
    queryKey: ["weekly-off-shift-check", off, next],
    enabled: enabled && Boolean(off) && Boolean(next),
    queryFn: async (): Promise<ShiftCheck | null> => {
      const { data, error } = await supabase.rpc("weekly_off_shift_check", {
        p_off: off,
        p_new: next,
      });
      if (error) throw error;
      return (data as unknown as ShiftCheck | null) ?? null;
    },
  });
}

export function useRequestShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { off: string; next: string; reason: string }) => {
      const reason = args.reason.trim();
      const { data, error } = await supabase.rpc("weekly_off_shift_request", {
        p_off: args.off,
        p_new: args.next,
        ...(reason ? { p_reason: reason } : {}),
      });
      if (error) throw error;
      return data as unknown as { id: string; status: ShiftStatus; needs_hr: boolean };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["weekly-off-shifts"] });
      void qc.invalidateQueries({ queryKey: ["weekly-off-shift-check"] });
      void qc.invalidateQueries({ predicate: touchesAttendance });
    },
  });
}

export function useCancelShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("weekly_off_shift_cancel", { p_id: id });
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["weekly-off-shifts"] });
      void qc.invalidateQueries({ predicate: touchesAttendance });
    },
  });
}

/** HR: shifts beyond the free ones, oldest first. */
export function usePendingShifts(enabled: boolean) {
  return useQuery({
    queryKey: ["weekly-off-shifts", "pending"],
    enabled,
    queryFn: async (): Promise<PendingShift[]> => {
      const { data, error } = await supabase.rpc("weekly_off_shifts_pending");
      if (error) throw error;
      return (data as unknown as PendingShift[] | null) ?? [];
    },
  });
}

export function useDecideShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("weekly_off_shift_decide", {
        p_id: args.id,
        p_approve: args.approve,
      });
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["weekly-off-shifts"] });
    },
  });
}
