import type { CalEvent, CalendarData, Holiday, LeaveDay, Program } from "@/hooks/useCalendar";
import { daysBetween, niceDate, rangeLabel, weekdayName } from "@/lib/calendar";
import type { Profile } from "@/lib/warriors";
import { isBirthdayOn } from "@/lib/birthdays";

export interface DayView {
  date: string;
  holiday: Holiday | null;
  programs: Program[];
  events: CalEvent[];
  leave: LeaveDay[];
  /** Whose birthday falls on this day — only those the viewer may see. */
  birthdays: Profile[];
  /** Host is away while they are meant to be running something. */
  conflicts: string[];
  /** Somebody is working a holiday or their own weekly off. */
  compOff: string[];
}

function covers(from: string, to: string, date: string) {
  return daysBetween(from, date) >= 0 && daysBetween(date, to) >= 0;
}

/** Programmes first, then scheduled events — each by start time, then name. */
function sortPrograms(a: Program, b: Program) {
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return (a.session_no ?? 0) - (b.session_no ?? 0);
}

function sortEvents(a: CalEvent, b: CalEvent) {
  const at = a.from_time ?? "99:99";
  const bt = b.from_time ?? "99:99";
  if (at !== bt) return at < bt ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function buildDayView(
  data: CalendarData | undefined,
  date: string,
  byId: Map<string, Profile>,
  /** Ids whose birthday may be shown. Omit to show none. */
  birthdayIds?: Set<string> | null,
): DayView {
  const view: DayView = {
    date,
    holiday: null,
    programs: [],
    events: [],
    leave: [],
    birthdays: [],
    conflicts: [],
    compOff: [],
  };
  if (birthdayIds) {
    view.birthdays = Array.from(byId.values())
      .filter((p) => birthdayIds.has(p.id) && isBirthdayOn(p, date))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }
  if (!data) return view;

  view.holiday = data.holidays.find((h) => h.date === date) ?? null;
  view.programs = data.programs.filter((p) => covers(p.from_date, p.to_date, date)).sort(sortPrograms);
  view.events = data.events
    .filter((e) => covers(e.date, e.end_date ?? e.date, date))
    .sort(sortEvents);
  view.leave = data.leave
    .filter((l) => covers(l.from_date, l.to_date, date))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const away = new Set(view.leave.map((l) => l.profile_id));
  const dayName = weekdayName(date);

  for (const p of view.programs) {
    const host = p.host_id ? byId.get(p.host_id) : undefined;
    if (p.host_id && away.has(p.host_id)) {
      const leave = view.leave.find((l) => l.profile_id === p.host_id);
      view.conflicts.push(
        `⚠️ ${host?.full_name ?? "The host"} is hosting ${p.name} (${rangeLabel(
          p.from_date,
          p.to_date,
        )}) but is on approved leave on ${niceDate(date)}${
          leave ? ` (${leave.type.replace("_", "-")})` : ""
        }. Nobody is covering.`,
      );
    }
    if (view.holiday) {
      view.compOff.push(
        `⚖️ ${p.name} runs on ${view.holiday.name}, a company holiday. Whoever works today should get a comp-off.`,
      );
    }
    if (host && host.weekly_off === dayName && !away.has(host.id)) {
      view.compOff.push(
        `⚖️ ${host.full_name} is hosting ${p.name} on their weekly off (${dayName}). Whoever works today should get a comp-off.`,
      );
    }
  }

  view.compOff = Array.from(new Set(view.compOff));
  view.conflicts = Array.from(new Set(view.conflicts));
  return view;
}

/** Every host-on-leave clash inside a date window, for the month strip. */
export function monthConflicts(
  data: CalendarData | undefined,
  dates: string[],
  byId: Map<string, Profile>,
): string[] {
  const all: string[] = [];
  for (const d of dates) {
    all.push(...buildDayView(data, d, byId).conflicts);
  }
  return Array.from(new Set(all));
}
