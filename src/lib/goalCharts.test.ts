import { describe, it as test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import {
  buildGoalCharts,
  cycleWeeks,
  funnelDonut,
  mondayOf,
  niceTicks,
  numberDonut,
} from "./goalCharts";
import type { Goal, GoalEntry, GoalProgress } from "./goals";

const numberGoal = { kind: "number", baseline: 0, target: 20, unit: "calls", stages: null } as Goal;
const funnelGoal = {
  kind: "funnel",
  baseline: 10,
  target: 25,
  unit: null,
  stages: ["Calls", "Connected", "Closed"],
} as unknown as Goal;

const value = (date: string, v: number | null) =>
  ({ id: date, goal_id: "g", date, value: v, counts: null }) as unknown as GoalEntry;
const counts = (date: string, c: number[]) =>
  ({ id: date, goal_id: "g", date, value: null, counts: c }) as unknown as GoalEntry;
const progress = (p: Partial<GoalProgress>) => p as GoalProgress;

describe("Chart weeks are the same Monday-to-Sunday weeks as goal_progress", () => {
  test("any day belongs to its Monday, Sunday included", () => {
    equal(mondayOf("2026-11-02"), "2026-11-02");
    equal(mondayOf("2026-11-06"), "2026-11-02");
    equal(mondayOf("2026-11-08"), "2026-11-02");
  });
  test("a cycle starting mid-week still counts that whole week", () => {
    deepEqual(cycleWeeks("2026-10-22", "2026-11-06"), ["2026-10-19", "2026-10-26", "2026-11-02"]);
  });
});

describe("The line's axis always has room for the target", () => {
  test("a target above every logged figure is on the axis", () => {
    deepEqual(niceTicks([25, 8, 20]), [0, 10, 20, 30]);
  });
  test("marks stay round", () => {
    deepEqual(niceTicks([90, 40, 70]), [0, 25, 50, 75, 100]);
  });
  test("a figure below zero extends the axis down", () => {
    deepEqual(niceTicks([10, -5]), [-5, 0, 5, 10]);
  });
  test("a count never gets a fractional mark", () => {
    deepEqual(niceTicks([1, 0], true), [0, 1]);
    deepEqual(niceTicks([5, 2], true), [0, 2, 4, 6]);
  });
  test("all zeros still draw an axis", () => {
    deepEqual(niceTicks([0, 0]), [0, 0.25, 0.5, 0.75, 1]);
  });
});

describe("A number goal's charts", () => {
  const entries = [value("2026-10-20", 3), value("2026-10-28", 8), value("2026-11-04", 13)];
  const data = buildGoalCharts(numberGoal, null, entries, "2026-10-19", "2026-11-06");

  test("each bar is how far the figure travelled that week, never the figure", () => {
    deepEqual(
      data.bars.map((b) => b.value),
      [3, 5, 5],
    );
  });
  test("the line starts at the baseline and shows where each week closed", () => {
    deepEqual(
      data.line.map((l) => l.value),
      [0, 3, 8, 13],
    );
    equal(data.line[0]!.label, "Start");
  });
  test("a day logged with only a note does not pull the line down", () => {
    const d = buildGoalCharts(
      numberGoal,
      null,
      [value("2026-10-20", 3), value("2026-10-28", null)],
      "2026-10-19",
      "2026-10-29",
    );
    deepEqual(
      d.line.map((l) => l.value),
      [0, 3, 3],
    );
  });
});

describe("A number goal's round chart adds up to the whole journey", () => {
  const donut = (current: number, week: number) =>
    numberDonut(numberGoal, progress({ current_value: current, week_sum: week }))!;
  const values = (current: number, week: number) => donut(current, week).slices.map((s) => s.value);

  test("before, this week and still to go", () => {
    deepEqual(values(13, 5), [8, 5, 7]);
    equal(donut(13, 5).centreValue, "+5");
    equal(donut(13, 5).note, null);
  });
  test("a goal that should come down counts falling as progress", () => {
    const down = { ...numberGoal, baseline: 100, target: 60 } as Goal;
    const d = numberDonut(down, progress({ current_value: 80, week_sum: -5 }))!;
    deepEqual(
      d.slices.map((s) => s.value),
      [15, 5, 20],
    );
    equal(d.note, null);
  });
  test("a step backwards is said in words, and the slices stay whole", () => {
    deepEqual(values(10, -2), [10, 0, 10]);
    equal(donut(10, -2).note, "The number went the wrong way by 2 calls this week.");
  });
  test("a percentage reads as 50%, not 50 %", () => {
    const pct = { ...numberGoal, unit: "%", baseline: 40, target: 90 } as Goal;
    equal(
      numberDonut(pct, progress({ current_value: 70, week_sum: 7 }))!.subtitle,
      "Of the 50% this goal has to travel",
    );
  });
  test("past the target nothing is left to go and no slice is negative", () => {
    deepEqual(values(25, 10), [10, 10, 0]);
  });
  test("a target equal to the baseline has no journey to draw", () => {
    equal(numberDonut({ ...numberGoal, target: 0 } as Goal, null), null);
  });
});

describe("A funnel goal's charts", () => {
  test("bars count the last stage and the line is that week's conversion", () => {
    const d = buildGoalCharts(
      funnelGoal,
      null,
      [counts("2026-10-27", [100, 40, 10]), counts("2026-11-03", [50, 20, 10])],
      "2026-10-26",
      "2026-11-06",
    );
    equal(d.unit, "%");
    equal(d.barTitle, "Closed each week");
    deepEqual(
      d.bars.map((b) => b.value),
      [10, 10],
    );
    deepEqual(
      d.line.map((l) => l.value),
      [10, 10, 20],
    );
  });
  test("a week with nothing at the first stage is a gap, not zero", () => {
    const d = buildGoalCharts(
      funnelGoal,
      null,
      [counts("2026-11-03", [50, 20, 10])],
      "2026-10-26",
      "2026-11-06",
    );
    equal(d.line[1]!.value, null);
  });
  test("the round chart splits the week by where each one stopped", () => {
    const d = funnelDonut(funnelGoal, progress({ week_totals: [100, 40, 10], week_rate: 10 }))!;
    deepEqual(d.slices, [
      { label: "Reached Closed", value: 10 },
      { label: "Stopped at Calls", value: 60 },
      { label: "Stopped at Connected", value: 30 },
    ]);
    equal(d.centreValue, "10%");
  });
  test("an empty week has no round chart", () => {
    equal(funnelDonut(funnelGoal, progress({ week_totals: [0, 0, 0], week_rate: null })), null);
  });
});
