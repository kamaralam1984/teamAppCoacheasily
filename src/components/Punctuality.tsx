import type { PunctualityMe } from "@/lib/punctuality";

/**
 * Your own mornings. Quiet, private, and framed as momentum —
 * there is no league table here and there never will be.
 */
export function PunctualityCard({
  me,
  meetingTime,
  style,
}: {
  me: PunctualityMe | null | undefined;
  meetingTime: string;
  style?: React.CSSProperties;
}) {
  if (!me || me.working_days === 0) return null;
  const pct = Math.min(100, Math.round((me.early / me.working_days) * 100));

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <p className="ce-label">Your mornings</p>
      <h2 className="mt-1 font-display text-2xl text-ink">
        {me.early} of {me.working_days} mornings early this month
      </h2>
      <p className="mt-1 text-[13px] text-soft">
        Early means you were in before {meetingTime}. Your weekly off, approved leave and company
        holidays are never counted here.
      </p>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-cream">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-goldL transition-[width] duration-500"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] font-bold text-goldD">
        {pct >= 80
          ? "This is what dependable looks like."
          : pct >= 50
            ? "Solid. One more early morning a week and it becomes who you are."
            : "Every streak starts with tomorrow morning."}
      </p>
    </section>
  );
}
