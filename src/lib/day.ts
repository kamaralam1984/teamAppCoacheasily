/** Shapes returned by the daily-rhythm functions. Nothing here is recomputed in the interface. */

export interface DayTask {
  id: string;
  title: string;
  slot: string;
  done: boolean;
  repeats: string;
  carried_count: number;
  goal_id: string | null;
  goal_name: string | null;
}

export interface DayOption {
  id: string;
  title: string;
  slot: string;
  repeats: string;
  carried_count: number;
  goal_id: string | null;
  goal_name: string | null;
  due_date: string | null;
}

/** Exactly what my_day() returns. */
export interface MyDay {
  day: string;
  cap: number;
  committed_at: string | null;
  closed_at: string | null;
  note: string | null;
  tasks: DayTask[];
  available: DayOption[];
  total: number;
  done: number;
}

/** Exactly what close_day() returns. */
export interface CloseResult {
  total: number;
  done: number;
  carried: number;
  pct: number;
}

/** One row of day_report(). */
export interface DayReportRow {
  day: string;
  committed: number;
  done: number;
  pct: number;
  closed: boolean;
  note: string | null;
}

export function prettyLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function carriedLine(count: number): string | null {
  if (count < 1) return null;
  return `moved ${count} ${count === 1 ? "time" : "times"}`;
}

export const CARRY_COACHING =
  "This has moved three times. Is it too big to finish in a day, or is it not really a priority?";

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

/** "five" for 5, and the digits beyond ten — so the heading reads at any cap. */
export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}
