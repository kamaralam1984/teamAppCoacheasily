import type { Tables } from "@/integrations/supabase/types";

export type Cycle = Tables<"cycles">;
export type Goal = Tables<"goals">;
export type GoalEntry = Tables<"goal_entries">;

/** Exactly what goal_progress() returns. Nothing in the app recomputes a percentage. */
export interface GoalProgress {
  goal_id: string;
  kind: "number" | "funnel";
  current_value: number;
  pct: number;
  /** how close to the line, counting where they already were */
  of_target: number;
  /** target equals baseline — there is no movement to measure */
  hold_the_line: boolean;
  totals: number[];
  week_totals: number[];
  prev_week_totals: number[];
  /** number goals: how far the figure moved this week / the week before (not a sum of the figures) */
  week_sum: number;
  prev_week_sum: number;
  week_rate: number | null;
  prev_week_rate: number | null;
  step_rates: {
    index: number;
    from: string;
    to: string;
    from_count: number;
    to_count: number;
    rate: number;
  }[];
  weakest_step: {
    index: number;
    from: string;
    to: string;
    from_count: number;
    to_count: number;
    rate: number;
  } | null;
  tracks_revenue: boolean;
  amount_total: number;
  logged_today: boolean;
  last_entry_date: string | null;
  entries_count: number;
}

export interface GoalWithProgress {
  goal: Goal;
  progress: GoalProgress | null;
}

export interface TeamGoalRow {
  profile: {
    id: string;
    full_name: string;
    title: string | null;
    department: string | null;
    role: string;
    manager_id: string | null;
  };
  goals: GoalWithProgress[];
  goal_count: number;
  avg_pct: number;
  last_entry_date: string | null;
  logged_today: boolean;
  days_since_log: number | null;
}

/* ── dates, always Mumbai time ─────────────────────────────── */

const IST = "Asia/Kolkata";

export function istToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayName(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
}

export function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
  );
}

/** We meet on Wednesdays. Default the next cycle to the first Wednesday on or after day 45. */
export function suggestedCycleEnd(from = istToday()): string {
  let d = addDays(from, 45);
  while (weekdayName(d) !== "Wednesday") d = addDays(d, 1);
  return d;
}

export function nearestWednesday(iso: string): string {
  let forward = iso;
  while (weekdayName(forward) !== "Wednesday") forward = addDays(forward, 1);
  let back = iso;
  while (weekdayName(back) !== "Wednesday") back = addDays(back, -1);
  return daysBetween(iso, forward) <= daysBetween(back, iso) ? forward : back;
}

/* ── role-based templates ──────────────────────────────────────
   A template is ONE SEALED UNIT. Its name, metric, unit and stages
   always travel together and are never combined across departments.
   Applying one replaces every shape field at once — see applyTemplate().
   Templates are a starting point, never a cage: every stage can be
   renamed, reordered, added to or removed in the goal form.        */

export interface GoalTemplate {
  /** department + slug, so a template can never be half-applied */
  id: string;
  department: string;
  name: string;
  kind: "number" | "funnel";
  metric: string;
  unit: string | null;
  /** funnel only — always 2 to 5, always in order */
  stages: string[] | null;
}

function funnel(department: string, name: string, stages: string[]): GoalTemplate {
  return {
    id: `${department}:${name}`,
    department,
    name,
    kind: "funnel",
    metric: stages.join(" → "),
    unit: null,
    stages,
  };
}

function number(
  department: string,
  name: string,
  metric: string,
  unit: string,
): GoalTemplate {
  return { id: `${department}:${name}`, department, name, kind: "number", metric, unit, stages: null };
}

