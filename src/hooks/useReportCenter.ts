import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ExportColumn, ExportRow } from "@/lib/exporters";

export interface ReportResult {
  report: string;
  title: string;
  subtitle: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

/** Runs one report. Pass null to hold off until the person presses Run. */
export function useReport(params: { id: string; from: string; to: string } | null) {
  return useQuery({
    queryKey: ["report", params],
    enabled: params !== null,
    staleTime: 0,
    gcTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<ReportResult> => {
      const { data, error } = await supabase.rpc("report_run", {
        p_report: params!.id,
        p_from: params!.from,
        p_to: params!.to,
      });
      if (error) throw error;
      return data as unknown as ReportResult;
    },
  });
}
