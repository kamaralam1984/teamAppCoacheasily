import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const KEY = ["tour-seen"];

/** Has this person already been walked through the app? Stored per person, not per browser. */
export function useTourSeen(profileId: string | null) {
  return useQuery({
    queryKey: [...KEY, profileId],
    enabled: Boolean(profileId),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("tour_seen")
        .select("profile_id")
        .eq("profile_id", profileId!)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
}

export function useMarkTourSeen(profileId: string | null, orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!profileId || !orgId) return;
      const { error } = await supabase
        .from("tour_seen")
        .upsert(
          { profile_id: profileId, org_id: orgId, seen_at: new Date().toISOString() },
          { onConflict: "profile_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...KEY, profileId] }),
  });
}
