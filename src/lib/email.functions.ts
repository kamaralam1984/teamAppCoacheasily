import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppEmailKind =
  | "leave_raised"
  | "leave_decided"
  | "task_assigned"
  | "cycle_opened"
  | "announcement";

export interface SendAppEmailInput {
  kind: AppEmailKind;
  /** Profile ids to notify. Resolved to login emails on the server. */
  profileIds: string[];
  title: string;
  body?: string;
  link?: string;
}

const CTA: Record<AppEmailKind, { label: string; path: string }> = {
  leave_raised: { label: "Open Approvals", path: "/approvals" },
  leave_decided: { label: "Open Leave", path: "/leave" },
  task_assigned: { label: "Open Tasks", path: "/tasks" },
  cycle_opened: { label: "Open Goals", path: "/goals" },
  announcement: { label: "Open CoachEasily", path: "/dashboard" },
};

function baseUrl() {
  return process.env["APP_BASE_URL"] ?? "https://project--e12daa46-df32-4307-a233-20934c13492d.lovable.app";
}

/** Notify people by email. Silently does nothing when no key is configured. */
export const sendAppEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SendAppEmailInput) => {
    if (!input || !Array.isArray(input.profileIds)) throw new Error("profileIds is required");
    return input;
  })
  .handler(async ({ data }) => {
    if (!process.env["RESEND_API_KEY"]) return { sent: 0, skipped: true };
    if (data.profileIds.length === 0) return { sent: 0, skipped: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendEmail } = await import("@/lib/email.server");

    const { data: rows } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, auth_user_id")
      .in("id", data.profileIds.slice(0, 50));

    const cta = CTA[data.kind] ?? CTA.announcement;
    let sent = 0;

    for (const row of rows ?? []) {
      if (!row.auth_user_id) continue;
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.auth_user_id);
      const to = authUser?.user?.email;
      if (!to) continue;
      const result = await sendEmail({
        to,
        subject: data.title,
        heading: data.title,
        lines: [
          `Namaste ${row.full_name.split(" ")[0]},`,
          data.body ?? "There's an update waiting for you in the team app.",
        ],
        ctaLabel: cta.label,
        ctaUrl: `${baseUrl()}${data.link ?? cta.path}`,
      });
      if (result.sent) sent += 1;
    }

    return { sent, skipped: false };
  });

/** Admin-only smoke test, so the key can be verified the moment it is added. */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { to: string }) => {
    if (!input?.to?.includes("@")) throw new Error("A valid email address is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (profile?.role !== "admin" && profile?.role !== "hr") {
      throw new Error("Only People & Culture can send a test email.");
    }
    if (!process.env["RESEND_API_KEY"]) {
      return { sent: false, message: "No email key is set yet, so nothing was sent." };
    }

    const { sendEmail } = await import("@/lib/email.server");
    const result = await sendEmail({
      to: data.to,
      subject: "CoachEasily test email",
      heading: "Email is working",
      lines: [
        "This is a test from the CoachEasily team app.",
        "If you can read this, notifications by email are live.",
      ],
      ctaLabel: "Open CoachEasily",
      ctaUrl: `${baseUrl()}/dashboard`,
    });
    return {
      sent: result.sent,
      message: result.sent ? "Test email sent." : `Could not send: ${result.reason ?? "unknown"}.`,
    };
  });

/** HR/Admin announcement: writes a notification for everyone, then emails it. */
export const postAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title: string; body: string }) => {
    if (!input?.title?.trim()) throw new Error("Give the announcement a title.");
    return { title: input.title.trim(), body: (input.body ?? "").trim() };
  })
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("id, role, org_id, full_name")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!me || (me.role !== "admin" && me.role !== "hr")) {
      throw new Error("Only People & Culture can post an announcement.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: people } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("org_id", me.org_id)
      .eq("status", "active");

    const rows = (people ?? []).map((p) => ({
      org_id: me.org_id,
      profile_id: p.id,
      title: data.title,
      body: data.body || null,
      link: "/dashboard",
    }));
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("notifications").insert(rows);
      if (error) throw new Error("The announcement could not be saved. Please try again.");
    }

    let emailed = 0;
    if (process.env["RESEND_API_KEY"]) {
      const { sendEmail } = await import("@/lib/email.server");
      for (const p of people ?? []) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("full_name, auth_user_id")
          .eq("id", p.id)
          .maybeSingle();
        if (!prof?.auth_user_id) continue;
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(prof.auth_user_id);
        const to = authUser?.user?.email;
        if (!to) continue;
        const res = await sendEmail({
          to,
          subject: data.title,
          heading: data.title,
          lines: [`Namaste ${prof.full_name.split(" ")[0]},`, data.body || "There's an announcement in the team app."],
          ctaLabel: "Open CoachEasily",
          ctaUrl: `${baseUrl()}/dashboard`,
        });
        if (res.sent) emailed += 1;
      }
    }

    return { posted: rows.length, emailed };
  });
