import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AppraisalData, LedgerRow, TeamHealth } from "@/lib/reports";

/** Every warrior's average goal achievement, cycle by cycle. HR and admin only. */
export function useAppraisal(enabled: boolean) {
  return useQuery({
    queryKey: ["appraisal"],
    enabled,
    queryFn: async (): Promise<AppraisalData> => {
      const { data, error } = await supabase.rpc("appraisal_matrix");
      if (error) throw error;
      return (data as unknown as AppraisalData) ?? { cycles: [], rows: [] };
    },
  });
}

export function useLeaveLedger(enabled: boolean) {
  return useQuery({
    queryKey: ["leave-ledger"],
    enabled,
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data, error } = await supabase.rpc("leave_ledger");
      if (error) throw error;
      return (data as unknown as LedgerRow[] | null) ?? [];
    },
  });
}

export function useTeamHealth(enabled: boolean) {
  return useQuery({
    queryKey: ["team-health"],
    enabled,
    queryFn: async (): Promise<TeamHealth | null> => {
      const { data, error } = await supabase.rpc("team_health");
      if (error) throw error;
      return (data as unknown as TeamHealth) ?? null;
    },
  });
}

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read: boolean;
}

/** The four most recent things this warrior is entitled to see. */
export function useAnnouncements(enabled: boolean, limit = 4) {
  return useQuery({
    queryKey: ["announcements", limit],
    enabled,
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,link,created_at,read")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
