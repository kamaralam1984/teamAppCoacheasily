import type { Tables } from "@/integrations/supabase/types";

export type Recognition = Tables<"recognitions">;
export type CheckinRequest = Tables<"checkin_requests">;
export type Ritual = Tables<"rituals">;
export type SopItem = Tables<"sop_items">;

export const BADGES = [
  "Champion of the Cycle",
  "Quiet Engine",
  "Went the Extra Mile",
  "Customer Hero",
  "Team Player",
  "Fastest Learner",
] as const;

/** A check-in request with the person's name attached, for the manager view. */
export interface OpenCheckin extends CheckinRequest {
  full_name?: string;
}



export function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (day === istToday()) return "today";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The date shown on a "joined CoachEasily" card is the day the person actually joined. The card itself was
 * written when their profile was created, which for people added in one go is the same day for everybody.
 */
export function joinedLabel(joinedOn: string | null | undefined, createdAt: string): string {
  return whenLabel(joinedOn ? `${joinedOn}T12:00:00+05:30` : createdAt);
}

/** Badges first, then appreciation — newest first inside each. */
export function shelfOrder(rows: Recognition[]): Recognition[] {
  const rank = (r: Recognition) => (r.kind === "badge" ? 0 : r.kind === "welcome" ? 2 : 1);
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at),
  );
}
