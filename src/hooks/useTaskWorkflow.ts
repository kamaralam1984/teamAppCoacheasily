import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { TaskStatus } from "@/lib/taskWorkflow";

export type TaskEvent = Tables<"task_events">;
export type TaskComment = Tables<"task_comments">;

export function useTaskEvents(taskId: string | null) {
  return useQuery({
    queryKey: ["task-events", taskId],
    enabled: Boolean(taskId),
    queryFn: async (): Promise<TaskEvent[]> => {
      const { data, error } = await supabase
        .from("task_events")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ["task-comments", taskId],
    enabled: Boolean(taskId),
    queryFn: async (): Promise<TaskComment[]> => {
      const { data, error } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddTaskComment(orgId?: string | null, authorId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; body: string; evidenceUrl?: string }) => {
      if (!orgId || !authorId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase.from("task_comments").insert({
        org_id: orgId,
        task_id: input.taskId,
        author_id: authorId,
        body: input.body.trim(),
        evidence_url: input.evidenceUrl?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      void qc.invalidateQueries({ queryKey: ["task-comments", vars.taskId] });
      void qc.invalidateQueries({ queryKey: ["task-events", vars.taskId] });
    },
  });
}

/** Move a task along its lifecycle. The database decides who may do what. */
export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: TaskStatus }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: input.status })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSettled: (_d, _e, vars) => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["my-day"] });
      void qc.invalidateQueries({ queryKey: ["task-events", vars.id] });
      void qc.invalidateQueries({ queryKey: ["dash-team"] });
    },
  });
}
