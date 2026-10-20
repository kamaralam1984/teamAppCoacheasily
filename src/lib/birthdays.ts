import type { Profile } from "@/lib/warriors";

const IST = "Asia/Kolkata";

/** Today in IST, ISO. */
export function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST });
}

/** "MM-DD" for any ISO date. */
export function mmdd(iso: string): string {
  return iso.slice(5, 10);
}

export function isValidBirthday(b: string | null | undefined): b is string {
  return Boolean(b && /^\d{2}-\d{2}$/.test(b));
}

/** MM-DD on a profile → the next date it falls on, ISO. */
export function nextBirthday(b: string | null | undefined, from = istToday()): string | null {
  if (!isValidBirthday(b)) return null;
  const year = Number(from.slice(0, 4));
  const thisYear = `${year}-${b}`;
  return thisYear >= from ? thisYear : `${year + 1}-${b}`;
}

export function isBirthdayOn(p: Profile, dateIso: string): boolean {
  return p.status === "active" && isValidBirthday(p.birthday) && p.birthday === mmdd(dateIso);
}

export function isBirthdayToday(p: Profile | null | undefined): boolean {
  return Boolean(p && isBirthdayOn(p, istToday()));
}

/** Everyone whose birthday falls on that date. */
export function birthdaysOn(people: Profile[], dateIso: string): Profile[] {
  return people.filter((p) => isBirthdayOn(p, dateIso));
}

export function firstName(full: string): string {
  return full.split(" ")[0] ?? full;
}

export const BIRTHDAY_WISH_PREFIX = "🎂 Happy birthday";

export interface BirthdayPlan {
  /** the signed-in person's own birthday today: they get the full-screen greeting */
  mine: boolean;
  /** colleagues whose birthday is today, for the "today's birthdays" popup */
  others: Profile[];
}

/**
 * What to show when the app opens. The person whose day it is sees the full-screen greeting first; everybody
 * sees who else is celebrating, unless the organisation has switched team birthdays off.
 */
export function birthdayPlan(
  me: Profile | null | undefined,
  roster: Profile[],
  dateIso: string,
  showTeam = true,
): BirthdayPlan {
  if (!me) return { mine: false, others: [] };
  return {
    mine: isBirthdayOn(me, dateIso),
    others: showTeam ? birthdaysOn(roster, dateIso).filter((p) => p.id !== me.id) : [],
  };
}

/** One look per person per day per browser tab: a reload shows it again, moving around the app does not. */
export function birthdaySeenKey(profileId: string, dateIso: string): string {
  return `ce-birthday-seen-${profileId}-${dateIso}`;
}