export const TEMPLATES: Record<string, GoalTemplate[]> = {
  "Tele-calling": [
    funnel("Tele-calling", "Dials to quality leads", ["Dialled", "Connected", "Quality leads"]),
    number("Tele-calling", "Reminder calls completed", "Reminder calls completed", "%"),
  ],
  Sales: [
    funnel("Sales", "Calls to closures", ["Calls made", "Connected", "Closed"]),
    funnel("Sales", "Lock payments to full payment", [
      "Lock payments",
      "Followed up",
      "Full payment",
    ]),
  ],
  Coaching: [
    funnel("Coaching", "Students to completed task", [
      "Students contacted",
      "Attended session",
      "Completed task",
    ]),
    number("Coaching", "Task completion", "Task completion", "%"),
  ],
  Community: [
    funnel("Community", "Invited to showed up", ["Invited", "Registered", "Showed up"]),
    number("Community", "Members onboarded", "Members onboarded", "people"),
  ],
  "Customer Experience": [
    funnel("Customer Experience", "Queries resolved same day", [
      "Queries received",
      "First reply",
      "Resolved same day",
    ]),
    number("Customer Experience", "NPS", "NPS", "score"),
  ],
  Content: [
    number("Content", "Posts per week", "Posts published", "posts"),
    number("Content", "Ads per week", "Ads shipped", "ads"),
  ],
  Technology: [
    number("Technology", "Requests shipped", "Requests shipped", "requests"),
    number("Technology", "Downtime", "Downtime", "minutes"),
  ],
  "People & Culture": [
    funnel("People & Culture", "Joiners settled in 7 days", [
      "Joiners",
      "Onboarding started",
      "Done within 7 days",
    ]),
    number("People & Culture", "Roles filled", "Roles filled", "roles"),
  ],
  Leadership: [
    number(
      "Leadership",
      "Departments with a clear owner",
      "Departments with a clear owner",
      "departments",
    ),
  ],
  Finance: [number("Finance", "Days to close the books", "Days to close the books", "days")],
};

export const METRIC_SUGGESTIONS = [
  "Sales closed",
  "Calls made",
  "Conversion %",
  "Show-up rate %",
  "Session attendance %",
  "Task completion %",
  "Student retention %",
  "Members onboarded",
  "Weekly active members",
  "Response time (hours)",
  "Refund requests",
  "Payment completion %",
  "Revenue (₹ lakh)",
  "Videos published",
  "Ads per week",
  "Posts per week",
  "Leads followed up",
  "1:1s completed",
  "Call connection %",
  "NPS score",
  "Referrals",
  "Bugs fixed",
  "Tickets resolved",
  "Uptime %",
];

/** Every template in the company — used on the empty state, where a blank page is hardest. */
export function allTemplates(): GoalTemplate[] {
  return Object.values(TEMPLATES).flat();
}

/** A department People & Culture added themselves still gets a starting point. */
export function genericTemplates(department: string): GoalTemplate[] {
  return [
    funnel(department, "Reached to done", ["Reached out", "Responded", "Done"]),
    number(department, "Weekly output", "Things completed", "items"),
    number(department, "Quality", "Quality", "%"),
  ];
}

export function templatesFor(department: string | null | undefined): GoalTemplate[] {
  if (!department) return [];
  return TEMPLATES[department] ?? genericTemplates(department);
}

/** The only way a template may be used. Every shape field moves together. */
export function applyTemplate(t: GoalTemplate): {
  name: string;
  kind: "number" | "funnel";
  metric: string;
  unit: string;
  stages: string[];
} {
  return {
    name: t.name,
    kind: t.kind,
    metric: t.metric,
    unit: t.kind === "number" ? (t.unit ?? "") : "",
    stages: t.kind === "funnel" ? [...(t.stages ?? [])] : [],
  };
}


/* ── presentation helpers (never percentage maths) ─────────── */

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function deltaLabel(now: number | null, prev: number | null): string | null {
  if (now === null || prev === null) return null;
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return "level with last week";
  return `${d > 0 ? "▲" : "▼"}${Math.abs(d).toFixed(1)} vs last week`;
}

export function weekLine(goal: Goal, p: GoalProgress | null): string | null {
  if (!p) return null;
  if (goal.kind === "funnel" && goal.stages?.length) {
    const flow = goal.stages
      .map((s, i) => `${fmt(p.week_totals[i] ?? 0)} ${s.toLowerCase()}`)
      .join(" → ");
    const rate = p.week_rate === null ? null : `${p.week_rate.toFixed(1)}%`;
    const delta = deltaLabel(p.week_rate, p.prev_week_rate);
    return `This week: ${flow}${rate ? ` · ${rate}` : ""}${delta ? ` ${delta}` : ""}`;
  }
  const delta = deltaLabel(p.week_sum, p.prev_week_sum);
  return (
    `This week: moved ${signed(p.week_sum)} ${goal.unit ?? ""}`.trim() + (delta ? ` · ${delta}` : "")
  );
}

