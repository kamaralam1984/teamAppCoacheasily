import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { leaveExtrasPreview } from "@/lib/leaveExtras.functions";
import { supabase } from "@/integrations/supabase/client";
import { notifyByEmail } from "@/lib/notify";
import type { Tables } from "@/integrations/supabase/types";

export type LeaveRequest = Tables<"leave_requests">;

export type LeaveType = "casual" | "sick" | "earned" | "comp_off" | "flexi" | "maternity" | "lwp";

export const LEAVE_TYPES: { value: LeaveType; label: string; note?: string }[] = [
  { value: "casual", label: "Casual leave" },
  { value: "sick", label: "Sick leave" },
  { value: "earned", label: "Earned leave" },
  { value: "comp_off", label: "Comp-off" },
  { value: "flexi", label: "Flexi holiday", note: "pick from the flexi list" },
  { value: "maternity", label: "Maternity leave", note: "26 weeks · first two children" },
  { value: "lwp", label: "Leave without pay" },
];

export const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  LEAVE_TYPES.map((t) => [t.value, t.label]),
);

export type HalfPart = "first" | "second";

/** "half day", or which half when it is known. */
export function halfLabel(r: { half_day: boolean; half_part?: string | null }): string {
  if (!r.half_day) return "";
  if (r.half_part === "first") return "first half";
  if (r.half_part === "second") return "second half";
  return "half day";
}

/**
 * Edit, cancel, half of the day and reminders. Until a developer approves the release only HR and
 * developers have them; the database refuses everybody else too. Any doubt means off.
 */
export function useLeaveExtras(profileId?: string | null) {
  const preview = useServerFn(leaveExtrasPreview);
  return useQuery({
    queryKey: ["leave-extras", profileId ?? "none"],
    enabled: Boolean(profileId),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("leave_extras_on");
      if (error) return false;
      if (data) return true;
      try {
        return (await preview()).on;
      } catch {
        return false;
      }
    },
  });
}

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
  /** the request being edited, so its own days are not counted against it */
  exclude?: string | undefined;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["leave-check", args.type, args.from, args.to, args.halfDay, args.exclude ?? null],
    enabled: args.enabled,
    queryFn: async (): Promise<LeaveCheck> => {
      const { data, error } = await supabase.rpc("leave_check", {
        p_type: args.type,
        p_from: args.from,
        p_to: args.to,
        p_half: args.halfDay,
        ...(args.exclude ? { p_exclude: args.exclude } : {}),
      });
      if (error) throw error;
      return (data as unknown as LeaveCheck) ?? { errors: [], warnings: [], days: 0 };
    },
  });
}

export interface FlexiHolidays {
  year: number;
  starts_from: number;
  per_year: number;
  options: { id: string; date: string; name: string }[];
  /** my pending and approved flexi requests in the year */
  requests: { id: string; date: string; status: "pending" | "approved" }[];
}

/** The flexi list for a year and what I have already asked for. */
export function useFlexiHolidays(year: number, enabled: boolean) {
  return useQuery({
    queryKey: ["flexi-holidays", year],
    enabled,
    queryFn: async (): Promise<FlexiHolidays | null> => {
      const { data, error } = await supabase.rpc("flexi_holidays", { p_year: year });
      if (error) throw error;
      return (data as unknown as FlexiHolidays | null) ?? null;
    },
  });
}

/**
 * A request nobody decided before its first day is rejected when that day arrives. The database
 * does it every night; asking first means a screen never shows an out-of-date "pending".
 */
export async function closeStaleRequests() {
  try {
    await supabase.rpc("leave_expire_pending");
  } catch {
    /* the nightly job will catch it */
  }
}

/** My leave history, newest first. */
export function useMyLeave(profileId?: string | null) {
  return useQuery({
    queryKey: ["leave-history", profileId ?? "none"],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<LeaveRequest[]> => {
      await closeStaleRequests();
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
  half_part?: HalfPart | null;
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
          ...(input.half_day && input.half_part ? { half_part: input.half_part } : {}),
          reason: input.reason || null,
          handover_to: input.handover_to,
          handover_task_ids: input.handover_to ? (input.handover_task_ids ?? []) : [],
        })
        .select("*")
        .single();
      if (error) throw error;

      // Telling the approver is a courtesy — it must not hold the button.
      void (async () => {
        const { data: me } = await supabase
          .from("profiles")
          .select("full_name, manager_id")
          .eq("id", profileId)
          .maybeSingle();
        if (!me?.manager_id) return;
        notifyByEmail({
          kind: "leave_raised",
          profileIds: [me.manager_id],
          title: `${me.full_name} has asked for leave`,
          body: `${TYPE_LABEL[input.type] ?? input.type} from ${input.from_date} to ${input.to_date}. It's waiting for your decision.`,
          link: "/approvals",
        });
      })();
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leave-balances"] });
      void qc.invalidateQueries({ queryKey: ["leave-history"] });
      void qc.invalidateQueries({ queryKey: ["leave-pending"] });
      void qc.invalidateQueries({ queryKey: ["flexi-holidays"] });
    },
  });
}

