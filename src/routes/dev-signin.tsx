import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

// Local "Open as this person" links land here (see devImpersonateLink). The one-time
// magic-link token arrives in the URL hash; verify it here and go to the dashboard.
export const Route = createFileRoute("/dev-signin")({
  head: () => ({
    meta: [
      { title: "Signing in | CoachEasily Team App" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DevSignIn,
});

function DevSignIn() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The token is single use, so verify it exactly once even if the effect runs twice.
    if (started.current) return;
    started.current = true;
    const tokenHash = new URLSearchParams(window.location.hash.slice(1)).get("token_hash");
    // Drop the token from the address bar and history straight away.
    window.history.replaceState(null, "", window.location.pathname);
    if (!tokenHash) {
      setError("This sign-in link is incomplete.");
      return;
    }
    void supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: "magiclink" })
      .then(({ error: verifyError }) => {
        if (verifyError) {
          setError("This sign-in link has expired or was already used. Create a new one.");
          return;
        }
        navigate({ to: "/dashboard", replace: true });
      });
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="ce-card max-w-md p-6 text-center text-sm text-soft">
        {error ?? "Signing you in…"}
      </div>
    </main>
  );
}
