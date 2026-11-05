import { dayLabel } from "@/lib/goals";
import { mondayOf, niceTicks, type GoalChartData } from "@/lib/goalCharts";

/* Strategic meeting goals are written in words: "200+", "105% Achieved", a note each week. So these
   charts count only what can be counted without guessing: a percentage someone actually wrote, and
   whether an update or outcome has been written at all. */

export interface MeetingGoalRow {
  id: string;
  title: string;
  outcome: string | null;
}

export interface MeetingUpdateRow {
  goal_id: string;
  week_start: string;
  note: string;
}

export interface WeekGoalRow {
  title: string;
  outcome: string | null;
  week_start: string | null;
}

export type MeetingChartData = GoalChartData & { barTicks: number[] };

export interface WeekProgress {
  label: string;
  /** a share of that week's goals, whole numbers only */
  pct: number;
}

/** The first percentage written in an outcome, or null when it has none: "105% Achieved" is 105. */
export function outcomePercent(outcome: string | null): number | null {
  const match = outcome?.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

const written = (text: string | null | undefined) => Boolean(text?.trim());

/** A row added to the table but not filled in yet is not a goal to report on. */
const hasTitle = (g: { title: string }) => written(g.title);

function outcomeBars(goals: MeetingGoalRow[]) {
  // numbered as in the table, so "3" here is row 3 there
  return goals.flatMap((g, i) => {
    const value = outcomePercent(g.outcome);
    return value === null ? [] : [{ label: String(i + 1), value }];
  });
}

function shared(goals: MeetingGoalRow[]) {
  const bars = outcomeBars(goals);
  return {
    hasEntries: true,
    barUnit: "%",
    barTitle: "Outcome % by goal No.",
    barPrefix: "Goal",
    barEmpty: "Write a percentage in Outcome, like 105%, and it shows here.",
    bars,
    barTicks: niceTicks([100, ...bars.map((b) => b.value)]),
    unit: "",
  };
}

/** The 45-day table: updates written each week, and this week's so far. */
export function runCharts(
  goals: MeetingGoalRow[],
  updates: MeetingUpdateRow[],
  weeks: string[],
  thisWeek: string | null,
  today: string,
): MeetingChartData {
  const real = goals.filter(hasTitle);
  const ids = new Set(real.map((g) => g.id));
  const countFor = (week: string) =>
    updates.filter((u) => u.week_start === week && ids.has(u.goal_id) && written(u.note)).length;

  const reached = mondayOf(today);
  const line = weeks
    .filter((w) => w <= reached)
    .map((w) => ({ label: dayLabel(w), value: countFor(w) }));
  const doneThisWeek = thisWeek ? countFor(thisWeek) : 0;

  return {
    ...shared(goals),
    lineTitle: "Updates written each week",
    line,
    lineTicks: niceTicks([real.length, ...line.map((p) => p.value)], true),
    target: real.length,
    targetLabel: `All ${real.length}`,
    roundTitle: "This week",
    roundEmpty: "No goals written yet.",
    donut:
      real.length > 0 && thisWeek
        ? {
            subtitle: `Updates for the week of ${dayLabel(thisWeek)}`,
            centreValue: `${doneThisWeek}/${real.length}`,
            centreLabel: "updates written",
            slices: [
              { label: "Written", value: doneThisWeek },
              { label: "Not written yet", value: real.length - doneThisWeek, quiet: true },
            ],
            note: null,
          }
        : null,
  };
}

/** One week's table: how many of each week's goals have an outcome, and this week's split. */
export function weekCharts(
  goals: MeetingGoalRow[],
  allWeekGoals: WeekGoalRow[],
  weeks: string[],
  weekStart: string,
  today: string,
): MeetingChartData {
  const real = goals.filter(hasTitle);
  const done = real.filter((g) => written(g.outcome)).length;
  const reached = mondayOf(today);
  const line = weeks
    .filter((w) => w <= reached || w === weekStart)
    .map((w) => ({
      label: dayLabel(w),
      value: allWeekGoals.filter((g) => g.week_start === w && hasTitle(g) && written(g.outcome))
        .length,
    }));

  return {
    ...shared(goals),
    lineTitle: "Weekly goals with an outcome",
    line,
    lineTicks: niceTicks(
      line.map((p) => p.value),
      true,
    ),
    target: null,
    targetLabel: null,
    roundTitle: `Week of ${dayLabel(weekStart)}`,
    roundEmpty: "No goals written for this week yet.",
    donut:
      real.length > 0
        ? {
            subtitle: "This week's goals",
            centreValue: `${done}/${real.length}`,
            centreLabel: "outcomes written",
            slices: [
              { label: "Outcome written", value: done },
              { label: "No outcome yet", value: real.length - done, quiet: true },
            ],
            note: null,
          }
        : null,
  };
}

const share = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

/** The 45-day table: for each week so far, how many of the goals have an update written. */
export function runProgress(
  goals: MeetingGoalRow[],
  updates: MeetingUpdateRow[],
  weeks: string[],
  today: string,
): WeekProgress[] {
  const real = goals.filter(hasTitle);
  const ids = new Set(real.map((g) => g.id));
  const reached = mondayOf(today);
  return weeks
    .filter((w) => w <= reached)
    .map((w) => ({
      label: dayLabel(w),
      pct: share(
        updates.filter((u) => u.week_start === w && ids.has(u.goal_id) && written(u.note)).length,
        real.length,
      ),
    }));
}

/** The weekly tables: for each week so far, how many of that week's goals have an outcome. */
export function weekProgress(
  allWeekGoals: WeekGoalRow[],
  weeks: string[],
  weekStart: string,
  today: string,
): WeekProgress[] {
  const reached = mondayOf(today);
  return weeks
    .filter((w) => w <= reached || w === weekStart)
    .map((w) => {
      const rows = allWeekGoals.filter((g) => g.week_start === w && hasTitle(g));
      return {
        label: dayLabel(w),
        pct: share(rows.filter((g) => written(g.outcome)).length, rows.length),
      };
    });
}
