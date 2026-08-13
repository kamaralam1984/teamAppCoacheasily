import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { addDays, iso, daysInMonth, todayIso } from "@/lib/calendar";

export type Program = Tables<"programs">;
export type CalEvent = Tables<"events">;
export type Holiday = Tables<"holidays">;

export interface LeaveDay {
  id: string;
  profile_id: string;
  full_name: string;
  type: string;
  from_date: string;
  to_date: string;
  half_day: boolean;
}

export interface CalendarData {
  programs: Program[];
  events: CalEvent[];
  holidays: Holiday[];
  leave: LeaveDay[];
}

async function fetchWindow(from: string, to: string): Promise<CalendarData> {
  const [programs, events, holidays, leave] = await Promise.all([
    supabase.from("programs").select("*").lte("from_date", to).gte("to_date", from),
    supabase.from("events").select("*").lte("date", to).gte("date", from),
    supabase.from("holidays").select("*").gte("date", from).lte("date", to),
    supabase.rpc("calendar_leave", { p_from: from, p_to: to }),
  ]);
  if (programs.error) throw programs.error;
  if (events.error) throw events.error;
  if (holidays.error) throw holidays.error;
  if (leave.error) throw leave.error;
  return {
    programs: programs.data ?? [],
    events: events.data ?? [],
    holidays: holidays.data ?? [],
    leave: (leave.data as unknown as LeaveDay[] | null) ?? [],
  };
}

/** Everything happening in one month — plus a little padding for the grid edges. */
export function useCalendarMonth(year: number, month: number) {
  const from = addDays(iso(year, month, 1), -7);
  const to = addDays(iso(year, month, daysInMonth(year, month)), 7);
  return useQuery({
    queryKey: ["calendar", year, month],
    queryFn: () => fetchWindow(from, to),
  });
}

/** The next 30 days, for "who's off" and the calendar file. */
export function useNext30() {
  const from = todayIso();
  const to = addDays(from, 30);
  return useQuery({
    queryKey: ["calendar-next-30", from],
    queryFn: () => fetchWindow(from, to),
  });
}

/** A full year around today, used to build the .ics file. */
export function useCalendarYear(enabled: boolean) {
  const from = addDays(todayIso(), -30);
  const to = addDays(todayIso(), 365);
  return useQuery({
    queryKey: ["calendar-year", from],
    enabled,
    queryFn: () => fetchWindow(from, to),
  });
}

export function useAllHolidays() {
  return useQuery({
    queryKey: ["holidays-all"],
    queryFn: async (): Promise<Holiday[]> => {
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface HostConflict {
  program_id: string;
  name: string;
  type: string;
  from_date: string;
  to_date: string;
  overlap_from: string;
  overlap_to: string;
}

/** Does this person host anything while they are away? */
export function useHostConflicts(profileId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["host-conflicts", profileId, from, to],
    enabled: Boolean(profileId && from && to),
    queryFn: async (): Promise<HostConflict[]> => {
      const { data, error } = await supabase.rpc("leave_host_conflicts", {
        p_profile_id: profileId!,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data as unknown as HostConflict[] | null) ?? [];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["calendar"] });
  void qc.invalidateQueries({ queryKey: ["calendar-next-30"] });
  void qc.invalidateQueries({ queryKey: ["calendar-year"] });
  void qc.invalidateQueries({ queryKey: ["holidays-all"] });
  void qc.invalidateQueries({ queryKey: ["host-conflicts"] });
}

export function useAddPrograms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: TablesInsert<"programs">[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase.from("programs").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useAddEvents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: TablesInsert<"events">[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase.from("events").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRemoveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRemoveProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; seriesId?: string | null; whole?: boolean }) => {
      const q =
        args.whole && args.seriesId
          ? supabase.from("programs").delete().eq("series_id", args.seriesId)
          : supabase.from("programs").delete().eq("id", args.id);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useAddHoliday(orgId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { date: string; name: string }) => {
      if (!orgId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase
        .from("holidays")
        .insert({ org_id: orgId, date: args.date, name: args.name });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRemoveHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}
