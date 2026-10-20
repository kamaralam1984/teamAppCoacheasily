/** What a day was, as worked out by the database (attendance_day_info). */
export type DayKind =
  | "present"
  | "late"
  | "wfh"
  | "half_day"
  | "leave"
  | "holiday"
  | "weekly_off"
  | "absent"
  | "upcoming"
  | "not_marked"
  | "not_joined";

export interface DayInfo {
  date: string;
  kind: DayKind;
  late: boolean;
  check_in: string | null;
  check_out: string | null;
  hours: number | null;
  note: string | null;
  /** marked attendance on the person's own weekly off (the reason is in note) */
  weekly_off_work?: boolean;
}

export const KIND_LABEL: Record<DayKind, string> = {
  present: "Present",
  late: "Late",
  wfh: "Work from home",
  half_day: "Half day",
  leave: "On leave",
  holiday: "Holiday",
  weekly_off: "Weekly off",
  absent: "Absent",
  upcoming: "Upcoming",
  not_marked: "Not marked yet",
  not_joined: "Not part of the team",
};

/** Cell colours for the calendar and the badges. Absent is red; late is a nudge, not a mark. */
export const KIND_STYLE: Record<DayKind, string> = {
  present: "bg-emer/15 text-emer",
  late: "bg-saff/15 text-saffBtn",
  wfh: "bg-violet/12 text-violet",
  half_day: "bg-goldL/30 text-goldD",
  leave: "bg-mist/50 text-ink",
  holiday: "bg-goldL/20 text-goldD",
  weekly_off: "bg-cream text-soft",
  absent: "bg-red/12 text-red",
  upcoming: "bg-transparent text-soft/60",
  not_marked: "bg-cream text-soft",
  not_joined: "bg-transparent text-soft/40",
};

/** Days where the person did turn up. */
export function attended(kind: DayKind): boolean {
  return kind === "present" || kind === "late" || kind === "wfh" || kind === "half_day";
}

export function hoursLabel(hours: number | null): string | null {
  if (hours === null || hours === undefined) return null;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 60 ? `${h + 1}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** First of the month for an ISO date, as YYYY-MM-01. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function shiftMonth(first: string, by: number): string {
  const [y, m] = first.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function monthTitle(first: string): string {
  const [y, m] = first.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
