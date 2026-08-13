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
  const days = summary?.days_marked ?? 0;
  const toNext = summary?.to_next_leave ?? 20;
  const streak = summary?.streak ?? 0;
  const progress = ((days % 20) / 20) * 100;

  return (
    <section className={`ce-rise ce-card p-6 ${className ?? ""}`} style={style}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">
          🔥 {days} {days === 1 ? "day" : "days"} worked in the app
        </h2>
        <p className="text-[13px] font-semibold text-goldD">
          {toNext} more and you earn a paid leave
        </p>
      </div>

      <div
        className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-cream"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={20}
        aria-valuenow={days % 20}
        aria-label="Progress to your next earned leave"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-goldL transition-[width] duration-500"
          style={{ width: `${Math.max(progress, 2)}%` }}
        />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-soft">
        Starts the day you first mark attendance here. 1 paid leave for every 20 days.
      </p>

      {showStreak && streak >= 2 ? (
        <p className="mt-3 text-[13px] font-semibold text-emer">
          {streak} days in a row — just for you, never on a leaderboard.
        </p>
      ) : null}
    </section>
  );
}
