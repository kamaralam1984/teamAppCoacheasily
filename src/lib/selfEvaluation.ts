/**
 * The Annual Self-Evaluation Form (January to December), as the company's Word form has it:
 * About you, Part A goals (50%), Part B values (50%), Part C reflection, Part D potential,
 * sign-off. Plus the manager, HR and admin ratings. Pure helpers, no I/O.
 */

export const RATINGS = ["O", "EE", "FME", "PME", "DNME"] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABEL: Record<Rating, string> = {
  O: "Outstanding (O)",
  EE: "Exceeds Expectations (EE)",
  FME: "Fully Meets Expectations (FME)",
  PME: "Partially Meets Expectations (PME)",
  DNME: "Does Not Meet Expectations (DNME)",
};

export const RATING_MEANING: Record<Rating, string> = {
  O: "Far above expectations; created exceptional impact for the business or team",
  EE: "Often goes beyond the role; shows extra initiative or impact",
  FME: "Consistently delivers the expected results and capabilities for the role",
  PME: "Some gaps in performance or capability; needs focused improvement",
  DNME: "Below the standard; significant improvement needed",
};

/** 5 for Outstanding down to 1 for Does Not Meet. */
export const RATING_POINTS: Record<Rating, number> = { O: 5, EE: 4, FME: 3, PME: 2, DNME: 1 };

/** As on the form: Low / Moderate / High. */
export const POTENTIAL_LEVELS = ["Low", "Moderate", "High"] as const;
export type PotentialLevel = (typeof POTENTIAL_LEVELS)[number];

export const VALUES = [
  {
    key: "ownership",
    name: "Ownership",
    practice: "I take responsibility for outcomes and follow through without being chased",
  },
  {
    key: "collaboration",
    name: "Collaboration",
    practice: "I share information, help teammates and work well across teams",
  },
  {
    key: "problem_solving",
    name: "Problem-solving",
    practice: "I find root causes and propose practical solutions, not just raise problems",
  },
  {
    key: "growth_mindset",
    name: "Growth mindset",
    practice: "I seek feedback, learn from mistakes and keep building new skills",
  },
  {
    key: "communication",
    name: "Communication",
    practice: "I am clear, timely and respectful in writing and in conversation",
  },
  {
    key: "optimism",
    name: "Optimism",
    practice: "I stay positive and solution-focused when things get hard",
  },
  {
    key: "courage",
    name: "Courage",
    practice: "I speak up, try new ideas and make hard calls when needed",
  },
  {
    key: "integrity",
    name: "Integrity",
    practice: "I am honest, keep my word and do the right thing when no one is watching",
  },
  {
    key: "responsibility",
    name: "Responsibility",
    practice: "I meet commitments and deadlines and follow agreed processes",
  },
  {
    key: "leadership",
    name: "Leadership",
    practice: "I guide, support and inspire others, whatever my role",
  },
  {
    key: "efficiency",
    name: "Efficiency",
    practice: "I use time and resources well and keep improving how work gets done",
  },
  {
    key: "strategic_thinking",
    name: "Strategic thinking",
    practice: "I connect my work to company goals and think about the bigger picture",
  },
] as const;
export type ValueKey = (typeof VALUES)[number]["key"];

export const REFLECTION = [
  {
    key: "proud",
    question: "What are your three proudest results this year, and what made them possible?",
  },
  {
    key: "missed",
    question: "Where did you miss a goal or a value, and what would you do differently?",
  },
  { key: "challenge", question: "What was your biggest challenge, and how did you handle it?" },
  { key: "feedback", question: "What feedback from your quarterly check-ins did you act on?" },
  { key: "development", question: "What progress did you make on your self-development goal?" },
  {
    key: "support",
    question: "What support or resources do you need from your manager or the company?",
  },
] as const;
export type ReflectionKey = (typeof REFLECTION)[number]["key"];

export const POTENTIAL = [
  { key: "learn", question: "How quickly do I learn new skills and adapt to change?" },
  { key: "bigger_role", question: "How ready am I to take on a bigger role or scope?" },
  { key: "help_others", question: "How much do I help others succeed and lift the team?" },
  { key: "stretch", question: "How often do I take on stretch work beyond my goals?" },
] as const;
export type PotentialKey = (typeof POTENTIAL)[number]["key"];

export const GOAL_FIELDS = ["goal", "target", "result", "evidence", "rating"] as const;
export type GoalField = (typeof GOAL_FIELDS)[number];
export interface GoalAnswer {
  goal?: string;
  target?: string;
  result?: string;
  evidence?: string;
  rating?: string;
}
/** practice: the person's own "What it looks like in practice"; empty → the value's standard line. */
export type ValueAnswers = Partial<
  Record<ValueKey, { practice?: string; example?: string; rating?: string }>
