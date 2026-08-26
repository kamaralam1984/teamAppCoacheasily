import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/** Only the fields a person is allowed to change on their own row. */
export interface MyProfilePatch {
  avatar_url?: string | null;
  bio?: string | null;
  fun_fact?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
}

export function useUpdateMyProfile(profileId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: MyProfilePatch) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", profileId!);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-profile"] });
      void qc.invalidateQueries({ queryKey: ["warriors"] });
    },
  });
}

export type PrivateLite = Pick<
  Tables<"profile_private">,
  "profile_id" | "emergency_name" | "emergency_phone"
>;

/**
 * HR-only: who is still missing the basics. RLS decides what comes back —
 * for anybody else this simply returns nothing.
 */
export function useMissingDetails(enabled: boolean) {
  return useQuery({
    queryKey: ["missing-details"],
    enabled,
    staleTime: 15 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async (): Promise<Map<string, PrivateLite>> => {
      const { data, error } = await supabase
        .from("profile_private")
        .select("profile_id, emergency_name, emergency_phone");
      if (error) throw error;
      const map = new Map<string, PrivateLite>();
      for (const row of data ?? []) map.set(row.profile_id, row);
      return map;
    },
  });
}
