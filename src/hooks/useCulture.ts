import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { OpenCheckin, Recognition, Ritual, SopItem } from "@/lib/culture";
import { istToday } from "@/lib/culture";

/* ─────────────── Recognition ─────────────── */

export function useRecognitions(limit = 200) {
  return useQuery({
    queryKey: ["recognitions", limit],
    queryFn: async (): Promise<Recognition[]> => {
      const { data, error } = await supabase
        .from("recognitions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface RecognitionInput {
  to_id: string;
  kind: "praise" | "badge";
  badge_name?: string | null;
  text: string;
}

export function useGiveRecognition(orgId?: string | null, fromId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecognitionInput) => {
      if (!orgId || !fromId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase.from("recognitions").insert({
        org_id: orgId,
        from_id: fromId,
        to_id: input.to_id,
        kind: input.kind,
        badge_name: input.kind === "badge" ? (input.badge_name ?? null) : null,
        text: input.text.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recognitions"] }),
  });
}

/* ─────────────── The doorbell: "I'd like a check-in" ─────────────── */

/**
 * RLS lets exactly four kinds of eyes see a row: the person who asked,
 * their manager chain, People & Culture and Admin. Never a peer.
 * No mood, no reason, no history — a doorbell, not a dataset.
 */
export function useCheckins(enabled = true) {
  return useQuery({
    queryKey: ["checkins"],
    enabled,
    queryFn: async (): Promise<OpenCheckin[]> => {
      const { data, error } = await supabase
        .from("checkin_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRequestCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note?: string) => {
      const { error } = await supabase.rpc("request_checkin", {
        p_note: note?.trim() || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["checkins"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Only ever your own, and only while nobody has acted on it. */
export function useCancelCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checkin_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["checkins"] }),
  });
}

export function useMarkTalked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("checkin_talked", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["checkins"] }),
  });
}

/* ─────────────── Rituals ─────────────── */

export function useRituals(profileId?: string | null) {
  return useQuery({
    queryKey: ["rituals", profileId ?? "none"],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<{ rituals: Ritual[]; doneIds: string[] }> => {
      const [{ data: rituals, error }, { data: logs, error: e2 }] = await Promise.all([
        supabase.from("rituals").select("*").order("sort_order", { ascending: true }),
        supabase.from("ritual_logs").select("ritual_id, done").eq("date", istToday()),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      return {
        rituals: rituals ?? [],
        doneIds: (logs ?? []).filter((l) => l.done).map((l) => l.ritual_id),
      };
    },
  });
}

export function useToggleRitual(orgId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ritualId, done }: { ritualId: string; done: boolean }) => {
      if (!orgId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase
        .from("ritual_logs")
        .upsert(
          { org_id: orgId, ritual_id: ritualId, date: istToday(), done },
          { onConflict: "ritual_id,date" },
        );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rituals"] }),
  });
}

export function useEditRituals(orgId?: string | null, profileId?: string | null) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["rituals"] });

  const add = useMutation({
    mutationFn: async ({ text, sortOrder }: { text: string; sortOrder: number }) => {
      if (!orgId || !profileId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase
        .from("rituals")
        .insert({ org_id: orgId, profile_id: profileId, text: text.trim(), sort_order: sortOrder });
      if (error) throw error;
    },
    onSuccess: done,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rituals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });

  return { add, remove };
}

/* ─────────────── The daily playbook ─────────────── */

export function usePlaybook(profileId?: string | null, department?: string | null) {
  return useQuery({
    queryKey: ["playbook", profileId ?? "none", department ?? "none"],
    enabled: Boolean(profileId && department),
    queryFn: async (): Promise<{ items: SopItem[]; doneIds: string[] }> => {
      const [{ data: items, error }, { data: logs, error: e2 }] = await Promise.all([
        supabase
          .from("sop_items")
          .select("*")
          .eq("department", department!)
          .order("sort_order", { ascending: true }),
        supabase.from("sop_logs").select("sop_item_id, done").eq("date", istToday()),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      return {
        items: items ?? [],
        doneIds: (logs ?? []).filter((l) => l.done).map((l) => l.sop_item_id),
      };
    },
  });
}

export function useTogglePlaybook(orgId?: string | null, profileId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, done }: { itemId: string; done: boolean }) => {
      if (!orgId || !profileId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase.from("sop_logs").upsert(
        {
          org_id: orgId,
          profile_id: profileId,
          sop_item_id: itemId,
          date: istToday(),
          done,
        },
        { onConflict: "profile_id,sop_item_id,date" },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["playbook"] }),
  });
}

/** Editing the playbook is a People & Culture job, done per department. */
export function useEditPlaybook(orgId?: string | null) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["playbook"] });

  const add = useMutation({
    mutationFn: async ({
      department,
      text,
      sortOrder,
    }: {
      department: string;
      text: string;
      sortOrder: number;
    }) => {
      if (!orgId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase
        .from("sop_items")
        .insert({ org_id: orgId, department, text: text.trim(), sort_order: sortOrder });
      if (error) throw error;
    },
    onSuccess: done,
  });

  const update = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const clean = text.trim();
      if (!clean) throw new Error("A playbook line cannot be empty.");
      const { error } = await supabase.from("sop_items").update({ text: clean }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });

  /** Reordering rewrites every sort_order in the list, so it can never drift. */
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += 1) {
        const { error } = await supabase
          .from("sop_items")
          .update({ sort_order: (i + 1) * 10 })
          .eq("id", ids[i]!);
        if (error) throw error;
      }
    },
    onSuccess: done,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sop_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });

  return { add, update, reorder, remove };
}

/** Every playbook line for one department — the People & Culture editing view. */
export function useDepartmentPlaybook(department: string | null) {
  return useQuery({
    queryKey: ["playbook", "dept", department ?? "none"],
    enabled: Boolean(department),
    queryFn: async (): Promise<SopItem[]> => {
      const { data, error } = await supabase
        .from("sop_items")
        .select("*")
        .eq("department", department!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
