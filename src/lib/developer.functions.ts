import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { impersonationBlockedReason, validateImpersonationInput } from "@/lib/developerImpersonation";
import { validateTeamOrderInput } from "@/lib/teamOrder";
import { assertDevDataProfileUpdate, assertDevTable, DEV_TABLES, istToday, keyColumns } from "@/lib/developerTables";

type Row = { [k: string]: Json };

const ROLES = ["member", "manager", "hr", "admin"];
const STATUSES = ["active", "exited"];

async function gate(userId: string) {
  const { requireDeveloper } = await import("@/lib/developer.server");
  return requireDeveloper(userId);
}
async function log(...args: Parameters<typeof import("@/lib/developer.server").audit>) {
  const { audit } = await import("@/lib/developer.server");
  return audit(...args);
}

export const devWhoAmI = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { checkDeveloper } = await import("@/lib/developer.server");
    const r = await checkDeveloper(context.userId);
    return { isDeveloper: r.ok, email: r.email };
  });

export const devOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await gate(context.userId);
    const counts = await Promise.all(
      DEV_TABLES.map(async (t) => {
        const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
        return { table: t, count: error ? null : (count ?? 0) };
      }),
    );
    const { data: people } = await db.from("profiles").select("role, status, auth_user_id");
    const list = (people ?? []) as { role: string; status: string; auth_user_id: string | null }[];
    const byRole: Record<string, number> = {};
    for (const p of list) byRole[p.role] = (byRole[p.role] ?? 0) + 1;
    const { count: punches } = await db
      .from("attendance")
      .select("*", { count: "exact", head: true })
      .eq("date", istToday());
    return {
      counts,
      people: {
        total: list.length,
        active: list.filter((p) => p.status === "active").length,
        exited: list.filter((p) => p.status === "exited").length,
        withLogin: list.filter((p) => p.auth_user_id).length,
        byRole,
      },
      punchesToday: punches ?? 0,
    };
  });

export const devListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await gate(context.userId);
    const { data: profiles, error } = await db
      .from("profiles")
      .select("id, org_id, full_name, title, department, role, status, manager_id, invited_at, auth_user_id, weekly_off")
      .order("full_name");
    if (error) throw new Error(error.message);
    const users: { id: string; email: string | null; confirmed: boolean; last: string | null; disabled: boolean }[] = [];
    for (let page = 1; page < 50; page++) {
      const { data, error: e } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (e) throw new Error(e.message);
      for (const u of data.users) {
        const banned = (u as { banned_until?: string | null }).banned_until;
        users.push({
          id: u.id,
          email: u.email ?? null,
          confirmed: Boolean(u.email_confirmed_at),
          last: u.last_sign_in_at ?? null,
          disabled: Boolean(banned && new Date(banned).getTime() > Date.now()),
        });
      }
      if (data.users.length < 200) break;
    }
    const byId = new Map(users.map((u) => [u.id, u]));
    const { developerEmails } = await import("@/lib/developer.server");
    const developers = developerEmails();
    type P = {
      id: string; org_id: string; full_name: string; title: string | null; department: string | null;
      role: string; status: string; manager_id: string | null; invited_at: string | null;
      auth_user_id: string | null; weekly_off: string | null;
    };
    const rows = ((profiles ?? []) as P[]).map((p) => {
      const u = p.auth_user_id ? byId.get(p.auth_user_id) : undefined;
      return {
        ...p,
        email: u?.email ?? null,
        email_confirmed: u?.confirmed ?? false,
        last_sign_in_at: u?.last ?? null,
        disabled: u?.disabled ?? false,
        isDeveloper: Boolean(u?.email && developers.includes(u.email.toLowerCase())),
      };
    });
    const linked = new Set(rows.map((r) => r.auth_user_id).filter(Boolean));
    const orphans = users.filter((u) => !linked.has(u.id)).map((u) => ({ id: u.id, email: u.email, last_sign_in_at: u.last }));
    return { rows, orphans };
  });

interface ProfilePatch {
  id: string;
  patch: {
    full_name?: string; title?: string | null; department?: string | null; role?: string;
    status?: string; manager_id?: string | null; weekly_off?: string | null;
  };
}

