import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/** A post nobody holds yet, shown on the org chart as "To be hired". */
export type OpenPosition = Tables<"open_positions">;

export function useOpenPositions(enabled = true) {
  return useQuery({
    queryKey: ["open-positions"],
    enabled,
    staleTime: 15 * 60_000,
    queryFn: async (): Promise<OpenPosition[]> => {
      const { data, error } = await supabase
        .from("open_positions")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** HR: add an open position. */
export function useAddOpenPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      org_id: string;
      title: string;
      department: string | null;
      reports_to: string | null;
    }) => {
      const { error } = await supabase.from("open_positions").insert(row);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["open-positions"] }),
  });
}

/** HR: remove an open position once it is filled. People drawn under it go back under their manager. */
export function useRemoveOpenPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("open_positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["open-positions"] });
      void qc.invalidateQueries({ queryKey: ["warriors"] });
    },
  });
}
