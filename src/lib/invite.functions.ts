import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface InviteInput {
  profileId: string;
  email: string;
  redirectTo?: string;
}

/**
 * Creates the auth account for a freshly added warrior, links it to their
 * profile, emails them an invite so they set their own password, and posts the
 * company-wide welcome + manager onboarding notifications.
 * hr/admin only — the caller's role is verified server-side.
 */
export const inviteWarrior = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: InviteInput) => {
    const email = input.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("A valid email is required");
    if (!input.profileId) throw new Error("profileId is required");
    return { profileId: input.profileId, email, redirectTo: input.redirectTo };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: me, error: meError } = await supabase
      .from("profiles")
      .select("id, org_id, role, full_name")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (meError) throw new Error(meError.message);
    if (!me || (me.role !== "hr" && me.role !== "admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, org_id, full_name, title, fun_fact, manager_id, auth_user_id")
      .eq("id", data.profileId)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target || target.org_id !== me.org_id) throw new Error("Warrior not found");
    if (target.auth_user_id) return { ok: true, alreadyInvited: true };

    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      data.redirectTo ? { redirectTo: data.redirectTo } : undefined,
    );

    let authUserId = invited?.user?.id ?? null;

    if (inviteError || !authUserId) {
      // Email delivery can fail (or the user may already exist) — still create
      // and link the account so People & Culture can resend later.
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        email_confirm: false,
      });
      if (createError || !created.user) {
        throw new Error(inviteError?.message ?? createError?.message ?? "Could not send the invite");
      }
      authUserId = created.user.id;
    }

    const { error: linkError } = await supabaseAdmin
      .from("profiles")
      .update({ auth_user_id: authUserId })
      .eq("id", target.id);
    if (linkError) throw new Error(linkError.message);

    // Company-wide welcome
    const { data: everyone } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("org_id", me.org_id)
      .eq("status", "active");

    const funFact = target.fun_fact?.trim();
    const welcomeBody = `${target.full_name} joins us as ${target.title ?? "a warrior"}.${
      funFact ? ` One human detail: ${funFact}` : ""
    }`;

    const rows = (everyone ?? []).map((p) => ({
      org_id: me.org_id,
      profile_id: p.id,
      title: `Welcome ${target.full_name} to the warriors`,
      body: welcomeBody,
      link: "/warriors",
    }));

    if (target.manager_id) {
      rows.push({
        org_id: me.org_id,
        profile_id: target.manager_id,
        title: `Set up ${target.full_name}'s first 90 days`,
        body: `${target.full_name} has joined your team. Plan their first 90 days this week.`,
        link: "/warriors",
      });
    }

    if (rows.length) await supabaseAdmin.from("notifications").insert(rows);

    return { ok: true, invited: !inviteError, email: data.email };
  });
