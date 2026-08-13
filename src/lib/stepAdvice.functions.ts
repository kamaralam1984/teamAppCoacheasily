import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface StepAdvice {
  advice: string | null;
  /** true when it came from this week's cache rather than a fresh call */
  cached: boolean;
}

interface Input {
  goalId: string;
  weekStart: string;
}

/**
 * One practical line under the weakest funnel step, written for that
 * department and those actual numbers. Generated once a week and cached.
 */
export const weakestStepAdvice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!input?.goalId) throw new Error("goalId is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.weekStart ?? "")) throw new Error("weekStart is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<StepAdvice> => {
    const { supabase } = context;

    // RLS decides whether this person may see the goal at all.
    const { data: goal, error } = await supabase
      .from("goals")
      .select("id, org_id, profile_id, name, kind, metric, unit, stages")
      .eq("id", data.goalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!goal || goal.kind !== "funnel") return { advice: null, cached: false };

    const { data: hit } = await supabase
      .from("goal_advice")
      .select("advice")
      .eq("goal_id", goal.id)
      .eq("week_start", data.weekStart)
      .maybeSingle();
    if (hit?.advice) return { advice: hit.advice, cached: true };

    const { data: progress } = await supabase.rpc("goal_progress", { p_goal_id: goal.id });
    const p = (progress ?? null) as {
      weakest_step?: { from: string; to: string; from_count: number; to_count: number; rate: number };
      steps?: unknown;
    } | null;
    const weakest = p?.weakest_step;
    if (!weakest) return { advice: null, cached: false };

    const { data: owner } = await supabase
      .from("profiles")
      .select("full_name, title, department")
      .eq("id", goal.profile_id)
      .maybeSingle();

    const { askAi, parseJson, AiUnavailable } = await import("@/lib/ai.server");

    const system =
      `You coach a remote team at CoachEasily, an online coaching company in Mumbai. ` +
      `Given the weakest step in someone's funnel, write ONE practical thing they can do tomorrow — specific to their department, their role and these actual numbers. ` +
      `No generic advice ("work harder", "follow up more"), no jargon, no praise padding. Under 30 words, plain English, second person. ` +
      `Return JSON only: {"advice":""}.`;

    const user = JSON.stringify({
      person: { title: owner?.title ?? null, department: owner?.department ?? null },
      goal: { name: goal.name, metric: goal.metric, unit: goal.unit, stages: goal.stages },
      weakest_step: weakest,
      all_steps: p?.steps ?? null,
    });

    let raw = "";
    try {
      raw = await askAi([
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
    } catch (e) {
      if (e instanceof AiUnavailable) return { advice: null, cached: false };
      throw e;
    }

    const advice = parseJson<{ advice?: unknown }>(raw, {}).advice;
    if (typeof advice !== "string" || !advice.trim()) return { advice: null, cached: false };
    const line = advice.trim().slice(0, 300);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("goal_advice").upsert(
      {
        org_id: goal.org_id,
        goal_id: goal.id,
        week_start: data.weekStart,
        step_key: `${weakest.from}→${weakest.to}`,
        advice: line,
      },
      { onConflict: "goal_id,week_start" },
    );

    return { advice: line, cached: false };
  });
