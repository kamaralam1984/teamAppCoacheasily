import { useState } from "react";

import { useOpenCycle } from "@/hooks/useGoals";
import {
  daysBetween,
  istToday,
  nearestWednesday,
  suggestedCycleEnd,
  weekdayName,
  type Cycle,
} from "@/lib/goals";
import { shortDate } from "@/lib/warriors";

export function CyclePanel({
  cycle,
  canOpen,
  style,
}: {
  cycle: Cycle | null;
  canOpen: boolean;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [end, setEnd] = useState(suggestedCycleEnd());
  const [name, setName] = useState("");
  const openCycle = useOpenCycle();

  const today = istToday();
  const isWed = weekdayName(end) === "Wednesday";
  const near = isWed ? end : nearestWednesday(end);
  const length = daysBetween(today, end);
  const ended = Boolean(cycle && cycle.end_date < today);
  const endedDays = cycle ? daysBetween(cycle.end_date, today) : 0;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="ce-label">Current cycle</p>
          <h2 className="mt-1 font-display text-2xl text-ink">
            {cycle ? cycle.name : "No cycle running"}
          </h2>
          {cycle ? (
            <p className="mt-1 text-[13px] text-soft">
              {shortDate(cycle.start_date)} → {shortDate(cycle.end_date)} ·{" "}
              {ended
                ? `ended ${endedDays} day${endedDays === 1 ? "" : "s"} ago`
                : `${Math.max(0, daysBetween(today, cycle.end_date))} days to the strategic meeting`}
            </p>
          ) : null}
          {cycle && ended ? (
            <p className="mt-3 rounded-xl border border-saff/40 bg-saff/10 p-3 text-[13px] leading-relaxed font-semibold text-[color:var(--ce-saffBtn)]">
              {canOpen
                ? "This cycle has ended. Open the next cycle so everyone can write fresh goals."
                : "This cycle has ended. HR will open the next one; keep logging your numbers until then and they stay on this cycle."}
            </p>
          ) : null}
        </div>
        {canOpen ? (
          <button
            type="button"
            className={
              ended && !open
                ? "btn3d"
                : "min-h-11 rounded-full border border-line px-4 text-[12px] font-bold text-goldD"
            }
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Open the next cycle"}
          </button>
        ) : null}
      </div>

      {open && canOpen ? (
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-[13px] leading-relaxed text-soft">
            Pick the date of the next strategic meeting. Opening a new cycle closes{" "}
            {cycle ? cycle.name : "the current cycle"} — it stays readable forever — and asks
            everyone to write fresh goals.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="ce-label">Next strategic meeting</span>
              <input
                type="date"
                className="ce-input mt-1 h-12 w-[190px]"
                value={end}
                min={today}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <label className="block flex-1">
              <span className="ce-label">Cycle name (optional)</span>
              <input
                className="ce-input mt-1 h-12 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Strategic Meeting 3"
              />
            </label>
          </div>

          {isWed ? (
            <p className="mt-3 text-[13px] font-semibold text-emer">
              ✓ {shortDate(end)} is a Wednesday — a {length}-day cycle.
            </p>
          ) : (
            <p className="mt-3 text-[13px] font-semibold text-[color:var(--ce-saffBtn)]">
              ⚠️ that is a {weekdayName(end)}; your meetings run on Wednesdays — nearest is{" "}
              {shortDate(near)}.{" "}
              <button type="button" className="underline" onClick={() => setEnd(near)}>
                Use it
              </button>
            </p>
          )}

          <button
            type="button"
            className="btn3d mt-4"
            disabled={openCycle.isPending || end <= today}
            onClick={() =>
              openCycle.mutate(
                { endDate: end, ...(name.trim() ? { name: name.trim() } : {}) },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            {openCycle.isPending ? "Opening…" : "Open the cycle"}
          </button>

          {openCycle.isError ? (
            <p className="mt-3 text-[13px] font-semibold text-red">
              {(openCycle.error as Error).message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
