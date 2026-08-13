import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LoginStatus {
  profile_id: string;
  email: string | null;
  has_login: boolean;
  invited_at: string | null;
  /** first time they actually signed in — null means the invite is still open */
  accepted_at: string | null;
}

/** Who can log in, who was invited, who has accepted. hr/admin only. */
export const listLoginStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: LoginStatus[] }> => {
    const { supabase, userId } = context;

    const { data: me, error: meError } = await supabase
      .from("profiles")
      .select("id, org_id, role")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (meError) throw new Error(meError.message);
    if (!me || (me.role !== "hr" && me.role !== "admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, auth_user_id, invited_at")
      .eq("org_id", me.org_id);
    if (error) throw new Error(error.message);

    const linked = (profiles ?? []).filter((p) => p.auth_user_id);
    const users = new Map<string, { email: string | null; lastSignIn: string | null }>();

    if (linked.length) {
      // One page is plenty for a team this size; loop defensively anyway.
      for (let page = 1; page <= 5; page += 1) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        const batch = list?.users ?? [];
        for (const u of batch) {
          users.set(u.id, { email: u.email ?? null, lastSignIn: u.last_sign_in_at ?? null });
        }
        if (batch.length < 200) break;
      }
    }

    const rows: LoginStatus[] = (profiles ?? []).map((p) => {
      const u = p.auth_user_id ? users.get(p.auth_user_id) : undefined;
      return {
        profile_id: p.id,
        email: u?.email ?? null,
        has_login: Boolean(p.auth_user_id),
        invited_at: p.invited_at ?? null,
        accepted_at: u?.lastSignIn ?? null,
      };
    });

    return { rows };
  });
