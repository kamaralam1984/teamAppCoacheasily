import type { ExportColumn, ExportRow } from "@/lib/exporters";
import { addDays } from "@/lib/tasks";

export type ReportTab = "tasks" | "goals" | "numbers";

export interface ReportTable {
  title: string;
  subtitle: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

export interface MyReport {
  person: string;
  department: string | null;
  from: string;
  to: string;
  summary: {
    tasks: number;
    completed: number;
    overdue: number;
    pending: number;
    on_time: number;
    goals: number;
    numbers_logged: number;
    days: number;
  };
  tasks: ReportTable;
  goals: ReportTable;
  numbers: ReportTable;
}

export const TAB_LABEL: Record<ReportTab, string> = {
  tasks: "Tasks",
  goals: "Goals",
  numbers: "Daily numbers",
};

export interface RangePreset {
  id: string;
  label: string;
  /** inclusive start and end, ISO */
  range: (today: string) => { from: string; to: string };
}

/** 45 days is how long a goal cycle runs, so it is the first thing offered. */
export const RANGE_PRESETS: RangePreset[] = [
  { id: "d45", label: "Last 45 days", range: (t) => ({ from: addDays(t, -44), to: t }) },
  { id: "d30", label: "Last 30 days", range: (t) => ({ from: addDays(t, -29), to: t }) },
  { id: "d7", label: "Last 7 days", range: (t) => ({ from: addDays(t, -6), to: t }) },
  { id: "month", label: "This month", range: (t) => ({ from: `${t.slice(0, 8)}01`, to: t }) },
];

export const MAX_DAYS = 366;

/** Whole days between two ISO dates, inclusive of both ends. */
export function daysInRange(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Why the chosen dates cannot be run, or null when they can. */
export function rangeProblem(from: string, to: string): string | null {
  if (!from || !to) return "Pick both dates.";
  const days = daysInRange(from, to);
  if (days < 1) return "The end date is before the start date.";
  if (days > MAX_DAYS) return `Pick at most ${MAX_DAYS} days at a time.`;
  return null;
}

export function reportFileName(person: string, tab: ReportTab, from: string, to: string): string {
  return `${person} - ${TAB_LABEL[tab]} ${from} to ${to}`;
}
