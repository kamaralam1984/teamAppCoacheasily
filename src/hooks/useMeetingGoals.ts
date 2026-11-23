import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { addDays, daysBetween } from "@/lib/calendar";
import { devMeetingGoals, devWriteRow } from "@/lib/developer.functions";
import type { StrategicMeeting } from "@/hooks/useStrategicMeetings";
import { shortDate } from "@/lib/warriors";

export type MeetingGoal = Tables<"meeting_goals">;
export type GoalUpdate = Tables<"meeting_goal_updates">;

/** How far back a meeting's goals run when there is no earlier meeting: the usual 45 days. */
const DEFAULT_RUN = 45;

/**
 * The run-up to a meeting, and one update column per week of it.
 *
 * The run ends on the meeting day. It starts on the start date HR set (each week then starts on
 * that weekday: 20 Nov → "20 Nov to 26 Nov", "27 Nov to 3 Dec", … "1 Jan to 4 Jan"), else the day
 * after the previous meeting, or 45 days before, in Monday-to-Sunday weeks.
 *
 * Weekly rows are stored by a Monday (`week_start`). The n-th week column always reads and writes
 * the n-th Monday from the start's own week, so setting or moving the start date never hides or
 * changes saved updates: `shift` is how many days a column's first day is after its stored Monday.
 */
