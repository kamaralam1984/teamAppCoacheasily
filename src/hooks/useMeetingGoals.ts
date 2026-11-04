import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { addDays, daysBetween } from "@/lib/calendar";
import { devWriteRow } from "@/lib/developer.functions";
import type { StrategicMeeting } from "@/hooks/useStrategicMeetings";

export type MeetingGoal = Tables<"meeting_goals">;
export type GoalUpdate = Tables<"meeting_goal_updates">;

/** How far back a meeting's goals run when there is no earlier meeting: the usual 45 days. */
const DEFAULT_RUN = 45;

/**
 * The run-up to a meeting: the day after the previous meeting, or 45 days before, up to the
 * meeting itself — and the Monday of every week in it, one update column each.
 */
export function meetingPeriod(meeting: StrategicMeeting, all: StrategicMeeting[]) {
  const prev = all
    .filter((m) => m.meeting_date < meeting.meeting_date)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))[0];
  // 45 days counting the meeting day itself, e.g. 7 Oct to 20 Nov
  const from = prev ? addDays(prev.meeting_date, 1) : addDays(meeting.meeting_date, -(DEFAULT_RUN - 1));
  const to = meeting.meeting_date;
  const dow = new Date(`${from}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  let monday = addDays(from, dow === 0 ? -6 : 1 - dow);
  const weeks: string[] = [];
  while (daysBetween(monday, to) >= 0) {
    weeks.push(monday);
    monday = addDays(monday, 7);
  }
  return { from, to, weeks };
}

/** Which table: the whole run-up (45 days), or one week of it (its Monday). */
export type GoalScope = { kind: "run" } | { kind: "week"; weekStart: string };

function scopeKey(scope: GoalScope) {
  return scope.kind === "run" ? "run" : `week:${scope.weekStart}`;
}

/** One person's goals for one meeting (45-day or one week), with their weekly updates. */
export function useMeetingGoals(meetingId: string | null, profileId: string | null, scope: GoalScope) {
  return useQuery({
    queryKey: ["meeting-goals", meetingId, profileId, scopeKey(scope)],
    enabled: Boolean(meetingId && profileId),
    queryFn: async () => {
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
  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ["meeting-goals", meetingId, profileId, scopeKey(scope)] });

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
    mutationFn: async (args: { id: string; values: Partial<Pick<MeetingGoal, "title" | "measure" | "timeline" | "outcome">> }) => {
      if (viaDev) {
        await dev({ data: { table: "meeting_goals", op: "update", key: { id: args.id }, values: args.values as Values } });
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
    mutationFn: async (args: { goalId: string; weekStart: string; note: string; by: string | null; exists: boolean }) => {
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
        .upsert({ ...key, note: args.note, updated_by: args.by }, { onConflict: "goal_id,week_start" });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  return { addGoal, saveGoal, deleteGoal, saveUpdate };
}
