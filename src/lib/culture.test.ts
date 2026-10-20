import { describe, it as test } from "node:test";
import { equal } from "node:assert/strict";
import { joinedLabel } from "./culture";

describe("The date on a 'joined CoachEasily' card", () => {
  test("is the day the person joined, not the day their card was written", () => {
    equal(joinedLabel("2026-03-02", "2026-08-14T05:00:00Z"), "2 Mar 2026");
    equal(joinedLabel("2025-12-31", "2026-08-14T05:00:00Z"), "31 Dec 2025");
  });
  test("falls back to when the card was written when the joining date is unknown", () => {
    equal(joinedLabel(null, "2026-08-14T05:00:00Z"), "14 Aug 2026");
    equal(joinedLabel(undefined, "2026-08-14T05:00:00Z"), "14 Aug 2026");
  });
  test("a different joining date never gives the same label", () => {
    const a = joinedLabel("2026-01-05", "2026-08-14T05:00:00Z");
    const b = joinedLabel("2026-02-09", "2026-08-14T05:00:00Z");
    equal(a === b, false);
  });
});
