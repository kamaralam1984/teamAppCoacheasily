import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/warriors";

export function useWarriors() {
  return useQuery({
    queryKey: ["warriors"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
