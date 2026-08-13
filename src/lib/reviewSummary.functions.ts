import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface WeekSummary {
  summary: string;
}

interface Person {
  name: string;
  title: string | null;
  department: string | null;
  goals: {
    name: string;
    kind: string;
    baseline: number;
    current: number;
    target: number;
    pct: number;
    this_week: number | null;
    last_week: number | null;
    weakest_step: { from: string; to: string; rate: number } | null;
  }[];
}

/**
 * A short plain-English read of a manager's team week, to be read aloud in the
 * 11 AM standup. Returned as a draft the manager edits — nothing is saved.
 */
export const teamWeekSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { people: Person[]; cycleName: string }) => {
    if (!Array.isArray(input?.people) || input.people.length === 0)
      throw new Error("No goals to summarise yet.");
    return { people: input.people.slice(0, 30), cycleName: input.cycleName ?? "" };
  })
  .handler(async ({ data, context }): Promise<WeekSummary> => {
    const { supabase, userId } = context;
    const { askAi, parseJson, AiUnavailable } = await import("@/lib/ai.server");

    const { data: me } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!me || !["manager", "hr", "admin"].includes(me.role)) throw new Error("Forbidden");

    const system =
      `You write the manager's 60-second read-out for the 11 AM standup at CoachEasily, an online coaching company in Mumbai. ` +
      `From the team's goal numbers for cycle ${data.cycleName}, write 4 short paragraphs, no headings, no markdown, no bullets, no asterisks: ` +
      `who moved this week, who stalled, which funnel step is leaking most across the team, and the one person worth a quiet conversation (framed with care, never as blame). ` +
      `Plain spoken English, warm and direct, under 160 words in total. Never invent numbers that are not given. ` +
      `Return JSON only: {"summary":""} with the paragraphs separated by \\n\\n.`;

    let raw = "";
    try {
      raw = await askAi([
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ people: data.people }) },
      ]);
    } catch (e) {
      if (e instanceof AiUnavailable) throw new Error(e.message);
      throw e;
    }

    const s = parseJson<{ summary?: unknown }>(raw, {}).summary;
    if (typeof s !== "string" || !s.trim()) throw new Error("The AI helper had nothing useful to say.");
    return { summary: s.replace(/[*#`]/g, "").trim().slice(0, 2000) };
  });
