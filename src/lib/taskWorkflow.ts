import { istToday, type Task } from "@/lib/tasks";

/** Assigned → Accepted → In progress → Review → Completed. The database enforces the rules. */
export type TaskStatus = "assigned" | "accepted" | "in_progress" | "review" | "completed";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: "Assigned",
  accepted: "Accepted",
  in_progress: "In progress",
  review: "In review",
  completed: "Completed",
};

export const STATUS_TONE: Record<TaskStatus, string> = {
  assigned: "bg-violet/12 text-violet",
  accepted: "bg-cream text-soft",
  in_progress: "bg-goldL/30 text-goldD",
  review: "bg-saff/15 text-saffBtn",
  completed: "bg-emer/15 text-emer",
};

export function statusOf(task: Task): TaskStatus {
  return (task.status as TaskStatus) ?? (task.done ? "completed" : "accepted");
}

/** Overdue is never stored: it is "not completed and past its date". */
export function isOverdue(task: Task, today = istToday()): boolean {
  return (
    statusOf(task) !== "completed" && Boolean(task.due_date) && (task.due_date as string) < today
  );
}

/** Made by and for the same person: no hand-over, so no review. */
export function isSelfMade(task: Task): boolean {
  return !task.created_by || task.created_by === task.owner_id;
}

export interface TaskAction {
  label: string;
  to: TaskStatus;
  /** the main next step, drawn as a solid button */
  primary?: boolean;
  danger?: boolean;
}

/**
 * The buttons a person gets on a task. Mirrors the rules in the database
 * (tasks_aa_workflow); if the two ever disagree, the database wins and the app shows its message.
 */
export function actionsFor(
  task: Task,
  opts: { isOwner: boolean; isReviewer: boolean },
): TaskAction[] {
  const status = statusOf(task);
  const selfMade = isSelfMade(task);

  if (opts.isOwner) {
    switch (status) {
      case "assigned":
        return [
          { label: "Accept", to: "accepted", primary: true },
          { label: "Start now", to: "in_progress" },
        ];
      case "accepted":
        return [{ label: "Start", to: "in_progress", primary: true }];
      case "in_progress":
        return [
          selfMade
            ? { label: "Mark complete", to: "completed", primary: true }
            : { label: "Send for review", to: "review", primary: true },
        ];
      case "review":
        return [{ label: "Take back to work on it", to: "in_progress" }];
      case "completed":
        return selfMade ? [{ label: "Reopen", to: "in_progress" }] : [];
    }
  }
  if (opts.isReviewer) {
    switch (status) {
      case "review":
        return [
          { label: "Approve", to: "completed", primary: true },
          { label: "Send back", to: "in_progress", danger: true },
        ];
      case "completed":
        return [{ label: "Reopen", to: "in_progress" }];
      default:
        return [{ label: "Mark complete", to: "completed" }];
    }
  }
  return [];
}

export const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  status: "Status",
  reassigned: "Handed over",
  due_changed: "Date changed",
  priority_changed: "Priority changed",
  comment: "Comment",
  overdue: "Became overdue",
};

/** One line for the history list. */
export function describeEvent(e: {
  kind: string;
  from_value: string | null;
  to_value: string | null;
}): string {
  const pretty = (v: string | null) =>
    v ? (STATUS_LABEL[v as TaskStatus] ?? v.replace("_", " ")) : "none";
  switch (e.kind) {
    case "created":
      return `Created (${pretty(e.to_value)})`;
    case "status":
      return `${pretty(e.from_value)} → ${pretty(e.to_value)}`;
    case "reassigned":
      return `Handed from ${e.from_value ?? "someone"} to ${e.to_value ?? "someone"}`;
    case "due_changed":
      return `Date ${e.from_value ?? "none"} → ${e.to_value ?? "none"}`;
    case "priority_changed":
      return `Priority ${e.from_value ?? "none"} → ${e.to_value ?? "none"}`;
    case "comment":
      return `Commented: ${e.to_value ?? ""}`;
    case "overdue":
      return `Passed its date (${e.to_value ?? ""})`;
    default:
      return e.kind;
  }
}
