import { describe, it as test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import {
  outcomePercent,
  runCharts,
  runProgress,
  weekCharts,
  weekProgress,
} from "./meetingGoalCharts";

const goal = (id: string, title: string, outcome: string | null = null) => ({ id, title, outcome });
const note = (goal_id: string, week_start: string, text: string) => ({
  goal_id,
  week_start,
  note: text,
});

const WEEKS = ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"];
const TODAY = "2026-11-06";

describe("Only a percentage someone wrote counts as a percentage", () => {
  test("it is read out of the words around it", () => {
    equal(outcomePercent("105% Achieved"), 105);
    equal(outcomePercent("reached 82.5 %"), 82.5);
  });
  test("a bare number is not guessed at", () => {
    equal(outcomePercent("200+"), null);
    equal(outcomePercent("done"), null);
    equal(outcomePercent(null), null);
  });
});

describe("The 45-day charts", () => {
  const goals = [
    goal("a", "Show up rate", "105% Achieved"),
    goal("b", "Calls", "200+"),
    goal("c", "Ads", "60%"),
  ];
  const updates = [
    note("a", "2026-10-19", "good start"),
    note("a", "2026-11-02", "held"),
    note("b", "2026-11-02", "behind"),
    note("c", "2026-10-26", "   "),
  ];
  const data = runCharts(goals, updates, WEEKS, "2026-11-02", TODAY);

  test("bars keep the table's row number and skip outcomes with no percentage", () => {
    deepEqual(data.bars, [
      { label: "1", value: 105 },
      { label: "3", value: 60 },
    ]);
  });
  test("the line counts written updates, ignores blanks and stops at this week", () => {
    deepEqual(
      data.line.map((p) => p.value),
      [1, 0, 2],
    );
  });
  test("the round chart is this week's written against the rest", () => {
    deepEqual(data.donut?.slices, [
      { label: "Written", value: 2 },
      { label: "Not written yet", value: 1, quiet: true },
    ]);
    equal(data.donut?.centreValue, "2/3");
  });
  test("the line's target is every goal, and it fits on the axis", () => {
    equal(data.target, 3);
    equal(data.targetLabel, "All 3");
    equal(Math.max(...data.lineTicks) >= 3, true);
  });
  test("a row not filled in yet is not counted, but numbering still matches the table", () => {
    const d = runCharts(
      [goal("x", "  "), goal("y", "Real", "50%")],
      [],
      WEEKS,
      "2026-11-02",
      TODAY,
    );
    equal(d.donut?.centreValue, "0/1");
    deepEqual(d.bars, [{ label: "2", value: 50 }]);
  });
  test("an update on a removed goal does not count", () => {
    const d = runCharts(
      [goal("y", "Real")],
      [note("gone", "2026-11-02", "x")],
      WEEKS,
      "2026-11-02",
      TODAY,
    );
    equal(d.donut?.centreValue, "0/1");
  });
  test("no goals means no round chart", () => {
    equal(runCharts([], [], WEEKS, "2026-11-02", TODAY).donut, null);
  });
});

describe("The weekly charts", () => {
  const all = [
    { title: "A", outcome: "done", week_start: "2026-10-26" },
    { title: "B", outcome: null, week_start: "2026-10-26" },
    { title: "C", outcome: "90%", week_start: "2026-11-02" },
    { title: "  ", outcome: "stray", week_start: "2026-11-02" },
  ];

  test("the line counts each week's goals with an outcome", () => {
    const d = weekCharts([goal("c", "C", "90%")], all, WEEKS, "2026-11-02", TODAY);
    deepEqual(
      d.line.map((p) => p.value),
      [0, 1, 1],
    );
    equal(d.target, null);
  });
  test("a future week someone picked still appears on the line", () => {
    const d = weekCharts([], all, WEEKS, "2026-11-09", TODAY);
    equal(d.line.length, 4);
    equal(d.donut, null);
  });
  test("the round chart splits that week's goals by outcome", () => {
    const d = weekCharts([goal("a", "A", "done"), goal("b", "B")], all, WEEKS, "2026-10-26", TODAY);
    equal(d.donut?.centreValue, "1/2");
  });
});

describe("Weekly progress is a share of goals, never a guess", () => {
  test("45 days: goals with an update that week, out of real goals", () => {
    const goals = [goal("a", "A"), goal("b", "B"), goal("c", "  ")];
    deepEqual(
      runProgress(
        goals,
        [note("a", "2026-10-26", "x"), note("a", "2026-11-02", "x"), note("b", "2026-11-02", "y")],
        WEEKS,
        TODAY,
      ).map((w) => w.pct),
      [0, 50, 100],
    );
  });
  test("weekly: each week's own goals with an outcome", () => {
    const rows = [
      { title: "A", outcome: "done", week_start: "2026-10-26" },
      { title: "B", outcome: null, week_start: "2026-10-26" },
      { title: "C", outcome: "90%", week_start: "2026-11-02" },
    ];
    deepEqual(
      weekProgress(rows, WEEKS, "2026-11-02", TODAY).map((w) => w.pct),
      [0, 50, 100],
    );
  });
  test("no goals is zero, not a division by nothing", () => {
    deepEqual(
      runProgress([], [], WEEKS, TODAY).map((w) => w.pct),
      [0, 0, 0],
    );
  });
  test("the bar axis always reaches 100%, and past it when an outcome does", () => {
    equal(Math.max(...runCharts([goal("a", "A", "40%")], [], WEEKS, null, TODAY).barTicks), 100);
    equal(
      Math.max(...runCharts([goal("a", "A", "105%")], [], WEEKS, null, TODAY).barTicks) >= 105,
      true,
    );
  });
});
