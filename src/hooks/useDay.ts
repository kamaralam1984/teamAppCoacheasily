import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { CloseResult, DayReportRow, MyDay } from "@/lib/day";

/** Today's plan, straight from my_day(). */
export function useMyDay(enabled: boolean) {
  return useQuery({
    queryKey: ["my-day"],
    enabled,
    queryFn: async (): Promise<MyDay | null> => {
      const { data, error } = await supabase.rpc("my_day", {});
      if (error) throw error;
      return (data as unknown as MyDay | null) ?? null;
    },
  });
}

export function useCommitDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      const { error } = await supabase.rpc("commit_day", { p_task_ids: taskIds });
      if (error) throw error;
    },
    // The day is committed on the click; the server catches up behind it.
    onMutate: async (taskIds: string[]) => {
      await qc.cancelQueries({ queryKey: ["my-day"] });
      const previous = qc.getQueryData<MyDay | null>(["my-day"]);
      if (previous) {
        const chosen = [
          ...previous.tasks.filter((t) => taskIds.includes(t.id)),
          ...previous.available
            .filter((a) => taskIds.includes(a.id) && !previous.tasks.some((t) => t.id === a.id))
            .map((a) => ({ ...a, done: false, goal_name: a.goal_name })),
        ];
        qc.setQueryData<MyDay>(["my-day"], {
          ...previous,
          committed_at: previous.committed_at ?? new Date().toISOString(),
          tasks: chosen,
          total: chosen.length,
          done: chosen.filter((t) => t.done).length,
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) qc.setQueryData(["my-day"], context.previous);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-day"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCloseDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: string): Promise<CloseResult> => {
      const { data, error } = await supabase.rpc("close_day", { p_note: note });
      if (error) throw error;
      return data as unknown as CloseResult;
    },
    // The day reads as closed straight away.
    onMutate: async (note: string) => {
      await qc.cancelQueries({ queryKey: ["my-day"] });
      const previous = qc.getQueryData<MyDay | null>(["my-day"]);
      if (previous) {
        qc.setQueryData<MyDay>(["my-day"], {
          ...previous,
          closed_at: new Date().toISOString(),
          note: note || previous.note,
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) qc.setQueryData(["my-day"], context.previous);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-day"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/** Kept promises for one person over a window — self, downline or HR. */
export function useDayReport(profileId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["day-report", profileId ?? "none", from, to],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<DayReportRow[]> => {
      const { data, error } = await supabase.rpc("day_report", {
        p_profile_id: profileId!,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data as unknown as DayReportRow[] | null) ?? [];
    },
  });
}

/** How many of a person's open tasks are currently carrying forward. */
export function useCarryingCount(profileId: string | null) {
  return useQuery({
    queryKey: ["carrying", profileId ?? "none"],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", profileId!)
        .eq("done", false)
        .gte("carried_count", 1);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export interface TeamPromise {
  days_committed: number;
  avg_pct: number;
  carrying: number;
  last_note: string | null;
}

/** Kept promises for the whole downline in one call. */
export function useTeamDayReport(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["day-report-team", from, to],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, TeamPromise>> => {
      const { data, error } = await supabase.rpc(
        "day_report_team" as never,
        { p_from: from, p_to: to } as never,
      );
      if (error) throw error;
      return (data as unknown as Record<string, TeamPromise> | null) ?? {};
    },
  });
}
