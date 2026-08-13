import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Mark } from "@/components/Mark";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | CoachEasily Team App" },
      {
        name: "description",
        content: "Sign in to the CoachEasily internal team app. Access is invite only.",
      },
      { property: "og:title", content: "Sign in | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Sign in to the CoachEasily internal team app. Access is invite only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError("That email and password combination didn't work. Please try again.");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-pearl">
      <div className="bg-night px-4 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5">
          <Mark size={34} color="#F0C75E" />
          <span className="leading-none">
            <span className="font-display text-xl text-white">Coach</span>
            <span className="font-display text-xl text-goldL">Easily</span>
            <span className="mt-0.5 block text-[10px] font-bold tracking-[0.22em] text-mist">
              TEAM APP
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center px-4 py-10">
        <form onSubmit={onSubmit} className="ce-card w-full max-w-md p-6">
          <h1 className="font-display text-3xl text-ink">Welcome back, warrior</h1>
          <p className="mt-1 text-sm text-soft">
            Sign in with the email People &amp; Culture invited you with.
          </p>

          <label className="mt-6 block text-sm font-semibold text-ink" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="ce-input mt-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="ce-input mt-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error ? <p className="mt-3 text-sm font-semibold text-red">{error}</p> : null}

          <button type="submit" disabled={busy} className="btn3d mt-6 w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="mt-4 text-center text-xs text-soft">
            Access is invite only. There is no public sign-up.
          </p>
        </form>
      </div>
    </div>
  );
}