>;
export type ReflectionAnswers = Partial<Record<ReflectionKey, string>>;
export type PotentialAnswers = Partial<Record<PotentialKey, { rating?: string; why?: string }>>;

/** The parts of a form this file needs. */
export interface FormLike {
  role_team?: string;
  manager_name?: string;
  review_period?: string;
  goals: GoalAnswer[];
  value_answers: ValueAnswers;
  reflection: ReflectionAnswers;
  potential: PotentialAnswers;
}
export interface StepsLike {
  emp_submitted_at: string | null;
  mgr_submitted_at: string | null;
  finalized_at: string | null;
}
export type ReviewKind = "manager" | "hr" | "sir";
export const REVIEW_KINDS: ReviewKind[] = ["manager", "hr", "sir"];
export const REVIEW_LABEL: Record<ReviewKind, string> = {
  manager: "Manager",
  hr: "HR",
  sir: "Admin",
};
export interface ReviewLike {
  kind: string;
  goal_ratings: Record<string, { rating?: string; comment?: string }>;
  value_ratings: Record<string, { rating?: string; comment?: string }>;
  overall_rating: string | null;
  feedback: string;
}

export const MAX_GOALS = 5;

export function isRating(v: unknown): v is Rating {
  return typeof v === "string" && (RATINGS as readonly string[]).includes(v);
}

export type Stage = "self" | "manager" | "feedback" | "final";
export function stageOf(row: StepsLike | null | undefined): Stage {
  if (row?.finalized_at) return "final";
  if (row?.mgr_submitted_at) return "feedback";
  if (row?.emp_submitted_at) return "manager";
  return "self";
}
export const STAGE_LABEL: Record<Stage, string> = {
  self: "Self-evaluation pending",
  manager: "Manager evaluation pending",
  feedback: "Manager evaluation pending",
  final: "Complete",
};

/** The reviewer boxes the viewer writes: managers 'manager', HR 'hr', admin 'sir'. */
export function reviewKindsFor(
  role: string | null | undefined,
  managesPerson: boolean,
  self: boolean,
): ReviewKind[] {
  if (self) return [];
  const out: ReviewKind[] = [];
  if (managesPerson) out.push("manager");
  if (role === "hr") out.push("hr");
  if (role === "admin") out.push("sir");
  return out;
}

/** May the viewer write this reviewer kind now? Mirrors can_write_self_eval_review(). */
export function canWriteReview(
  kind: ReviewKind,
  steps: StepsLike | null | undefined,
  hrOrAdmin: boolean,
): boolean {
  const stage = stageOf(steps);
  if (stage === "self" || stage === "final") return false;
  if (kind === "manager" && stage === "feedback" && !hrOrAdmin) return false;
  return true;
}

/** Average points of the ratings given (O = 5 … DNME = 1), one decimal; null when none. */
export function averagePoints(ratings: (string | null | undefined)[]): number | null {
  const pts = ratings.filter(isRating).map((r) => RATING_POINTS[r]);
  if (pts.length === 0) return null;
  return Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 10) / 10;
}

/** The nearest rating to a points score. */
export function ratingForPoints(points: number | null): Rating | null {
  if (points === null) return null;
  if (points >= 4.5) return "O";
  if (points >= 3.5) return "EE";
  if (points >= 2.5) return "FME";
  if (points >= 1.5) return "PME";
  return "DNME";
}

/** Part A and Part B are 50% each: the score out of 5 is their average. */
export function weightedScore(goalsAvg: number | null, valuesAvg: number | null): number | null {
  if (goalsAvg === null && valuesAvg === null) return null;
  if (goalsAvg === null) return valuesAvg;
  if (valuesAvg === null) return goalsAvg;
  return Math.round(((goalsAvg + valuesAvg) / 2) * 10) / 10;
}

export interface Score {
  goals: number | null;
  values: number | null;
  total: number | null;
}

export function selfScore(form: FormLike): Score {
  const goals = averagePoints(form.goals.map((g) => g.rating));
  const values = averagePoints(VALUES.map((v) => form.value_answers[v.key]?.rating));
  return { goals, values, total: weightedScore(goals, values) };
}

export function reviewScore(review: ReviewLike, goalCount: number): Score {
  const goals = averagePoints(
    Array.from({ length: goalCount }, (_, i) => review.goal_ratings[String(i)]?.rating),
  );
  const values = averagePoints(VALUES.map((v) => review.value_ratings[v.key]?.rating));
  return { goals, values, total: weightedScore(goals, values) };
}

