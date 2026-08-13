import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface GoalReview {
  verdict: string;
  trackable: string;
  target: string;
  shape: string;
  stages: string[];
}

interface Input {
  kind: "number" | "funnel";
  name: string;
  metric: string;
  unit: string;
  baseline: string;
  target: string;
  stages: string[];
  cycleStart: string;
  cycleEnd: string;
}

/** Reviews a goal a person is writing. Suggests only — never rewrites or saves. */
export const checkGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!input?.name?.trim()) throw new Error("Give the goal a name first.");
    return input;
  })
  .handler(async ({ data, context }): Promise<GoalReview> => {
    const { supabase, userId } = context;
    const { askAi, parseJson, AiUnavailable } = await import("@/lib/ai.server");

    const { data: me } = await supabase
      .from("profiles")
      .select("department, title")
      .eq("auth_user_id", userId)
      .maybeSingle();

    const system =
      `You are a warm, direct coach at CoachEasily, an online coaching company in Mumbai. A warrior is writing a goal for a work cycle. ` +
      `Review it against what makes a goal genuinely trackable: is the metric countable every day, is the target realistic against the baseline and the days left in the cycle, ` +
      `and would a funnel (2–5 stages) serve them better than one number. ` +
      `Be specific and kind, in plain English, second person. Never rewrite their goal — suggest, they decide. Two sentences per field, maximum.\n` +
      `Return JSON only: {"verdict":"","trackable":"","target":"","shape":"","stages":["stage","stage","stage"]}. ` +
      `"stages" is a suggested funnel for their department (empty array if a single number is genuinely the right shape).`;

    const user = JSON.stringify({
      person: { department: me?.department ?? null, title: me?.title ?? null },
      goal: {
        kind: data.kind,
        name: data.name,
        metric: data.metric,
        unit: data.unit,
        baseline: data.baseline,
        target: data.target,
        stages: data.stages.filter((s) => s.trim()),
      },
      cycle: { start: data.cycleStart, end: data.cycleEnd },
    });

    let raw = "";
    try {
      raw = await askAi([
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
    } catch (e) {
      if (e instanceof AiUnavailable) throw new Error(e.message);
      throw e;
    }

    const p = parseJson<Partial<GoalReview>>(raw, {});
    const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 400) : "");
    return {
      verdict: text(p.verdict),
      trackable: text(p.trackable),
      target: text(p.target),
      shape: text(p.shape),
      stages: Array.isArray(p.stages)
        ? p.stages.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 5)
        : [],
    };
  });
