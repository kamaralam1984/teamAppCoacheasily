import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { Mark } from "@/components/Mark";
import { supabase } from "@/integrations/supabase/client";

const DESCRIPTION =
  "Set up your CoachEasily team app login. Only warriors whose work email HR has already added can join.";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Set up your login | CoachEasily Team App" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Set up your login | CoachEasily Team App" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JoinPage,
});

function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return "Use both small and capital letters.";
  if (!/[0-9]/.test(pw)) return "Include at least one number.";
  return null;
}

function JoinPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notExpected, setNotExpected] = useState(false);
  const [busy, setBusy] = useState(false);

  async function checkEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotExpected(false);
    const { data, error: rpcError } = await supabase.rpc("claim_invite", {
      p_email: email.trim(),
    });
    setBusy(false);
    if (rpcError) {
      setError("We couldn't check that just now. Please try again.");
      return;
    }
    const row = (data ?? {}) as { expected?: boolean; first_name?: string };
    if (!row.expected) {
      setNotExpected(true);
      return;
    }
    setFirstName(row.first_name ?? "");
    setStep("password");
  }

  async function createLogin(event: React.FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError("Both passwords need to match.");
      return;
    }
    setBusy(true);
    setError(null);

    let result: { ok: boolean; error?: string };
    try {
      result = await createLoginFn({ data: { email: email.trim(), password } });
    } catch {
      setBusy(false);
      setError("We couldn't finish setting you up just now. Please try again.");
      return;
    }

    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? "We couldn't finish setting you up.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError("Your login is ready. Please sign in on the sign-in page.");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }


  return (
    <main className="relative z-10 min-h-screen w-full overflow-x-hidden">
      <div className="grid w-full grid-cols-1 items-stretch gap-0 lg:min-h-screen lg:grid-cols-2">
        <section className="ce-rise flex flex-col justify-center bg-night px-6 py-10 sm:px-10 lg:items-end lg:px-12 xl:px-16">
          <div className="w-full max-w-xl">
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
              Welcome, warrior.
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-mist">
              Set up your own login in a minute. You choose your password — nobody else ever sees
              it.
            </p>
            <p className="mt-8 text-[12px] tracking-[0.16em] text-mist/70 uppercase">
              Honesty · Dedication · Genuine care
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:justify-start lg:px-12 xl:px-16">
          {step === "email" ? (
            <form onSubmit={checkEmail} className="ce-card ce-rise w-full max-w-md p-6">
              <h1 className="font-display text-3xl text-ink">Set up your login</h1>
              <p className="mt-1 text-sm text-soft">
                Start with the work email HR has on record for you.
              </p>

              <label className="mt-6 block text-sm font-semibold text-ink" htmlFor="join-email">
                Work email
              </label>
              <input
                id="join-email"
                type="email"
                autoComplete="email"
                required
                className="ce-input mt-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              {notExpected ? (
                <p className="mt-3 rounded-xl border border-line bg-pearl p-3 text-[13px] leading-relaxed text-soft">
                  We can't set up a login for that address yet. Please ask HR to add your work
                  email, then come back to this page.
                </p>
              ) : null}
              {error ? <p className="mt-3 text-sm font-semibold text-red">{error}</p> : null}

              <button type="submit" disabled={busy} className="btn3d mt-6 min-h-12 w-full">
                {busy ? "Checking…" : "Continue"}
              </button>

              <p className="mt-4 text-center text-xs text-soft">
                Already set up?{" "}
                <Link to="/auth" className="font-semibold underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={createLogin} className="ce-card ce-rise w-full max-w-md p-6">
              <h1 className="font-display text-3xl text-ink">
                {firstName ? `Hello ${firstName}` : "Hello there"}
              </h1>
              <p className="mt-1 text-sm text-soft">
                Choose a password for {email.trim()}. At least 8 characters, with capital and small
                letters and a number.
              </p>

              <label className="mt-6 block text-sm font-semibold text-ink" htmlFor="join-pw">
                Password
              </label>
              <input
                id="join-pw"
                type="password"
                autoComplete="new-password"
                required
                className="ce-input mt-1.5"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="join-pw2">
                Type it again
              </label>
              <input
                id="join-pw2"
                type="password"
                autoComplete="new-password"
                required
                className="ce-input mt-1.5"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />

              {error ? <p className="mt-3 text-sm font-semibold text-red">{error}</p> : null}

              <button type="submit" disabled={busy} className="btn3d mt-6 min-h-12 w-full">
                {busy ? "Setting up…" : "Create my login"}
              </button>

              <button
                type="button"
                className="mt-3 min-h-11 w-full text-[13px] font-semibold text-soft underline-offset-4 hover:underline"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
              >
                Use a different email
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
