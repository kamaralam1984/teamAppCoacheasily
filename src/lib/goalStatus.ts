/** Worked out by the database (goal_status_info) the same way for everyone. */
export type GoalStatus = "on_track" | "at_risk" | "completed" | "overdue";

export interface GoalStatusRow {
  goal_id: string;
  name: string;
  kind: "number" | "funnel";
  unit: string | null;
  status: GoalStatus;
  /** how far from baseline to target */
  pct: number;
  /** where an even pace through the cycle would be by today */
  expected_pct: number;
  milestones_total: number;
  milestones_done: number;
  comments: number;
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  completed: "Completed",
  overdue: "Overdue",
};

export const GOAL_STATUS_TONE: Record<GoalStatus, string> = {
  on_track: "bg-emer/15 text-emer",
  at_risk: "bg-saff/15 text-saffBtn",
  completed: "bg-violet/12 text-violet",
  overdue: "bg-red/12 text-red",
};

export const GOAL_STATUS_HELP: Record<GoalStatus, string> = {
  on_track: "Progress is close to an even pace through the cycle.",
  at_risk: "Progress is 20 points or more behind an even pace.",
  completed: "The target has been reached.",
  overdue: "The cycle is over and the target wasn't reached.",
};
