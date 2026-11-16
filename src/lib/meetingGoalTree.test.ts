import { describe, it as test } from "node:test";
import { deepEqual } from "node:assert/strict";
import { goalTree, parentChoices, type TreeGoal } from "./meetingGoalTree";

const g = (id: string, position: number, parent_id: string | null = null): TreeGoal => ({
  id,
  title: id,
  position,
  created_at: "2026-11-01T00:00:00Z",
  parent_id,
});

describe("goalTree", () => {
  test("all main goals: 1, 2, 3 in position order", () => {
    const rows = goalTree([g("b", 20), g("a", 10), g("c", 30)]);
    deepEqual(
      rows.map((r) => [r.goal.id, r.no, r.sub]),
      [
        ["a", "1", false],
        ["b", "2", false],
        ["c", "3", false],
      ],
    );
  });
  test("sub-goals sit under their main goal as 1.1, 1.2 and mains renumber", () => {
    const rows = goalTree([g("a", 10), g("b", 20, "a"), g("c", 30), g("d", 40, "a")]);
    deepEqual(
      rows.map((r) => [r.goal.id, r.no]),
      [
        ["a", "1"],
        ["b", "1.1"],
        ["d", "1.2"],
        ["c", "2"],
      ],
    );
  });
  test("never hides a row: a missing or nested parent shows the goal as main", () => {
    const rows = goalTree([g("a", 10), g("b", 20, "gone"), g("c", 30, "a"), g("d", 40, "c")]);
    deepEqual(rows.map((r) => r.goal.id).sort(), ["a", "b", "c", "d"]);
    deepEqual(
      rows.filter((r) => !r.sub).map((r) => r.goal.id),
      ["a", "b", "d"],
    );
  });
});

describe("parentChoices", () => {
  test("main goals only, never the goal itself", () => {
    const rows = goalTree([g("a", 10), g("b", 20, "a"), g("c", 30)]);
    deepEqual(
      parentChoices(rows, "a").map((r) => r.goal.id),
      ["c"],
    );
    deepEqual(
      parentChoices(rows, "b").map((r) => r.goal.id),
      ["a", "c"],
    );
  });
});
