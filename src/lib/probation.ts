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
