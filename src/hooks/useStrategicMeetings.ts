import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type StrategicMeeting = Tables<"strategic_meetings">;

/** What HR, admin or a developer fill in for a meeting. */
export interface MeetingInput {
  edition: string | null;
  title: string;
  tagline: string | null;
  meeting_date: string;
  from_time: string | null;
  to_time: string | null;
  location: string | null;
  agenda: string | null;
}

/** "Strategic Meeting 5.0 – The Year-End Impact Summit", or the title alone without an edition. */
export function meetingLabel(m: Pick<StrategicMeeting, "edition" | "title">): string {
  const edition = m.edition?.trim();
  return edition ? `Strategic Meeting ${edition} – ${m.title}` : m.title;
}

/** Every strategic meeting, soonest first. */
export function useStrategicMeetings(enabled = true) {
  return useQuery({
    queryKey: ["strategic-meetings"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StrategicMeeting[]> => {
      const { data, error } = await supabase
        .from("strategic_meetings")
        .select("*")
        .order("meeting_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The next meeting from today, if any. */
export function nextMeeting(meetings: StrategicMeeting[] | undefined, today: string) {
  return (meetings ?? []).find((m) => m.meeting_date >= today) ?? null;
}

/** Meetings change the calendar too. */
export function invalidateMeetings(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["strategic-meetings"] });
  void qc.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("calendar"),
  });
}

/** HR and admin: add or change a meeting. */
export function useSaveMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id?: string; orgId: string; createdBy: string | null; values: MeetingInput }) => {
      if (args.id) {
        const { error } = await supabase.from("strategic_meetings").update(args.values).eq("id", args.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("strategic_meetings")
          .insert({ ...args.values, org_id: args.orgId, created_by: args.createdBy });
        if (error) throw error;
      }
    },
    onSettled: () => invalidateMeetings(qc),
  });
}

/** HR and admin: remove a meeting. */
export function useDeleteMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("strategic_meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => invalidateMeetings(qc),
  });
}
