import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { addDays, daysBetween, iso, daysInMonth, todayIso } from "@/lib/calendar";

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
    supabase
      .from("programs")
      .select("*")
      .neq("status", "cancelled")
      .lte("from_date", to)
      .gte("to_date", from),
    supabase
      .from("events")
      .select("*")
      .neq("status", "cancelled")
      .lte("date", to)
      .or(`end_date.gte.${from},and(end_date.is.null,date.gte.${from})`),
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

// ───────────────────────── attendees ─────────────────────────

export type AttendeeKind = "event" | "program";

export interface Attendee {
  id: string;
  kind: string;
  ref_id: string;
  profile_id: string;
  required: boolean;
}

/** Every attendee row in the org, small enough to hold in one query. */
export function useAttendees() {
  return useQuery({
    queryKey: ["calendar-attendees"],
    queryFn: async (): Promise<Attendee[]> => {
      const { data, error } = await supabase
        .from("calendar_attendees")
        .select("id, kind, ref_id, profile_id, required");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSetAttendees(orgId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      kind: AttendeeKind;
      refId: string;
      profileIds: string[];
      requiredIds?: string[];
    }) => {
      if (!orgId) throw new Error("Your profile isn't set up yet.");
      const { error: wipe } = await supabase
        .from("calendar_attendees")
        .delete()
        .eq("kind", args.kind)
        .eq("ref_id", args.refId);
      if (wipe) throw wipe;
      if (args.profileIds.length === 0) return;
      const rows = args.profileIds.map((profile_id) => ({
        org_id: orgId,
        kind: args.kind,
        ref_id: args.refId,
        profile_id,
        required: args.requiredIds ? args.requiredIds.includes(profile_id) : true,
      }));
      const { error } = await supabase.from("calendar_attendees").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar-attendees"] });
      void qc.invalidateQueries({ queryKey: ["cover-conflicts"] });
    },
  });
}

// ───────────────────────── editing ─────────────────────────

export type SeriesScope = "one" | "following" | "all";

export interface EventPatch {
  name?: string;
  type?: string;
  date?: string;
  end_date?: string | null;
  from_time?: string | null;
  to_time?: string | null;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
  host_id?: string | null;
}

export interface ProgramPatch {
  name?: string;
  type?: string;
  language?: string | null;
  from_date?: string;
  to_date?: string;
  from_time?: string | null;
  to_time?: string | null;
  location?: string | null;
  description?: string | null;
  host_id?: string | null;
  cover_id?: string | null;
}

/**
 * Standard calendar behaviour before a scoped change:
 *  "one"       — pull this occurrence out of the series so it stands alone
 *  "following" — split the series here, so earlier sessions keep the old values
 */
async function applyScopeSplit(
  table: "events" | "programs",
  row: { id: string; series_id: string | null },
  scope: SeriesScope,
  anchorDate: string,
) {
  if (!row.series_id || scope === "all") return;
  const dateCol = table === "events" ? "date" : "from_date";
  if (scope === "one") {
    const { error } = await supabase
      .from(table)
      .update({ series_id: null, session_no: null } as never)
      .eq("id", row.id);
    if (error) throw error;
    return;
  }
  const newSeries = crypto.randomUUID();
  const { error } = await supabase
    .from(table)
    .update({ series_id: newSeries } as never)
    .eq("series_id", row.series_id)
    .gte(dateCol, anchorDate);
  if (error) throw error;
}

/** Rows in the same series that a given scope should touch. */
async function siblings(
  table: "events" | "programs",
  row: { id: string; series_id: string | null },
  scope: SeriesScope,
  anchorDate: string,
) {
  if (scope === "one" || !row.series_id) return [row.id];
  const dateCol = table === "events" ? "date" : "from_date";
  let q = supabase
    .from(table)
    .select(`id, ${dateCol}`)
    .eq("series_id", row.series_id)
    .neq("status", "cancelled");
  if (scope === "following") q = q.gte(dateCol, anchorDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => (r as unknown as { id: string }).id);
}

