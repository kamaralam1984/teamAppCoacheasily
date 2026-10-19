import { useInfiniteQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AuditRow = Tables<"audit_log">;

export interface AuditFilters {
  entity: string;
  subjectId: string;
  from: string;
  to: string;
  text: string;
}

export const AUDIT_PAGE = 50;

/** HR and admin only (the table's row-level security does the refusing). Newest first. */
export function useAuditLog(filters: AuditFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["audit-log", filters],
    enabled,
    initialPageParam: 0,
    getNextPageParam: (last: AuditRow[], all) =>
      last.length === AUDIT_PAGE ? all.length * AUDIT_PAGE : undefined,
    queryFn: async ({ pageParam }): Promise<AuditRow[]> => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + AUDIT_PAGE - 1);
      if (filters.entity) q = q.eq("entity", filters.entity);
      if (filters.subjectId) q = q.eq("subject_id", filters.subjectId);
      if (filters.from) q = q.gte("created_at", `${filters.from}T00:00:00+05:30`);
      if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59+05:30`);
      if (filters.text.trim()) {
        const term = filters.text.trim().replace(/[%,()]/g, " ");
        q = q.ilike("summary", `%${term}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
