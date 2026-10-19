import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { devWhoAmI } from "@/lib/developer.functions";

export function useDeveloperAccess(enabled = true) {
  const fn = useServerFn(devWhoAmI);
  return useQuery({
    queryKey: ["dev-whoami"],
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => fn(),
  });
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
