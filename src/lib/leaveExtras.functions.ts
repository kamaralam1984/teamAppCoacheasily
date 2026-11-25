import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KEY = "leave_extras";

/** A developer gets the leave features before release; the database is told, so it allows them too. */
export const leaveExtrasPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { checkDeveloper, getAdmin } = await import("@/lib/developer.server");
    const { ok } = await checkDeveloper(context.userId);
    if (!ok) return { on: false };
    const db = await getAdmin();
    const { data: me } = await db
      .from("profiles")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!me) return { on: false };
    const { error } = await db.rpc("leave_extras_preview", { p_profile: me.id });
    return { on: !error };
  });

export interface LeaveRelease {
  released: boolean;
  released_at: string | null;
  released_by: string | null;
}

export const devGetLeaveRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaveRelease> => {
    const { requireDeveloper } = await import("@/lib/developer.server");
    const { db } = await requireDeveloper(context.userId);
    const { data, error } = await db
      .from("feature_releases")
      .select("released, released_at, released_by")
      .eq("key", KEY)
      .single();
    if (error) throw new Error(error.message);
    return data as LeaveRelease;
  });

export const devSetLeaveRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { released: boolean }) => {
    if (typeof input?.released !== "boolean") throw new Error("released is required");
    return input;
  })
  .handler(async ({ context, data }) => {
    const { requireDeveloper, audit } = await import("@/lib/developer.server");
    const { db, email } = await requireDeveloper(context.userId);
    const { error } = await db
      .from("feature_releases")
      .update({
        released: data.released,
        released_at: data.released ? new Date().toISOString() : null,
        released_by: data.released ? email : null,
      })
      .eq("key", KEY)
      .select("key")
      .single();
    if (error) throw new Error(error.message);
    await audit(db, email, data.released ? "feature.release" : "feature.withdraw", KEY, {
      released: data.released,
    });
    return { ok: true };
  });
