import { useMemo } from "react";

import { useProbationOverview } from "@/hooks/useProbation";
import { niceDate } from "@/lib/calendar";
import { PROBATION_LABEL, probationLeftText } from "@/lib/probation";

/** HR/Admin: everyone still on probation, soonest end date first. */
export function ProbationPanel({ onOpen }: { onOpen: (profileId: string) => void }) {
  const { data, isLoading } = useProbationOverview();
  const open = useMemo(
    () =>
      (data ?? [])
        .filter((r) => r.status !== "confirmed")
        .sort((a, b) => a.days_left - b.days_left),
    [data],
  );

  return (
    <div className="ce-card p-6">
      <h2 className="font-display text-2xl text-ink">Probation</h2>
      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-sm text-soft">Loading…</p>
        ) : open.length === 0 ? (
          <p className="text-sm text-soft">Nobody is on probation right now.</p>
        ) : (
          open.map((r) => (
            <button
              key={r.profile_id}
              type="button"
              onClick={() => onOpen(r.profile_id)}
              className="flex w-full min-h-11 items-center justify-between gap-3 rounded-lg text-left hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
            >
              <span className="text-sm font-semibold text-ink">{r.full_name}</span>
              <span className="flex flex-wrap items-center justify-end gap-2 text-[13px] text-soft">
                {niceDate(r.end_date)} · {probationLeftText(r.days_left)}
                {r.status === "under_review" || r.days_left <= 7 ? (
                  <span className="rounded-full bg-saff/12 px-2 py-0.5 text-[10px] font-bold tracking-wider text-saffBtn uppercase">
                    {r.status === "under_review" ? PROBATION_LABEL[r.status] : "Decide"}
                  </span>
                ) : null}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
