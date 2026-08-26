import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";

/** Our database messages are written to be read by people. Never swallow them. */
function humanMessage(error: unknown): string {
  const e = error as { message?: string; error_description?: string } | null;
  const raw = (e?.message ?? e?.error_description ?? "").trim();
  if (!raw) return "That didn't save. Please try again.";
  return raw.replace(/^new row violates row-level security policy.*/i, "You're not allowed to change that.");
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        // A hook that words its own failure stays in charge of it.
        if (mutation.options.onError) return;
        const msg = humanMessage(error);
        toast.error(msg, { id: msg });
      },
    }),

    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        retry: 1,
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
