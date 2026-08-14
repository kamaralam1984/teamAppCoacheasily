import { useMemo, useState } from "react";

import {
  useDeleteSeries,
  useExtendSeries,
  useRestoreItem,
  useSeries,
  type SeriesRow,
} from "@/hooks/useCalendar";
import { WEEKDAYS, addDays, dayOfWeek, daysBetween, longDate, todayIso } from "@/lib/calendar";

interface Props {
  table: "events" | "programs";
  seriesId: string;
  orgId: string;
  createdBy: string;
  onClose: () => void;
}

/** The pattern most of the occurrences follow — used for the summary line. */
function describe(rows: SeriesRow[]): { dow: number | null; every: number; time: string | null } {
  const live = rows.filter((r) => r.status !== "cancelled");
  if (live.length === 0) return { dow: null, every: 1, time: null };
  const dow = dayOfWeek(live[0]!.date);
  const gaps = live.slice(1).map((r, i) => daysBetween(live[i]!.date, r.date));
  const weekly = gaps.length ? Math.max(1, Math.round(Math.min(...gaps) / 7)) : 1;
  return { dow, every: weekly, time: live[0]!.from_time ?? null };
}

export function SeriesPanel({ table, seriesId, orgId, createdBy, onClose }: Props) {
  const { data: rows, isLoading } = useSeries(table, seriesId);
  const extend = useExtendSeries();
  const wipe = useDeleteSeries();
  const restore = useRestoreItem();
  const today = todayIso();

  const live = useMemo(() => (rows ?? []).filter((r) => r.status !== "cancelled"), [rows]);
  const pattern = useMemo(() => describe(live), [live]);
  const last = live[live.length - 1];

  const [untilDate, setUntilDate] = useState("");
  const [every, setEvery] = useState(1);
  const [dowPick, setDowPick] = useState<number | null>(null);
  const dow = dowPick ?? pattern.dow ?? 0;
  const setDow = setDowPick;
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // the individually-edited ones differ from what most of the series says
  const majorityName = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of live) tally.set(r.name, (tally.get(r.name) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [live]);

  const cancelled = useMemo(
    () => (rows ?? []).filter((r) => r.status === "cancelled"),
    [rows],
  );

  const past = live.filter((r) => r.date < today);
  const upcoming = live.filter((r) => r.date >= today);

  const newDates = useMemo(() => {
    if (!untilDate || !last) return [];
    const out: string[] = [];
    let cursor = addDays(last.date, 1);
    while (dayOfWeek(cursor) !== dow) cursor = addDays(cursor, 1);
    let guard = 0;
    while (daysBetween(cursor, untilDate) >= 0 && guard < 200) {
      out.push(cursor);
      cursor = addDays(cursor, 7 * Math.max(1, every));
      guard += 1;
    }
    return out;
  }, [untilDate, last, dow, every]);

  const occurrence = (r: SeriesRow, dim: boolean) => (
    <li
      key={r.id}
      className={`flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-2 text-[13px] ${
        dim ? "text-soft opacity-60" : "text-ink"
      }`}
    >
      <span>
        {longDate(r.date)}
        {r.from_time ? ` · ${r.from_time.slice(0, 5)}` : ""}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-soft">{r.name}</span>
        {r.name !== majorityName ? (
          <span className="rounded-full border border-goldD/40 bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-goldD">
            edited
          </span>
        ) : null}
      </span>
    </li>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-night/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Manage series"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ce-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-[14px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.1em] text-soft uppercase">Series</p>
            <h2 className="font-display text-2xl text-ink">{majorityName || "This series"}</h2>
            <p className="text-[12px] text-soft">
              {live.length} session{live.length === 1 ? "" : "s"}
              {pattern.dow !== null
                ? ` · ${pattern.every > 1 ? `Every ${pattern.every} weeks on ` : "Every "}${WEEKDAYS[pattern.dow]}`
                : ""}
              {pattern.time ? ` ${pattern.time.slice(0, 5)}` : ""}
              {last ? ` · until ${longDate(last.date)}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {isLoading ? <p className="mt-4 text-[13px] text-soft">Loading the series…</p> : null}

        <div className="mt-4">
          <p className="ce-label">Upcoming</p>
          {upcoming.length === 0 ? (
            <p className="text-[13px] text-soft">Nothing left ahead in this series.</p>
          ) : (
            <ul>{upcoming.map((r) => occurrence(r, false))}</ul>
          )}
        </div>

        {past.length > 0 ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="ce-label">Already happened</p>
            <ul>{past.map((r) => occurrence(r, true))}</ul>
          </div>
        ) : null}

        {cancelled.length > 0 ? (
          <div className="mt-4 rounded-lg border border-line bg-cream p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-bold text-ink">
                  Cancelled ({cancelled.length})
                </p>
                <p className="text-[12px] text-soft">
                  Nothing is ever really gone — bring any of these back.
                </p>
              </div>
              <button
                type="button"
                className="btn3d btn3d-ghost"
                disabled={restore.isPending}
                onClick={() =>
                  restore.mutate(
                    { table, ids: cancelled.map((r) => r.id) },
                    {
                      onSuccess: () =>
                        setNote(
                          `Restored ${cancelled.length} session${cancelled.length === 1 ? "" : "s"}.`,
                        ),
                      onError: () => setNote("That didn't restore. Try once more."),
                    },
                  )
                }
              >
                Restore all {cancelled.length}
              </button>
            </div>
            <ul className="mt-2">
              {cancelled.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-2 text-[13px] text-soft opacity-70 last:border-b-0"
                >
                  <span className="line-through">
                    {longDate(r.date)}
                    {r.from_time ? ` · ${r.from_time.slice(0, 5)}` : ""} · {r.name}
                  </span>
                  <button
                    type="button"
                    className="min-h-11 text-[13px] font-bold text-emer underline"
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(
                        { table, ids: [r.id] },
                        {
                          onSuccess: () => setNote("Session restored."),
                          onError: () => setNote("That didn't restore. Try once more."),
                        },
                      )
                    }
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 rounded-lg border border-line bg-cream p-3">
          <p className="text-[13px] font-bold text-ink">Extend the series</p>
          <p className="mt-1 text-[12px] text-soft">
            Only new dates get added — nothing already there is duplicated.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <label className="ce-label" htmlFor="sp-dow">
                Weekday
              </label>
              <select
                id="sp-dow"
                className="ce-input"
                value={dow}
                onChange={(e) => setDow(Number(e.target.value))}
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ce-label" htmlFor="sp-every">
                Every
              </label>
              <select
                id="sp-every"
                className="ce-input"
                value={every}
                onChange={(e) => setEvery(Number(e.target.value))}
              >
                <option value={1}>1 week</option>
                <option value={2}>2 weeks</option>
                <option value={4}>4 weeks</option>
              </select>
            </div>
            <div>
              <label className="ce-label" htmlFor="sp-until">
                Until
              </label>
              <input
                id="sp-until"
                type="date"
                className="ce-input"
                value={untilDate}
                onChange={(e) => setUntilDate(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn3d mt-3 w-full sm:w-auto"
            disabled={newDates.length === 0 || extend.isPending || !last}
            onClick={() => {
              if (!last) return;
              extend.mutate(
                {
                  table,
                  seriesId,
                  dates: newDates,
                  template: last,
                  orgId,
                  createdBy,
                },
                {
                  onSuccess: (n) => setNote(`Added ${n} new session${n === 1 ? "" : "s"}.`),
                  onError: () => setNote("That didn't save. Try once more."),
                },
              );
            }}
          >
            {newDates.length > 0 ? `Add ${newDates.length} more session(s)` : "Pick an end date"}
          </button>
        </div>

        {note ? <p className="mt-3 text-[13px] font-semibold text-emer">{note}</p> : null}

        <div className="mt-5 border-t border-line pt-4">
          {confirmWipe ? (
            <div className="rounded-lg border border-red/30 bg-red/10 p-3">
              <p className="text-[13px] font-semibold text-red">
                Delete all {live.length} session{live.length === 1 ? "" : "s"} in this series?
                Everyone subscribed will see them disappear.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn3d btn3d-danger"
                  disabled={wipe.isPending}
                  onClick={() =>
                    wipe.mutate({ table, seriesId }, { onSuccess: onClose })
                  }
                >
                  Yes, delete {live.length}
                </button>
                <button
                  type="button"
                  className="btn3d btn3d-ghost"
                  onClick={() => setConfirmWipe(false)}
                >
                  Keep them
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="text-[13px] font-bold text-red underline"
              onClick={() => setConfirmWipe(true)}
            >
              Delete the whole series
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
