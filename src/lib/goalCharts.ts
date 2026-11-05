import {
  addDays,
  dayLabel,
  fmt,
  istToday,
  levelBefore,
  signed,
  type Goal,
  type GoalEntry,
  type GoalProgress,
} from "@/lib/goals";

/* What the goal's charts show. Weeks run Monday to Sunday, the same weeks goal_progress() reports, so
   the last bar and the round chart always agree with the "This week" line on the card. */

export interface BarPoint {
  label: string;
  value: number;
}

export interface LinePoint {
  label: string;
  /** null when a funnel had nothing at its first stage that week: a gap, not a zero */
  value: number | null;
}

export interface DonutSlice {
  label: string;
  value: number;
}

export interface WeeklyDonut {
  subtitle: string;
  centreValue: string;
  centreLabel: string;
  slices: DonutSlice[];
  /** said in words because a round chart cannot draw a step backwards */
  note: string | null;
}

export interface GoalChartData {
  hasEntries: boolean;
  /** what the line and the target are measured in */
  unit: string;
  /** what the bars count: a funnel's bars are people or things, its line is a percentage */
  barUnit: string;
  barTitle: string;
  bars: BarPoint[];
  lineTitle: string;
  line: LinePoint[];
  /** the line's axis, always tall enough to hold the target */
  lineTicks: number[];
  target: number;
  donut: WeeklyDonut | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function amount(n: number, unit: string): string {
  if (!unit) return fmt(n);
  return unit === "%" ? `${fmt(n)}%` : `${fmt(n)} ${unit}`;
}

/** Round axis marks covering every value given, from zero unless something is below it. */
export function niceTicks(values: number[]): number[] {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values) || (lo < 0 ? 0 : 1);
  const rough = (hi - lo) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? rough;

  const ticks: number[] = [];
  for (let i = Math.floor(lo / step); i <= Math.ceil(hi / step); i += 1) {
    ticks.push(Math.round(i * step * 1000) / 1000);
  }
  return ticks;
}

function lineTicksFor(line: LinePoint[], target: number): number[] {
  return niceTicks([target, ...line.map((p) => p.value ?? 0)]);
}

export function mondayOf(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

/** Every Monday from the week the cycle began up to this week. */
export function cycleWeeks(cycleStart: string, today: string): string[] {
  const last = mondayOf(today);
  const out: string[] = [];
  for (let w = mondayOf(cycleStart); w <= last && out.length < 60; w = addDays(w, 7)) out.push(w);
  return out;
}

/** The week as a whole journey: done before this week, done this week, still to go. */
export function numberDonut(goal: Goal, p: GoalProgress | null): WeeklyDonut | null {
  const span = Math.abs(goal.target - goal.baseline);
  if (span === 0) return null;
  const direction = goal.target > goal.baseline ? 1 : -1;
  const current = p?.current_value ?? goal.baseline;
  const moved = p?.week_sum ?? 0;

  const done = Math.min(span, Math.max(0, (current - goal.baseline) * direction));
  const thisWeek = Math.min(done, Math.max(0, moved * direction));
  const unit = goal.unit ?? "";

  return {
    subtitle: `Of the ${amount(round1(span), unit)} this goal has to travel`,
    centreValue: signed(round1(moved)),
    centreLabel: "this week",
    slices: [
      { label: "Before this week", value: round1(done - thisWeek) },
      { label: "This week", value: round1(thisWeek) },
      { label: "Still to go", value: round1(span - done) },
    ],
    note:
      moved * direction < 0
        ? `The number went the wrong way by ${amount(round1(Math.abs(moved)), unit)} this week.`
        : null,
  };
}

/** The week's first-stage count, split by where each one stopped. */
export function funnelDonut(goal: Goal, p: GoalProgress | null): WeeklyDonut | null {
  const stages = goal.stages ?? [];
  const n = stages.length;
  if (n < 2) return null;
  const week = stages.map((_, i) => p?.week_totals[i] ?? 0);
  const first = week[0] ?? 0;
  if (first <= 0) return null;

  const stopped = stages.slice(0, -1).map((stage, i) => ({
    label: `Stopped at ${stage}`,
    value: Math.max(0, (week[i] ?? 0) - (week[i + 1] ?? 0)),
  }));

  return {
    subtitle: `Where this week's ${fmt(first)} ${stages[0]!.toLowerCase()} ended up`,
    centreValue: p?.week_rate === null || p?.week_rate === undefined ? "—" : `${fmt(p.week_rate)}%`,
    centreLabel: stages[n - 1]!.toLowerCase(),
    slices: [{ label: `Reached ${stages[n - 1]}`, value: week[n - 1] ?? 0 }, ...stopped],
    note: null,
  };
}

export function buildGoalCharts(
  goal: Goal,
  progress: GoalProgress | null,
  entries: GoalEntry[],
  cycleStart: string,
  today = istToday(),
): GoalChartData {
  const weeks = cycleWeeks(cycleStart, today);
  const start: LinePoint = { label: "Start", value: goal.baseline };

  if (goal.kind === "funnel") {
    const stages = goal.stages ?? [];
    const lastStage = stages.length - 1;
    const countsIn = (week: string, stage: number) =>
      entries
        .filter((e) => e.date >= week && e.date < addDays(week, 7))
        .reduce((sum, e) => sum + (e.counts?.[stage] ?? 0), 0);

    const line = [
      start,
      ...weeks.map((w) => {
        const top = countsIn(w, 0);
        return {
          label: dayLabel(w),
          value: top > 0 ? round1((countsIn(w, lastStage) / top) * 100) : null,
        };
      }),
    ];

    return {
      hasEntries: entries.length > 0,
      unit: "%",
      barUnit: "",
      barTitle: `${stages[lastStage] ?? "Result"} each week`,
      bars: weeks.map((w) => ({ label: dayLabel(w), value: countsIn(w, lastStage) })),
      lineTitle: "Conversion each week",
      line,
      lineTicks: lineTicksFor(line, goal.target),
      target: goal.target,
      donut: funnelDonut(goal, progress),
    };
  }

  const closing = (week: string) => levelBefore(entries, addDays(week, 7), goal.baseline);
  const line = [start, ...weeks.map((w) => ({ label: dayLabel(w), value: round1(closing(w)) }))];
  return {
    hasEntries: entries.length > 0,
    unit: goal.unit ?? "",
    barUnit: goal.unit ?? "",
    barTitle: "Moved each week",
    bars: weeks.map((w) => ({
      label: dayLabel(w),
      value: round1(closing(w) - levelBefore(entries, w, goal.baseline)),
    })),
    lineTitle: "Where the number stands",
    line,
    lineTicks: lineTicksFor(line, goal.target),
    target: goal.target,
    donut: numberDonut(goal, progress),
  };
}
