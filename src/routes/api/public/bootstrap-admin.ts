import { createFileRoute } from "@tanstack/react-router";

const ADMIN_PROFILE_ID = "22222222-2222-4222-8222-222222222222";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * One-time bootstrap for the very first admin account.
 * Public sign-up is off, so this endpoint creates the auth user for the seeded
 * founder profile and links it. It self-disables: once ANY profile in the org
 * has an auth_user_id, it refuses to run again.
 */
export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          email?: string;
          password?: string;
        } | null;

        const email = body?.email?.trim().toLowerCase();
        const password = body?.password;
        if (!email || !password || password.length < 8) {
          return json({ error: "email and a password of at least 8 characters are required" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: linked, error: linkedError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .not("auth_user_id", "is", null)
          .limit(1);
        if (linkedError) return json({ error: linkedError.message }, 500);
        if (linked && linked.length > 0) {
          return json({ error: "Bootstrap already completed. This endpoint is disabled." }, 409);
        }

        const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (createError || !created.user) {
          return json({ error: createError?.message ?? "Could not create the account" }, 400);
        }

        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ auth_user_id: created.user.id })
          .eq("id", ADMIN_PROFILE_ID);
        if (updateError) return json({ error: updateError.message }, 500);

        return json({ ok: true, email, profile_id: ADMIN_PROFILE_ID });
      },
    },
  },
});
