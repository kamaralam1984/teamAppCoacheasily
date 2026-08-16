import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface ReleaseItem {
  id: string;
  title: string;
  what_it_does: string | null;
  how_to_use: string | null;
  why_it_helps: string | null;
  credit: string | null;
}

export interface Release {
  id: string;
  title: string;
  summary: string | null;
  published_at: string | null;
  items: ReleaseItem[];
}

export function useLatestUnseenRelease(enabled = true) {
  return useQuery({
    queryKey: ["release-unseen"],
    enabled,
    queryFn: async (): Promise<Release | null> => {
      const { data, error } = await supabase.rpc("latest_unseen_release");
      if (error) throw error;
      return (data as unknown as Release | null) ?? null;
    },
  });
}

export function useReleaseHistory(enabled = true) {
  return useQuery({
    queryKey: ["release-history"],
    enabled,
    queryFn: async (): Promise<Release[]> => {
      const { data, error } = await supabase.rpc("release_history");
      if (error) throw error;
      return (data as unknown as Release[]) ?? [];
    },
  });
}

export function useMarkReleaseSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (releaseId: string) => {
      const { error } = await supabase.rpc("mark_release_seen", { p_release_id: releaseId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["release-unseen"] });
    },
  });
}

/* ── HR composer ──────────────────────────────────────────── */

export interface DraftRow {
  id: string;
  title: string;
  summary: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
}

export function useAllReleases(enabled = true) {
  return useQuery({
    queryKey: ["releases-all"],
    enabled,
    queryFn: async (): Promise<DraftRow[]> => {
      const { data, error } = await supabase
        .from("releases")
        .select("id,title,summary,published,published_at,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface EditableItem {
  id?: string;
  sort_order: number;
  title: string;
  what_it_does: string;
  how_to_use: string;
  why_it_helps: string;
  idea_id: string | null;
}

export function useReleaseItems(releaseId: string | null) {
  return useQuery({
    queryKey: ["release-items", releaseId],
    enabled: Boolean(releaseId),
    queryFn: async (): Promise<EditableItem[]> => {
      const { data, error } = await supabase
        .from("release_items")
        .select("id,sort_order,title,what_it_does,how_to_use,why_it_helps,idea_id")
        .eq("release_id", releaseId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        sort_order: r.sort_order,
        title: r.title,
        what_it_does: r.what_it_does ?? "",
        how_to_use: r.how_to_use ?? "",
        why_it_helps: r.why_it_helps ?? "",
        idea_id: r.idea_id,
      }));
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["releases-all"] });
  void qc.invalidateQueries({ queryKey: ["release-history"] });
  void qc.invalidateQueries({ queryKey: ["release-unseen"] });
}

export function useSaveRelease(orgId: string | null, meId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string | null;
      title: string;
      summary: string;
      items: EditableItem[];
    }) => {
      let releaseId = input.id;
      if (releaseId) {
        const { error } = await supabase
          .from("releases")
          .update({ title: input.title, summary: input.summary })
          .eq("id", releaseId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("releases")
          .insert({
            org_id: orgId!,
            title: input.title,
            summary: input.summary,
            created_by: meId,
          })
          .select("id")
          .single();
        if (error) throw error;
        releaseId = data.id;
      }

      const { error: delErr } = await supabase
        .from("release_items")
        .delete()
        .eq("release_id", releaseId);
      if (delErr) throw delErr;

      if (input.items.length > 0) {
        const { error: insErr } = await supabase.from("release_items").insert(
          input.items.map((it, i) => ({
            release_id: releaseId!,
            sort_order: i,
            title: it.title,
            what_it_does: it.what_it_does || null,
            how_to_use: it.how_to_use || null,
            why_it_helps: it.why_it_helps || null,
            idea_id: it.idea_id,
          })),
        );
        if (insErr) throw insErr;
      }
      return releaseId!;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function usePublishRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("releases")
        .update({ published: true, published_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}