function refreshLeave(qc: QueryClient) {
  for (const key of [
    "leave-balances",
    "leave-history",
    "leave-pending",
    "flexi-holidays",
    "leave-check",
  ])
    void qc.invalidateQueries({ queryKey: [key] });
}

export interface EditInput {
  id: string;
  type: LeaveType;
  from_date: string;
  to_date: string;
  half_day: boolean;
  half_part: HalfPart | null;
  reason: string;
}

/** Change my own pending request. The approver is told. */
export function useEditLeave(myName?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditInput) => {
      const { data, error } = await supabase.rpc("leave_edit", {
        p_id: input.id,
        p_type: input.type,
        p_from: input.from_date,
        p_to: input.to_date,
        p_half: input.half_day,
        ...(input.half_day && input.half_part ? { p_half_part: input.half_part } : {}),
        p_reason: input.reason,
      });
      if (error) throw error;
      const r = data as unknown as { changed: boolean; approver_id: string | null };
      if (r.changed && r.approver_id) {
        notifyByEmail({
          kind: "leave_raised",
          profileIds: [r.approver_id],
          title: `${myName ?? "Somebody"} changed a leave request`,
          body: `It is now ${TYPE_LABEL[input.type] ?? input.type} from ${input.from_date} to ${input.to_date}. It's waiting for your decision.`,
          link: "/approvals",
        });
      }
      return r;
    },
    onSettled: () => refreshLeave(qc),
  });
}

/** Cancel my own pending request. It stays in the history as cancelled. */
export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("leave_cancel", { p_id: id });
      if (error) throw error;
    },
    onSettled: () => refreshLeave(qc),
  });
}

/** Remind the approver, at most once in 24 hours. */
export function useRemindLeave(myName?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: LeaveRequest) => {
      const { data, error } = await supabase.rpc("leave_send_reminder", { p_id: r.id });
      if (error) throw error;
      if (data) {
        notifyByEmail({
          kind: "leave_raised",
          profileIds: [data],
          title: `Reminder: ${myName ?? "Somebody"}'s leave request is waiting`,
          body: `${TYPE_LABEL[r.type] ?? r.type} from ${r.from_date} to ${r.to_date}. Please approve or reject it.`,
          link: "/approvals",
        });
      }
    },
    onSettled: () => refreshLeave(qc),
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
      await closeStaleRequests();
      const { data, error } = await supabase
        .from("leave_requests")
        .select(
          "*, applicant:profiles!leave_requests_profile_id_fkey(id, full_name, title, department)",
        )
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
    mutationFn: async (args: { request: LeaveRequest; status: "approved" | "rejected" }) => {
      const { data: row, error } = await supabase
        .from("leave_requests")
        .update({
          status: args.status,
          decided_at: new Date().toISOString(),
          decided_by: deciderId ?? null,
        })
        .eq("id", args.request.id)
        // decide exactly what was on the screen: it may have been edited or cancelled since
        .eq("status", "pending")
        .eq("type", args.request.type)
        .eq("from_date", args.request.from_date)
        .eq("to_date", args.request.to_date)
        .eq("half_day", args.request.half_day)
        .select("profile_id, type, from_date, to_date")
        .maybeSingle();
      if (error) throw error;
      if (!row) {
        throw new Error(
          "This request was changed, cancelled or already decided. Look at it again before deciding.",
        );
      }
      notifyByEmail({
        kind: "leave_decided",
        profileIds: [row.profile_id],
        title: `Your leave was ${args.status}`,
        body: `${TYPE_LABEL[row.type] ?? row.type} from ${row.from_date} to ${row.to_date} was ${args.status}.`,
        link: "/leave",
      });
    },
    // The decision is final the moment it is pressed — drop it off the list now.
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ["leave-pending"] });
      const snapshot = qc.getQueriesData<PendingRequest[]>({ queryKey: ["leave-pending"] });
      for (const [key, rows] of snapshot) {
        if (!rows) continue;
        qc.setQueryData<PendingRequest[]>(
          key,
          rows.filter((r) => r.id !== args.request.id),
        );
      }
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      // said here, not on the card: the card may already be gone from the list
      toast.error((error as { message?: string }).message ?? "That decision wasn't allowed.");
      for (const [key, rows] of context?.snapshot ?? []) qc.setQueryData(key, rows);
      void qc.invalidateQueries({ queryKey: ["leave-pending"] });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leave-pending"] });
      void qc.invalidateQueries({ queryKey: ["leave-balances"] });
      void qc.invalidateQueries({ queryKey: ["leave-history"] });
      void qc.invalidateQueries({ queryKey: ["flexi-holidays"] });
    },
  });
}
