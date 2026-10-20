import { describe, it as test } from "node:test";
import { equal, deepEqual } from "node:assert/strict";
import { levelBefore, signed, weekLine, weeklyMovement, type Goal, type GoalEntry } from "./goals";

const entry = (date: string, value: number | null): GoalEntry =>
  ({ id: date, goal_id: "g", date, value, counts: null }) as unknown as GoalEntry;

describe("A number goal's week is the distance its figure travelled", () => {
  // the cycle starts on a Monday, 5 Oct; the figure is a running total
  const entries = [entry("2026-10-06", 3), entry("2026-10-08", 5), entry("2026-10-13", 13)];

  test("the level before a day is the latest figure before it, else the starting number", () => {
    equal(levelBefore(entries, "2026-10-05", 0), 0);
    equal(levelBefore(entries, "2026-10-07", 0), 3);
    equal(levelBefore(entries, "2026-10-14", 0), 13);
  });
  test("a day's own figure is not 'before' it", () => {
    equal(levelBefore(entries, "2026-10-08", 0), 3);
  });
  test("figures logged as a note only are ignored", () => {
    equal(levelBefore([entry("2026-10-06", null)], "2026-10-20", 7), 7);
  });
  test("3, 5 then 13 reads as 5 in the first week and 8 in the second, never as 8 and 13", () => {
    deepEqual(weeklyMovement(entries, "2026-10-05", 0, "2026-10-19"), [
      { start: "2026-10-05", value: 5 },
      { start: "2026-10-12", value: 8 },
      { start: "2026-10-19", value: 0 },
    ]);
  });
  test("a goal that should come down moves negative", () => {
    const down = [entry("2026-10-06", 100), entry("2026-10-13", 75)];
    deepEqual(
      weeklyMovement(down, "2026-10-05", 120, "2026-10-13").map((w) => w.value),
      [-20, -25],
    );
  });
  test("a week with nothing logged did not move", () => {
    deepEqual(
      weeklyMovement([entry("2026-10-06", 4)], "2026-10-05", 0, "2026-10-19").map((w) => w.value),
      [4, 0, 0],
    );
  });
  test("a cycle that has not started has no weeks", () => {
    deepEqual(weeklyMovement([], "2026-11-01", 0, "2026-10-19"), []);
  });
});

describe("Movement is always written with its sign", () => {
  test("signs", () => {
    equal(signed(5), "+5");
    equal(signed(-45), "−45");
    equal(signed(0), "0");
    equal(signed(2.5), "+2.5");
  });
  test("the week line says moved, not a bare total", () => {
    const goal = { kind: "number", unit: "tickets", stages: null } as unknown as Goal;
    const line = weekLine(goal, { week_sum: 8, prev_week_sum: 5 } as never);
    equal(line, "This week: moved +8 tickets · ▲3.0 vs last week");
  });
});
