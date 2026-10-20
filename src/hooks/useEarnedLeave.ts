import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type EarnedLeavePolicy = Tables<"el_policy">;

/** One automatic credit. HR/Admin also receive the calculation behind it. */
export interface LedgerEntry {
  id: string;
  /** one line of the account: the opening balance, a credit, a lapse, leave used, or a request still pending */
  kind: "opening" | "credit" | "lapse" | "used" | "pending";
  credited_on: string;
  amount: number;
  /** negative for a lapse or for leave used */
  credited: number;
  /** the same as credited, as a plain signed change to the balance (0 for a pending request) */
  delta?: number;
  /** the balance after this line, counting from the opening balance */
  available_after?: number;
  /** leave used or pending: the last day, and whether it was half a day */
  to_date?: string;
  half_day?: boolean;
  previous_balance: number | null;
  new_balance: number | null;
  /** lapses: the carry-forward limit that applied */
  carry_limit?: number;
  period_start?: string;
  period_end?: string;
  eligible_days?: number;
  source?: string;
}

export function useEarnedLeavePolicy(enabled = true) {
  return useQuery({
    queryKey: ["el-policy"],
    enabled,
    queryFn: async (): Promise<EarnedLeavePolicy | null> => {
      const { data, error } = await supabase.from("el_policy").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type PolicyEdit = Pick<
  EarnedLeavePolicy,
  | "required_days"
  | "credit_amount"
  | "exclude_weekly_off"
  | "exclude_holidays"
  | "count_approved_leave"
  | "count_wfh"
  | "count_half_day"
  | "count_during_probation"
  | "carry_forward_limit"
  | "year_start_month"
  | "max_balance"
>;

export function useSaveEarnedLeavePolicy(orgId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (edit: PolicyEdit) => {
      if (!orgId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase.from("el_policy").update(edit).eq("org_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["el-policy"] });
      void qc.invalidateQueries({ queryKey: ["el-policy-log"] });
    },
  });
}

export function useEarnedLeavePolicyLog(enabled = true) {
  return useQuery({
    queryKey: ["el-policy-log"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("el_policy_log")
        .select("id, changed_at, changed_by, old_policy, new_policy")
        .order("changed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEarnedLeaveLedger(profileId?: string | null) {
  return useQuery({
    queryKey: ["el-ledger", profileId ?? "me"],
    enabled: profileId !== null,
    queryFn: async (): Promise<LedgerEntry[]> => {
      const { data, error } = await supabase.rpc(
        "el_ledger_for",
        profileId ? { p_profile_id: profileId } : {},
      );
      if (error) throw error;
      return (data as unknown as LedgerEntry[]) ?? [];
    },
  });
}

/** HR/Admin: run the credit engine for everyone now (it also runs every night). */
export function useRecalculateEarnedLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("el_recalculate");
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["el-ledger"] });
      void qc.invalidateQueries({ queryKey: ["attendance-summary"] });
      void qc.invalidateQueries({ queryKey: ["leave-balances"] });
    },
  });
}

export interface RebuildRow {
  profile_id: string;
  full_name: string;
  joined_on: string | null;
  first_punch: string | null;
  opening: number;
  working_days: number;
  credits_now: number;
  credits_new: number;
  lapsed: number;
  used: number;
  balance_now: number;
  balance_new: number;
  available_now: number;
  available_new: number;
  change: number;
  note: string | null;
}

export interface RebuildPreview {
  mode_now: "punches" | "joining_date";
  today: string;
  people: RebuildRow[];
}

/** HR/Admin: what counting from the joining date would do to everyone's earned leave. Changes nothing. */
export function useRebuildPreview() {
  return useMutation({
    mutationFn: async (): Promise<RebuildPreview> => {
      const { data, error } = await supabase.rpc("el_rebuild_preview");
      if (error) throw error;
      return data as unknown as RebuildPreview;
    },
  });
}

/** HR/Admin: switch to counting from the joining date and rebuild every ledger. Archives the old rows. */
export function useRebuildApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (confirm: string): Promise<number> => {
      const { data, error } = await supabase.rpc("el_rebuild_apply", { p_confirm: confirm });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: () => {
      for (const key of [
        "el-policy",
        "el-policy-log",
        "el-ledger",
        "attendance-summary",
        "leave-balances",
        "audit-log",
        "dash-hr",
        "profile-360",
        "report",
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
