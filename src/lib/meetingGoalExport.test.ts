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
      {
        id: "b",
        title: "Chat Bot",
        goal_type: "sub",
        measure: null,
        timeline: null,
        outcome: null,
      },
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
      [
        "Type",
        "No",
        "Goal / Task",
        "Measure",
        "Timeline",
        "Outcome",
        "Week of 11-02",
        "Week of 11-09",
      ],
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
  test("each goal is labelled Main Goal or Sub Goal, Main Goal when not set", () => {
    deepEqual(
      table.rows.map((r) => r["type"]),
      ["Main Goal", "Sub Goal"],
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
  equal(t.columns.length, 6);
  equal(t.rows.length, 0);
});

describe("Challenges, Learnings and Remarks are in the download only when added", () => {
  const goals = [
    {
      id: "a",
      title: "Post Monitoring",
      measure: null,
      timeline: null,
      outcome: null,
      challenges: "Festival week",
    },
    {
      id: "b",
      title: "Chat Bot",
      measure: null,
      timeline: null,
      outcome: null,
      learnings: "Plan early",
      remarks: "Owner: Sales",
    },
  ];

  test("not added: no extra columns, even if a goal has text", () => {
    const t = meetingGoalTable({ ...base, goals, updates: [], weeks: [] });
    equal(
      t.columns.some((c) => ["challenges", "learnings", "remarks"].includes(c.key)),
      false,
    );
  });

  test("added: one column each, every goal's own entry beside it", () => {
    const t = meetingGoalTable({
      ...base,
      goals,
      updates: [],
      weeks: [],
      columnsAdded: ["challenges", "learnings", "remarks"],
    });
    deepEqual(
      t.columns.slice(-3).map((c) => c.label),
      ["Challenges", "Learnings", "Remarks"],
    );
    equal(t.rows[0]?.["remarks"], "");
    equal(t.rows[1]?.["remarks"], "Owner: Sales");
    equal(t.rows[0]?.["challenges"], "Festival week");
    equal(t.rows[1]?.["challenges"], "");
    equal(t.rows[1]?.["learnings"], "Plan early");
  });
});