/** How much of the form is filled: [done, of]. */
export function progress(form: FormLike): [number, number] {
  const filled = (s: string | undefined) => Boolean(s && s.trim());
  let done = 0;
  let of = 0;
  const goals = form.goals.filter((g) => GOAL_FIELDS.some((f) => filled(g[f])));
  const goalSlots = Math.max(goals.length, 4);
  of += goalSlots * GOAL_FIELDS.length;
  for (const g of goals) for (const f of GOAL_FIELDS) if (filled(g[f])) done++;
  for (const v of VALUES) {
    of += 2;
    if (filled(form.value_answers[v.key]?.example)) done++;
    if (filled(form.value_answers[v.key]?.rating)) done++;
  }
  for (const r of REFLECTION) {
    of += 1;
    if (filled(form.reflection[r.key])) done++;
  }
  for (const p of POTENTIAL) {
    of += 2;
    if (filled(form.potential[p.key]?.rating)) done++;
    if (filled(form.potential[p.key]?.why)) done++;
  }
  return [done, of];
}

// ───────── reading an uploaded form ─────────

/** "Outstanding (o)", "Exceeds Expectations ( EE)", "ee", "FME" → the rating; else "". */
export function normalizeRating(text: unknown): Rating | "" {
  const t = String(text ?? "").trim();
  if (!t) return "";
  const inBrackets = /\(\s*([a-z]+)\s*\)/i.exec(t)?.[1];
  const short = (inBrackets ?? t).toUpperCase().replace(/[^A-Z]/g, "");
  if (isRating(short)) return short;
  const words = t.toLowerCase();
  if (words.includes("outstanding")) return "O";
  if (words.includes("exceed")) return "EE";
  if (words.includes("does not") || words.includes("doesn't")) return "DNME";
  if (words.includes("partially")) return "PME";
  if (words.includes("fully") || words.includes("meets")) return "FME";
  return "";
}

/** "moderate", "Medium", "HIGH" → the level; an in-between ("Moderate–High") or anything else → "". */
export function normalizePotential(text: unknown): PotentialLevel | "" {
  const t = String(text ?? "")
    .toLowerCase()
    .replace(/\s*(?:-|–|—|to|\/)\s*/g, "-")
    .replace(/[^a-z-]/g, "");
  const map: Record<string, PotentialLevel> = {
    low: "Low",
    moderate: "Moderate",
    medium: "Moderate",
    high: "High",
  };
  return map[t] ?? "";
}

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

export interface ReadForm {
  role_team: string;
  manager_name: string;
  review_period: string;
  goals: GoalAnswer[];
  value_answers: ValueAnswers;
  reflection: ReflectionAnswers;
  potential: PotentialAnswers;
}

/** Whatever the reader returned, made into the form's shape: known keys, known ratings only. */
export function normalizeReadForm(raw: unknown): ReadForm {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const about = (r["about"] && typeof r["about"] === "object" ? r["about"] : r) as Record<
    string,
    unknown
  >;
  const goalsIn = Array.isArray(r["goals"]) ? r["goals"] : [];
  const goals: GoalAnswer[] = goalsIn
    .map((g) => (g && typeof g === "object" ? (g as Record<string, unknown>) : {}))
    .map((g) => ({
      goal: str(g["goal"]),
      target: str(g["target"]),
      result: str(g["result"]),
      evidence: str(g["evidence"]),
      rating: normalizeRating(g["rating"]),
    }))
    .filter((g) => g.goal || g.target || g.result || g.evidence)
    .slice(0, 10);

  const valuesIn = (r["values"] && typeof r["values"] === "object" ? r["values"] : {}) as Record<
    string,
    unknown
  >;
  const value_answers: ValueAnswers = {};
  for (const v of VALUES) {
    const got = (valuesIn[v.key] ?? valuesIn[v.name]) as Record<string, unknown> | undefined;
    if (!got || typeof got !== "object") continue;
    const example = str(got["example"]);
    const rating = normalizeRating(got["rating"]);
    if (example || rating) value_answers[v.key] = { example, rating };
  }

  const reflIn = (
    r["reflection"] && typeof r["reflection"] === "object" ? r["reflection"] : {}
  ) as Record<string, unknown>;
  const reflection: ReflectionAnswers = {};
  for (const q of REFLECTION) {
    const t = str(reflIn[q.key]);
    if (t) reflection[q.key] = t;
  }

  const potIn = (
    r["potential"] && typeof r["potential"] === "object" ? r["potential"] : {}
  ) as Record<string, unknown>;
  const potential: PotentialAnswers = {};
  for (const q of POTENTIAL) {
    const got = potIn[q.key] as Record<string, unknown> | undefined;
    if (!got || typeof got !== "object") continue;
    const rating = normalizePotential(got["rating"]);
    const why = str(got["why"]);
    if (rating || why) potential[q.key] = { rating, why };
  }

  return {
    role_team: str(about["role_team"]).slice(0, 500),
    manager_name: str(about["manager"] ?? about["manager_name"]).slice(0, 500),
    review_period: str(about["review_period"]).slice(0, 500),
    goals,
    value_answers,
    reflection,
    potential,
  };
}

