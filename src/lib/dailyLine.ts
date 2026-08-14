/**
 * The one line on the login page that changes every day.
 *
 * Row-level security keeps daily_codes unreadable before sign-in, so these are
 * curated copies of the real rows, kept word for word. The pick is by
 * day-of-year in Asia/Kolkata so every warrior sees the same line on the
 * same day, whatever device they open.
 */
export type DailyLine = { value: "Honesty" | "Dedication" | "Genuine Care"; line: string };

export const DAILY_LINES: DailyLine[] = [
  { value: "Honesty", line: "Nobody is watching. That is the point." },
  { value: "Dedication", line: "Show up before you feel like it." },
  { value: "Genuine Care", line: "Somebody's dream is in your inbox." },
  { value: "Honesty", line: "Mark it only if you mean it." },
  { value: "Dedication", line: "The unglamorous hour." },
  { value: "Genuine Care", line: "Answer like it is your family asking." },
  { value: "Honesty", line: "A number you round up is a lie you tell yourself." },
  { value: "Dedication", line: "Consistency beats intensity." },
  { value: "Genuine Care", line: "Your teammate is having a day you cannot see." },
  { value: "Honesty", line: "Own the miss before you are asked." },
  { value: "Dedication", line: "Finish one thing completely." },
  { value: "Genuine Care", line: "Praise out loud, correct in private." },
  { value: "Honesty", line: "You cannot fix what you flatter." },
  { value: "Dedication", line: "Small hinges, heavy doors." },
  { value: "Genuine Care", line: "Be the reason somebody stays." },
  { value: "Honesty", line: "Half-present is not present." },
  { value: "Dedication", line: "The last ten percent is where the value lives." },
  { value: "Genuine Care", line: "The quiet one on the call." },
  { value: "Dedication", line: "Your future self is watching." },
];

/** Day-of-year in Mumbai, 1-based. */
export function istDayOfYear(now: Date = new Date()): number {
  const ist = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60000);
  const start = Date.UTC(ist.getFullYear(), 0, 1);
  const today = Date.UTC(ist.getFullYear(), ist.getMonth(), ist.getDate());
  return Math.floor((today - start) / 86400000) + 1;
}

export function lineOfTheDay(now: Date = new Date()): DailyLine {
  return DAILY_LINES[istDayOfYear(now) % DAILY_LINES.length]!;
}
