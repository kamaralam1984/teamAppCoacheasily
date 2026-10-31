import type { ProbationStatus } from "@/hooks/useProbation";

export const PROBATION_LABEL: Record<ProbationStatus, string> = {
  on_probation: "On probation",
  under_review: "Under review",
  confirmed: "Confirmed",
};

export function probationLeftText(daysLeft: number) {
  if (daysLeft < 0) return `ended ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`;
  if (daysLeft === 0) return "ends today";
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
}

/** Probation runs 90 days from joining. */
export const PROBATION_DAYS = 90;

/**
 * The reminder point a probation has reached: 15, 10, 5 and 2 days before the end, the last day,
 * and after it ended with no decision. Null when it is further off. Matches probation_tick().
 */
export function probationReminderPoint(daysLeft: number): string | null {
  if (daysLeft < 0) return "ended";
  if (daysLeft === 0) return "today";
  if (daysLeft <= 2) return "2d";
  if (daysLeft <= 5) return "5d";
  if (daysLeft <= 10) return "10d";
  if (daysLeft <= 15) return "15d";
  return null;
}

export function probationLengthText(startDate: string, endDate: string) {
  const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000);
  return `${days} days`;
}
