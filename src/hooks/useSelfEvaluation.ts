import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { unshrink, shrinkForUpload } from "@/lib/shrinkFile";
import { uploadMime, uploadPath, UPLOAD_MAX_BYTES, type ReviewKind } from "@/lib/selfEvaluation";

export type SelfEvalRow = Tables<"self_evaluations">;
export type SelfEvalReview = Tables<"self_eval_reviews">;
export type SelfEvalNote = Tables<"self_eval_notes">;
export type SelfEvalFile = Tables<"self_eval_files">;
export type SelfEvalLog = Tables<"self_eval_log">;
export type SelfEvalCycle = Tables<"self_eval_cycles">;
export type Section = "about" | "goals" | "values" | "reflection" | "potential";

export interface SelfEvalData {
  form: SelfEvalRow | null;
  reviews: SelfEvalReview[];
  notes: SelfEvalNote[];
  files: SelfEvalFile[];
  log: SelfEvalLog[];
}

const BUCKET = "self-evaluation";

export function useSelfEvalCycles(enabled: boolean) {
  return useQuery({
    queryKey: ["self-eval-cycles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("self_eval_cycles")
        .select("*")
        .order("year", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The step of every form of the year the viewer may see (the database limits who that is). */
export function useSelfEvalList(year: number, enabled: boolean) {
  return useQuery({
    queryKey: ["self-eval-list", year],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("self_evaluations")
        .select(
          "id, profile_id, year, emp_submitted_at, mgr_submitted_at, finalized_at, final_rating, updated_at",
        )
        .eq("year", year);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** One person's form for one year, with ratings, notes, files and history (as allowed). */
export function useSelfEval(profileId: string | null, year: number) {
  return useQuery({
    queryKey: ["self-eval", profileId, year],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<SelfEvalData> => {
      const id = profileId!;
      const [form, reviews, notes, files, log] = await Promise.all([
        supabase
          .from("self_evaluations")
          .select("*")
          .eq("profile_id", id)
          .eq("year", year)
          .maybeSingle(),
        supabase.from("self_eval_reviews").select("*").eq("profile_id", id).eq("year", year),
        supabase.from("self_eval_notes").select("*").eq("profile_id", id).eq("year", year),
        supabase
          .from("self_eval_files")
          .select("*")
          .eq("profile_id", id)
          .eq("year", year)
          .is("removed_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("self_eval_log")
          .select("*")
          .eq("profile_id", id)
          .eq("year", year)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      for (const r of [form, reviews, notes, files, log]) if (r.error) throw r.error;
      return {
        form: form.data ?? null,
        reviews: reviews.data ?? [],
        notes: notes.data ?? [],
        files: files.data ?? [],
        log: log.data ?? [],
      };
    },
  });
}

/** A short-lived link to an uploaded file — never a public URL. */
/**
 * Opens an uploaded file in a new tab, as the original: a file stored compressed is unpacked
 * in the browser first. Links are short-lived, never public.
 */
export async function openSelfEvalFile(
  f: Pick<SelfEvalFile, "path" | "encoding" | "mime">,
  tab: Window | null,
): Promise<void> {
  if (f.encoding) {
    const { data, error } = await supabase.storage.from(BUCKET).download(f.path);
    if (error) throw error;
    const blob = await unshrink(data, f.encoding, f.mime);
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 120);
  if (error) throw error;
  if (tab && data?.signedUrl) tab.location.href = data.signedUrl;
}

export function useSelfEvalWrites(profileId: string | null, year: number) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["self-eval", profileId, year] });
    void qc.invalidateQueries({ queryKey: ["self-eval-list", year] });
  };

  const start = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("self_eval_start", { p_year: year });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const save = useMutation({
    mutationFn: async (args: { section: Section; path: string[]; value: Json }) => {
      const { error } = await supabase.rpc("self_eval_save", {
        p_profile_id: profileId!,
        p_year: year,
        p_section: args.section,
        p_path: args.path,
        p_value: args.value,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const reviewSave = useMutation({
    mutationFn: async (args: { kind: ReviewKind; path: string[]; value: Json }) => {
      const { error } = await supabase.rpc("self_eval_review_save", {
        p_profile_id: profileId!,
        p_year: year,
        p_kind: args.kind,
        p_path: args.path,
        p_value: args.value,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const noteSave = useMutation({
    mutationFn: async (args: { kind: ReviewKind; note: string }) => {
      const { error } = await supabase.rpc("self_eval_note_save", {
        p_profile_id: profileId!,
        p_year: year,
        p_kind: args.kind,
        p_note: args.note,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const submit = useMutation({
    mutationFn: async (args: { stage: "employee" | "manager"; signedName?: string }) => {
      const { error } = await supabase.rpc("self_eval_submit", {
        p_profile_id: profileId!,
        p_year: year,
        p_stage: args.stage,
        ...(args.signedName ? { p_signed_name: args.signedName } : {}),
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const reopen = useMutation({
    mutationFn: async (stage: "employee" | "manager") => {
      const { error } = await supabase.rpc("self_eval_reopen", {
        p_profile_id: profileId!,
        p_year: year,
        p_stage: stage,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const finalize = useMutation({
    mutationFn: async (rating: string) => {
      const { error } = await supabase.rpc("self_eval_finalize", {
        p_profile_id: profileId!,
        p_year: year,
        p_rating: rating,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  /** Uploads to <profile>/<year>/… and records it; returns the file's row id. */
  const upload = useMutation({
    mutationFn: async (args: {
      file: File;
      kind: "evidence" | "form" | "other";
      goalIndex?: number;
    }) => {
      const mime = uploadMime(args.file.name, args.file.type);
      if (!mime)
        throw new Error("That file type can't be uploaded. Use PDF, Word, Excel, CSV or an image.");
      if (args.file.size > UPLOAD_MAX_BYTES) throw new Error("That file is over 20MB.");
      // smaller before it is stored: photos re-saved at high quality, documents gzip (lossless)
      const s = await shrinkForUpload(args.file, mime);
      const path =
        uploadPath(profileId!, year, s.name, crypto.randomUUID()) + (s.encoding ? ".gz" : "");
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, s.blob, { contentType: s.storedMime, upsert: false });
      if (upErr) throw upErr;
      const { data, error } = await supabase.rpc("self_eval_file_add", {
        p_profile_id: profileId!,
        p_year: year,
        p_kind: args.kind,
        p_goal_index: args.goalIndex ?? null,
        p_path: path,
        p_name: s.name,
        p_mime: s.mime,
        p_size: s.blob.size,
        p_original_size: s.originalSize,
        ...(s.encoding ? { p_encoding: s.encoding } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSettled: refresh,
  });

  const removeFile = useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await supabase.rpc("self_eval_file_remove", { p_file_id: fileId });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  return { start, save, reviewSave, noteSave, submit, reopen, finalize, upload, removeFile };
}

export function useSelfEvalCycleWrites() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["self-eval-cycles"] });
  const open = useMutation({
    mutationFn: async (args: { year: number; due: string | null }) => {
      const { error } = await supabase.rpc("self_eval_open_cycle", {
        p_year: args.year,
        ...(args.due ? { p_due: args.due } : {}),
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
  const close = useMutation({
    mutationFn: async (year: number) => {
      const { error } = await supabase.rpc("self_eval_close_cycle", { p_year: year });
      if (error) throw error;
    },
    onSettled: refresh,
  });
  return { open, close };
}
