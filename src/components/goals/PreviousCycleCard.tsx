import { useGoalsFor } from "@/hooks/useGoals";
import { fmt, type Cycle, type GoalWithProgress } from "@/lib/goals";
import { shortDate } from "@/lib/warriors";

import type { GoalDraft } from "./GoalForm";

export function PreviousCycleCard({
  cycle,
  profileId,
  onCarryForward,
  style,
}: {
  cycle: Cycle;
  profileId: string;
  onCarryForward: (draft: GoalDraft) => void;
  style?: React.CSSProperties;
}) {
  const { data } = useGoalsFor(profileId, cycle.id);
  const goals: GoalWithProgress[] = data ?? [];
  if (goals.length === 0) return null;

  const avg =
    Math.round(
      (goals.reduce((s, g) => s + (g.progress?.pct ?? 0), 0) / goals.length) * 10,
    ) / 10;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <p className="ce-label">Before you write</p>
      <h2 className="mt-1 font-display text-2xl text-ink">
        Last cycle — {cycle.name}
      </h2>
      <p className="mt-1 text-[13px] text-soft">
        {shortDate(cycle.start_date)} → {shortDate(cycle.end_date)} · {goals.length}{" "}
        {goals.length === 1 ? "goal" : "goals"} · {avg}% achieved on average
      </p>

      <ul className="mt-4 space-y-3">
        {goals.map(({ goal, progress }) => (
          <li key={goal.id} className="rounded-[12px] border border-line bg-cream/50 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-bold text-ink">{goal.name}</p>
              <span className="text-[12px] font-bold text-goldD">
                {fmt(progress?.pct ?? 0)}%
              </span>
            </div>
            <p className="mt-1 text-[13px] text-soft">
              {fmt(goal.baseline)} → {fmt(progress?.current_value ?? goal.baseline)} → target{" "}
              {fmt(goal.target)} {goal.unit ?? ""}
            </p>
            {goal.learnings ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink">“{goal.learnings}”</p>
            ) : null}
            <button
              type="button"
              className="mt-3 min-h-11 rounded-full border border-line bg-ivory px-3 text-[12px] font-bold text-goldD"
              onClick={() =>
                onCarryForward({
                  kind: goal.kind as "number" | "funnel",
                  name: goal.name,
                  metric: goal.metric ?? "",
                  unit: goal.unit ?? "",
                  baseline: String(progress?.current_value ?? goal.baseline),
                  target: "",
                  stages: goal.stages?.length ? goal.stages : ["", "", ""],
                  plan: "",
                  tracksRevenue: Boolean(goal.tracks_revenue),
                })
              }
            >
              Use this again next cycle →
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
