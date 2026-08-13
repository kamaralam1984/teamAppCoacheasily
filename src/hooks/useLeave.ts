import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { notifyByEmail } from "@/lib/notify";
import type { Tables } from "@/integrations/supabase/types";

export type LeaveRequest = Tables<"leave_requests">;

export type LeaveType = "casual" | "sick" | "earned" | "comp_off" | "maternity" | "lwp";

export const LEAVE_TYPES: { value: LeaveType; label: string; note?: string }[] = [
  { value: "casual", label: "Casual leave" },
  { value: "sick", label: "Sick leave" },
  { value: "earned", label: "Earned leave" },
  { value: "comp_off", label: "Comp-off" },
  { value: "maternity", label: "Maternity leave", note: "26 weeks · first two children" },
  { value: "lwp", label: "Leave without pay" },
];

export const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  LEAVE_TYPES.map((t) => [t.value, t.label]),
);

/** The order the plaques must always render in. */
export const BALANCE_ORDER: LeaveType[] = ["casual", "sick", "earned", "comp_off"];

export interface LeaveBalance {
  type: LeaveType;
  entitled: number;
  used: number;
  pending: number;
  balance: number;
}

/** Balances come from Postgres — never computed in the client. */
export function useLeaveBalances(profileId?: string | null) {
  return useQuery({
    queryKey: ["leave-balances", profileId ?? "me"],
    enabled: profileId !== null,
    queryFn: async (): Promise<LeaveBalance[]> => {
      const { data, error } = await supabase.rpc(
        "leave_balances",
        profileId ? { p_profile_id: profileId } : {},
      );
      if (error) throw error;
      const rows = (data as unknown as LeaveBalance[] | null) ?? [];
      return BALANCE_ORDER.map((t) => rows.find((r) => r.type === t)).filter(
        (r): r is LeaveBalance => Boolean(r),
      );
    },
  });
}

export interface LeaveCheck {
  errors: string[];
  warnings: string[];
  days: number;
}

/** Live validation, straight from the same rules the database enforces on write. */
export function useLeaveCheck(args: {
  type: LeaveType;
  from: string;
  to: string;
  halfDay: boolean;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["leave-check", args.type, args.from, args.to, args.halfDay],
    enabled: args.enabled,
    queryFn: async (): Promise<LeaveCheck> => {
      const { data, error } = await supabase.rpc("leave_check", {
        p_type: args.type,
        p_from: args.from,
        p_to: args.to,
        p_half: args.halfDay,
      });
      if (error) throw error;
      return (data as unknown as LeaveCheck) ?? { errors: [], warnings: [], days: 0 };
    },
  });
}

/** My leave history, newest first. */
export function useMyLeave(profileId?: string | null) {
  return useQuery({
    queryKey: ["leave-history", profileId ?? "none"],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<LeaveRequest[]> => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("profile_id", profileId!)
        .order("from_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface ApplyInput {
  type: LeaveType;
  from_date: string;
  to_date: string;
  half_day: boolean;
  reason: string;
  handover_to: string | null;
  /** Exactly which open tasks move across. Empty means none. */
  handover_task_ids?: string[];
}

export function useApplyLeave(profileId?: string | null, orgId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyInput) => {
      if (!profileId || !orgId) throw new Error("Your profile isn't set up yet.");
      const { data, error } = await supabase
        .from("leave_requests")
        .insert({
          profile_id: profileId,
          org_id: orgId,
          type: input.type,
          from_date: input.from_date,
          to_date: input.to_date,
          half_day: input.half_day,
          reason: input.reason || null,
          handover_to: input.handover_to,
          handover_task_ids: input.handover_to ? (input.handover_task_ids ?? []) : [],
        })
        .select("*")
        .single();
      if (error) throw error;

      const { data: me } = await supabase
        .from("profiles")
        .select("full_name, manager_id")
        .eq("id", profileId)
        .maybeSingle();
      if (me?.manager_id) {
        notifyByEmail({
          kind: "leave_raised",
          profileIds: [me.manager_id],
          title: `${me.full_name} has asked for leave`,
          body: `${input.type} leave from ${input.from_date} to ${input.to_date}. It's waiting for your decision.`,
          link: "/approvals",
        });
      }
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leave-balances"] });
      void qc.invalidateQueries({ queryKey: ["leave-history"] });
      void qc.invalidateQueries({ queryKey: ["leave-pending"] });
    },
  });
}

export interface PendingRequest extends LeaveRequest {
  applicant: { id: string; full_name: string; title: string | null; department: string | null };
}

/** Pending requests for my line — oldest first, longest waiting at the top. */
export function usePendingApprovals(enabled: boolean) {
  return useQuery({
    queryKey: ["leave-pending"],
    enabled,
    queryFn: async (): Promise<PendingRequest[]> => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, applicant:profiles!leave_requests_profile_id_fkey(id, full_name, title, department)")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as PendingRequest[]) ?? [];
    },
  });
}

export function useDecideLeave(deciderId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; status: "approved" | "rejected" }) => {
      const { data: row, error } = await supabase
        .from("leave_requests")
        .update({
          status: args.status,
          decided_at: new Date().toISOString(),
          decided_by: deciderId ?? null,
        })
        .eq("id", args.id)
        .select("profile_id, type, from_date, to_date")
        .maybeSingle();
      if (error) throw error;
      if (row) {
        notifyByEmail({
          kind: "leave_decided",
          profileIds: [row.profile_id],
          title: `Your leave was ${args.status}`,
          body: `${row.type} leave from ${row.from_date} to ${row.to_date} was ${args.status}.`,
          link: "/leave",
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leave-pending"] });
      void qc.invalidateQueries({ queryKey: ["leave-balances"] });
      void qc.invalidateQueries({ queryKey: ["leave-history"] });
    },
  });
}
