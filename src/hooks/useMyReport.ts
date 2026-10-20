import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { MyReport } from "@/lib/myReport";

/** The signed-in person's own tasks, goals and daily numbers for the dates given. */
export function useMyReport(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ["my-report", range],
    enabled: range !== null,
    staleTime: 0,
    gcTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<MyReport> => {
      const { data, error } = await supabase.rpc("my_report", {
        p_from: range!.from,
        p_to: range!.to,
      });
      if (error) throw error;
      return data as unknown as MyReport;
    },
  });
}
