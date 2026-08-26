import type { TeamPromise } from "@/hooks/useDay";

/** Kept promises over the last fortnight. Never a count of how much somebody did. */
export function KeptPromises({ stats }: { stats: TeamPromise | undefined }) {
  const days = stats?.days_committed ?? 0;
  const avg = days === 0 ? null : Math.round(stats?.avg_pct ?? 0);
  const lastNote = stats?.last_note ?? null;

  return (
    <div className="mt-4 rounded-[12px] border border-line bg-cream/40 p-3.5">
      <p className="ce-label">Kept promises · last 14 days</p>
      {days === 0 ? (
        <p className="mt-1.5 text-[13px] text-soft">
          No days committed yet — the daily rhythm is new.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] text-ink">
            <span className="font-bold">{days}</span>{" "}
            {days === 1 ? "day" : "days"} committed ·{" "}
            <span className="font-bold">{avg}%</span> of what was committed got finished ·{" "}
            <span className="font-bold">{stats?.carrying ?? 0}</span> carrying now
          </p>
          {lastNote && lastNote.trim().length > 0 ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-soft">
              Last carry-forward note: “{lastNote.trim()}”
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
