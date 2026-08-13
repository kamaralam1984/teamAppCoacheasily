import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,link,read,created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMarkNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

export function useMarkAllNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

/** Every notification link must land somewhere real. Unknown links go to the dashboard. */
const KNOWN = [
  "/dashboard",
  "/calendar",
  "/tasks",
  "/goals",
  "/culture",
  "/leave",
  "/warriors",
  "/team",
  "/approvals",
  "/reports",
];

export function safeLink(link: string | null | undefined): string {
  if (!link) return "/dashboard";
  const path = link.split("?")[0]?.split("#")[0] ?? "";
  const match = KNOWN.find((k) => path === k || path.startsWith(`${k}/`));
  return match ? link : "/dashboard";
}
