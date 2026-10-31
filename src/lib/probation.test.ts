import { describe, it as test } from "node:test";
import { equal } from "node:assert/strict";
import { probationLengthText, probationReminderPoint } from "./probation";

describe("probationReminderPoint", () => {
  test("nothing before 15 days", () => {
    equal(probationReminderPoint(16), null);
    equal(probationReminderPoint(90), null);
  });
  test("15, 10, 5 and 2 days before, with missed days caught up", () => {
    equal(probationReminderPoint(15), "15d");
    equal(probationReminderPoint(11), "15d");
    equal(probationReminderPoint(10), "10d");
    equal(probationReminderPoint(6), "10d");
    equal(probationReminderPoint(5), "5d");
    equal(probationReminderPoint(3), "5d");
    equal(probationReminderPoint(2), "2d");
    equal(probationReminderPoint(1), "2d");
  });
  test("the last day, then ended", () => {
    equal(probationReminderPoint(0), "today");
    equal(probationReminderPoint(-1), "ended");
    equal(probationReminderPoint(-30), "ended");
  });
});

describe("probationLengthText", () => {
  test("counts days between start and end", () => {
    equal(probationLengthText("2026-10-01", "2026-12-30"), "90 days");
  });
});
