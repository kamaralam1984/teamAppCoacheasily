/**
 * The 11 AM standup.
 *
 * Every word here is written to sound like a coach who believes in you.
 * Nothing in this file scolds, ranks or shames — it lifts, and it points
 * at tomorrow. If you edit these lines, keep that promise.
 */

export interface PunctualityMe {
  working_days: number;
  marked: number;
  early: number;
  today_on_time: boolean | null;
  today_marked_at: string | null;
}

export interface PunctualityRow {
  profile_id: string;
  full_name: string;
  title: string | null;
  department: string | null;
  role: string;
  working_days: number;
  marked: number;
  early: number;
  pct_early: number;
  avg_punch: string | null;
}

export interface OrgSettings {
  daily_meeting_url?: string;
  daily_meeting_time?: string;
  timezone?: string;
  /** Show everybody's birthday in "Coming up". The founder's always shows. */
  team_birthdays?: boolean;
  /** Automatic daily and Monday summary emails. Off until switched on here. */
  digests_enabled?: boolean;
  /** Yearly leave entitlements. People & Culture own these, not the code. */
  casual_quota?: number;
  sick_quota?: number;
  /** How many casual days one person may take in a single quarter. */
  casual_quarter_cap?: number;
  /** Launch-week testing notice. YYYY-MM-DD; empty or past switches it off. */
  testing_until?: string | null;
}

export const DEFAULT_MEETING_TIME = "11:00";

/** "11:00" → "11:00 AM" */
export function prettyTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m ?? "00"} ${suffix}`;
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function mornings(n: number): string {
  return `${n} early morning${n === 1 ? "" : "s"} this month`;
}

const EARLY = [
  (t: string, n: number) => `🔥 ${t} — you're early. That's ${mornings(n)}.`,
  (t: string, n: number) =>
    `🔥 ${t}. In before the room fills up — ${mornings(n)} and counting.`,
  (t: string, n: number) =>
    `🔥 ${t} — the day starts on your terms. ${mornings(n)}.`,
  (t: string, n: number) =>
    `🔥 ${t}. Ready before eleven, again. That's ${mornings(n)}.`,
];

const LATE = [
  (t: string, n: number) =>
    `${t} today. On time is late — the room is better when you're already in it. Tomorrow, aim for 10:55. You already have ${mornings(n)}.`,
  (t: string, n: number) =>
    `${t} today. No drama — just come in a little earlier tomorrow. ${mornings(n)} says you know how.`,
  (t: string, n: number) =>
    `${t}. The team feels it when you're there first. Try 10:55 tomorrow — that's ${mornings(n)} you can build on.`,
  (t: string, n: number) =>
    `${t} today. One morning doesn't decide anything. ${mornings(n)} already, and tomorrow is another one.`,
];

/** The two moments — same warmth, different message. */
export function punchMessage(onTime: boolean, at: string, earlyThisMonth: number): string {
  const time = prettyTime(at) || at;
  return (onTime ? pick(EARLY) : pick(LATE))(time, earlyThisMonth);
}

export function csvEscape(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function punctualityCsv(rows: PunctualityRow[], monthLabel: string): string {
  const head = [
    "Warrior",
    "Title",
    "Department",
    "Working days",
    "Mornings marked",
    "Mornings early",
    "% early",
    "Average punch",
  ];
  const body = rows.map((r) =>
    [
      r.full_name,
      r.title ?? "",
      r.department ?? "",
      r.working_days,
      r.marked,
      r.early,
      r.pct_early,
      r.avg_punch ?? "",
    ]
      .map(csvEscape)
      .join(","),
  );
  return [`Timeliness — ${monthLabel}`, head.join(","), ...body].join("\n");
}
