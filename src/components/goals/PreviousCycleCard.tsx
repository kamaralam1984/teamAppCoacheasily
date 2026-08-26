import { useEffect, useRef, useState } from "react";

import { useGoalsFor, useLogEntry } from "@/hooks/useGoals";
import { fmt, type Cycle, type GoalWithProgress } from "@/lib/goals";
import { shortDate } from "@/lib/warriors";

import { GoalForm, draftFromGoal, type GoalDraft } from "./GoalForm";

export function PreviousCycleCard({
  cycle,
  profileId,
  orgId,
  department,
  onCarryForward,
  style,
}: {
  cycle: Cycle;
  profileId: string;
  orgId: string;
  department: string | null;
  onCarryForward: (draft: GoalDraft) => void;
  style?: React.CSSProperties;
}) {
  const { data } = useGoalsFor(profileId, cycle.id);
  const [editing, setEditing] = useState<{ goalId: string; draft: GoalDraft } | null>(null);
  const goals: GoalWithProgress[] = data ?? [];
  if (goals.length === 0) return null;

  /* Every figure comes from goal_progress — including how many days were recorded. */
  const recorded = goals.filter((g) => (g.progress?.entries_count ?? 0) > 0);
  const missing = goals.length - recorded.length;
  const avg =
    recorded.length === 0
      ? null
      : Math.round(
          (recorded.reduce((s, g) => s + (g.progress?.pct ?? 0), 0) / recorded.length) * 10,
        ) / 10;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <p className="ce-label">Before you write the new one, close off the old one</p>
      <h2 className="mt-1 font-display text-2xl text-ink">
        Last cycle — {cycle.name}
      </h2>
      <p className="mt-1 text-[13px] text-soft">
        {shortDate(cycle.start_date)} → {shortDate(cycle.end_date)} · {goals.length}{" "}
        {goals.length === 1 ? "goal" : "goals"}
        {missing > 0 ? ` · ${missing} still to record` : ""} ·{" "}
        {avg === null
          ? "no numbers recorded yet"
          : `${avg}% achieved on average across the ${recorded.length} recorded`}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink">
        Whatever you put here becomes the record for that cycle, so it is worth getting right
        today. The closing number is saved against {shortDate(cycle.end_date)}.
      </p>

      <ul className="mt-4 space-y-3">
        {goals.map(({ goal, progress }) => (
          <li
            key={goal.id}
            className={`rounded-[12px] border p-3 ${
              editing?.goalId === goal.id
                ? "border-gold bg-gold/8 ring-2 ring-gold/40"
                : "border-line bg-cream/50"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-bold text-ink">{goal.name}</p>
              <span className="text-[12px] font-bold text-goldD">
                {(progress?.entries_count ?? 0) > 0 ? `${fmt(progress?.pct ?? 0)}%` : "not recorded"}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-soft">
              {fmt(goal.baseline)} → {fmt(progress?.current_value ?? goal.baseline)} → target{" "}
              {fmt(goal.target)} {goal.unit ?? ""}
            </p>
            {goal.learnings ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink">“{goal.learnings}”</p>
            ) : null}

            <ClosingNumber goal={goal} progress={progress} endDate={cycle.end_date} />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="min-h-11 rounded-full border border-line bg-ivory px-3 text-[12px] font-bold text-goldD"
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
                Use this again next cycle →
              </button>
              <button
                type="button"
                className="text-[12px] font-bold text-soft underline"
                onClick={() =>
                  setEditing(
                    editing?.goalId === goal.id
                      ? null
                      : {
                          goalId: goal.id,
                          draft: draftFromGoal(
                            goal,
                            progress?.entries_count ?? 0,
                            progress?.current_value ?? undefined,
                          ),
                        },
                  )
                }
              >
                {editing?.goalId === goal.id ? "Close" : "Fix this goal"}
              </button>
            </div>

            {editing?.goalId === goal.id ? (
              <ScrollTo className="mt-4">
                <GoalForm
                  cycle={cycle}
                  profileId={profileId}
                  orgId={orgId}
                  department={department}
                  initial={editing.draft}
                  onDone={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              </ScrollTo>
            ) : null}
          </li>
        ))}
      </ul>

    </section>
  );
}

/** Brings freshly-opened panels into view so the click never feels dead. */
function ScrollTo({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Where did you actually finish? Saved against the cycle's end date, never today. */
function ClosingNumber({
  goal,
  progress,
  endDate,
}: {
  goal: GoalWithProgress["goal"];
  progress: GoalWithProgress["progress"];
  endDate: string;
}) {
  const log = useLogEntry();
  const isFunnel = goal.kind === "funnel" && (goal.stages?.length ?? 0) > 0;
  const stages = isFunnel ? (goal.stages ?? []) : [];

  const [single, setSingle] = useState<string>(
    (progress?.entries_count ?? 0) > 0 && progress?.current_value !== undefined
      ? String(progress.current_value)
      : "",
  );
  const [counts, setCounts] = useState<string[]>(
    stages.map((_, i) => {
      const t = progress?.totals?.[i];
      return t === undefined || t === null ? "" : String(t);
    }),
  );
  const [done, setDone] = useState(false);

  const save = () => {
    setDone(false);
    if (isFunnel) {
      log.mutate(
        { goalId: goal.id, date: endDate, counts: counts.map((c) => Number(c) || 0) },
        { onSuccess: () => setDone(true) },
      );
      return;
    }
    if (single.trim() === "") return;
    log.mutate(
      { goalId: goal.id, date: endDate, value: Number(single) },
      { onSuccess: () => setDone(true) },
    );
  };

  return (
    <div className="mt-3 rounded-[10px] border border-line bg-ivory p-3">
      <p className="ce-label">Where did you actually finish?</p>
      {isFunnel ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {stages.map((s, i) => (
            <label key={`${goal.id}-${s}-${i}`} className="block">
              <span className="text-[12px] font-semibold text-soft">{s}</span>
              <input
                type="number"
                inputMode="numeric"
                className="ce-input mt-1 h-11 w-28"
                value={counts[i] ?? ""}
                onChange={(e) =>
                  setCounts((cur) => {
                    const next = [...cur];
                    next[i] = e.target.value;
                    return next;
                  })
                }
              />
            </label>
          ))}
        </div>
      ) : (
        <input
          type="number"
          inputMode="decimal"
          className="ce-input mt-2 h-11 w-40"
          value={single}
          onChange={(e) => setSingle(e.target.value)}
          placeholder={`Closing ${goal.unit ?? "number"}`}
        />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn3d min-h-11 px-4 text-[12px]"
          disabled={log.isPending}
          onClick={save}
        >
          {log.isPending ? "Saving…" : "Save closing number"}
        </button>
        {done ? <span className="text-[12px] font-bold text-emer">Saved</span> : null}
        {log.isError ? (
          <span className="text-[12px] font-bold text-soft">
            Could not save. Try once more.
          </span>
        ) : null}
      </div>
    </div>
  );
}
