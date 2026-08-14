import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Mark } from "@/components/Mark";
import { supabase } from "@/integrations/supabase/client";
import { lineOfTheDay } from "@/lib/dailyLine";

const DESCRIPTION =
  "The internal team operating system for CoachEasily warriors — attendance, leave, goals, calendar and culture in one place.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | CoachEasily Team App" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Sign in | CoachEasily Team App" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
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
    <main className="relative z-10 min-h-screen w-full overflow-x-hidden bg-pearl/85">
      <div className="mx-auto grid w-full max-w-6xl lg:min-h-screen grid-cols-1 items-stretch gap-0 lg:grid-cols-2">
        {/* ── The office you are walking into ─────────────────── */}
        <section className="ce-rise flex flex-col justify-center bg-night px-6 py-10 sm:px-10 lg:rounded-l-[20px]">
          <div className="flex items-center gap-3">
            <Mark size={56} color="var(--ce-goldL)" className="ce-float" />
            <span className="leading-none">
              <span className="font-display text-3xl text-white">Coach</span>
              <span className="font-display text-3xl text-goldL">Easily</span>
              <span className="mt-1 block text-[10px] font-bold tracking-[0.24em] text-mist">
                TEAM APP
              </span>
            </span>
          </div>

          <h2 className="mt-8 font-display text-3xl leading-tight text-white sm:text-4xl">
            Eighteen warriors, one scoreboard, one standard.
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-mist">
            We coach people to change their lives, and we hold ourselves to the same bar. This is
            where we mark the day, move one honest number, and look after each other while we do
            it.
          </p>

          <ul className="mt-7 space-y-2.5 text-[14px] text-mist">
            <li className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-goldL" />
              Show up, mark the day, win it before lunch.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-goldL" />
              Real numbers only — progress you can stand behind.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-goldL" />
              Honesty, dedication and genuine care, every single day.
            </li>
          </ul>

          <p className="mt-8 text-[12px] tracking-[0.16em] text-mist/70 uppercase">Mumbai · IST</p>
        </section>

        {/* ── Sign in ─────────────────────────────────────────── */}
        <section className="flex items-center justify-center px-4 py-10 sm:px-8">
          <form onSubmit={onSubmit} className="ce-card ce-rise w-full max-w-md p-6">
            <h1 className="font-display text-3xl text-ink">Welcome back, warrior</h1>
            <p className="mt-1 text-sm text-soft">
              Sign in with the email People &amp; Culture invited you with. The team is already
              here.
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
        </section>
      </div>
    </main>
  );
}
