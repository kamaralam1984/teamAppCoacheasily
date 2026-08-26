import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useWarriors } from "@/hooks/useWarriors";

const HOUR = 60 * 60 * 1000;

/**
 * One batched signing call for every photo on screen — never one request per face.
 * The bucket is private, so links are signed and cached for an hour.
 */
export function useAvatarMap() {
  const { data: warriors } = useWarriors();

  const paths = useMemo(() => {
    const set = new Set<string>();
    for (const p of warriors ?? []) {
      const path = p.avatar_url?.trim();
      if (path) set.add(path);
    }
    return [...set].sort();
  }, [warriors]);

  const query = useQuery({
    queryKey: ["avatar-urls", paths.join("|")],
    enabled: paths.length > 0,
    staleTime: HOUR,
    gcTime: HOUR,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrls(paths, 60 * 60);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
      }
      return map;
    },
  });

  return query.data ?? null;
}

/** Sign a single freshly-uploaded path, outside the batch. */
export async function signAvatar(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
