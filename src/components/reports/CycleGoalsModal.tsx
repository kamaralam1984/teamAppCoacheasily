import { useEffect } from "react";

import { useGoalsFor } from "@/hooks/useGoals";
import { scoreTone } from "@/lib/reports";

/** Read-only. People & Culture look at the record; they never edit somebody's goal. */
export function CycleGoalsModal({
  profileId,
  name,
  cycleId,
  cycleName,
  onClose,
}: {
  profileId: string;
  name: string;
  cycleId: string;
  cycleName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useGoalsFor(profileId, cycleId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-[18px] bg-white p-6 sm:rounded-[18px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ce-label">{cycleName} · read only</p>
            <h2 className="mt-1 font-display text-3xl text-ink">{name}</h2>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-full border border-line px-4 text-[13px] font-bold text-soft"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-soft">Opening the record…</p>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="mt-6 rounded-[14px] bg-cream px-4 py-4 text-sm text-soft">
            No goals were written in this cycle.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {data!.map(({ goal, progress }) => {
              const pct = progress?.pct ?? 0;
              return (
                <li key={goal.id} className="rounded-[14px] border border-line p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[15px] font-bold text-ink">{goal.name}</p>
                    <span className={`font-display text-2xl ${scoreTone(pct)}`}>
                      {Math.round(pct)}%
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-soft">
                    {goal.kind === "funnel"
                      ? (goal.stages ?? []).join(" → ")
                      : `${goal.metric ?? "Number"}${goal.unit ? ` · ${goal.unit}` : ""}`}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-cream">
                    <div
                      className="h-full rounded-full bg-emer"
                      style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-soft">
                    From {goal.baseline} to {goal.target}
                    {progress ? ` · now ${progress.current_value}` : ""}
                  </p>
                  {goal.learnings ? (
                    <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-soft">
                      {goal.learnings}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
