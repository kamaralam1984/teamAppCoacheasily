import { createServerFn } from "@tanstack/react-start";

interface JoinInput {
  email: string;
  password: string;
}

const GENERIC_FAILURE =
  "We can't set up a login for that address. Please ask HR to check your work email.";

function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return "Use both small and capital letters.";
  if (!/[0-9]/.test(pw)) return "Include at least one number.";
  return null;
}

/**
 * Creates the auth login for a warrior who is on the allow list, using the
 * service role. Public sign-up stays switched off; this is the only path.
 */
export const createJoinLogin = createServerFn({ method: "POST" })
  .inputValidator((input: JoinInput) => {
    const email = input.email?.trim().toLowerCase() ?? "";
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(GENERIC_FAILURE);
    return { email, password: input.password ?? "" };
  })
  .handler(async ({ data }) => {
    const problem = passwordProblem(data.password);
    if (problem) return { ok: false as const, error: problem };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, auth_user_id, status")
      .eq("email", data.email)
      .eq("status", "active")
      .is("auth_user_id", null)
      .maybeSingle();

    if (profileError || !profile) return { ok: false as const, error: GENERIC_FAILURE };

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });

    if (createError || !created?.user) {
      const message = createError?.message ?? "";
      if (/already|registered|exists/i.test(message)) {
        return {
          ok: false as const,
          error:
            "A login already exists for this address. Please sign in instead — you can reset your password there.",
        };
      }
      if (/password/i.test(message)) {
        return { ok: false as const, error: "That password is too weak. Please choose a stronger one." };
      }
      return { ok: false as const, error: GENERIC_FAILURE };
    }

    const { error: linkError } = await supabaseAdmin
      .from("profiles")
      .update({ auth_user_id: created.user.id, invited_at: new Date().toISOString() })
      .eq("id", profile.id)
      .is("auth_user_id", null);

    if (linkError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return { ok: false as const, error: GENERIC_FAILURE };
    }

    return { ok: true as const };
  });
