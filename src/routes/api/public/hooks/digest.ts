import { createFileRoute } from "@tanstack/react-router";

type Kind = "daily" | "weekly_self" | "weekly_manager";

const FN: Record<Kind, "digest_daily" | "digest_weekly_self" | "digest_weekly_manager"> = {
  daily: "digest_daily",
  weekly_self: "digest_weekly_self",
  weekly_manager: "digest_weekly_manager",
};

const HEADING: Record<Kind, string> = {
  daily: "Your day at CoachEasily",
  weekly_self: "Your week at CoachEasily",
  weekly_manager: "Your team's week",
};

function lines(payload: Record<string, unknown>): string[] {
  return Object.entries(payload).map(([key, value]) => {
    const label = key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    if (Array.isArray(value)) return `${label}: ${value.length === 0 ? "nothing" : value.join(", ")}`;
    if (value === null || value === undefined || value === "") return `${label}: nothing`;
    if (typeof value === "boolean") return `${label}: ${value ? "yes" : "no"}`;
    return `${label}: ${String(value)}`;
  });
}

/** Constant-time compare so a wrong secret leaks nothing through timing. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Digest runner, called by the scheduler. Defaults to OFF — it does nothing
 * unless HR switch digests on in Admin settings.
 *
 * The scheduled jobs must send the shared secret:
 *   header:  x-digest-secret
 *   value:   the DIGEST_HOOK_SECRET stored in Project Settings → Secrets
 * Without a configured secret this endpoint refuses every request.
 */
export const Route = createFileRoute("/api/public/hooks/digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["DIGEST_HOOK_SECRET"];
        if (!expected) {
          return Response.json(
            { ok: false, error: "Digest hook is not configured." },
            { status: 401 },
          );
        }
        const given = request.headers.get("x-digest-secret") ?? "";
        if (!given || !sameSecret(given, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = (await request.json().catch(() => null)) as { kind?: Kind } | null;
        const kind: Kind = body?.kind && body.kind in FN ? body.kind : "daily";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: enabled } = await supabaseAdmin.rpc("digests_enabled");
        if (!enabled) {
          return Response.json({ ok: true, skipped: "digests_off" });
        }

        const { data: rows, error } = await supabaseAdmin.rpc(FN[kind]);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        if (!process.env["RESEND_API_KEY"]) {
          console.log(`[digest:${kind}] ${rows?.length ?? 0} recipients, no email key — skipped`);
          return Response.json({ ok: true, recipients: rows?.length ?? 0, skipped: "no_key" });
        }

        const { sendEmail } = await import("@/lib/email.server");
        const base =
          process.env["APP_BASE_URL"] ??
          "https://project--e12daa46-df32-4307-a233-20934c13492d.lovable.app";

        let sent = 0;
        for (const row of rows ?? []) {
          if (!row.email) continue;
          const result = await sendEmail({
            to: row.email,
            subject: HEADING[kind],
            heading: HEADING[kind],
            lines: [
              `Namaste ${String(row.full_name ?? "").split(" ")[0]},`,
              ...lines((row.payload ?? {}) as Record<string, unknown>),
            ],
            ctaLabel: "Open CoachEasily",
            ctaUrl: `${base}/dashboard`,
          });
          if (result.sent) sent += 1;
        }

        return Response.json({ ok: true, recipients: rows?.length ?? 0, sent });
      },
    },
  },
});
