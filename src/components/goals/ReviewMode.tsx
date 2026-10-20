import { useEffect, useMemo, useState } from "react";

import { ProgressNumbers } from "@/components/goals/ProgressNumbers";
import { Ring } from "@/components/goals/Ring";
import { ReviewSummary } from "@/components/goals/ReviewSummary";
import { StepAdvice } from "@/components/goals/StepAdvice";
import { useGoalEntries } from "@/hooks/useGoals";
import {
  addDays,
  dayLabel,
  daysBetween,
  deltaLabel,
  fmt,
  istToday,
  signed,
  weeklyMovement,
  type Cycle,
  type GoalEntry,
  type GoalWithProgress,
} from "@/lib/goals";

export interface ReviewSlide {
  personName: string;
  personTitle: string | null;
  item: GoalWithProgress;
}

/** The Monday screen. Big type, one goal at a time, readable across a Zoom share. */
export function ReviewMode({
  cycle,
  slides,
  onClose,
  showSummary,
}: {
  cycle: Cycle;
  slides: ReviewSlide[];
  onClose: () => void;
  /** managers reviewing their line get the standup read-out draft */
  showSummary?: boolean;
}) {
  const [i, setI] = useState(0);
  const at = Math.min(i, Math.max(slides.length - 1, 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ")
        setI((v) => Math.min(v + 1, slides.length - 1));
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, slides.length]);

  const slide = slides[at];

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-pearl">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-5 sm:px-8 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold tracking-[0.16em] text-soft uppercase">
            Review mode · {cycle.name}
          </p>
          <button
            type="button"
            className="min-h-11 rounded-full border border-line px-4 text-[13px] font-bold text-soft"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {slide ? (
          <Slide key={slide.item.goal.id + String(at)} cycle={cycle} slide={slide} />
        ) : (
          <p className="mt-16 text-center text-lg text-soft">
            Nothing written for this cycle yet.
          </p>
        )}

        {showSummary && slides.length > 0 ? (
          <ReviewSummary slides={slides} cycleName={cycle.name} />
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-8">
          <button
            type="button"
            className="min-h-12 rounded-full border border-line px-5 text-[14px] font-bold text-soft disabled:opacity-40"
            disabled={at === 0}
            onClick={() => setI(at - 1)}
          >
            ← Previous
          </button>
          <span className="text-[13px] font-bold text-soft">
            {slides.length === 0 ? "0 of 0" : `${at + 1} of ${slides.length}`}
          </span>
          <button
            type="button"
            className="btn3d min-h-12"
            disabled={at >= slides.length - 1}
            onClick={() => setI(at + 1)}
          >
            Next →
          </button>
        </div>
        <p className="mt-3 text-center text-[12px] text-soft">
          Use the ← and → arrow keys. Esc closes.
        </p>
      </div>
    </div>
  );
}

interface Bucket {
  start: string;
  label: string;
  value: number;
}

function weeklyTrend(
  entries: GoalEntry[],
  cycleStart: string,
  kind: string,
  stageCount: number,
  baseline: number,
): Bucket[] {
  const today = istToday();
  if (!(kind === "funnel" && stageCount >= 2)) {
    return weeklyMovement(entries, cycleStart, baseline, today).map((w) => ({
      start: w.start,
      label: dayLabel(w.start),
      value: w.value,
    }));
  }
  const out: Bucket[] = [];
  let start = cycleStart;
  let guard = 0;
  while (start <= today && guard < 30) {
    const end = addDays(start, 6);
    const inWeek = entries.filter((e) => e.date >= start && e.date <= end);
    const first = inWeek.reduce((s, e) => s + (e.counts?.[0] ?? 0), 0);
    const last = inWeek.reduce((s, e) => s + (e.counts?.[stageCount - 1] ?? 0), 0);
    const value = first > 0 ? Math.round((last / first) * 1000) / 10 : 0;
    out.push({ start, label: dayLabel(start), value });
    start = addDays(start, 7);
    guard += 1;
  }
  return out;
}

function Slide({ cycle, slide }: { cycle: Cycle; slide: ReviewSlide }) {
  const { goal, progress: p } = slide.item;
  const { data: entries } = useGoalEntries(goal.id, 400);
  const stageCount = goal.stages?.length ?? 0;

  const buckets = useMemo(
    () => weeklyTrend(entries ?? [], cycle.start_date, goal.kind, stageCount, goal.baseline),
    [entries, cycle.start_date, goal.kind, stageCount, goal.baseline],
  );
  const peak = Math.max(1, ...buckets.map((b) => Math.abs(b.value)));

  const thisWeek = goal.kind === "funnel" ? p?.week_rate ?? null : p?.week_sum ?? null;
  const lastWeek = goal.kind === "funnel" ? p?.prev_week_rate ?? null : p?.prev_week_sum ?? null;
  const suffix = goal.kind === "funnel" ? "%" : (goal.unit ?? "");

  return (
    <section className="mt-6">
      <p className="text-[15px] font-bold text-goldD sm:text-lg">
        {slide.personName}
        {slide.personTitle ? ` · ${slide.personTitle}` : ""}
      </p>
      <h2 className="mt-1 font-display text-4xl leading-tight text-ink sm:text-6xl">{goal.name}</h2>
      {goal.metric ? (
        <p className="mt-2 text-[15px] text-soft sm:text-xl">{goal.metric}</p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-6">
        <Ring pct={p?.pct ?? 0} />
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <Stat label="Baseline" value={fmt(goal.baseline)} />
          <span className="text-2xl text-line">→</span>
          <Stat label="Today" value={fmt(p?.current_value ?? goal.baseline)} big />
          <span className="text-2xl text-line">→</span>
          <Stat label="Target" value={fmt(goal.target)} gold />
        </div>
      </div>

      <ProgressNumbers progress={p} big className="mt-5" />

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <div className="ce-card p-5">
          <p className="ce-label">This week vs last week</p>
          <p className="mt-2 font-display text-3xl text-ink sm:text-4xl">
            {thisWeek === null
              ? "—"
              : `${goal.kind === "funnel" ? fmt(thisWeek) : signed(thisWeek)}${suffix ? ` ${suffix}` : ""}`}
          </p>
          <p className="mt-1 text-[15px] font-bold text-soft">
            {deltaLabel(thisWeek, lastWeek) ?? "no numbers last week"}
          </p>
        </div>

        <div className="ce-card p-5">
          <p className="ce-label">Weakest step</p>
          {p?.weakest_step ? (
            <>
              <p className="mt-2 font-display text-2xl leading-tight text-ink sm:text-3xl">
                {p.weakest_step.from} → {p.weakest_step.to}
              </p>
              <p className="mt-1 text-[15px] font-bold text-red">
                {fmt(p.weakest_step.rate)}% · {fmt(p.weakest_step.to_count)} of{" "}
                {fmt(p.weakest_step.from_count)} made it through
              </p>
              <StepAdvice goalId={goal.id} big />
            </>
          ) : (
            <p className="mt-2 text-[15px] text-soft">
              {goal.kind === "funnel" ? "Not enough numbers yet." : "One number — no funnel steps."}
            </p>
          )}
        </div>
      </div>

      <div className="ce-card mt-4 p-5">
        <p className="ce-label">
          Week by week since {cycle.name} began ·{" "}
          {daysBetween(cycle.start_date, istToday())} days in
        </p>
        <div className="mt-4 flex items-end gap-2 sm:gap-3">
          {buckets.map((b) => (
            <div key={b.start} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[12px] font-bold text-ink sm:text-[14px]">
                {b.value === 0 ? "" : goal.kind === "funnel" ? fmt(b.value) : signed(b.value)}
              </span>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-gold to-goldL"
                style={{ height: `${Math.max(6, (Math.abs(b.value) / peak) * 120)}px` }}
              />
              <span className="truncate text-[10px] text-soft sm:text-[12px]">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  big,
  gold,
}: {
  label: string;
  value: string;
  big?: boolean;
  gold?: boolean;
}) {
  return (
    <span className="inline-block">
      <span className="ce-label block">{label}</span>
      <span
        className={`font-display leading-none ${big ? "text-5xl sm:text-7xl" : "text-3xl sm:text-4xl"} ${
          gold ? "text-goldD" : "text-ink"
        }`}
      >
        {value}
      </span>
    </span>
  );
}