export const devUpdateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: ProfilePatch) => {
    if (!i?.id) throw new Error("id is required");
    const p = i.patch ?? {};
    const allowed = ["full_name", "title", "department", "role", "status", "manager_id", "weekly_off"];
    for (const k of Object.keys(p)) if (!allowed.includes(k)) throw new Error(`Field not editable: ${k}`);
    if (p.role !== undefined && !ROLES.includes(p.role)) throw new Error("Invalid role");
    if (p.status !== undefined && !STATUSES.includes(p.status)) throw new Error("Invalid status");
    if (p.full_name !== undefined && !p.full_name.trim()) throw new Error("Name cannot be empty");
    if (p.manager_id && p.manager_id === i.id) throw new Error("A person cannot be their own manager");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { db, email } = await gate(context.userId);
    const { data: before, error } = await db.from("profiles").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!before) throw new Error("Row not found");
    const patch: Record<string, string | null> = { ...data.patch } as Record<string, string | null>;
    if (data.patch.status === "exited" && !before.exited_on) patch["exited_on"] = istToday();
    if (data.patch.status === "active") patch["exited_on"] = null;
    const changes: Row = {};
    for (const [k, v] of Object.entries(patch)) {
      if (before[k] !== v) changes[k] = { before: (before[k] ?? null) as Json, after: v };
    }
    const { error: upErr } = await db.rpc("dev_update_profile", { p_id: data.id, p_patch: patch });
    if (upErr) throw new Error(upErr.message);
    await log(db, email, "profile.update", `profiles:${data.id}`, changes);
    return { ok: true };
  });

interface UserActionInput {
  action: "recovery_link" | "set_password" | "disable" | "enable" | "unlink";
  profileId?: string;
  authUserId?: string;
  password?: string;
  origin?: string;
}

export const devImpersonateLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateImpersonationInput)
  .handler(async ({ data, context }): Promise<string> => {
    const { db, email: actor } = await gate(context.userId);
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("id, full_name, role, status, auth_user_id").eq("id", data.profileId).maybeSingle();
    if (profileError) throw new Error("Couldn't look up this person. Please try again.");
    if (!profile) throw new Error("This person was not found.");
    if (!profile.auth_user_id) throw new Error("This person has no login.");
    const { data: auth, error: authError } = await db.auth.admin.getUserById(profile.auth_user_id);
    if (authError || !auth.user) throw new Error("Couldn't find this person's login.");
    const { developerEmails } = await import("@/lib/developer.server");
    const email = auth.user.email;
    const bannedUntil = (auth.user as { banned_until?: string | null }).banned_until;
    const reason = impersonationBlockedReason({
      auth_user_id: profile.auth_user_id,
      status: profile.status,
      disabled: Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now()),
      isDeveloper: auth.user.id === context.userId || Boolean(email && developerEmails().includes(email.toLowerCase())),
    });
    if (reason) throw new Error(reason);
    if (!email) throw new Error("This person's login has no email address.");
    const { data: generated, error } = await db.auth.admin.generateLink({
      type: "magiclink", email, options: { redirectTo: data.redirectTo },
    });
    if (error || !generated.properties?.action_link) throw new Error("Couldn't create the sign-in link. Please try again.");
    await log(db, actor, "user.impersonate", `${profile.full_name} (${profile.id})`, { role: profile.role });
    return generated.properties.action_link;
  });

export const devUserAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: UserActionInput) => {
    if (!["recovery_link", "set_password", "disable", "enable", "unlink"].includes(i?.action)) throw new Error("Invalid action");
    if (i.action === "set_password" && (!i.password || i.password.length < 8)) throw new Error("Password must be at least 8 characters");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { db, email } = await gate(context.userId);
    let authId = data.authUserId ?? null;
    if (!authId && data.profileId) {
      const { data: p } = await db.from("profiles").select("auth_user_id").eq("id", data.profileId).maybeSingle();
      authId = (p?.auth_user_id as string | null) ?? null;
    }
    if (!authId) throw new Error("This person has no login");
    const target = `auth:${authId}`;
    if (data.action === "recovery_link") {
      const { data: u, error: ue } = await db.auth.admin.getUserById(authId);
      if (ue || !u.user?.email) throw new Error(ue?.message ?? "Login has no email");
      const origin = data.origin?.startsWith("http") ? data.origin : "https://team.coacheasily.com";
      const { data: link, error } = await db.auth.admin.generateLink({
        type: "recovery",
        email: u.user.email,
        options: { redirectTo: `${origin}/change-password` },
      });
      if (error) throw new Error(error.message);
      await log(db, email, "user.recovery_link", target, { email: u.user.email });
      return { ok: true, link: link.properties?.action_link ?? null };
    }
    if (data.action === "set_password") {
      const { error } = await db.auth.admin.updateUserById(authId, { password: data.password!, email_confirm: true });
      if (error) throw new Error(error.message);
      await log(db, email, "user.set_password", target, {});
      return { ok: true, link: null };
    }
    if (data.action === "disable" || data.action === "enable") {
      const { error } = await db.auth.admin.updateUserById(authId, {
        ban_duration: data.action === "disable" ? "876000h" : "none",
      });
      if (error) throw new Error(error.message);
      await log(db, email, `user.${data.action}`, target, {});
      return { ok: true, link: null };
    }
    const { error } = await db.from("profiles").update({ auth_user_id: null }).eq("auth_user_id", authId);
    if (error) throw new Error(error.message);
    await log(db, email, "user.unlink", target, { profileId: data.profileId ?? null });
    return { ok: true, link: null };
  });

