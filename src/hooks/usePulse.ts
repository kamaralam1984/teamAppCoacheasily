import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface PulseQuestion {
  type: "scale" | "text";
  text: string;
  min?: number;
  max?: number;
}

export interface PulseRound {
  id: string;
  label: string;
  kind: "first_week" | "monthly";
  questions: PulseQuestion[];
}

export interface PulseResults {
  count: number;
  sealed: boolean;
  average: number | null;
  texts: string[];
}

export function useMyPulse(enabled = true) {
  return useQuery({
    queryKey: ["my-pulse"],
    enabled,
    queryFn: async (): Promise<PulseRound | null> => {
      const { data, error } = await supabase.rpc("my_pulse");
      if (error) throw error;
      return (data as unknown as PulseRound | null) ?? null;
    },
  });
}

export function useSubmitPulse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { roundId: string; answers: (number | string | null)[] }) => {
      const { error } = await supabase.rpc("submit_pulse", {
        p_round_id: input.roundId,
        p_answers: input.answers as unknown as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-pulse"] });
    },
  });
}

export interface PulseRoundRow {
  id: string;
  label: string;
  kind: string;
  opens_on: string;
  closes_on: string | null;
  active: boolean;
}

export function usePulseRounds(enabled = true) {
  return useQuery({
    queryKey: ["pulse-rounds"],
    enabled,
    queryFn: async (): Promise<PulseRoundRow[]> => {
      const { data, error } = await supabase
        .from("pulse_rounds")
        .select("id,label,kind,opens_on,closes_on,active")
        .order("opens_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePulseResults(roundId: string | null) {
  return useQuery({
    queryKey: ["pulse-results", roundId],
    enabled: Boolean(roundId),
    queryFn: async (): Promise<PulseResults> => {
      const { data, error } = await supabase.rpc("pulse_results", { p_round_id: roundId! });
      if (error) throw error;
      return data as unknown as PulseResults;
    },
  });
}