/** "+5", "−45", "0": a movement, never a bare number that could be mistaken for a total. */
export function signed(n: number): string {
  if (n === 0 || Number.isNaN(n)) return "0";
  return `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
}

/**
 * Where a number goal stood just before a day: the latest figure logged before it, or the starting
 * number when nothing had been logged yet.
 */
export function levelBefore(entries: GoalEntry[], day: string, baseline: number): number {
  let best: GoalEntry | null = null;
  for (const e of entries) {
    if (e.value === null || e.date >= day) continue;
    if (!best || e.date > best.date) best = e;
  }
  return best ? Number(best.value) : baseline;
}

/**
 * How far a number goal's figure travelled in each week since the cycle began. The figure logged is where
 * the person is, so a week's movement is end-of-week minus start-of-week, not the sum of the figures.
 */
export function weeklyMovement(
  entries: GoalEntry[],
  cycleStart: string,
  baseline: number,
  today = istToday(),
): { start: string; value: number }[] {
  const out: { start: string; value: number }[] = [];
  let start = cycleStart;
  let guard = 0;
  while (start <= today && guard < 60) {
    const nextStart = addDays(start, 7);
    out.push({
      start,
      value:
        levelBefore(entries, nextStart, baseline) - levelBefore(entries, start, baseline),
    });
    start = nextStart;
    guard += 1;
  }
  return out;
}

/** Which of the last n days have no entry — so people can fill the gaps. */
export function missingDays(
  entries: GoalEntry[],
  cycleStart: string,
  lookback = 7,
): string[] {
  const today = istToday();
  const have = new Set(entries.map((e) => e.date));
  const out: string[] = [];
  for (let i = 1; i <= lookback; i += 1) {
    const d = addDays(today, -i);
    if (d < cycleStart) break;
    if (!have.has(d)) out.push(d);
  }
  return out;
}

/* ── two figures, each explained ───────────────────────────────
   Movement stays the headline. "Of target" sits beside it, quieter.
   Nothing here computes a percentage — both come from goal_progress. */

export const PROGRESS_EXPLAINER = [
  "Moved this cycle is how far you travelled from where you started towards your target. It only counts what changed in these 45 days.",
  "Of target is how close you are to the finish line. It includes where you already were when the cycle began.",
  "Both matter. Moving from 0 to 7 is real work even when the target is 20 — that is why we lead with movement.",
];

export interface ProgressWords {
  /** the leading figure, always with its words */
  lead: string;
  /** the quieter second figure, or null when there is no movement to show */
  aside: string | null;
  /** one plain sentence for this situation */
  sentence: string;
  holding: boolean;
}

export function progressWords(p: GoalProgress | null | undefined): ProgressWords {
  const pct = p?.pct ?? 0;
  const ofTarget = p?.of_target ?? 0;

  if (p?.hold_the_line) {
    return {
      lead: `${fmt(ofTarget)}% of target`,
      aside: null,
      holding: true,
      sentence:
        ofTarget >= 100
          ? "Held the line all cycle, exactly as asked."
          : "Slipped below the level you were holding.",
    };
  }

  let sentence: string;
  if (pct >= 100) sentence = "Target reached. Well done.";
  else if (pct <= 0 && ofTarget >= 70)
    sentence = `You held at ${fmt(p?.current_value)} all cycle. Strong position, but the number did not move.`;
  else if (pct <= 0) sentence = "The number has not moved yet. Worth asking what is in the way.";
  else sentence = "Some ground gained. Still a way to the target.";

  return {
    lead: `${fmt(pct)}% moved this cycle`,
    aside: `${fmt(ofTarget)}% of target`,
    holding: false,
    sentence,
  };
}
