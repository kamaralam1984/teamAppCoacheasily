import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import {
  NETWORK_FAILURE_MESSAGE,
  isNetworkError,
  setNetworkFailed,
} from "./lib/netStatus";

/** Our database messages are written to be read by people. Never swallow them. */
function humanMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_FAILURE_MESSAGE;
  const e = error as { message?: string; error_description?: string } | null;
  const raw = (e?.message ?? e?.error_description ?? "").trim();
  if (!raw) return "That didn't save. Please try again.";
  return raw.replace(/^new row violates row-level security policy.*/i, "You're not allowed to change that.");
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isNetworkError(error)) setNetworkFailed(true);
      },
      onSuccess: () => setNetworkFailed(false),
    }),

    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (isNetworkError(error)) setNetworkFailed(true);
        // A hook that words its own failure stays in charge of it.
        if (mutation.options.onError) return;
        const msg = humanMessage(error);
        toast.error(msg, { id: msg });
      },
      onSuccess: () => setNetworkFailed(false),
    }),

    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        retry: 1,
        // Never refuse in advance on navigator.onLine — try, and deal with reality.
        networkMode: "always",
      },
      mutations: {
        networkMode: "always",
      },
    },
  });



  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 5 * 60_000,
  });

  return router;
};