/** How many boxes a read form fills. */
export function readCount(f: ReadForm): number {
  let n = 0;
  for (const g of f.goals) for (const k of GOAL_FIELDS) if (g[k]) n++;
  for (const v of Object.values(f.value_answers)) n += (v?.example ? 1 : 0) + (v?.rating ? 1 : 0);
  n += Object.values(f.reflection).filter(Boolean).length;
  for (const p of Object.values(f.potential)) n += (p?.rating ? 1 : 0) + (p?.why ? 1 : 0);
  return n;
}

const has = (s: string | undefined) => Boolean(s && s.trim());

/**
 * The form after an upload: "empty" fills only the boxes that are still blank; "replace" takes
 * everything the upload has (boxes it has nothing for are kept).
 */
export function mergeReadForm(current: FormLike, read: ReadForm, mode: "empty" | "replace") {
  const pick = (cur: string | undefined, got: string | undefined) =>
    mode === "replace" ? (has(got) ? got! : (cur ?? "")) : has(cur) ? cur! : (got ?? "");

  const n = Math.max(current.goals.length, read.goals.length);
  const goals: GoalAnswer[] = [];
  for (let i = 0; i < Math.min(n, 10); i++) {
    const c = current.goals[i] ?? {};
    const g = read.goals[i] ?? {};
    const row: GoalAnswer = {};
    for (const k of GOAL_FIELDS) row[k] = pick(c[k], g[k]);
    goals.push(row);
  }

  const value_answers: ValueAnswers = {};
  for (const v of VALUES) {
    const c = current.value_answers[v.key] ?? {};
    const g = read.value_answers[v.key] ?? {};
    const example = pick(c.example, g.example);
    const rating = pick(c.rating, g.rating);
    // an upload never carries this box, so what the person typed is kept
    const practice = c.practice?.trim() ? c.practice : undefined;
    if (example || rating || practice)
      value_answers[v.key] = practice ? { practice, example, rating } : { example, rating };
  }

  const reflection: ReflectionAnswers = {};
  for (const q of REFLECTION) {
    const t = pick(current.reflection[q.key], read.reflection[q.key]);
    if (t) reflection[q.key] = t;
  }

  const potential: PotentialAnswers = {};
  for (const q of POTENTIAL) {
    const c = current.potential[q.key] ?? {};
    const g = read.potential[q.key] ?? {};
    const rating = pick(c.rating, g.rating);
    const why = pick(c.why, g.why);
    if (rating || why) potential[q.key] = { rating, why };
  }

  return {
    role_team: pick(current.role_team, read.role_team),
    manager_name: pick(current.manager_name, read.manager_name),
    review_period: pick(current.review_period, read.review_period),
    goals,
    value_answers,
    reflection,
    potential,
  };
}

// ───────── uploads ─────────

export const UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "text/plain": "txt",
};
export const UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,.xlsx,.xls,.csv,.txt";
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

const BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(UPLOAD_TYPES).map(([mime, ext]) => [ext, mime]),
);
BY_EXT["jpeg"] = "image/jpeg";

/** The file's type, from the browser or else from its name; null when we don't take it. */
export function uploadMime(name: string, browserType: string): string | null {
  if (browserType && UPLOAD_TYPES[browserType]) return browserType;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return BY_EXT[ext] ?? null;
}

/** <profile>/<year>/<random>-<safe name>: the folder is what the storage rules check. */
export function uploadPath(profileId: string, year: number, name: string, random: string): string {
  const safe =
    name
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "_")
      .replace(/\.{2,}/g, ".")
      .replace(/_+/g, "_")
      .slice(-80) || "file";
  return `${profileId}/${year}/${random}-${safe}`;
}

