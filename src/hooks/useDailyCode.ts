import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type DailyCode = Tables<"daily_codes">;

export const CODE_VALUES = ["Honesty", "Dedication", "Genuine Care"] as const;
export type CodeValue = (typeof CODE_VALUES)[number];

/** Today's code for the signed-in warrior — department row first, generic otherwise. */
export function useTodayCode(enabled = true) {
  return useQuery({
    queryKey: ["daily-code-today"],
    enabled,
    queryFn: async (): Promise<DailyCode | null> => {
      const { data, error } = await supabase.rpc("daily_code_today");
      if (error) throw error;
      return (data as unknown as DailyCode) ?? null;
    },
  });
}

export interface PresenceRow {
  profile_id: string;
  full_name: string;
  title: string | null;
  department: string | null;
  present: boolean;
  focus: string | null;
}

/** Who is around today, and the one line they are on. */
export function usePresenceToday(enabled = true) {
  return useQuery({
    queryKey: ["presence-today"],
    enabled,
    queryFn: async (): Promise<PresenceRow[]> => {
      const { data, error } = await supabase.rpc("presence_today");
      if (error) throw error;
      return (data as unknown as PresenceRow[]) ?? [];
    },
  });
}

/** Every code, for the People & Culture editor. */
export function useDailyCodes(enabled = true) {
  return useQuery({
    queryKey: ["daily-codes"],
    enabled,
    queryFn: async (): Promise<DailyCode[]> => {
      const { data, error } = await supabase
        .from("daily_codes")
        .select("*")
        .order("day_no", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface CodeInput {
  id?: string;
  day_no: number;
  value: CodeValue;
  title: string;
  body: string;
  pledge: string;
  department: string | null;
}

export function useSaveCode(orgId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CodeInput) => {
      if (!orgId) throw new Error("Your profile isn't set up yet.");
      const row = {
        org_id: orgId,
        day_no: input.day_no,
        value: input.value,
        title: input.title.trim(),
        body: input.body.trim(),
        pledge: input.pledge.trim(),
        department: input.department,
      };
      const { error } = input.id
        ? await supabase.from("daily_codes").update(row).eq("id", input.id)
        : await supabase.from("daily_codes").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["daily-codes"] });
      void qc.invalidateQueries({ queryKey: ["daily-code-today"] });
    },
  });
}

export function useDeleteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["daily-codes"] });
      void qc.invalidateQueries({ queryKey: ["daily-code-today"] });
    },
  });
}
