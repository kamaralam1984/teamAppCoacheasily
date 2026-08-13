import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { notifyByEmail } from "@/lib/notify";
import type { Profile } from "@/lib/warriors";
import type { Priority, Slot, Task } from "@/lib/tasks";

/** Every task I own or handed to somebody in my line. */
export function useTasks(profileId?: string | null) {
  return useQuery({
    queryKey: ["tasks", profileId ?? "none"],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface TaskInput {
  title: string;
  description?: string | null;
  due_date?: string | null;
  slot: Slot;
  priority: Priority;
  owner_id: string;
  blocked_by?: string | null;
}

export function useCreateTasks(orgId?: string | null, createdBy?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: TaskInput[]) => {
      if (!orgId || !createdBy) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase.from("tasks").insert(
        inputs.map((t) => ({
          org_id: orgId,
          created_by: createdBy,
          owner_id: t.owner_id,
          title: t.title.trim(),
          description: t.description?.trim() || null,
          due_date: t.due_date || null,
          slot: t.slot,
          priority: t.priority,
          blocked_by: t.blocked_by || null,
        })),
      );
      if (error) throw error;

      const assigned = inputs.filter((t) => t.owner_id !== createdBy);
      for (const task of assigned) {
        notifyByEmail({
          kind: "task_assigned",
          profileIds: [task.owner_id],
          title: `New task: ${task.title.trim()}`,
          body: task.due_date ? `Due ${task.due_date}.` : "No due date set.",
          link: "/tasks",
        });
      }
      return inputs.length;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

/** Nudge me once a day about anything I'm waiting on that has slipped. */
export function useBlockedNudge(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void supabase.rpc("tasks_blocked_nudges");
  }, [enabled]);
}

/** Everyone below me in the chart — used for "For" and handover pickers. */
export function myLine(profiles: Profile[], meId?: string | null): Profile[] {
  if (!meId) return [];
  const out: Profile[] = [];
  const walk = (managerId: string) => {
    for (const p of profiles) {
      if (p.manager_id === managerId && p.status === "active" && p.id !== meId) {
        out.push(p);
        walk(p.id);
      }
    }
  };
  walk(meId);
  return out;
}

/** Open tasks of mine that fall inside a date window — shown on the leave form. */
export function useTasksInWindow(profileId?: string | null, from?: string, to?: string) {
  return useQuery({
    queryKey: ["tasks-window", profileId ?? "none", from, to],
    enabled: Boolean(profileId && from && to && from <= to),
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("owner_id", profileId!)
        .eq("done", false)
        .gte("due_date", from!)
        .lte("due_date", to!)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type Reflection = { id: string; date: string; note: string };

export function useReflections(profileId?: string | null, limit = 7) {
  return useQuery({
    queryKey: ["reflections", profileId ?? "none", limit],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<Reflection[]> => {
      const { data, error } = await supabase
        .from("daily_reflections")
        .select("id, date, note")
        .eq("profile_id", profileId!)
        .order("date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveReflection(profileId?: string | null, orgId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, note }: { date: string; note: string }) => {
      if (!profileId || !orgId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase
        .from("daily_reflections")
        .upsert(
          { profile_id: profileId, org_id: orgId, date, note: note.trim() },
          { onConflict: "profile_id,date" },
        );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["reflections"] }),
  });
}

/** The exact tasks a leave request hands over — shown to the approver before they decide. */
export function useTasksByIds(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["tasks-by-ids", key],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .in("id", ids)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
