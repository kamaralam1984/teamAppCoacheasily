/** The reports in the report centre. The numbers come from the database (report_run). */
export type RangeKind = "range" | "none";

export interface ReportDef {
  id: string;
  label: string;
  blurb: string;
  /** only HR and admin can run it; the database refuses everybody else */
  hrOnly: boolean;
  range: RangeKind;
  /** the longest range the report accepts, in days */
  maxDays: number;
  defaultRange: "month" | "year" | "next30" | "next60" | "none";
}

export const REPORTS: ReportDef[] = [
  {
    id: "attendance",
    label: "Attendance",
    blurb:
      "Per person: present, late, work from home, half days, leave and absent, with attendance %.",
    hrOnly: false,
    range: "range",
    maxDays: 92,
    defaultRange: "month",
  },
  {
    id: "tasks",
    label: "Tasks",
    blurb:
      "Per person: tasks due in the range, completed, on time, pending, in review and overdue.",
    hrOnly: false,
    range: "range",
    maxDays: 92,
    defaultRange: "month",
  },
  {
    id: "activity",
    label: "Work and activity",
    blurb:
      "Per person: days in, tasks completed, goal numbers logged, weekly reviews and comments.",
    hrOnly: false,
    range: "range",
    maxDays: 92,
    defaultRange: "month",
  },
  {
    id: "goals",
    label: "Goal progress",
    blurb: "One row per goal in the active cycle: status, progress, even pace and milestones.",
    hrOnly: false,
    range: "none",
    maxDays: 0,
    defaultRange: "none",
  },
  {
    id: "department",
    label: "Department performance",
    blurb: "Each department's attendance, task completion and goal health, rolled up.",
    hrOnly: true,
    range: "range",
    maxDays: 92,
    defaultRange: "month",
  },
  {
    id: "manager",
    label: "Manager performance",
    blurb: "The same numbers rolled up for each manager's team.",
    hrOnly: true,
    range: "range",
    maxDays: 92,
    defaultRange: "month",
  },
  {
    id: "leave",
    label: "Leave",
    blurb: "Every leave request that touches the range, with who decided it and when.",
    hrOnly: true,
    range: "range",
    maxDays: 731,
    defaultRange: "month",
  },
  {
    id: "earned_leave",
    label: "Earned leave transactions",
    blurb: "Each automatic credit with the working days behind it, and any yearly lapse.",
    hrOnly: true,
    range: "range",
    maxDays: 731,
    defaultRange: "year",
  },
  {
    id: "holidays",
    label: "Holidays",
    blurb: "The holiday calendar with each holiday's type and approval status.",
    hrOnly: true,
    range: "range",
    maxDays: 731,
    defaultRange: "year",
  },
  {
    id: "probation",
    label: "Probation",
    blurb: "Everyone's probation, open ones first, with the days left and decisions made.",
    hrOnly: true,
    range: "none",
    maxDays: 0,
    defaultRange: "none",
  },
  {
    id: "birthdays",
    label: "Birthdays",
    blurb: "Birthdays that fall in the range, soonest first.",
    hrOnly: true,
    range: "range",
    maxDays: 731,
    defaultRange: "next60",
  },
];

export function reportById(id: string): ReportDef | undefined {
  return REPORTS.find((r) => r.id === id);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Start and end dates for a default range, counted from today (an ISO date). */
export function defaultDates(
  kind: ReportDef["defaultRange"],
  today: string,
): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  switch (kind) {
    case "month":
      return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "next30":
    case "next60": {
      const end = new Date(`${today}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + (kind === "next30" ? 30 : 60));
      return { from: today, to: iso(end) };
    }
    default:
      return { from: today, to: today };
  }
}

/** Shorthand ranges for the quick-pick buttons. */
export function presetDates(
  preset: "this_month" | "last_month" | "last_30" | "this_year",
  today: string,
): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  if (preset === "this_month") return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
  if (preset === "last_month") {
    const first = new Date(Date.UTC(y, m - 2, 1));
    const last = new Date(Date.UTC(y, m - 1, 0));
    return { from: iso(first), to: iso(last) };
  }
  if (preset === "last_30") {
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 29);
    return { from: iso(start), to: today };
  }
  return { from: `${y}-01-01`, to: today };
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
