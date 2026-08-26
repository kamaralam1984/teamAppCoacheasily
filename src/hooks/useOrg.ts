import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  OrgSettings,
  PunctualityMe,
  PunctualityRow,
} from "@/lib/punctuality";

/** Company settings — the standup link and time live here, never in code. */
export function useOrgSettings(enabled = true) {
  return useQuery({
    queryKey: ["org-settings"],
    enabled,
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async (): Promise<OrgSettings> => {
      const { data, error } = await supabase.rpc("org_settings");
      if (error) throw error;
      return (data as unknown as OrgSettings) ?? {};
    },
  });
}

export function useSaveOrgSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: OrgSettings) => {
      const { data, error } = await supabase.rpc("update_org_settings", {
        p_patch: patch as never,
      });
      if (error) throw error;
      return data as unknown as OrgSettings;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org-settings"] }),
  });
}

/** Your own mornings this month. Nobody else sees this number as a verdict. */
export function usePunctualityMe(enabled = true) {
  return useQuery({
    queryKey: ["punctuality-me"],
    enabled,
    staleTime: 15 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async (): Promise<PunctualityMe | null> => {
      const { data, error } = await supabase.rpc("punctuality_me");
      if (error) throw error;
      return (data as unknown as PunctualityMe) ?? null;
    },
  });
}

/** Monthly timeliness. Scope is decided in Postgres, never in the browser. */
export function usePunctualityRows(enabled: boolean, month?: string | null) {
  return useQuery({
    queryKey: ["punctuality-rows", month ?? "this"],
    enabled,
    queryFn: async (): Promise<PunctualityRow[]> => {
      const { data, error } = await supabase.rpc("punctuality_rows", {
        ...(month ? { p_month: month } : {}),
      });
      if (error) throw error;
      return (data as unknown as PunctualityRow[] | null) ?? [];
    },
  });
}
