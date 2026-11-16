import type { ExportColumn, ExportRow } from "@/lib/exporters";

/** The parts of a KRA row and review this file needs (kept loose so tests stay simple). */
export interface KraLike {
  title: string;
  measure: string;
  emp_achievement: string | null;
  emp_evaluation: string | null;
  mgr_achievement: string | null;
  mgr_evaluation: string | null;
  emp_remark: string | null;
  mgr_remark: string | null;
  removed_at: string | null;
}
export interface ReviewLike {
  emp_submitted_at: string | null;
  mgr_submitted_at: string | null;
  finalized_at: string | null;
}

export type ReviewStage = "self" | "manager" | "feedback" | "final";

/** Where the review stands: self evaluation, manager evaluation, HR & Sir feedback, or final. */
export function reviewStage(review: ReviewLike | null | undefined): ReviewStage {
  if (review?.finalized_at) return "final";
  if (review?.mgr_submitted_at) return "feedback";
  if (review?.emp_submitted_at) return "manager";
  return "self";
}

export const STAGE_LABEL: Record<ReviewStage, string> = {
  self: "Self evaluation pending",
  manager: "Manager evaluation pending",
  feedback: "HR & Sir feedback pending",
  final: "Final",
};

/** "85%", "85", " 85 % " → 85. Anything else → null. */
export function percentOf(text: string | null | undefined): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(text ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Average of the filled-in percentages of one column, rounded; null when none are filled. */
export function averagePercent(rows: KraLike[], field: "emp_achievement" | "mgr_achievement") {
  const nums = rows
    .filter((r) => !r.removed_at)
    .map((r) => percentOf(r[field]))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export interface Viewer {
  /** the review is the viewer's own */
  self: boolean;
  /** a manager above the person, HR or admin (never the person) */
  reviewer: boolean;
  hrOrAdmin: boolean;
  /** a developer writing through the audited route (not limited by the steps) */
  dev: boolean;
}

/** Which parts of a KRA row the viewer may change right now. Mirrors probation_kras_guard(). */
export function kraEditable(viewer: Viewer, review: ReviewLike | null | undefined) {
  const stage = reviewStage(review);
  const none = { kra: false, emp: false, empRemark: false, mgr: false, mgrRemark: false };
  if (stage === "final") return none;
  if (viewer.dev && !viewer.self && !viewer.reviewer) {
    return { kra: true, emp: true, empRemark: true, mgr: true, mgrRemark: true };
  }
  if (viewer.self) {
    return { ...none, emp: stage === "self", empRemark: true };
  }
  if (viewer.reviewer) {
    const mgrOpen = stage !== "feedback" || viewer.hrOrAdmin;
    return { ...none, kra: mgrOpen, mgr: mgrOpen, mgrRemark: true };
  }
  return none;
}

/** The overall feedback boxes the viewer writes: managers 'manager', HR 'hr', admin (Sir) 'sir'. */
export function feedbackKindsFor(
  role: string | null | undefined,
  managesPerson: boolean,
  self: boolean,
): ("manager" | "hr" | "sir")[] {
  if (self) return [];
  const out: ("manager" | "hr" | "sir")[] = [];
  if (managesPerson) out.push("manager");
  if (role === "hr") out.push("hr");
  if (role === "admin") out.push("sir");
  return out;
}

export const FEEDBACK_LABEL = { manager: "Manager", hr: "HR", sir: "Sir" } as const;

export const DECISION_LABEL = {
  confirm: "Confirm",
  extend: "Extend probation",
  review: "Mark for review",
} as const;

/** The KRA sheet as rows for CSV / PDF, in the same column order as the Excel sheet. */
export function probationReviewTable(rows: KraLike[]): {
  columns: ExportColumn[];
  rows: ExportRow[];
} {
  const columns: ExportColumn[] = [
    { key: "no", label: "Sr. No." },
    { key: "title", label: "KRA / Goal" },
    { key: "measure", label: "Measures (% / Timeline)" },
    { key: "emp_achievement", label: "Employee - Actual Achievement" },
    { key: "mgr_achievement", label: "Manager - Actual Achievement" },
    { key: "emp_evaluation", label: "Employee Self Evaluation" },
    { key: "mgr_evaluation", label: "Manager Evaluation" },
    { key: "emp_remark", label: "Employee Remark" },
    { key: "mgr_remark", label: "Manager Evaluation Remark" },
  ];
  const live = rows.filter((r) => !r.removed_at);
  const out: ExportRow[] = live.map((r, i) => ({
    no: i + 1,
    title: r.title,
    measure: r.measure,
    emp_achievement: r.emp_achievement ?? "",
    mgr_achievement: r.mgr_achievement ?? "",
    emp_evaluation: r.emp_evaluation ?? "",
    mgr_evaluation: r.mgr_evaluation ?? "",
    emp_remark: r.emp_remark ?? "",
    mgr_remark: r.mgr_remark ?? "",
  }));
  const emp = averagePercent(live, "emp_achievement");
  const mgr = averagePercent(live, "mgr_achievement");
  if (live.length > 0) {
    out.push({
      no: "",
      title: "Average",
      measure: "",
      emp_achievement: emp === null ? "" : `${emp}%`,
      mgr_achievement: mgr === null ? "" : `${mgr}%`,
      emp_evaluation: "",
      mgr_evaluation: "",
      emp_remark: "",
      mgr_remark: "",
    });
  }
  return { columns, rows: out };
}