export function useSaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      row: CalEvent;
      patch: EventPatch;
      scope: SeriesScope;
    }) => {
      const ids = await siblings("events", args.row, args.scope, args.row.date);
      await applyScopeSplit("events", args.row, args.scope, args.row.date);
      const shiftDays =
        args.patch.date && args.patch.date !== args.row.date
          ? daysBetween(args.row.date, args.patch.date)
          : 0;

      for (const id of ids) {
        const patch: Record<string, unknown> = { ...args.patch };
        if (id !== args.row.id) {
          // dates move by the same number of days rather than all landing on one day
          delete patch["date"];
          delete patch["end_date"];
          if (shiftDays !== 0) {
            const { data: current } = await supabase
              .from("events")
              .select("date, end_date")
              .eq("id", id)
              .maybeSingle();
            if (current) {
              patch["date"] = addDays(current.date, shiftDays);
              patch["end_date"] = current.end_date ? addDays(current.end_date, shiftDays) : null;
            }
          }
        }
        const { error } = await supabase.from("events").update(patch as never).eq("id", id);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useSaveProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      row: Program;
      patch: ProgramPatch;
      scope: SeriesScope;
    }) => {
      const ids = await siblings("programs", args.row, args.scope, args.row.from_date);
      await applyScopeSplit("programs", args.row, args.scope, args.row.from_date);
      const shiftDays =
        args.patch.from_date && args.patch.from_date !== args.row.from_date
          ? daysBetween(args.row.from_date, args.patch.from_date)
          : 0;

      for (const id of ids) {
        const patch: Record<string, unknown> = { ...args.patch };
        if (id !== args.row.id) {
          delete patch["from_date"];
          delete patch["to_date"];
          if (shiftDays !== 0) {
            const { data: current } = await supabase
              .from("programs")
              .select("from_date, to_date")
              .eq("id", id)
              .maybeSingle();
            if (current) {
              patch["from_date"] = addDays(current.from_date, shiftDays);
              patch["to_date"] = addDays(current.to_date, shiftDays);
            }
          }
        }
        const { error } = await supabase.from("programs").update(patch as never).eq("id", id);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Deleting marks the row cancelled so subscribed calendars remove it too. */
export function useCancelItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      table: "events" | "programs";
      row: { id: string; series_id: string | null; date: string };
      scope: SeriesScope;
    }) => {
      const ids = await siblings(args.table, args.row, args.scope, args.row.date);
      const { error } = await supabase
        .from(args.table)
        .update({ status: "cancelled" })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRestoreItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { table: "events" | "programs"; ids: string[] }) => {
      const { error } = await supabase
        .from(args.table)
        .update({ status: "active" })
        .in("id", args.ids);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDuplicateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { table: "events" | "programs"; id: string }) => {
      const { data, error } = await supabase
        .from(args.table)
        .select("*")
        .eq("id", args.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("That item has gone.");
      const row = { ...(data as Record<string, unknown>) };
      delete row["id"];
      delete row["created_at"];
      delete row["updated_at"];
      row["sequence"] = 0;
      row["series_id"] = null;
      row["session_no"] = null;
      row["name"] = `${String(row["name"])} (copy)`;
      const { error: insertError } = await supabase
        .from(args.table)
        .insert(row as never);
      if (insertError) throw insertError;
    },
    onSuccess: () => invalidate(qc),
  });
}

// ───────────────────────── the subscription feed ─────────────────────────

export function useCalendarToken(profileId?: string | null, orgId?: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["calendar-token", profileId],
    enabled: Boolean(profileId && orgId),
    queryFn: async (): Promise<string | null> => {
      const existing = await supabase
        .from("calendar_tokens")
        .select("token")
        .eq("profile_id", profileId!)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.token) return existing.data.token;
      const made = await supabase
        .from("calendar_tokens")
        .insert({ profile_id: profileId!, org_id: orgId! })
        .select("token")
        .maybeSingle();
      if (made.error) throw made.error;
      return made.data?.token ?? null;
    },
  });

  const rotate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("calendar_tokens")
        .update({ token: crypto.randomUUID() })
        .eq("profile_id", profileId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar-token", profileId] }),
  });

  return { token: query.data ?? null, isLoading: query.isLoading, rotate };
}

