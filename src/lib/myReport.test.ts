import { describe, it as test } from "node:test";
import { equal } from "node:assert/strict";
import { RANGE_PRESETS, daysInRange, rangeProblem } from "./myReport";

describe("My report date ranges", () => {
  test("the first quick range is the 45 days of a goal cycle, ending today", () => {
    const r = RANGE_PRESETS[0]!.range("2026-10-20");
    equal(r.to, "2026-10-20");
    equal(r.from, "2026-09-06");
    equal(daysInRange(r.from, r.to), 45);
  });
  test("a single day counts as one day", () => {
    equal(daysInRange("2026-10-20", "2026-10-20"), 1);
  });
  test("the range crosses month and year ends", () => {
    equal(daysInRange("2026-12-30", "2027-01-02"), 4);
  });
  test("this month starts on the first", () => {
    const month = RANGE_PRESETS.find((p) => p.id === "month")!.range("2026-10-20");
    equal(month.from, "2026-10-01");
  });
  test("every quick range can be run", () => {
    for (const p of RANGE_PRESETS) {
      const r = p.range("2026-10-20");
      equal(rangeProblem(r.from, r.to), null);
    }
  });
  test("both dates are needed", () => {
    equal(rangeProblem("", "2026-10-20"), "Pick both dates.");
  });
  test("the end cannot come before the start", () => {
    equal(rangeProblem("2026-10-20", "2026-10-19"), "The end date is before the start date.");
  });
  test("a year is the most that can be asked for", () => {
    equal(rangeProblem("2026-01-01", "2026-12-31"), null);
    equal(typeof rangeProblem("2025-01-01", "2026-12-31"), "string");
  });
});
