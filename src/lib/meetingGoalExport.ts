import type { ExportColumn, ExportRow } from "@/lib/exporters";

/* The Strategic Meetings goals table as rows for the CSV and PDF downloads: the same columns the
   page shows, in the same order, with each week's update in its own column. */

export interface ExportGoal {
  id: string;
  title: string;
  measure: string | null;
  timeline: string | null;
  outcome: string | null;
  challenges?: string | null;
  learnings?: string | null;
}

export interface ExportUpdate {
  goal_id: string;
  week_start: string;
  note: string;
}

export interface MeetingGoalTable {
  title: string;
  subtitle: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

/** Week columns are keyed by their Monday, so two weeks can never share a column. */
const weekKey = (week: string) => `week_${week}`;

export function meetingGoalTable(args: {
  person: string;
  heading: string;
  period: string;
  goals: ExportGoal[];
  updates: ExportUpdate[];
  weeks: string[];
  weekLabel: (week: string) => string;
  dateLabel: (iso: string) => string;
  /** The optional Challenges / Learnings columns this table has added (one entry per goal). */
  columnsAdded?: ("challenges" | "learnings")[];
}): MeetingGoalTable {
  const notes = new Map<string, string>();
  for (const u of args.updates) notes.set(`${u.goal_id}|${u.week_start}`, u.note);

  const columns: ExportColumn[] = [
    { key: "no", label: "No" },
    { key: "title", label: "Goal / Task" },
    { key: "measure", label: "Measure" },
    { key: "timeline", label: "Timeline" },
    { key: "outcome", label: "Outcome" },
    ...args.weeks.map((w) => ({ key: weekKey(w), label: `Week of ${args.weekLabel(w)}` })),
  ];
  // only the optional columns this table has added, each goal's own entry beside it
  const boxes = (
    [
      ["challenges", "Challenges"],
      ["learnings", "Learnings"],
    ] as const
  ).filter(([key]) => args.columnsAdded?.includes(key));
  for (const [key, label] of boxes) columns.push({ key, label });

  const rows: ExportRow[] = args.goals.map((g, i) => {
    const row: ExportRow = {
      no: i + 1,
      title: g.title,
      measure: g.measure ?? "",
      timeline: g.timeline ? args.dateLabel(g.timeline) : "",
      outcome: g.outcome ?? "",
    };
    for (const w of args.weeks) row[weekKey(w)] = notes.get(`${g.id}|${w}`) ?? "";
    for (const [key] of boxes) row[key] = g[key] ?? "";
    return row;
  });

  return {
    title: `${args.person} - ${args.heading}`,
    subtitle: args.period,
    columns,
    rows,
  };
}
