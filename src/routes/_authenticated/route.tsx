import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** A network drop or a 5xx from the backend says nothing about whether the login is still good. */
function isTransient(error: AuthError): boolean {
  return isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Only send people to /auth when the login is really gone, not when a request failed.
    const { data: local, error: sessionError } = await supabase.auth.getSession();
    if (sessionError && isTransient(sessionError)) throw sessionError; // stays signed in; refresh retries
    if (!local.session) throw redirect({ to: "/auth" });

    const { data, error } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };
    if (error && isTransient(error)) return { user: local.session.user };
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
