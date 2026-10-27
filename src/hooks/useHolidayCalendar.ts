import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { suggestHolidays } from "@/lib/holidays.functions";

export type CalendarHoliday = Tables<"holiday_calendar">;

export const HOLIDAY_KINDS = ["national", "regional", "company", "optional", "restricted"] as const;
export type HolidayKind = (typeof HOLIDAY_KINDS)[number];

export const KIND_LABEL: Record<HolidayKind, string> = {
  national: "National",
  regional: "Regional",
  company: "Company",
  optional: "Flexi",
  restricted: "Restricted",
};

/** Days off for everyone. Optional and restricted holidays are listed, but nobody is forced off. */
export function isDayOff(kind: string): boolean {
  return kind === "national" || kind === "regional" || kind === "company";
}

/** The whole calendar. Members see approved holidays; HR and admin also see proposals. */
export function useHolidayCalendar() {
  return useQuery({
    queryKey: ["holiday-calendar"],
    queryFn: async (): Promise<CalendarHoliday[]> => {
      const { data, error } = await supabase
        .from("holiday_calendar")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      "holiday-calendar",
      "holidays-all",
      "holidays",
      "calendar",
      "calendar-next-30",
      "calendar-year",
      "host-conflicts",
    ]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export interface NewHoliday {
  date: string;
  name: string;
  kind: HolidayKind;
  status?: "proposed" | "approved";
  region?: string | null;
  source?: "manual" | "suggested";
}

export function useAddCalendarHolidays(orgId?: string | null) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (items: NewHoliday[]) => {
      if (!orgId) throw new Error("Your profile isn't set up yet.");
      const { error } = await supabase.from("holiday_calendar").insert(
        items.map((h) => ({
          org_id: orgId,
          date: h.date,
          name: h.name.trim(),
          kind: h.kind,
          status: h.status ?? "approved",
          region: h.region ?? null,
          source: h.source ?? "manual",
        })),
      );
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useUpdateCalendarHoliday() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Pick<CalendarHoliday, "name" | "date" | "kind" | "status" | "region">>;
    }) => {
      const { error } = await supabase
        .from("holiday_calendar")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useRemoveCalendarHoliday() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("holiday_calendar").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

/** Suggestions for a year from the organisation's country and region. Nothing is saved. */
export function useHolidaySuggestions() {
  const suggest = useServerFn(suggestHolidays);
  return useMutation({ mutationFn: async (year: number) => suggest({ data: { year } }) });
}
