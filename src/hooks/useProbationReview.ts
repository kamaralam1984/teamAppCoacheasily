import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { devProbationList, devProbationReview, devWriteRow } from "@/lib/developer.functions";
import type { ProbationDecision, ProbationStatus } from "@/hooks/useProbation";

export type ProbationKra = Tables<"probation_kras">;
export type ProbationReview = Tables<"probation_reviews">;
export type ProbationFeedback = Tables<"probation_feedback">;
export type ProbationNote = Tables<"probation_internal_notes">;
export type ProbationLog = Tables<"probation_review_log">;
export type FeedbackKind = "manager" | "hr" | "sir";

export interface ProbationReviewData {
  kras: ProbationKra[];
  review: ProbationReview | null;
  feedback: ProbationFeedback[];
  notes: ProbationNote[];
  log: ProbationLog[];
}

/** Developer view of everyone's probation and review steps (RLS limits everyone else). */
export function useDevProbationList(enabled: boolean) {
  const fn = useServerFn(devProbationList);
  return useQuery({
    queryKey: ["probation-review-list", "dev"],
    enabled,
    queryFn: async () => {
      const r = await fn();
      return {
        probations: r.probations as unknown as {
          profile_id: string;
          start_date: string;
          end_date: string;
          status: ProbationStatus;
        }[],
        reviews: r.reviews as unknown as ProbationReview[],
      };
    },
  });
}

/** The review steps of everyone the viewer may see. */
export function useProbationReviewSteps(enabled: boolean) {
  return useQuery({
    queryKey: ["probation-review-list", "steps"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("probation_reviews").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** One person's whole review. A developer who is not their manager/HR reads it server side. */
export function useProbationReview(profileId: string | null, viaDev: boolean) {
  const dev = useServerFn(devProbationReview);
  return useQuery({
    queryKey: ["probation-review", profileId, viaDev],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<ProbationReviewData> => {
      if (viaDev) {
        const r = await dev({ data: { profileId: profileId! } });
        return r as unknown as ProbationReviewData;
      }
      const id = profileId!;
      const [kras, review, feedback, notes, log] = await Promise.all([
        supabase
          .from("probation_kras")
          .select("*")
          .eq("profile_id", id)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("probation_reviews").select("*").eq("profile_id", id).maybeSingle(),
        supabase.from("probation_feedback").select("*").eq("profile_id", id),
        supabase.from("probation_internal_notes").select("*").eq("profile_id", id),
        supabase
          .from("probation_review_log")
          .select("*")
          .eq("profile_id", id)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      for (const r of [kras, review, feedback, notes, log]) if (r.error) throw r.error;
      return {
        kras: kras.data ?? [],
        review: review.data ?? null,
        feedback: feedback.data ?? [],
        notes: notes.data ?? [],
        log: log.data ?? [],
      };
    },
  });
}

type KraFields = Partial<
  Pick<
    ProbationKra,
    | "title"
    | "measure"
    | "position"
    | "emp_achievement"
    | "emp_evaluation"
    | "mgr_achievement"
    | "mgr_evaluation"
    | "emp_remark"
    | "mgr_remark"
    | "removed_at"
  >
>;

/** Every write on one person's review. Developers write KRAs through the audited route. */
export function useProbationReviewWrites(profileId: string | null, viaDev: boolean) {
  const qc = useQueryClient();
  const dev = useServerFn(devWriteRow);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["probation-review", profileId] });
    void qc.invalidateQueries({ queryKey: ["probation-review-list"] });
  };

  const addKra = useMutation({
    mutationFn: async (args: { orgId: string; position: number }) => {
      const row = { org_id: args.orgId, profile_id: profileId!, position: args.position };
      if (viaDev) {
        await dev({ data: { table: "probation_kras", op: "insert", values: row } });
        return;
      }
      const { error } = await supabase.from("probation_kras").insert(row);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const saveKra = useMutation({
    mutationFn: async (args: { id: string; values: KraFields }) => {
      if (viaDev) {
        await dev({
          data: {
            table: "probation_kras",
            op: "update",
            key: { id: args.id },
            values: args.values as { [k: string]: Json },
          },
        });
        return;
      }
      const { error } = await supabase.from("probation_kras").update(args.values).eq("id", args.id);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const saveFeedback = useMutation({
    mutationFn: async (args: { orgId: string; kind: FeedbackKind; text: string }) => {
      const { error } = await supabase
        .from("probation_feedback")
        .upsert(
          { profile_id: profileId!, org_id: args.orgId, kind: args.kind, feedback: args.text },
          { onConflict: "profile_id,kind" },
        );
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const saveNote = useMutation({
    mutationFn: async (args: { orgId: string; kind: FeedbackKind; text: string }) => {
      const { error } = await supabase
        .from("probation_internal_notes")
        .upsert(
          { profile_id: profileId!, org_id: args.orgId, kind: args.kind, note: args.text },
          { onConflict: "profile_id,kind" },
        );
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const submit = useMutation({
    mutationFn: async (args: { stage: "employee" | "manager"; recommendation?: string }) => {
      const { error } = await supabase.rpc("probation_review_submit", {
        p_profile_id: profileId!,
        p_stage: args.stage,
        ...(args.recommendation ? { p_recommendation: args.recommendation } : {}),
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const reopen = useMutation({
    mutationFn: async (stage: "employee" | "manager") => {
      const { error } = await supabase.rpc("probation_review_reopen", {
        p_profile_id: profileId!,
        p_stage: stage,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const finalize = useMutation({
    mutationFn: async (args: { decision: ProbationDecision; months?: number; note?: string }) => {
      const { error } = await supabase.rpc("probation_review_finalize", {
        p_profile_id: profileId!,
        p_decision: args.decision,
        ...(args.months ? { p_months: args.months } : {}),
        ...(args.note?.trim() ? { p_note: args.note.trim() } : {}),
      });
      if (error) throw error;
    },
    onSettled: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["probation"] });
      void qc.invalidateQueries({ queryKey: ["probation-history"] });
    },
  });

  return { addKra, saveKra, saveFeedback, saveNote, submit, reopen, finalize };
}
