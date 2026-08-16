import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type IdeaKind = "broken" | "confusing" | "idea" | "praise";
export type IdeaStatus = "new" | "looking" | "building" | "shipped" | "declined";

export interface IdeaRow {
  id: string;
  kind: IdeaKind;
  title: string;
  detail: string | null;
  status: IdeaStatus;
  status_note: string | null;
  screen: string | null;
  device: string | null;
  source: string;
  created_at: string;
  decided_at: string | null;
  is_anonymous: boolean;
  is_mine: boolean;
  author: string;
  votes: number;
  voted: boolean;
}

export const KIND_LABEL: Record<IdeaKind, string> = {
  broken: "Something's broken",
  confusing: "Confusing or slow",
  idea: "An idea",
  praise: "Good — don't change it",
};

export const STATUS_LABEL: Record<IdeaStatus, string> = {
  new: "New",
  looking: "Looking at it",
  building: "Building",
  shipped: "Shipped",
  declined: "Not now",
};

export function useIdeas(enabled = true) {
  return useQuery({
    queryKey: ["ideas"],
    enabled,
    queryFn: async (): Promise<IdeaRow[]> => {
      const { data, error } = await supabase.rpc("ideas_board");
      if (error) throw error;
      return (data as unknown as IdeaRow[]) ?? [];
    },
  });
}

export function useSubmitIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: IdeaKind;
      title: string;
      detail?: string;
      anonymous: boolean;
      screen?: string;
      device?: string;
    }) => {
      const { data, error } = await supabase.rpc("submit_idea", {
        p_kind: input.kind,
        p_title: input.title,
        p_detail: input.detail ?? "",
        p_anonymous: input.anonymous,
        p_screen: input.screen ?? "",
        p_device: input.device ?? "",
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ideas"] });
    },
  });
}

export function useVoteIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ideaId: string) => {
      const { data, error } = await supabase.rpc("vote_idea", { p_idea_id: ideaId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ideas"] });
    },
  });
}

export function useSetIdeaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: IdeaStatus; note: string }) => {
      const { error } = await supabase.rpc("set_idea_status", {
        p_idea_id: input.id,
        p_status: input.status,
        p_note: input.note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ideas"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Loose title match so five people don't file the same thing. */
export function similarIdeas(rows: IdeaRow[], title: string, limit = 3): IdeaRow[] {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  if (words.length === 0) return [];
  return rows
    .map((r) => {
      const hay = `${r.title} ${r.detail ?? ""}`.toLowerCase();
      return { r, score: words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.r.votes - a.r.votes)
    .slice(0, limit)
    .map((x) => x.r);
}
