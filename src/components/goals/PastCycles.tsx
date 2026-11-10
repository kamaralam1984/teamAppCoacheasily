import { useMemo, useState } from "react";

import { useGoalsFor } from "@/hooks/useGoals";
import { fmt, type Cycle, type GoalWithProgress } from "@/lib/goals";
import { scoreTone } from "@/lib/reports";
import { shortDate } from "@/lib/warriors";

import type { GoalDraft } from "./GoalForm";

/** Every finished cycle, one at a time, read only. The record stays as it was written. */
export function PastCycles({
  cycles,
  profileId,
  onCarryForward,
  style,
}: {
  cycles: Cycle[];
  profileId: string;
  /** offered only while a cycle is open to carry a goal into */
  onCarryForward?: ((draft: GoalDraft) => void) | undefined;
  style?: React.CSSProperties;
}) {
  // newest first, so the dropdown opens on the cycle that just ended
  const closed = useMemo(
    () =>
      cycles
        .filter((c) => c.status !== "active")
        .slice()
        .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [cycles],
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const cycle = closed.find((c) => c.id === pickedId) ?? closed[0] ?? null;

  const { data, isLoading } = useGoalsFor(profileId, cycle?.id ?? null);
  const goals: GoalWithProgress[] = data ?? [];

  if (!cycle) return null;

  const recorded = goals.filter((g) => (g.progress?.entries_count ?? 0) > 0);
  const avg =
    recorded.length === 0
      ? null
      : Math.round(recorded.reduce((s, g) => s + (g.progress?.pct ?? 0), 0) / recorded.length);

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <p className="ce-label">Read only</p>
      <h2 className="mt-1 font-display text-2xl text-ink">Past cycles</h2>
      <p className="mt-1 text-[13px] text-soft">
        Pick any finished cycle to see the goals you wrote in it and where you ended.
      </p>

      <label className="mt-4 block">
        <span className="ce-label">Cycle</span>
        <select
          className="ce-input mt-1"
          value={cycle.id}
          onChange={(e) => setPickedId(e.target.value)}
        >
          {closed.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {shortDate(c.start_date)} – {shortDate(c.end_date)}
            </option>
          ))}
        </select>
      </label>

      {isLoading ? (
        <p className="mt-5 text-sm text-soft">Opening the record…</p>
      ) : goals.length === 0 ? (
        <p className="mt-5 rounded-[14px] bg-cream px-4 py-4 text-sm text-soft">
          You wrote no goals in {cycle.name}.
        </p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3 rounded-[14px] bg-cream/60 p-4 text-center">
            <Stat label="Goals" value={String(goals.length)} />
            <Stat label="Recorded" value={`${recorded.length} of ${goals.length}`} />
            <Stat
              label="Average"
              value={avg === null ? "—" : `${avg}%`}
              tone={avg === null ? "text-soft" : scoreTone(avg)}
            />
          </div>

          <ul className="mt-4 space-y-3">
            {goals.map(({ goal, progress }) => {
              const days = progress?.entries_count ?? 0;
              const pct = days > 0 ? (progress?.pct ?? 0) : null;
              return (
                <li key={goal.id} className="rounded-[14px] border border-line p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[15px] font-bold text-ink">{goal.name}</p>
                    <span
                      className={`font-display text-2xl ${pct === null ? "text-soft" : scoreTone(pct)}`}
                    >
                      {pct === null ? "—" : `${Math.round(pct)}%`}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-soft">
                    {goal.kind === "funnel"
                      ? (goal.stages ?? []).join(" → ")
                      : `${goal.metric || "Number"}${goal.unit ? ` · ${goal.unit}` : ""}`}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-cream">
                    <div
                      className="h-full rounded-full bg-emer"
                      style={{ width: `${Math.min(100, Math.max(2, pct ?? 0))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[13px] text-soft">
                    Started {fmt(goal.baseline)} → ended{" "}
                    {days > 0 ? fmt(progress?.current_value ?? goal.baseline) : "not recorded"} →
                    target {fmt(goal.target)} {goal.unit ?? ""}
                  </p>
                  <p className="mt-0.5 text-[12px] text-soft">
                    {days} {days === 1 ? "day" : "days"} of numbers logged
                  </p>
                  {goal.plan ? (
                    <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-ink">
                      <span className="font-bold">Plan: </span>
                      {goal.plan}
                    </p>
                  ) : null}
                  {goal.learnings ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-ink">
                      <span className="font-bold">Learnings: </span>“{goal.learnings}”
                    </p>
                  ) : null}
                  {onCarryForward ? (
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
                          target: String(goal.target),
                          stages: goal.stages?.length ? goal.stages : ["", "", ""],
                          plan: "",
                          tracksRevenue: Boolean(goal.tracks_revenue),
                        })
                      }
                    >
                      Use this again this cycle →
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className={`font-display text-2xl ${tone ?? "text-ink"}`}>{value}</p>
      <p className="text-[12px] font-semibold text-soft">{label}</p>
    </div>
  );
}