export function meetingPeriod(meeting: StrategicMeeting, all: StrategicMeeting[]) {
  const prev = all
    .filter((m) => m.meeting_date < meeting.meeting_date)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))[0];
  const custom = Boolean(meeting.starts_on && meeting.starts_on <= meeting.meeting_date);
  // 45 days counting the first day itself, e.g. 7 Oct to 20 Nov
  const from = custom
    ? meeting.starts_on!
    : prev
      ? addDays(prev.meeting_date, 1)
      : addDays(meeting.meeting_date, -(DEFAULT_RUN - 1));
  const to = meeting.meeting_date;
  const dow = new Date(`${from}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const firstMonday = addDays(from, dow === 0 ? -6 : 1 - dow);
  const shift = custom ? daysBetween(firstMonday, from) : 0;
  const weeks: string[] = [];
  for (let monday = firstMonday; addDays(monday, shift) <= to; monday = addDays(monday, 7)) {
    weeks.push(monday);
  }
  return { from, to, weeks, shift };
}

export type MeetingPeriod = ReturnType<typeof meetingPeriod>;

/** The first day a week column covers (its stored Monday, moved to the start date's weekday). */
export function weekFirstDay(period: MeetingPeriod | null, week: string): string {
  return period ? addDays(week, period.shift) : week;
}

/** A week column's dates, cut off at the end of the run: "20 Nov to 26 Nov". */
export function weekRangeLabel(period: MeetingPeriod | null, week: string): string {
  const first = weekFirstDay(period, week);
  const last = addDays(first, 6);
  return `${shortDate(first)} to ${shortDate(period && last > period.to ? period.to : last)}`;
}

/** The week column today falls in (the latest one already started), else the first. */
export function currentWeek(period: MeetingPeriod | null, today: string): string | null {
  const weeks = period?.weeks ?? [];
  return [...weeks].reverse().find((w) => weekFirstDay(period, w) <= today) ?? weeks[0] ?? null;
}

/** Which table: the whole run-up (45 days), or one week of it (its Monday). */
export type GoalScope = { kind: "run" } | { kind: "week"; weekStart: string };

function scopeKey(scope: GoalScope) {
  return scope.kind === "run" ? "run" : `week:${scope.weekStart}`;
}

/** One person's goals for one meeting (45-day or one week), with their weekly updates. */
export function useMeetingGoals(
  meetingId: string | null,
  profileId: string | null,
  scope: GoalScope,
  viaDev = false,
) {
  const dev = useServerFn(devMeetingGoals);
  return useQuery({
    queryKey: ["meeting-goals", meetingId, profileId, scopeKey(scope), viaDev],
    enabled: Boolean(meetingId && profileId),
    queryFn: async () => {
      if (viaDev) {
        const all = await dev({ data: { meetingId: meetingId!, profileId: profileId! } });
        const goals = (all.goals as unknown as MeetingGoal[]).filter(
          (g) =>
            g.scope === scope.kind && (scope.kind !== "week" || g.week_start === scope.weekStart),
        );
        const ids = new Set(goals.map((g) => g.id));
        const updates = (all.updates as unknown as GoalUpdate[]).filter((u) => ids.has(u.goal_id));
        return { goals, updates };
      }
      let q = supabase
        .from("meeting_goals")
        .select("*")
        .eq("meeting_id", meetingId!)
        .eq("profile_id", profileId!)
        .eq("scope", scope.kind);
      if (scope.kind === "week") q = q.eq("week_start", scope.weekStart);
      const { data: goals, error } = await q
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (goals ?? []).map((g) => g.id);
      let updates: GoalUpdate[] = [];
      if (ids.length > 0) {
        const res = await supabase.from("meeting_goal_updates").select("*").in("goal_id", ids);
        if (res.error) throw res.error;
        updates = res.data ?? [];
      }
      return { goals: goals ?? [], updates };
    },
  });
}

/** Every week's goals for this person, so the weekly chart can show one week beside the others. */
export function useMeetingWeekGoals(
  meetingId: string | null,
  profileId: string | null,
  enabled: boolean,
  viaDev = false,
) {
  const dev = useServerFn(devMeetingGoals);
  return useQuery({
    queryKey: ["meeting-goals", meetingId, profileId, "all-weeks", viaDev],
    enabled: enabled && Boolean(meetingId && profileId),
    queryFn: async () => {
      if (viaDev) {
        const all = await dev({ data: { meetingId: meetingId!, profileId: profileId! } });
        return (all.goals as unknown as MeetingGoal[])
          .filter((g) => g.scope === "week")
          .map(({ title, outcome, week_start, goal_type }) => ({
            title,
            outcome,
            week_start,
            goal_type,
          }));
      }
      const { data, error } = await supabase
        .from("meeting_goals")
        .select("title, outcome, week_start, goal_type")
        .eq("meeting_id", meetingId!)
        .eq("profile_id", profileId!)
        .eq("scope", "week");
      if (error) throw error;
      return data ?? [];
    },
  });
}

type Values = { [k: string]: Json };

/**
 * Writes for the table. People write through their own permissions; a developer who is not
 * allowed directly (`viaDev`) goes through the gated, audited Developer write instead.
 */
export function useMeetingGoalWrites(
  meetingId: string | null,
  profileId: string | null,
  viaDev: boolean,
  scope: GoalScope,
) {
  const qc = useQueryClient();
  const dev = useServerFn(devWriteRow);
  const refresh = () => {
    void qc.invalidateQueries({
      queryKey: ["meeting-goals", meetingId, profileId, scopeKey(scope)],
    });
    void qc.invalidateQueries({ queryKey: ["meeting-goals", meetingId, profileId, "all-weeks"] });
  };

  const addGoal = useMutation({
    mutationFn: async (args: { orgId: string; position: number; createdBy: string | null }) => {
      const row = {
        org_id: args.orgId,
        meeting_id: meetingId!,
        profile_id: profileId!,
        position: args.position,
        scope: scope.kind,
        week_start: scope.kind === "week" ? scope.weekStart : null,
        title: "",
        created_by: args.createdBy,
      };
      if (viaDev) {
        await dev({ data: { table: "meeting_goals", op: "insert", values: row } });
        return;
      }
      const { error } = await supabase.from("meeting_goals").insert(row);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const saveGoal = useMutation({
    mutationFn: async (args: {
      id: string;
      values: Partial<
        Pick<
          MeetingGoal,
          | "title"
          | "measure"
          | "timeline"
          | "outcome"
          | "challenges"
          | "learnings"
          | "remarks"
          | "goal_type"
        >
      >;
    }) => {
      if (viaDev) {
        await dev({
          data: {
            table: "meeting_goals",
            op: "update",
            key: { id: args.id },
            values: args.values as Values,
          },
        });
        return;
      }
      const { error } = await supabase.from("meeting_goals").update(args.values).eq("id", args.id);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      if (viaDev) {
        await dev({ data: { table: "meeting_goals", op: "delete", key: { id } } });
        return;
      }
      const { error } = await supabase.from("meeting_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const saveUpdate = useMutation({
    mutationFn: async (args: {
      goalId: string;
      weekStart: string;
      note: string;
      by: string | null;
      exists: boolean;
    }) => {
      const key = { goal_id: args.goalId, week_start: args.weekStart };
      if (viaDev) {
        await dev({
          data: args.exists
            ? { table: "meeting_goal_updates", op: "update", key, values: { note: args.note } }
            : { table: "meeting_goal_updates", op: "insert", values: { ...key, note: args.note } },
        });
        return;
      }
      const { error } = await supabase
        .from("meeting_goal_updates")
        .upsert(
          { ...key, note: args.note, updated_by: args.by },
          { onConflict: "goal_id,week_start" },
        );
      if (error) throw error;
    },
    onSettled: refresh,
  });

  return { addGoal, saveGoal, deleteGoal, saveUpdate };
}

export type GoalNotes = Tables<"meeting_goal_notes">;
export type NoteField = "challenges" | "learnings" | "remarks";

/** The `period` a table's notes are kept under: 'run', or the Monday of a weekly table. */
function notesPeriod(scope: GoalScope) {
  return scope.kind === "run" ? "run" : scope.weekStart;
}

/**
 * The optional Challenges, Learnings and Remarks boxes for one person's table. A field that is null has
 * not been added; an empty string has been added with nothing written yet.
 */
export function useMeetingGoalNotes(
  meetingId: string | null,
  profileId: string | null,
  scope: GoalScope,
  viaDev = false,
) {
  const dev = useServerFn(devMeetingGoals);
  return useQuery({
    queryKey: ["meeting-goal-notes", meetingId, profileId, scopeKey(scope), viaDev],
    enabled: Boolean(meetingId && profileId),
    queryFn: async () => {
      if (viaDev) {
        const all = await dev({ data: { meetingId: meetingId!, profileId: profileId! } });
        return (
          (all.notes as unknown as GoalNotes[]).find((n) => n.period === notesPeriod(scope)) ?? null
        );
      }
      const { data, error } = await supabase
        .from("meeting_goal_notes")
        .select("*")
        .eq("meeting_id", meetingId!)
        .eq("profile_id", profileId!)
        .eq("period", notesPeriod(scope))
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Add, write or remove a Challenges, Learnings or Remarks box (remove = set it back to null). */
export function useSaveMeetingGoalNote(
  meetingId: string | null,
  profileId: string | null,
  viaDev: boolean,
  scope: GoalScope,
) {
  const qc = useQueryClient();
  const dev = useServerFn(devWriteRow);
  return useMutation({
    mutationFn: async (args: {
      orgId: string;
      field: NoteField;
      value: string | null;
      by: string | null;
      exists: boolean;
    }) => {
      const key = { meeting_id: meetingId!, profile_id: profileId!, period: notesPeriod(scope) };
      if (viaDev) {
        await dev({
          data: args.exists
            ? {
                table: "meeting_goal_notes",
                op: "update",
                key,
                values: { [args.field]: args.value },
              }
            : {
                table: "meeting_goal_notes",
                op: "insert",
                values: { ...key, org_id: args.orgId, [args.field]: args.value },
              },
        });
        return;
      }
      const { error } = await supabase
        .from("meeting_goal_notes")
        .upsert(
          { ...key, org_id: args.orgId, [args.field]: args.value, updated_by: args.by },
          { onConflict: "meeting_id,profile_id,period" },
        );
      if (error) throw error;
    },
    onSettled: () =>
      void qc.invalidateQueries({
        queryKey: ["meeting-goal-notes", meetingId, profileId, scopeKey(scope)],
      }),
  });
}
