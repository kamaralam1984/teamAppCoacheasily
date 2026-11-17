import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { uploadPath } from "@/lib/selfEvaluation";

/**
 * Developer powers on the Annual Self-Evaluation: open / close the cycle, read, fill or correct
 * anyone's form until it is final, upload files to it and remove (hide) files from it.
 * Every function re-checks the developer allowlist on the server, writes dev_audit_log, and
 * calls service-role-only database functions that also keep the change in self_eval_log.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "self-evaluation";
const SECTIONS = ["about", "goals", "values", "reflection", "potential"];
type Row = Record<string, Json>;

function year(v: unknown): number {
  const y = Number(v);
  if (!Number.isInteger(y) || y < 2020 || y > 2100) throw new Error("Choose a year.");
  return y;
}
function id(v: unknown, what = "id"): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new Error(`Invalid ${what}`);
  return v;
}

/** The allowlisted developer, their own profile (for the history) and the admin client. */
async function gate(userId: string) {
  const { requireDeveloper } = await import("@/lib/developer.server");
  const { db, email } = await requireDeveloper(userId);
  const { data, error } = await db
    .from("profiles")
    .select("id, org_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const me = (data ?? null) as { id: string; org_id: string } | null;
  if (!me) throw new Error("Your profile was not found.");
  return { db, email, me };
}

async function audit(
  ...args: Parameters<typeof import("@/lib/developer.server").audit>
): Promise<void> {
  const { audit: write } = await import("@/lib/developer.server");
  return write(...args);
}

/** Every form of the year (the steps only), for the people list. */
export const devSelfEvalList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { year: number }) => ({ year: year(i?.year) }))
  .handler(async ({ data, context }) => {
    const { db, me } = await gate(context.userId);
    const { data: rows, error } = await db
      .from("self_evaluations")
      .select(
        "id, profile_id, year, emp_submitted_at, mgr_submitted_at, finalized_at, final_rating, updated_at, goals, value_answers, reflection, potential",
      )
      .eq("org_id", me.org_id)
      .eq("year", data.year);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Row[];
  });

