import { describe, it as test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import { buildCsv } from "./exporters";
import { meetingGoalTable } from "./meetingGoalExport";

const base = {
  person: "Kamar Alam",
  heading: "Goals for next 45 days",
  period: "7 Oct to 20 Nov · Strategic Meeting 5.0",
  weekLabel: (w: string) => w.slice(5),
  dateLabel: (d: string) => d.split("-").reverse().join("/"),
};

describe("The downloaded goals table matches the page", () => {
  const table = meetingGoalTable({
    ...base,
    goals: [
      {
        id: "a",
        title: "Post Monitoring",
        measure: "Daily",
        timeline: "2026-11-20",
        outcome: "100%",
      },
      { id: "b", title: "Chat Bot", measure: null, timeline: null, outcome: null },
    ],
    updates: [
      { goal_id: "a", week_start: "2026-11-02", note: "140 – 100% done" },
      { goal_id: "b", week_start: "2026-11-09", note: "80" },
      { goal_id: "gone", week_start: "2026-11-02", note: "ignored" },
    ],
    weeks: ["2026-11-02", "2026-11-09"],
  });

  test("same columns, in the same order, one per week", () => {
    deepEqual(
      table.columns.map((c) => c.label),
      ["No", "Goal / Task", "Measure", "Timeline", "Outcome", "Week of 11-02", "Week of 11-09"],
    );
  });
  test("each week's update sits under its own week, empty where none was written", () => {
    equal(table.rows[0]?.["week_2026-11-02"], "140 – 100% done");
    equal(table.rows[0]?.["week_2026-11-09"], "");
    equal(table.rows[1]?.["week_2026-11-09"], "80");
  });
  test("rows are numbered like the table and blanks stay blank", () => {
    deepEqual(
      table.rows.map((r) => [r["no"], r["timeline"], r["outcome"]]),
      [
        [1, "20/11/2026", "100%"],
        [2, "", ""],
      ],
    );
  });
  test("the title names the person", () => {
    equal(table.title, "Kamar Alam - Goals for next 45 days");
  });
  test("it turns into a CSV with a header and one line per goal", () => {
    const lines = buildCsv(table.columns, table.rows).trim().split("\r\n");
    equal(lines.length, 3);
  });
});

test("the weekly view has no week columns", () => {
  const t = meetingGoalTable({ ...base, goals: [], updates: [], weeks: [] });
  equal(t.columns.length, 5);
  equal(t.rows.length, 0);
});