const PAGE = 25;

export const devBrowse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { table: string; page: number }) => ({
    table: assertDevTable(i?.table),
    page: Math.max(0, Math.floor(Number(i?.page) || 0)),
  }))
  .handler(async ({ data, context }) => {
    const { db } = await gate(context.userId);
    const from = data.page * PAGE;
    let res = await db.from(data.table).select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    if (res.error) res = await db.from(data.table).select("*", { count: "exact" }).range(from, from + PAGE - 1);
    if (res.error) throw new Error(res.error.message);
    return { rows: (res.data ?? []) as Row[], total: res.count ?? 0, pageSize: PAGE, keys: keyColumns(data.table) };
  });

const EXPORT_CHUNK = 1000;

/** One slice of a table for the full-database export; the client loops until `done`. */
export const devExportChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { table: string; offset: number }) => ({
    table: i?.table === "auth.users" ? "auth.users" : assertDevTable(i?.table),
    offset: Math.max(0, Math.floor(Number(i?.offset) || 0)),
  }))
  .handler(async ({ data, context }) => {
    const { db, email } = await gate(context.userId);
    if (data.offset === 0) await log(db, email, "export", data.table, {});
    if (data.table === "auth.users") {
      const page = Math.floor(data.offset / EXPORT_CHUNK) + 1;
      const res = await db.auth.admin.listUsers({ page, perPage: EXPORT_CHUNK });
      if (res.error) throw new Error(res.error.message);
      const rows = res.data.users.map((u) => ({
        id: u.id, email: u.email ?? null, phone: u.phone ?? null, created_at: u.created_at,
        email_confirmed_at: u.email_confirmed_at ?? null, last_sign_in_at: u.last_sign_in_at ?? null,
        user_metadata: u.user_metadata, app_metadata: u.app_metadata,
      })) as Row[];
      return { rows, done: rows.length < EXPORT_CHUNK };
    }
    const keys = keyColumns(assertDevTable(data.table));
    let q = db.from(data.table).select("*");
    for (const k of keys) q = q.order(k, { ascending: true });
    const res = await q.range(data.offset, data.offset + EXPORT_CHUNK - 1);
    if (res.error) throw new Error(res.error.message);
    const rows = (res.data ?? []) as Row[];
    return { rows, done: rows.length < EXPORT_CHUNK };
  });

interface WriteInput {
  table: string;
  op: "insert" | "update" | "delete";
  key?: { [k: string]: string };
  values?: Row;
}

export const devWriteRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: WriteInput) => {
    const table = assertDevTable(i?.table);
    if (!["insert", "update", "delete"].includes(i.op)) throw new Error("Invalid op");
    const values = i.values ?? {};
    if (typeof values !== "object" || Array.isArray(values)) throw new Error("Values must be an object");
    return { table, op: i.op, key: i.key ?? {}, values };
  })
  .handler(async ({ data, context }) => {
    const { db, email } = await gate(context.userId);
    if (data.table === "profiles" && data.op === "update") {
      assertDevDataProfileUpdate(data.values);
    }
    if (data.op === "insert") {
      const { data: row, error } = await db.from(data.table).insert(data.values).select().maybeSingle();
      if (error) throw new Error(error.message);
      await log(db, email, "row.insert", data.table, { row: (row ?? data.values) as Json });
      return { ok: true };
    }
    let q = db.from(data.table).select("*");
    for (const k of keyColumns(data.table)) {
      const v = data.key[k];
      if (!v) throw new Error(`Missing key column: ${k}`);
      q = q.eq(k, v);
    }
    const { data: before, error: be } = await q.maybeSingle();
    if (be) throw new Error(be.message);
    if (!before) throw new Error("Row not found");
    const target = `${data.table}:${JSON.stringify(data.key)}`;
    if (data.op === "update") {
      let u = db.from(data.table).update(data.values);
      for (const k of keyColumns(data.table)) u = u.eq(k, data.key[k]!);
      const { error } = await u;
      if (error) throw new Error(error.message);
      await log(db, email, "row.update", target, { before: before as Json, patch: data.values });
    } else {
      let d = db.from(data.table).delete();
      for (const k of keyColumns(data.table)) d = d.eq(k, data.key[k]!);
      const { error } = await d;
      if (error) throw new Error(error.message);
      await log(db, email, "row.delete", target, { before: before as Json });
    }
    return { ok: true };
  });

