import { describe, it as test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import {
  asManagerExtra,
  averagePoints,
  canWriteManagerEval,
  finalFromParts,
  hasStarted,
  canWriteReview,
  defaultYear,
  docxXmlToText,
  mergeReadForm,
  normalizePotential,
  normalizeRating,
  normalizeReadForm,
  progress,
  ratingForPoints,
  readCount,
  reviewKindsFor,
  reviewScore,
  selfScore,
  selfSummary,
  stageOf,
  uploadMime,
  uploadPath,
  weightedScore,
  type FormLike,
} from "./selfEvaluation";

const empty = (): FormLike => ({
  role_team: "",
  manager_name: "",
  review_period: "",
  goals: [],
  value_answers: {},
  reflection: {},
  potential: {},
});

describe("ratings as written on the form", () => {
  test("short codes, labels and odd spacing", () => {
    equal(normalizeRating("Outstanding (o)"), "O");
    equal(normalizeRating("Exceeds Expectations ( EE)"), "EE");
    equal(normalizeRating("fme"), "FME");
    equal(normalizeRating("Partially Meets Expectations"), "PME");
    equal(normalizeRating("Does Not Meet Expectations (DNME)"), "DNME");
    equal(normalizeRating("Fully Meets Expectations"), "FME");
    equal(normalizeRating(""), "");
    equal(normalizeRating("great"), "");
  });
  test("potential levels", () => {
    equal(normalizePotential("Moderate"), "Moderate");
    equal(normalizePotential("moderate - high"), "");
    equal(normalizePotential("HIGH"), "High");
    equal(normalizePotential("Medium"), "Moderate");
    equal(normalizePotential("very"), "");
  });
});

describe("steps and who rates", () => {
  test("stage follows the dates", () => {
    equal(stageOf(null), "self");
    equal(
      stageOf({ emp_submitted_at: "x", mgr_submitted_at: null, finalized_at: null }),
      "manager",
    );
    equal(
      stageOf({ emp_submitted_at: "x", mgr_submitted_at: "y", finalized_at: null }),
      "feedback",
    );
    equal(stageOf({ emp_submitted_at: "x", mgr_submitted_at: "y", finalized_at: "z" }), "final");
  });
  test("reviewer kinds", () => {
    deepEqual(reviewKindsFor("manager", true, false), ["manager"]);
    deepEqual(reviewKindsFor("hr", false, false), ["hr"]);
    deepEqual(reviewKindsFor("admin", true, false), ["manager", "sir"]);
    deepEqual(reviewKindsFor("admin", true, true), []);
  });
  test("the manager's own ratings lock after the manager submits, HR's do not", () => {
    const fb = { emp_submitted_at: "x", mgr_submitted_at: "y", finalized_at: null };
    equal(canWriteReview("manager", fb, false), false);
    equal(canWriteReview("manager", fb, true), true);
    equal(canWriteReview("hr", fb, true), true);
    equal(canWriteReview("hr", null, true), false);
  });
});

describe("score", () => {
  test("points, 50/50 weighting and nearest rating", () => {
    equal(averagePoints(["O", "EE", "", null, "x"]), 4.5);
    equal(averagePoints([]), null);
    equal(weightedScore(4, 3), 3.5);
    equal(weightedScore(null, 3), 3);
    equal(ratingForPoints(3.5), "EE");
    equal(ratingForPoints(2.4), "PME");
    equal(ratingForPoints(null), null);
  });
  test("self and reviewer scores", () => {
    const f = empty();
    f.goals = [{ rating: "O" }, { rating: "FME" }];
    f.value_answers = { ownership: { rating: "EE" } };
    deepEqual(selfScore(f), { goals: 4, values: 4, total: 4 });
    const r = {
      kind: "manager",
      goal_ratings: { "0": { rating: "EE" }, "1": { rating: "EE" } },
      value_ratings: { ownership: { rating: "O" } },
      overall_rating: "EE",
      feedback: "",
    };
    deepEqual(reviewScore(r, 2), { goals: 4, values: 5, total: 4.5 });
  });
  test("progress counts filled boxes", () => {
    const f = empty();
    const [d0, of0] = progress(f);
    equal(d0, 0);
    equal(of0, 4 * 5 + 12 * 2 + 6 + 4 * 2);
    f.reflection = { proud: "x" };
    equal(progress(f)[0], 1);
  });
});

describe("reading an uploaded form", () => {
  test("keeps known boxes, drops unknown ones, fixes ratings", () => {
    const read = normalizeReadForm({
      about: { role_team: "Tech Head", manager: "PH", review_period: "Aug–Dec" },
      goals: [
        { goal: "Monitor apps", target: "Daily", result: "100%", evidence: "SM 5.0", rating: "EE" },
        { goal: "", target: "", result: "", evidence: "" },
        { goal: "GHL", rating: "Outstanding (o)" },
      ],
      values: { ownership: { example: "0 pending", rating: "O" }, bravery: { example: "x" } },
      reflection: { proud: "Shipped", unknown: "x" },
      potential: { learn: { rating: "High", why: "Fast" }, stretch: { rating: "moderate" } },
    });
    equal(read.goals.length, 2);
    equal(read.goals[1]!.rating, "O");
    deepEqual(Object.keys(read.value_answers), ["ownership"]);
    deepEqual(read.reflection, { proud: "Shipped" });
    equal(read.potential.stretch?.rating, "Moderate");
    equal(read.manager_name, "PH");
    equal(readCount(read), 5 + 2 + 2 + 1 + 2 + 1);
  });
  test("rubbish in, empty form out", () => {
    const read = normalizeReadForm("nope");
    equal(readCount(read), 0);
    deepEqual(read.goals, []);
  });
  test("fill empty keeps typing; replace takes the upload where it has something", () => {
    const cur = empty();
    cur.goals = [{ goal: "Mine", target: "" }];
    cur.reflection = { proud: "Typed" };
    const read = normalizeReadForm({
      goals: [{ goal: "Upload", target: "T" }, { goal: "Second" }],
      reflection: { proud: "From file", missed: "Gap" },
    });
    const filled = mergeReadForm(cur, read, "empty");
    equal(filled.goals[0]!.goal, "Mine");
    equal(filled.goals[0]!.target, "T");
    equal(filled.goals[1]!.goal, "Second");
    deepEqual(filled.reflection, { proud: "Typed", missed: "Gap" });
    const replaced = mergeReadForm(cur, read, "replace");
    equal(replaced.goals[0]!.goal, "Upload");
    equal(replaced.reflection.proud, "From file");
  });
  test("an upload keeps the practice line the person typed", () => {
    const cur = empty();
    cur.value_answers = { ownership: { practice: "My own line", example: "Old" } };
    const read = normalizeReadForm({ values: { ownership: { example: "New", rating: "O" } } });
    const replaced = mergeReadForm(cur, read, "replace");
    deepEqual(replaced.value_answers.ownership, {
      practice: "My own line",
      example: "New",
      rating: "O",
    });
    deepEqual(mergeReadForm(empty(), read, "replace").value_answers.ownership, {
      example: "New",
      rating: "O",
    });
  });
});

describe("uploads", () => {
  test("type from the browser or the file name", () => {
    equal(uploadMime("a.pdf", "application/pdf"), "application/pdf");
    equal(
      uploadMime("Form.DOCX", ""),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    equal(uploadMime("a.jpeg", ""), "image/jpeg");
    equal(uploadMime("a.exe", "application/x-msdownload"), null);
  });
  test("path is the person's folder for the year, with a safe name", () => {
    const p = uploadPath("abc", 2026, "Kamar Alam Form (final).docx.pdf", "r1");
    equal(p, "abc/2026/r1-Kamar_Alam_Form_final_.docx.pdf");
    ok(!uploadPath("abc", 2026, "../../x", "r").includes(".."));
  });
  test("word xml to text", () => {
    const xml =
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>";
    equal(docxXmlToText(xml), "Name\n | A & B\n |");
  });
});

test("default year is the newest open cycle", () => {
  const now = new Date("2026-11-17");
  equal(defaultYear([], now), 2026);
  equal(
    defaultYear(
      [
        { year: 2025, opened_at: "x", closed_at: null },
        { year: 2027, opened_at: null, closed_at: null },
      ],
      now,
    ),
    2025,
  );
});

describe("manager evaluation form", () => {
  test("self summary is the nearest rating to the average", () => {
    equal(selfSummary(["O", "EE", "EE"]), "EE");
    equal(selfSummary([]), null);
  });
  test("only the direct manager writes, while it waits for them", () => {
    const waiting = { emp_submitted_at: "x", mgr_submitted_at: null, finalized_at: null };
    const base = { self: false, directManager: true, hrOrAdmin: false, personHasManager: true };
    equal(canWriteManagerEval({ ...base, steps: waiting }), true);
    equal(canWriteManagerEval({ ...base, steps: null }), false);
    equal(
      canWriteManagerEval({
        ...base,
        steps: { ...waiting, mgr_submitted_at: "y", finalized_at: "y" },
      }),
      false,
    );
    equal(
      canWriteManagerEval({ ...base, directManager: false, hrOrAdmin: true, steps: waiting }),
      false,
    );
    equal(
      canWriteManagerEval({
        ...base,
        directManager: false,
        hrOrAdmin: true,
        personHasManager: false,
        steps: waiting,
      }),
      true,
    );
    equal(canWriteManagerEval({ ...base, self: true, steps: waiting }), false);
  });
  test("extra is read safely", () => {
    deepEqual(asManagerExtra(null), {});
    equal(asManagerExtra({ discussion_date: "2026-12-20" }).discussion_date, "2026-12-20");
  });
});

test("final rating: A and B at 50% each", () => {
  equal(finalFromParts("O", "EE"), "O");
  equal(finalFromParts("FME", "PME"), "FME");
  equal(finalFromParts("EE", "EE"), "EE");
  equal(finalFromParts("EE", ""), null);
});

test("an opened but empty form is not started", () => {
  const empty = {
    emp_submitted_at: null,
    goals: [{}],
    value_answers: {},
    reflection: {},
    potential: { learn: { rating: "" } },
  };
  equal(hasStarted(empty), false);
  equal(hasStarted({ ...empty, reflection: { proud: "Shipped" } }), true);
  equal(hasStarted({ ...empty, goals: [{ rating: "EE" }] }), true);
  equal(hasStarted({ ...empty, emp_submitted_at: "x" }), true);
});
