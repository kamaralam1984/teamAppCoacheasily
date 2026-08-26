import { useMemo } from "react";

import { useCarryingCount, useDayReport } from "@/hooks/useDay";
import { istToday, addDays } from "@/lib/tasks";

/** Kept promises over the last fortnight. Never a count of how much somebody did. */
export function KeptPromises({ profileId }: { profileId: string }) {
  const to = istToday();
  const from = useMemo(() => addDays(to, -13), [to]);

  const { data: rows } = useDayReport(profileId, from, to);
  const { data: carrying } = useCarryingCount(profileId);

  const days = rows ?? [];
  const avg =
    days.length === 0
      ? null
      : Math.round(days.reduce((sum, d) => sum + d.pct, 0) / days.length);
  const lastNote = days.find((d) => (d.note ?? "").trim().length > 0)?.note ?? null;

  return (
    <div className="mt-4 rounded-[12px] border border-line bg-cream/40 p-3.5">
      <p className="ce-label">Kept promises · last 14 days</p>
      {days.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-soft">
          No days committed yet — the daily rhythm is new.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] text-ink">
            <span className="font-bold">{days.length}</span>{" "}
            {days.length === 1 ? "day" : "days"} committed ·{" "}
            <span className="font-bold">{avg}%</span> of what was committed got finished ·{" "}
            <span className="font-bold">{carrying ?? 0}</span> carrying now
          </p>
          {lastNote ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-soft">
              Last carry-forward note: “{lastNote.trim()}”
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
