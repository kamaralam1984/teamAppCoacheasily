import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/change-password")({
  head: () => ({
    meta: [
      { title: "Change password | CoachEasily Team App" },
      {
        name: "description",
        content: "Set a new password for your CoachEasily team app account.",
      },
      { property: "og:title", content: "Change password | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Set a new password for your CoachEasily team app account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangePassword,
});

function ChangePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }

    setStatus("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setStatus("idle");
      setError(updateError.message);
      return;
    }
    setStatus("done");
    setPassword("");
    setConfirm("");
  }

  return (
    <AppShell>
      <div className="ce-card mx-auto max-w-md p-6">
        <h1 className="font-display text-3xl text-ink">Change password</h1>
        <p className="mt-2 text-sm text-soft">
          Set a password only you know. You stay signed in after saving.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-bold text-ink">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink outline-none focus:border-gold"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-sm font-bold text-ink">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink outline-none focus:border-gold"
            />
          </div>

          {error ? <p className="text-sm font-semibold text-red">{error}</p> : null}
          {status === "done" ? (
            <p className="text-sm font-semibold text-emer">Password updated.</p>
          ) : null}

          <button type="submit" disabled={status === "saving"} className="btn3d w-full">
            {status === "saving" ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
