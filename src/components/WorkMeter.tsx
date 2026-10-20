import type { AttendanceSummary } from "@/hooks/useAttendance";

export interface WorkMeterProps {
  summary: AttendanceSummary | null | undefined;
  /** streak is private — only ever show it to the person themselves */
  showStreak?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** The earned-leave work meter. One component, so Dashboard and Leave never disagree. */
export function WorkMeter({ summary, showStreak = true, className, style }: WorkMeterProps) {
  const fromJoining = summary?.count_from === "joining_date";
  const days = fromJoining ? (summary?.el_days_total ?? 0) : (summary?.days_marked ?? 0);
  const required = summary?.el_required_days ?? 20;
  const done = summary?.el_progress ?? 0;
  const toNext = summary?.to_next_leave ?? required;
  const streak = summary?.streak ?? 0;
  const progress = (done / required) * 100;

  return (
    <section className={`ce-rise ce-card p-6 ${className ?? ""}`} style={style}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">
          🔥 {days} {fromJoining ? "working " : ""}
          {days === 1 ? "day" : "days"} {fromJoining ? "since you joined" : "worked in the app"}
        </h2>
        <p className="text-[13px] font-semibold text-goldD">
          {toNext} more {fromJoining ? "working days " : ""}and you earn a paid leave
        </p>
      </div>

      <div
        className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-cream"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={required}
        aria-valuenow={done}
        aria-label="Progress to your next earned leave"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-goldL transition-[width] duration-500"
          style={{ width: `${Math.max(progress, 2)}%` }}
        />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-soft">
        {fromJoining
          ? `Counted from your joining date${summary?.joined_on ? ` (${new Date(`${summary.joined_on}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })})` : ""}, whether or not you marked attendance on a day. Weekly offs, holidays and days on leave aren't counted. `
          : "Starts the day you first mark attendance here. "}
        1 paid leave for every {required} working days, counted by the company's leave policy.
      </p>

      {!fromJoining && summary?.el_days_total !== undefined && summary.days_marked > summary.el_days_total ? (
        <p className="mt-3 text-[13px] leading-relaxed text-soft">
          You have marked attendance on <b className="text-ink">{summary.days_marked}</b> days.{" "}
          <b className="text-ink">{summary.el_days_total}</b> of them count towards earned leave:{" "}
          {summary.days_marked - summary.el_days_total === 1
            ? "1 day doesn't count: it was a weekly off, a holiday or a half day."
            : `${summary.days_marked - summary.el_days_total} days don't count: they were weekly offs, holidays or half days.`}
        </p>
      ) : null}

      {showStreak && streak >= 2 ? (
        <p className="mt-3 text-[13px] font-semibold text-emer">
          {streak} days in a row — just for you, never on a leaderboard.
        </p>
      ) : null}
    </section>
  );
}
