import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type ProbationStatus = "on_probation" | "under_review" | "confirmed";
export type ProbationDecision = "confirm" | "extend" | "review";

export interface ProbationRow {
  profile_id: string;
  full_name: string;
  department: string | null;
  manager_id: string | null;
  start_date: string;
  end_date: string;
  duration_months: number;
  status: ProbationStatus;
  days_left: number;
}

export interface ProbationHistoryRow {
  id: string;
  decision: ProbationDecision;
  previous_end: string | null;
  new_end: string | null;
  extension_months: number | null;
  note: string | null;
  decided_by: string | null;
  created_at: string;
}

/** Everyone the viewer may see (own, downline, or the whole org for HR/Admin). */
export function useProbationOverview(enabled = true) {
  return useQuery({
    queryKey: ["probation"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ProbationRow[]> => {
      const { data, error } = await supabase.rpc("probation_overview");
      if (error) throw error;
      return (data as unknown as ProbationRow[]) ?? [];
    },
  });
}

export function useProbationHistory(profileId?: string | null) {
  return useQuery({
    queryKey: ["probation-history", profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<ProbationHistoryRow[]> => {
      const { data, error } = await supabase.rpc("probation_history", {
        p_profile_id: profileId!,
      });
      if (error) throw error;
      return (data as unknown as ProbationHistoryRow[]) ?? [];
    },
  });
}

export function useProbationDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      profileId: string;
      decision: ProbationDecision;
      months?: number;
      note?: string;
    }) => {
      const { error } = await supabase.rpc("probation_decide", {
        p_profile_id: args.profileId,
        p_decision: args.decision,
        ...(args.months ? { p_months: args.months } : {}),
        ...(args.note?.trim() ? { p_note: args.note.trim() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["probation"] });
      void qc.invalidateQueries({ queryKey: ["probation-history"] });
      void qc.invalidateQueries({ queryKey: ["hr-record"] });
    },
  });
}
