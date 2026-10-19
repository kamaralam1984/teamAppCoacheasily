import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";

const DEFAULT_DEVELOPERS = ["kamaralamjdu@gmail.com"];

export function developerEmails(): string[] {
  const extra = (process.env["DEVELOPER_EMAILS"] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_DEVELOPERS, ...extra]));
}

// Untyped admin client: the panel works across arbitrary allowlisted tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = SupabaseClient<any, "public", any>;

export async function getAdmin(): Promise<AnyDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyDb;
}

export async function checkDeveloper(userId: string): Promise<{ ok: boolean; email: string | null }> {
  const db = await getAdmin();
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  const email = data.user?.email?.toLowerCase() ?? null;
  const ok = Boolean(email && data.user?.email_confirmed_at && developerEmails().includes(email));
  return { ok, email };
}

/** Throws "Forbidden" unless the caller is an allowlisted, confirmed developer. */
export async function requireDeveloper(userId: string): Promise<{ db: AnyDb; email: string }> {
  const { ok, email } = await checkDeveloper(userId);
  if (!ok || !email) throw new Error("Forbidden");
  return { db: await getAdmin(), email };
}

/** Best effort — never blocks the real action. */
export async function audit(db: AnyDb, actor: string, action: string, target: string | null, detail: Json) {
  try {
    const { error } = await db.from("dev_audit_log").insert({ actor_email: actor, action, target, detail });
    if (error) console.error("[dev audit]", error.message);
  } catch (e) {
    console.error("[dev audit]", e);
  }
}
