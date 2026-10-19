import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { DayInfo } from "@/lib/attendanceKinds";

export interface MonthData {
  month: string;
  days: DayInfo[];
}

export interface TeamDayRow extends DayInfo {
  profile_id: string;
  full_name: string;
  department: string | null;
}

export interface RangeRow {
  profile_id: string;
  full_name: string;
  department: string | null;
  working_days: number;
  present: number;
  late: number;
  wfh: number;
  half_day: number;
  leave: number;
  absent: number;
  holidays: number;
  weekly_offs: number;
}

export interface CorrectionEntry {
  id: string;
  date: string;
  old_value: { status: string; check_in: string; check_out: string | null } | null;
  new_value: { status: string; check_in: string; check_out: string | null } | null;
  reason: string;
  corrected_by: string | null;
  corrected_by_name: string | null;
  created_at: string;
}

/** The calendar for one month. Omit profileId for the signed-in person. */
export function useAttendanceMonth(profileId: string | null | undefined, month: string) {
  return useQuery({
    queryKey: ["attendance-month", profileId ?? "me", month],
    staleTime: 60_000,
    queryFn: async (): Promise<MonthData> => {
      const { data, error } = await supabase.rpc("attendance_month", {
        ...(profileId ? { p_profile_id: profileId } : {}),
        p_month: month,
      });
      if (error) throw error;
      return data as unknown as MonthData;
    },
  });
}

export function useTeamDay(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["attendance-team-day", date],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<TeamDayRow[]> => {
      const { data, error } = await supabase.rpc("attendance_team_day", { p_date: date });
      if (error) throw error;
      return (data ?? []) as unknown as TeamDayRow[];
    },
  });
}

export function useRangeReport(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ["attendance-range", from, to],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<RangeRow[]> => {
      const { data, error } = await supabase.rpc("attendance_range_report", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as unknown as RangeRow[];
    },
  });
}

export function useCorrections(profileId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["attendance-corrections", profileId ?? "me"],
    enabled,
    queryFn: async (): Promise<CorrectionEntry[]> => {
      const { data, error } = await supabase.rpc("attendance_corrections_for", {
        ...(profileId ? { p_profile_id: profileId } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as CorrectionEntry[];
    },
  });
}

export interface CorrectionInput {
  profileId: string;
  date: string;
  action: "set" | "remove";
  status?: string;
  checkIn?: string;
  checkOut?: string;
  reason: string;
}

/** HR/Admin only. Every correction is logged with the old value, the new value and the reason. */
export function useCorrectAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CorrectionInput) => {
      const { error } = await supabase.rpc("attendance_correct", {
        p_profile_id: input.profileId,
        p_date: input.date,
        p_action: input.action,
        p_reason: input.reason,
        ...(input.status ? { p_status: input.status } : {}),
        ...(input.checkIn ? { p_check_in: input.checkIn } : {}),
        ...(input.checkOut ? { p_check_out: input.checkOut } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of [
        "attendance-month",
        "attendance-team-day",
        "attendance-range",
        "attendance-corrections",
        "attendance-summary",
        "attendance-history",
        "el-ledger",
        "leave-balances",
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
