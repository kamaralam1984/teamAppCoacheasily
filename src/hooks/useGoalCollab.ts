import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/hooks/useMyProfile";
import type { Tables } from "@/integrations/supabase/types";
import type { GoalStatusRow } from "@/lib/goalStatus";

export type Milestone = Tables<"goal_milestones">;
export type GoalComment = Tables<"goal_comments">;

/** A person's goals in the active cycle, with status, milestones and comment counts. */
export function useGoalStatuses(profileId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["goal-statuses", profileId ?? "me"],
    enabled: enabled && profileId !== undefined,
    staleTime: 60_000,
    queryFn: async (): Promise<GoalStatusRow[]> => {
      const { data, error } = await supabase.rpc("goals_status_for", {
        ...(profileId ? { p_profile_id: profileId } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as GoalStatusRow[];
    },
  });
}

export function useMilestones(goalId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["goal-milestones", goalId],
    enabled,
    queryFn: async (): Promise<Milestone[]> => {
      const { data, error } = await supabase
        .from("goal_milestones")
        .select("*")
        .eq("goal_id", goalId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useRefreshGoal(goalId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["goal-milestones", goalId] });
    void qc.invalidateQueries({ queryKey: ["goal-comments", goalId] });
    void qc.invalidateQueries({ queryKey: ["goal-statuses"] });
  };
}

export function useAddMilestone(goalId: string, orgId?: string | null) {
  const refresh = useRefreshGoal(goalId);
  return useMutation({
    mutationFn: async (input: { title: string; dueDate?: string }) => {
      if (!orgId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase.from("goal_milestones").insert({
        org_id: orgId,
        goal_id: goalId,
        title: input.title.trim(),
        due_date: input.dueDate || null,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useToggleMilestone(goalId: string) {
  const refresh = useRefreshGoal(goalId);
  return useMutation({
    mutationFn: async (input: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from("goal_milestones")
        .update({ done: input.done })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useDeleteMilestone(goalId: string) {
  const refresh = useRefreshGoal(goalId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goal_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useGoalComments(goalId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["goal-comments", goalId],
    enabled,
    queryFn: async (): Promise<GoalComment[]> => {
      const { data, error } = await supabase
        .from("goal_comments")
        .select("*")
        .eq("goal_id", goalId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddGoalComment(goalId: string, orgId?: string | null, authorId?: string | null) {
  const refresh = useRefreshGoal(goalId);
  return useMutation({
    mutationFn: async (body: string) => {
      if (!orgId || !authorId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase
        .from("goal_comments")
        .insert({ org_id: orgId, goal_id: goalId, author_id: authorId, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** The status for one goal, from the owner's list (one request is shared by all their cards). */
export function useGoalStatus(goalId: string, ownerId: string) {
  const { data: mine } = useMyProfile();
  const own = mine?.profile?.id === ownerId;
  const { data } = useGoalStatuses(own ? null : ownerId);
  return data?.find((g) => g.goal_id === goalId) ?? null;
}
