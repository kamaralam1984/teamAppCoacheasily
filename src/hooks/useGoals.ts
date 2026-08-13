import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { notifyByEmail } from "@/lib/notify";
import type {
  Cycle,
  Goal,
  GoalEntry,
  GoalWithProgress,
  TeamGoalRow,
} from "@/lib/goals";

/* ── cycles ────────────────────────────────────────────────── */

export function useCycles() {
  return useQuery({
    queryKey: ["cycles"],
    queryFn: async (): Promise<Cycle[]> => {
      const { data, error } = await supabase
        .from("cycles")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOpenCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { endDate: string; name?: string }) => {
      const { data, error } = await supabase.rpc("open_cycle", {
        p_end_date: args.endDate,
        ...(args.name ? { p_name: args.name } : {}),
      });
      if (error) throw error;

      const cycle = data as unknown as { id: string; name: string; closed: string | null };
      const { data: people } = await supabase.from("profiles").select("id").eq("status", "active");
      notifyByEmail({
        kind: "cycle_opened",
        profileIds: (people ?? []).map((p) => p.id),
        title: `${cycle.name} is open`,
        body: `Write your goals for this cycle. It runs to ${args.endDate}.`,
        link: "/goals",
      });
      return cycle;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cycles"] });
      void qc.invalidateQueries({ queryKey: ["goals"] });
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/* ── goals + progress, always straight from Postgres ───────── */

export function useGoalsFor(profileId?: string | null, cycleId?: string | null) {
  return useQuery({
    queryKey: ["goals", profileId ?? "me", cycleId ?? "active"],
    enabled: profileId !== null,
    queryFn: async (): Promise<GoalWithProgress[]> => {
      const { data, error } = await supabase.rpc("goals_for", {
        ...(profileId ? { p_profile_id: profileId } : {}),
        ...(cycleId ? { p_cycle_id: cycleId } : {}),
      });
      if (error) throw error;
      return (data as unknown as GoalWithProgress[] | null) ?? [];
    },
  });
}

export function useGoalEntries(goalId: string | null, limit = 30) {
  return useQuery({
    queryKey: ["goal-entries", goalId, limit],
    enabled: Boolean(goalId),
    queryFn: async (): Promise<GoalEntry[]> => {
      const { data, error } = await supabase
        .from("goal_entries")
        .select("*")
        .eq("goal_id", goalId!)
        .order("date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface SaveGoalInput {
  id?: string;
  profile_id: string;
  org_id: string;
  cycle_id: string;
  kind: "number" | "funnel";
  name: string;
  metric: string | null;
  unit: string | null;
  baseline: number;
  target: number;
  stages: string[] | null;
  plan: string | null;
}

export function useSaveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveGoalInput) => {
      if (input.target === input.baseline) {
        throw new Error("Where you are and where you're going cannot be the same number.");
      }
      const { id, ...rest } = input;
      if (id) {
        const { error } = await supabase.from("goals").update(rest).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("goals").insert(rest).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      void qc.invalidateQueries({ queryKey: ["team-goals"] });
    },
  });
}

export function useArchiveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase.from("goals").update({ archived: true }).eq("id", goalId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

/** A goal written by mistake should never be permanent. Entries go with it. */
export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goalId: string) => {
      const { error: e1 } = await supabase.from("goal_entries").delete().eq("goal_id", goalId);
      if (e1) throw e1;
      const { error } = await supabase.from("goals").delete().eq("id", goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      void qc.invalidateQueries({ queryKey: ["goal-entries"] });
      void qc.invalidateQueries({ queryKey: ["team-goals"] });
    },
  });
}

export function useSaveLearnings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { goalId: string; learnings: string }) => {
      const { error } = await supabase
        .from("goals")
        .update({ learnings: args.learnings })
        .eq("id", args.goalId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

/* ── the twenty-second habit ───────────────────────────────── */

export interface LogInput {
  goalId: string;
  date?: string;
  value?: number | null;
  counts?: number[] | null;
  note?: string | null;
}

export function useLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogInput) => {
      const { data, error } = await supabase.rpc("log_goal_entry", {
        p_goal_id: input.goalId,
        ...(input.date ? { p_date: input.date } : {}),
        ...(input.value !== undefined && input.value !== null ? { p_value: input.value } : {}),
        ...(input.counts ? { p_counts: input.counts } : {}),
        ...(input.note ? { p_note: input.note } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["goals"] });
      void qc.invalidateQueries({ queryKey: ["goal-entries"] });
      void qc.invalidateQueries({ queryKey: ["team-goals"] });
    },
  });
}

/* ── team panel ────────────────────────────────────────────── */

export function useTeamGoals(enabled: boolean, cycleId?: string | null) {
  return useQuery({
    queryKey: ["team-goals", cycleId ?? "active"],
    enabled,
    queryFn: async (): Promise<TeamGoalRow[]> => {
      const { data, error } = await supabase.rpc("team_goals", {
        ...(cycleId ? { p_cycle_id: cycleId } : {}),
      });
      if (error) throw error;
      return (data as unknown as TeamGoalRow[] | null) ?? [];
    },
  });
}

export function useRemindAll() {
  return useMutation({
    mutationFn: async (cycleId?: string | null) => {
      const { data, error } = await supabase.rpc("goals_remind_pending", {
        ...(cycleId ? { p_cycle_id: cycleId } : {}),
      });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
  });
}

/** Worked today but numbers still blank — the app taps them on the shoulder, once. */
export function useEveningNudge(enabled: boolean) {
  return useQuery({
    queryKey: ["goal-nudge"],
    enabled,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
      if (hour < 17) return false;
      const { data, error } = await supabase.rpc("goal_nudge_me");
      if (error) return false;
      return Boolean(data);
    },
  });
}

export type { Goal, Cycle, GoalEntry, GoalWithProgress, TeamGoalRow };
