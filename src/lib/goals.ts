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
  totals: number[];
  week_totals: number[];
  prev_week_totals: number[];
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

/* ── role-based templates, one tap to pre-fill ─────────────── */

export interface GoalTemplate {
  name: string;
  kind: "number" | "funnel";
  metric: string;
  unit?: string;
  stages?: string[];
}

export const TEMPLATES: Record<string, GoalTemplate[]> = {
  Sales: [
    {
      name: "Calls to closures",
      kind: "funnel",
      metric: "Calls made → Connected → Closed",
      stages: ["Calls made", "Connected", "Closed"],
    },
    {
      name: "Lock payments to full payment",
      kind: "funnel",
      metric: "Lock payments → Followed up → Full payment",
      stages: ["Lock payments", "Followed up", "Full payment"],
    },
  ],
  "Tele-calling": [
    {
      name: "Dials to quality leads",
      kind: "funnel",
      metric: "Dialled → Connected → Quality leads",
      stages: ["Dialled", "Connected", "Quality leads"],
    },
    {
      name: "Reminder calls completed",
      kind: "number",
      metric: "Reminder calls completed",
      unit: "%",
    },
  ],
  Coaching: [
    {
      name: "Batch attendance",
      kind: "funnel",
      metric: "Students in batch → Reminded → Attended",
      stages: ["Students in batch", "Reminded", "Attended"],
    },
    { name: "Task completion", kind: "number", metric: "Task completion", unit: "%" },
    { name: "Response time", kind: "number", metric: "Response time", unit: "hours" },
  ],
  Community: [
    {
      name: "Enrolled to showed up",
      kind: "funnel",
      metric: "Enrolled → Reminded → Showed up",
      stages: ["Enrolled", "Reminded", "Showed up"],
    },
    { name: "Members onboarded", kind: "number", metric: "Members onboarded", unit: "people" },
    { name: "Refund requests", kind: "number", metric: "Refund requests", unit: "requests" },
  ],
  "Customer Experience": [
    {
      name: "Queries resolved",
      kind: "funnel",
      metric: "Queries received → First reply → Resolved",
      stages: ["Queries received", "First reply", "Resolved"],
    },
    { name: "NPS", kind: "number", metric: "NPS", unit: "score" },
  ],
  Content: [
    { name: "Posts per week", kind: "number", metric: "Posts published", unit: "posts" },
    { name: "Ads per week", kind: "number", metric: "Ads shipped", unit: "ads" },
  ],
  Technology: [
    { name: "Requests shipped", kind: "number", metric: "Requests shipped", unit: "requests" },
    { name: "Downtime", kind: "number", metric: "Downtime", unit: "minutes" },
    {
      name: "Bugs fixed",
      kind: "funnel",
      metric: "Bugs → Reproduced → Fixed",
      stages: ["Bugs", "Reproduced", "Fixed"],
    },
  ],
  "People & Culture": [
    { name: "Roles filled", kind: "number", metric: "Roles filled", unit: "roles" },
    {
      name: "Joiners settled in 7 days",
      kind: "funnel",
      metric: "Joiners → Started → Done in 7 days",
      stages: ["Joiners", "Started", "Done in 7 days"],
    },
  ],
  Leadership: [
    {
      name: "Departments with an owner",
      kind: "number",
      metric: "Departments with an owner",
      unit: "departments",
    },
  ],
};

export const METRIC_SUGGESTIONS = [
  "Calls made",
  "Quality leads",
  "Revenue collected",
  "Students attended",
  "Task completion %",
  "Response time (hours)",
  "Posts published",
  "Requests shipped",
  "Downtime minutes",
  "NPS",
];

export function templatesFor(department: string | null | undefined): GoalTemplate[] {
  if (!department) return [];
  return TEMPLATES[department] ?? [];
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
  return `This week: ${fmt(p.week_sum)} ${goal.unit ?? ""}`.trim() + (delta ? ` · ${delta}` : "");
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
