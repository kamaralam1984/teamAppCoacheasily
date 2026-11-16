import { describe, it as test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import {
  averagePercent,
  feedbackKindsFor,
  kraEditable,
  percentOf,
  probationReviewTable,
  reviewStage,
  type KraLike,
} from "./probationReview";

const kra = (over: Partial<KraLike> = {}): KraLike => ({
  title: "Refund queries",
  measure: "100%",
  emp_achievement: null,
  emp_evaluation: null,
  mgr_achievement: null,
  mgr_evaluation: null,
  emp_remark: null,
  mgr_remark: null,
  removed_at: null,
  ...over,
});
const at = "2026-11-17T10:00:00Z";
const review = (emp: boolean, mgr: boolean, fin: boolean) => ({
  emp_submitted_at: emp ? at : null,
  mgr_submitted_at: mgr ? at : null,
  finalized_at: fin ? at : null,
});

describe("reviewStage", () => {
  test("follows the steps in order", () => {
    equal(reviewStage(null), "self");
    equal(reviewStage(review(true, false, false)), "manager");
    equal(reviewStage(review(true, true, false)), "feedback");
    equal(reviewStage(review(true, true, true)), "final");
  });
});

describe("percentOf / averagePercent", () => {
  test("reads plain and % numbers only", () => {
    equal(percentOf("85%"), 85);
    equal(percentOf(" 70 % "), 70);
    equal(percentOf("99.5"), 99.5);
    equal(percentOf("good"), null);
    equal(percentOf(null), null);
  });
  test("averages filled rows, skips removed and blank ones", () => {
    const rows = [
      kra({ mgr_achievement: "85%" }),
      kra({ mgr_achievement: "70" }),
      kra({ mgr_achievement: "" }),
      kra({ mgr_achievement: "10%", removed_at: at }),
    ];
    equal(averagePercent(rows, "mgr_achievement"), 78);
    equal(averagePercent(rows, "emp_achievement"), null);
  });
});

describe("kraEditable", () => {
  const person = { self: true, reviewer: false, hrOrAdmin: false, dev: false };
  const manager = { self: false, reviewer: true, hrOrAdmin: false, dev: false };
  const hr = { self: false, reviewer: true, hrOrAdmin: true, dev: false };
  const outsider = { self: false, reviewer: false, hrOrAdmin: false, dev: false };

  test("the person writes only their own columns, until they submit", () => {
    deepEqual(kraEditable(person, null), {
      kra: false,
      emp: true,
      empRemark: true,
      mgr: false,
      mgrRemark: false,
    });
    equal(kraEditable(person, review(true, false, false)).emp, false);
    equal(kraEditable(person, review(true, false, false)).empRemark, true);
  });
  test("a manager writes the KRA and manager columns, never the person's", () => {
    const e = kraEditable(manager, null);
    equal(e.kra && e.mgr && e.mgrRemark, true);
    equal(e.emp || e.empRemark, false);
    equal(kraEditable(manager, review(true, true, false)).mgr, false);
    equal(kraEditable(hr, review(true, true, false)).mgr, true);
  });
  test("nobody writes once final; outsiders never", () => {
    for (const v of [person, manager, hr]) {
      equal(Object.values(kraEditable(v, review(true, true, true))).some(Boolean), false);
    }
    equal(Object.values(kraEditable(outsider, null)).some(Boolean), false);
  });
});

describe("feedbackKindsFor", () => {
  test("manager / HR / Sir boxes by role; never on your own review", () => {
    deepEqual(feedbackKindsFor("manager", true, false), ["manager"]);
    deepEqual(feedbackKindsFor("hr", false, false), ["hr"]);
    deepEqual(feedbackKindsFor("admin", true, false), ["manager", "sir"]);
    deepEqual(feedbackKindsFor("member", false, false), []);
    deepEqual(feedbackKindsFor("hr", false, true), []);
  });
});

describe("probationReviewTable", () => {
  test("sheet columns in order, removed rows left out, average row at the end", () => {
    const t = probationReviewTable([
      kra({ emp_achievement: "100%", mgr_achievement: "85%" }),
      kra({ title: "Gone", removed_at: at }),
      kra({ title: "Invoices", emp_achievement: "100%", mgr_achievement: "95%" }),
    ]);
    equal(t.columns[0]?.label, "Sr. No.");
    equal(t.rows.length, 3);
    equal(t.rows[1]?.["no"], 2);
    equal(t.rows[1]?.["title"], "Invoices");
    equal(t.rows[2]?.["title"], "Average");
    equal(t.rows[2]?.["mgr_achievement"], "90%");
  });
});
