import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  fixedHolidays,
  LUNAR_NOTE,
  mergeSuggestions,
  normalizePublicApi,
  type HolidaySuggestion,
} from "@/lib/holidaySuggestions";

export interface HolidaySuggestions {
  year: number;
  country: string;
  region: string | null;
  items: HolidaySuggestion[];
  /** where the list came from, and anything HR should know */
  notes: string[];
}

/**
 * Holidays the app can suggest for a year, from the organisation's country and region
 * (settings holiday_country, holiday_region). HR / admin only. Nothing is saved: the person
 * picks which ones to propose, and approves them afterwards.
 */
export const suggestHolidays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { year: number }) => {
    const year = Math.trunc(Number(input?.year));
    if (!Number.isFinite(year) || year < 2000 || year > 2100) throw new Error("Pick a year.");
    return { year };
  })
  .handler(async ({ data, context }): Promise<HolidaySuggestions> => {
    const { supabase, userId } = context;
    const { data: me, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!me || (me.role !== "hr" && me.role !== "admin")) throw new Error("Forbidden");

    const { data: settings } = await supabase.rpc("org_settings");
    const s = (settings ?? {}) as { holiday_country?: string; holiday_region?: string };
    const country = (s.holiday_country ?? "IN").toUpperCase();
    const region = s.holiday_region?.trim() ? s.holiday_region.trim().toUpperCase() : null;

    const notes: string[] = [];
    let fromApi: HolidaySuggestion[] = [];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${data.year}/${country}`,
        {
          signal: controller.signal,
        },
      );
      clearTimeout(timer);
      if (res.status === 200) {
        fromApi = normalizePublicApi(await res.json(), country, region);
        if (fromApi.length > 0) notes.push("Public holiday list for your country.");
      }
    } catch {
      notes.push(
        "The public holiday service could not be reached, so only the built-in dates are shown.",
      );
    }

    const builtIn = fixedHolidays(country, region, data.year);
    if (builtIn.length > 0) notes.push("Fixed-date holidays built into the app.");
    notes.push(LUNAR_NOTE);

    return {
      year: data.year,
      country,
      region,
      items: mergeSuggestions(fromApi, builtIn),
      notes,
    };
  });
