import type { CalEvent, Program } from "@/hooks/useCalendar";
import type { Profile } from "@/lib/warriors";

/** Ordinary events a manager is allowed to keep. Programmes are never in this list. */
export const ORDINARY_EVENT_TYPES = ["Meeting", "Review", "1:1", "Standup", "Training"] as const;

export function isOrdinary(type: string): boolean {
  return (ORDINARY_EVENT_TYPES as readonly string[]).includes(type);
}

/** Admin, People & Culture, or anyone given the calendar switch. */
export function keepsCalendar(p: Profile | null | undefined): boolean {
  if (!p) return false;
  return p.role === "hr" || p.role === "admin" || p.can_manage_calendar === true;
}

export function canAddEvents(p: Profile | null | undefined): boolean {
  return keepsCalendar(p) || p?.role === "manager";
}

export function canEditEvent(p: Profile | null | undefined, e: CalEvent): boolean {
  if (keepsCalendar(p)) return true;
  return Boolean(p && p.role === "manager" && e.created_by === p.id && isOrdinary(e.type));
}

export function canEditProgram(p: Profile | null | undefined, _program?: Program): boolean {
  return keepsCalendar(p);
}

export function whoToAsk(p: Profile | null | undefined): string {
  if (p?.role === "manager") {
    return "You can add and change your own meetings, reviews, 1:1s, standups and training. Company programmes and holidays are kept by HR and Admin — ask them for those.";
  }
  return "The calendar is kept by HR and Admin. Ask them to add, move or cancel anything here.";
}