// ───────────────────────── cover conflicts & nudges ─────────────────────────

export interface CoverConflict {
  kind: "event" | "program";
  id: string;
  name: string;
  type: string;
  from_date: string;
  to_date: string;
  overlap_from: string;
  overlap_to: string;
  role: string;
  cover: string | null;
}

/** Anything this person is running — or required at — while they are away. */
export function useCoverConflicts(profileId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["cover-conflicts", profileId, from, to],
    enabled: Boolean(profileId && from && to),
    queryFn: async (): Promise<CoverConflict[]> => {
      const { data, error } = await supabase.rpc("leave_cover_conflicts", {
        p_profile_id: profileId!,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data as unknown as CoverConflict[] | null) ?? [];
    },
  });
}

export function usePrepNudges(enabled: boolean) {
  return useQuery({
    queryKey: ["calendar-prep-nudges"],
    enabled,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("calendar_prep_nudges");
      if (error) throw error;
      return data ?? 0;
    },
  });
}


// ───────────────────────── series management ─────────────────────────

export interface SeriesRow {
  id: string;
  name: string;
  type: string;
  date: string;
  from_time: string | null;
  to_time: string | null;
  location: string | null;
  host_id: string | null;
  status: string;
  session_no: number | null;
}

/** Every occurrence of one series, oldest first. */
export function useSeries(table: "events" | "programs", seriesId: string | null) {
  return useQuery({
    queryKey: ["calendar-series", table, seriesId],
    enabled: Boolean(seriesId),
    queryFn: async (): Promise<SeriesRow[]> => {
      const dateCol = table === "events" ? "date" : "from_date";
      const { data, error } = await supabase
        .from(table)
        .select(
          `id, name, type, ${dateCol}, from_time, to_time, location, host_id, status, session_no`,
        )
        .eq("series_id", seriesId!)
        .order(dateCol, { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as unknown as Record<string, unknown>;
        return { ...(row as unknown as SeriesRow), date: String(row[dateCol]) };
      });
    },
  });
}

/** Adds only the dates a series doesn't already have. */
export function useExtendSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      table: "events" | "programs";
      seriesId: string;
      dates: string[];
      template: SeriesRow;
      orgId: string;
      createdBy: string;
    }) => {
      const dateCol = args.table === "events" ? "date" : "from_date";
      const { data: existing, error: readError } = await supabase
        .from(args.table)
        .select(`id, ${dateCol}`)
        .eq("series_id", args.seriesId);
      if (readError) throw readError;
      const have = new Set(
        (existing ?? []).map((r) => String((r as unknown as Record<string, unknown>)[dateCol])),
      );
      const fresh = args.dates.filter((d) => !have.has(d));
      if (fresh.length === 0) return 0;
      const rows = fresh.map((d) => ({
        org_id: args.orgId,
        name: args.template.name,
        type: args.template.type,
        from_time: args.template.from_time,
        to_time: args.template.to_time,
        location: args.template.location,
        host_id: args.template.host_id,
        series_id: args.seriesId,
        created_by: args.createdBy,
        ...(args.table === "events" ? { date: d } : { from_date: d, to_date: d }),
      }));
      const { error } = await supabase.from(args.table).insert(rows as never);
      if (error) throw error;
      return fresh.length;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Cancels every occurrence — the one-action "delete the whole series". */
export function useDeleteSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { table: "events" | "programs"; seriesId: string }) => {
      const { error } = await supabase
        .from(args.table)
        .update({ status: "cancelled" } as never)
        .eq("series_id", args.seriesId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}
