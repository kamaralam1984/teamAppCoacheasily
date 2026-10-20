import { IST, addDays, istToday, shortDay, type Task } from "@/lib/tasks";
import { statusOf } from "@/lib/taskWorkflow";

export type PendingTone = "late" | "today" | "wait" | "idle";

export interface PendingItem {
  task: Task;
  /** what is missing, in a few plain words */
  reason: string;
  tone: PendingTone;
}

export interface WhatsLeft {
  total: number;
  overdue: number;
  dueToday: number;
  /** not started: still Assigned or Accepted */
  notStarted: number;
  inProgress: number;
  /** done from the owner's side, waiting for the person who asked to check it */
  inReview: number;
  blocked: number;
  noDate: number;
  items: PendingItem[];
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * What is still left for a person: every task that is not completed, each with the reason it is still open.
 * `byId` lets a task say it is waiting on another one.
 */
export function whatsLeft(tasks: Task[], byId: Map<string, Task>, today = istToday()): WhatsLeft {
  const open = tasks.filter((t) => statusOf(t) !== "completed" && !t.done);
  const out: WhatsLeft = {
    total: open.length,
    overdue: 0,
    dueToday: 0,
    notStarted: 0,
    inProgress: 0,
    inReview: 0,
    blocked: 0,
    noDate: 0,
    items: [],
  };

  for (const task of open) {
    const status = statusOf(task);
    const blocker = task.blocked_by ? byId.get(task.blocked_by) : undefined;
    const blockedNow = Boolean(blocker && !blocker.done && statusOf(blocker) !== "completed");
    const late = task.due_date !== null && task.due_date < today;

    if (late) out.overdue += 1;
    if (task.due_date === today) out.dueToday += 1;
    if (task.due_date === null) out.noDate += 1;
    if (status === "assigned" || status === "accepted") out.notStarted += 1;
    if (status === "in_progress") out.inProgress += 1;
    if (status === "review") out.inReview += 1;
    if (blockedNow) out.blocked += 1;

    let reason: string;
    let tone: PendingTone;
    if (status === "review") {
      reason = "Sent for review — waiting for the person who asked";
      tone = "wait";
    } else if (blockedNow && blocker) {
      reason = `Waiting on “${blocker.title}”`;
      tone = "wait";
    } else if (late && task.due_date) {
      const days = daysBetween(task.due_date, today);
      reason = `${plural(days, "day")} late — was due ${shortDay(task.due_date)}${
        status === "in_progress" ? ", in progress" : ", not started"
      }`;
      tone = "late";
    } else if (task.due_date === today) {
      reason = status === "in_progress" ? "Due today — in progress" : "Due today — not started";
      tone = "today";
    } else if (task.due_date) {
      reason = `Due ${shortDay(task.due_date)}${status === "in_progress" ? " — in progress" : " — not started"}`;
      tone = "idle";
    } else {
      reason = status === "in_progress" ? "No date — in progress" : "No date — not started";
      tone = "idle";
    }
    out.items.push({ task, reason, tone });
  }

  const rank: Record<PendingTone, number> = { late: 0, today: 1, idle: 2, wait: 3 };
  out.items.sort(
    (a, b) =>
      rank[a.tone] - rank[b.tone] ||
      (a.task.due_date ?? "9999-12-31").localeCompare(b.task.due_date ?? "9999-12-31") ||
      a.task.created_at.localeCompare(b.task.created_at),
  );
  return out;
}

/** The day a task was finished, in India time. */
export function doneDay(task: Task): string | null {
  if (!task.done_at) return null;
  return new Date(task.done_at).toLocaleDateString("en-CA", { timeZone: IST });
}

/** "Done 12 Oct · on time" or "Done 12 Oct · 3 days late". */
export function doneLine(task: Task): string {
  const day = doneDay(task);
  if (!day) return "Done";
  const base = `Done ${shortDay(day)}`;
  if (!task.due_date) return base;
  const late = daysBetween(task.due_date, day);
  return late <= 0 ? `${base} · on time` : `${base} · ${plural(late, "day")} late`;
}

/** Completed tasks, newest first, and how many were finished in the last seven days. */
export function completedSummary(tasks: Task[], today = istToday()) {
  const done = tasks
    .filter((t) => statusOf(t) === "completed" || t.done)
    .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const from = addDays(today, -6);
  const thisWeek = done.filter((t) => {
    const day = doneDay(t);
    return day !== null && day >= from && day <= today;
  }).length;
  return { done, thisWeek };
}