/** One person's whole form, with ratings, notes, files and history. */
export const devSelfEval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { profileId: string; year: number }) => ({
    profileId: id(i?.profileId, "person"),
    year: year(i?.year),
  }))
  .handler(async ({ data, context }) => {
    const { db } = await gate(context.userId);
    const { profileId: p, year: y } = data;
    const [form, reviews, notes, files, log] = await Promise.all([
      db.from("self_evaluations").select("*").eq("profile_id", p).eq("year", y).maybeSingle(),
      db.from("self_eval_reviews").select("*").eq("profile_id", p).eq("year", y),
      db.from("self_eval_notes").select("*").eq("profile_id", p).eq("year", y),
      db
        .from("self_eval_files")
        .select("*")
        .eq("profile_id", p)
        .eq("year", y)
        .is("removed_at", null)
        .order("created_at", { ascending: true }),
      db
        .from("self_eval_log")
        .select("*")
        .eq("profile_id", p)
        .eq("year", y)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    for (const r of [form, reviews, notes, files, log])
      if (r.error) throw new Error(r.error.message);
    return {
      form: (form.data ?? null) as Row | null,
      reviews: (reviews.data ?? []) as Row[],
      notes: (notes.data ?? []) as Row[],
      files: (files.data ?? []) as Row[],
      log: (log.data ?? []) as Row[],
    };
  });

export const devSelfEvalCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { action: "open" | "close"; year: number; due?: string | null }) => {
    if (i?.action !== "open" && i?.action !== "close") throw new Error("Unknown action.");
    const due = i.due ?? null;
    if (due !== null && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Choose a date.");
    return { action: i.action, year: year(i.year), due };
  })
  .handler(async ({ data, context }) => {
    const { db, email, me } = await gate(context.userId);
    await audit(db, email, `self_eval_cycle_${data.action}`, String(data.year), {
      due: data.due,
    });
    const { error } =
      data.action === "open"
        ? await db.rpc("self_eval_dev_open_cycle", {
            p_actor: me.id,
            p_org: me.org_id,
            p_year: data.year,
            p_due: data.due,
          })
        : await db.rpc("self_eval_dev_close_cycle", {
            p_actor: me.id,
            p_org: me.org_id,
            p_year: data.year,
          });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Fills or corrects one box (or a whole part) of anyone's form, until it is final. */
export const devSelfEvalSave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { profileId: string; year: number; section: string; path: string[]; value: Json }) => {
      if (!SECTIONS.includes(i?.section)) throw new Error("Unknown part of the form.");
      if (!Array.isArray(i.path) || i.path.length > 3 || i.path.some((x) => typeof x !== "string"))
        throw new Error("Unknown box.");
      return {
        profileId: id(i.profileId, "person"),
        year: year(i.year),
        section: i.section,
        path: i.path,
        value: i.value ?? null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { db, email, me } = await gate(context.userId);
    await audit(db, email, "self_eval_edit", data.profileId, {
      year: data.year,
      section: data.section,
      path: data.path,
    });
    const { error } = await db.rpc("self_eval_dev_save", {
      p_actor: me.id,
      p_profile_id: data.profileId,
      p_year: data.year,
      p_section: data.section,
      p_path: data.path,
      p_value: data.value,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A one-time upload link into the person's folder; the browser uploads the file to it. */
export const devSelfEvalUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { profileId: string; year: number; name: string; gzip: boolean }) => ({
    profileId: id(i?.profileId, "person"),
    year: year(i?.year),
    name: String(i?.name ?? "file").slice(0, 200),
    gzip: Boolean(i?.gzip),
  }))
  .handler(async ({ data, context }) => {
    const { db } = await gate(context.userId);
    const path =
      uploadPath(data.profileId, data.year, data.name, crypto.randomUUID()) +
      (data.gzip ? ".gz" : "");
    const { data: signed, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "The upload could not start.");
    return { path, token: signed.token };
  });

/** Records a file the browser uploaded with devSelfEvalUploadUrl. */
export const devSelfEvalFileAdd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      profileId: string;
      year: number;
      kind: string;
      goalIndex: number | null;
      path: string;
      name: string;
      mime: string;
      size: number;
      originalSize: number;
      encoding: string | null;
    }) => {
      if (!["evidence", "form", "other"].includes(i?.kind))
        throw new Error("Unknown kind of file.");
      return {
        profileId: id(i.profileId, "person"),
        year: year(i.year),
        kind: i.kind,
        goalIndex: Number.isInteger(i.goalIndex) ? i.goalIndex : null,
        path: String(i.path ?? ""),
        name: String(i.name ?? "file").slice(0, 200),
        mime: String(i.mime ?? "").slice(0, 120),
        size: Math.max(0, Math.floor(Number(i.size) || 0)),
        originalSize: Math.max(0, Math.floor(Number(i.originalSize) || 0)),
        encoding: i.encoding === "gzip" ? "gzip" : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { db, email, me } = await gate(context.userId);
    await audit(db, email, "self_eval_upload", data.profileId, {
      year: data.year,
      kind: data.kind,
      name: data.name,
      size: data.size,
    });
    const { data: fileId, error } = await db.rpc("self_eval_dev_file_add", {
      p_actor: me.id,
      p_profile_id: data.profileId,
      p_year: data.year,
      p_kind: data.kind,
      p_goal_index: data.goalIndex,
      p_path: data.path,
      p_name: data.name,
      p_mime: data.mime,
      p_size: data.size,
      p_original_size: data.originalSize,
      p_encoding: data.encoding,
    });
    if (error) throw new Error(error.message);
    return { id: fileId as string };
  });

/** Removes a file from anyone's form: hidden from the form, kept in storage and the history. */
export const devSelfEvalFileRemove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { fileId: string }) => ({ fileId: id(i?.fileId, "file") }))
  .handler(async ({ data, context }) => {
    const { db, email, me } = await gate(context.userId);
    await audit(db, email, "self_eval_file_remove", data.fileId, {});
    const { error } = await db.rpc("self_eval_dev_file_remove", {
      p_actor: me.id,
      p_file_id: data.fileId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A short-lived link to any self-evaluation file. */
export const devSelfEvalFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { path: string }) => {
    const path = String(i?.path ?? "");
    if (!/^[0-9a-f-]{36}\/\d{4}\/[^/]+$/i.test(path)) throw new Error("Wrong file location.");
    return { path };
  })
  .handler(async ({ data, context }) => {
    const { db } = await gate(context.userId);
    const { data: s, error } = await db.storage.from(BUCKET).createSignedUrl(data.path, 120);
    if (error || !s) throw new Error(error?.message ?? "The file could not be opened.");
    return { url: s.signedUrl };
  });