export const devListOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await gate(context.userId);
    const { data, error } = await db.from("organisations").select("id, name, logo_url, settings").order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string; logo_url: string | null; settings: Json }[];
  });

export const devUpdateOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; name: string; logo_url: string | null; settings: Row }) => {
    if (!i?.id) throw new Error("id is required");
    if (!i.name?.trim()) throw new Error("Name is required");
    if (!i.settings || typeof i.settings !== "object" || Array.isArray(i.settings)) throw new Error("Settings must be a JSON object");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { db, email } = await gate(context.userId);
    const { data: before } = await db.from("organisations").select("name, logo_url, settings").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Row not found");
    const after = { name: data.name.trim(), logo_url: data.logo_url?.trim() || null, settings: data.settings };
    const { error } = await db.from("organisations").update(after).eq("id", data.id);
    if (error) throw new Error(error.message);
    await log(db, email, "org.update", `organisations:${data.id}`, { before: before as Json, after: after as Json });
    return { ok: true };
  });

export const devAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { profileId: string }) => {
    if (!i?.profileId) throw new Error("profileId is required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { db } = await gate(context.userId);
    const { data: rows, error } = await db
      .from("attendance")
      .select("id, date, marked_at, focus, on_time")
      .eq("profile_id", data.profileId)
      .order("date", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return (rows ?? []) as { id: string; date: string; marked_at: string; focus: string | null; on_time: boolean | null }[];
  });

export const devAddPunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { profileId: string; date: string; focus?: string }) => {
    if (!i?.profileId) throw new Error("profileId is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date ?? "")) throw new Error("Pick a valid date");
    if (i.date > istToday()) throw new Error("That date is in the future");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { db, email } = await gate(context.userId);
    const { data: p } = await db.from("profiles").select("org_id").eq("id", data.profileId).maybeSingle();
    if (!p) throw new Error("Row not found");
    const { data: existing } = await db.from("attendance").select("id").eq("profile_id", data.profileId).eq("date", data.date).maybeSingle();
    if (existing) throw new Error("A punch already exists for that day");
    const row = {
      org_id: p.org_id,
      profile_id: data.profileId,
      date: data.date,
      marked_at: `${data.date}T12:00:00+05:30`,
      on_time: true,
      focus: data.focus?.trim() || "Added by developer",
    };
    const { error } = await db.from("attendance").insert(row);
    if (error) throw new Error(error.message);
    await log(db, email, "attendance.add", `profiles:${data.profileId}`, row);
    return { ok: true };
  });

export const devAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await gate(context.userId);
    const { data, error } = await db
      .from("dev_audit_log")
      .select("id, actor_email, action, target, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return { rows: [], missing: true };
      throw new Error(error.message);
    }
    return {
      rows: (data ?? []) as { id: string; actor_email: string; action: string; target: string | null; detail: Json; created_at: string }[],
      missing: false,
    };
  });

/** Everybody still here, with what the team list needs to be ordered and shown. */
export const devTeamList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await gate(context.userId);
    const { data, error } = await db
      .from("profiles")
      .select("id, full_name, title, department, role, manager_id, status, team_order, sort_order, joined_on, avatar_url")
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string; full_name: string; title: string | null; department: string | null; role: string;
      manager_id: string | null; status: string; team_order: number | null; sort_order: number | null;
      joined_on: string | null; avatar_url: string | null;
    }[];
  });

/** Places people on the Culture page's team list by hand (10, 20, 30…), or goes back to the rule. */
export const devSaveTeamOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateTeamOrderInput)
  .handler(async ({ data, context }) => {
    const { db, email } = await gate(context.userId);
    const { data: current, error } = await db
      .from("profiles")
      .select("id, full_name, team_order")
      .eq("status", "active");
    if (error) throw new Error(error.message);
    const byId = new Map((current ?? []).map((p: { id: string; full_name: string; team_order: number | null }) => [p.id, p]));

    if ("reset" in data) {
      const { error: e } = await db.from("profiles").update({ team_order: null }).eq("status", "active");
      if (e) throw new Error(e.message);
      await log(db, email, "team_order.reset", null, { people: byId.size });
      return { changed: byId.size };
    }

    const changes: Row = {};
    for (const [i, id] of data.orderedIds.entries()) {
      const person = byId.get(id);
      if (!person) throw new Error("Somebody in that list is not an active person.");
      const place = (i + 1) * 10;
      if (person.team_order === place) continue;
      const { error: e } = await db.from("profiles").update({ team_order: place }).eq("id", id);
      if (e) throw new Error(e.message);
      changes[person.full_name] = { before: person.team_order, after: place };
    }
    await log(db, email, "team_order.save", null, changes);
    return { changed: Object.keys(changes).length };
  });
