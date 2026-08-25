/**
 * Launch-week testing notice. Driven only by the `testing_until` org setting.
 * When the date is missing, unreadable or in the past, everything switches
 * itself off — nobody has to remember to remove the banner.
 */

const IST = "Asia/Kolkata";

export function istToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True while today (IST) is on or before `testing_until` (YYYY-MM-DD). */
export function isTestingActive(until: string | null | undefined): boolean {
  if (typeof until !== "string") return false;
  const value = until.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return istToday() <= value;
}

/** "2026-08-24" → "24 August" */
export function prettyTestingDate(until: string | null | undefined): string {
  if (typeof until !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(until.trim())) return "";
  const d = new Date(`${until.trim()}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(d);
}
