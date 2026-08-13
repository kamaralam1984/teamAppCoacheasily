import type { Tables } from "@/integrations/supabase/types";

export type Task = Tables<"tasks">;

export const SLOTS = ["Morning", "Afternoon", "Evening", "Anytime"] as const;
export type Slot = (typeof SLOTS)[number];

export const PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SLOT_ICON: Record<string, string> = {
  Morning: "🌅",
  Afternoon: "☀️",
  Evening: "🌙",
  Anytime: "",
};

const SLOT_RANK: Record<string, number> = { Morning: 0, Afternoon: 1, Evening: 2, Anytime: 3 };
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

export const PRIORITY_TONE: Record<string, string> = {
  Urgent: "bg-red/12 text-red",
  High: "bg-saff/12 text-saffBtn",
  Low: "bg-cream text-soft",
  Normal: "bg-cream text-soft",
};

export const IST = "Asia/Kolkata";

/** Today in IST, as YYYY-MM-DD. */
export function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST });
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

export function shortDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export type GroupKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "someday";

export const GROUPS: { key: GroupKey; label: string; dot: string; text: string }[] = [
  { key: "overdue", label: "Overdue", dot: "bg-red", text: "text-red" },
  { key: "today", label: "Today", dot: "bg-saff", text: "text-saffBtn" },
  { key: "tomorrow", label: "Tomorrow", dot: "bg-gold", text: "text-goldD" },
  { key: "week", label: "This week", dot: "bg-violet", text: "text-violet" },
  { key: "later", label: "Later", dot: "bg-soft/50", text: "text-soft" },
  { key: "someday", label: "No date yet", dot: "bg-soft/40", text: "text-soft" },
];

export function groupOf(task: Task, today = istToday()): GroupKey {
  if (!task.due_date) return "someday";
  if (task.due_date < today) return "overdue";
  if (task.due_date === today) return "today";
  if (task.due_date === addDays(today, 1)) return "tomorrow";
  if (task.due_date <= addDays(today, 7)) return "week";
  return "later";
}

export function compareTasks(a: Task, b: Task): number {
  const slot = (SLOT_RANK[a.slot] ?? 3) - (SLOT_RANK[b.slot] ?? 3);
  if (slot !== 0) return slot;
  const pri = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
  if (pri !== 0) return pri;
  return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
}

export function groupTasks(tasks: Task[], today = istToday()) {
  const open = tasks.filter((t) => !t.done);
  return GROUPS.map((g) => ({
    ...g,
    tasks: open.filter((t) => groupOf(t, today) === g.key).sort(compareTasks),
  })).filter((g) => g.tasks.length > 0);
}

/** Rolling 7-day completion: finished in the last 7 days vs everything that was due then. */
export function weekCompletion(tasks: Task[], today = istToday()) {
  const from = addDays(today, -6);
  const closed = tasks.filter(
    (t) => t.done && t.done_at && t.done_at.slice(0, 10) >= from && t.done_at.slice(0, 10) <= today,
  ).length;
  const stillOpen = tasks.filter(
    (t) => !t.done && t.due_date !== null && t.due_date <= today,
  ).length;
  const total = closed + stillOpen;
  return { closed, stillOpen, total, pct: total === 0 ? 0 : Math.round((closed / total) * 100) };
}
