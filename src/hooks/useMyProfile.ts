import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;

const TEN_MINUTES = 10 * 60 * 1000;

export function useMyProfile() {
  return useQuery({
    queryKey: ["my-profile"],
    staleTime: TEN_MINUTES,
    gcTime: TEN_MINUTES,
    queryFn: async (): Promise<{
      user: { id: string; email?: string | undefined } | null;
      profile: Profile | null;
    }> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return { user: null, profile: null };

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return { user: { id: user.id, email: user.email ?? undefined }, profile: data ?? null };
    },
  });
}