/** Can this upload be read into the form? PDF and images go to the reader; Word as text. */
export function readableKind(mime: string): "file" | "docx" | "text" | null {
  if (mime === "application/pdf" || mime.startsWith("image/")) return "file";
  if (mime === UPLOAD_TYPES_DOCX) return "docx";
  if (mime === "text/plain") return "text";
  return null;
}
const UPLOAD_TYPES_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Word's document.xml as plain text: one line per paragraph, " | " between table cells. */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The year the form is for by default: the newest open cycle, else this year. */
export function defaultYear(
  cycles: { year: number; opened_at: string | null; closed_at: string | null }[],
  today: Date,
): number {
  const open = cycles.filter((c) => c.opened_at && !c.closed_at).map((c) => c.year);
  if (open.length > 0) return Math.max(...open);
  return today.getFullYear();
}

/** The message of an error from the app, the database (which is not an Error) or the network. */
export function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message || fallback;
  }
  return fallback;
}

// ───────── the Annual Manager Evaluation Form ─────────

export const MANAGER_POTENTIAL: Record<PotentialKey, string> = {
  learn: "How quickly do they learn new skills and adapt to change?",
  bigger_role: "How ready are they to take on a bigger role or scope?",
  help_others: "How much do they help others succeed and lift the team?",
  stretch: "How often do they take on stretch work beyond their goals?",
};

export const MANAGER_FEEDBACK = [
  { key: "strengths", question: "What are the team member's key strengths this year?" },
  {
    key: "development",
    question: "Which areas need development, and what should they do differently?",
  },
  {
    key: "accuracy",
    question: "How accurate was the self-evaluation overall? Note any ratings you changed and why.",
  },
  {
    key: "support",
    question: "What support or resources will you provide in response to their request?",
  },
  { key: "goals_next", question: "What goals or focus areas do you recommend for 2027?" },
  { key: "training", question: "What training or development actions do you recommend?" },
] as const;
export type ManagerFeedbackKey = (typeof MANAGER_FEEDBACK)[number]["key"];

export const RECOMMENDATIONS = [
  { key: "promotion", label: "Promotion / role elevation" },
  { key: "scope", label: "Increased scope or responsibility" },
  { key: "continue", label: "Continue in current role" },
  { key: "pip", label: "Performance improvement plan" },
] as const;
export type RecommendationKey = (typeof RECOMMENDATIONS)[number]["key"];

interface RatingRemarks {
  rating?: string;
  remarks?: string;
}
interface SummaryRow extends RatingRemarks {
  /** the team member's overall self-rating for the part, as the manager records it */
  self_rating?: string;
}

/** The manager's view of potential, as on the form. */
export const MANAGER_POTENTIAL_LEVELS = ["Low", "Moderate", "High"] as const;

/** Part C: A and B weighted at 50% each, rounded to the nearest rating. Mirrors the sign-off. */
export function finalFromParts(a: string | undefined, b: string | undefined): Rating | null {
  if (!isRating(a) || !isRating(b)) return null;
  return ratingForPoints((RATING_POINTS[a] + RATING_POINTS[b]) / 2);
}
/** The manager-form boxes kept in self_eval_reviews.extra (kind 'manager'). */
export interface ManagerExtra {
  discussion_date?: string;
  goals_summary?: SummaryRow;
  values_summary?: SummaryRow;
  overall?: { goals?: SummaryRow; values?: SummaryRow };
  potential?: Partial<Record<PotentialKey, RatingRemarks>>;
  feedback?: Partial<Record<ManagerFeedbackKey, string>>;
  recommendation?: { choice?: string; comments?: Partial<Record<RecommendationKey, string>> };
  signed_name?: string;
  signed_at?: string;
}

export function asManagerExtra(raw: unknown): ManagerExtra {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as ManagerExtra) : {};
}

/** The team member's overall self-rating for a part: the nearest rating to their average. */
export function selfSummary(ratings: (string | null | undefined)[]): Rating | null {
  return ratingForPoints(averagePoints(ratings));
}

/** May the viewer write the manager evaluation? Mirrors self_eval_is_rater() + the steps. */
export function canWriteManagerEval(args: {
  self: boolean;
  directManager: boolean;
  hrOrAdmin: boolean;
  personHasManager: boolean;
  steps: StepsLike | null | undefined;
}): boolean {
  if (args.self) return false;
  const rater = args.directManager || (args.hrOrAdmin && !args.personHasManager);
  return rater && stageOf(args.steps) === "manager";
}

/** Has the person written anything yet? Opening the page makes an empty form; that is not a start. */
export function hasStarted(row: {
  emp_submitted_at: string | null;
  goals: unknown;
  value_answers: unknown;
  reflection: unknown;
  potential: unknown;
}): boolean {
  if (row.emp_submitted_at) return true;
  const filled = (v: unknown): boolean => {
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.some(filled);
    if (v && typeof v === "object") return Object.values(v).some(filled);
    return false;
  };
  return [row.goals, row.value_answers, row.reflection, row.potential].some(filled);
}
