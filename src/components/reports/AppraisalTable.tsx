import { Fragment } from "react";
import { useMemo, useState, type CSSProperties } from "react";

import {
  closedCycles,
  downloadCsv,
  pctLabel,
  scoreTone,
  sortAppraisal,
  toCsv,
  trendFor,
  type AppraisalData,
} from "@/lib/reports";
import { CycleGoalsModal } from "@/components/reports/CycleGoalsModal";

export function AppraisalTable({
  data,
  style,
}: {
  data: AppraisalData | undefined;
  style?: CSSProperties;
}) {
  const cycles = data?.cycles ?? [];
  const closed = useMemo(() => closedCycles(cycles), [cycles]);
  const canTrend = closed.length >= 2;
  const rows = useMemo(
    () => sortAppraisal(data?.rows ?? [], closed),
    [data?.rows, closed],
  );
  const [open, setOpen] = useState<{ profileId: string; name: string; cycleId: string; cycleName: string } | null>(
    null,
  );

  const trends = useMemo(
    () => new Map(rows.map((r) => [r.profile_id, trendFor(r, closed)])),
    [rows, closed],
  );

  const growing = canTrend
    ? rows.filter((r) => (trends.get(r.profile_id)?.delta ?? 0) > 0).length
    : 0;
  const slipping = canTrend
    ? rows.filter((r) => (trends.get(r.profile_id)?.delta ?? 0) < 0).length
    : 0;

  const exportCsv = () => {
    const headers = ["Warrior", "Title", "Department", ...cycles.map((c) => c.name), "Trend"];
    const body = rows.map((r) => {
      const t = trends.get(r.profile_id);
      return [
        r.full_name,
        r.title ?? "",
        r.department ?? "",
        ...cycles.map((c) => {
          const s = r.scores[c.id];
          if (!s) return "none";
          return c.status === "closed" ? `${s.pct}%` : `${s.pct}% so far`;
        }),
        canTrend && t?.delta !== null && t?.delta !== undefined
          ? `${t.delta > 0 ? "+" : ""}${t.delta}`
          : "—",
      ];
    });
    downloadCsv("appraisal.csv", toCsv(headers, body));
  };

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ce-label">Appraisal</p>
          <h2 className="mt-1 font-display text-2xl text-ink">Goal achievement, cycle by cycle</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-soft">
            A live cycle is shown in muted type and is never compared with a finished one — a
            cycle that is a few days old would always look worse, and that would be unfair.
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-full border border-line px-4 text-[13px] font-bold text-soft"
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </div>

      {canTrend ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-emer/12 px-3 py-1.5 text-[13px] font-bold text-emer">
            ↑ {growing} growing
          </span>
          <span className="rounded-full bg-red/12 px-3 py-1.5 text-[13px] font-bold text-red">
            ↓ {slipping} slipping
          </span>
        </div>
      ) : (
        <p className="mt-4 rounded-[14px] bg-cream px-4 py-3 text-[13px] text-soft">
          Trend appears once a second cycle closes.
        </p>
      )}

      {/* Below 640px the table becomes stacked cards. */}
      <div className="mt-5 grid gap-2 sm:hidden">
        {rows.map((r) => {
          const t = trends.get(r.profile_id);
          return (
            <div key={r.profile_id} className="rounded-[16px] border border-line p-3">
              <p className="text-[14px] font-bold text-ink">{r.full_name}</p>
              {r.title ? <p className="text-[12px] text-soft">{r.title}</p> : null}
              <div className="mt-2 grid grid-cols-2 gap-y-1 text-[13px]">
                {cycles.map((c) => {
                  const s = r.scores[c.id] ?? null;
                  const live = c.status !== "closed";
                  return (
                    <Fragment key={c.id}>
                      <span className="text-soft">
                        {c.name}
                        {live ? " · live" : ""}
                      </span>
                      <button
                        type="button"
                        className={`text-right font-bold ${scoreTone(s ? s.pct : null)} ${live ? "opacity-45" : ""}`}
                        onClick={() =>
                          setOpen({
                            profileId: r.profile_id,
                            name: r.full_name,
                            cycleId: c.id,
                            cycleName: c.name,
                          })
                        }
                      >
                        {pctLabel(s ? s.pct : null)}
                        {s && live ? " so far" : ""}
                      </button>
                    </Fragment>
                  );
                })}
                <span className="text-soft">Trend</span>
                <span className="text-right">
                  {canTrend && t?.delta !== null && t?.delta !== undefined ? (
                    <span className={t.delta >= 0 ? "font-bold text-emer" : "font-bold text-red"}>
                      {t.delta > 0 ? "↑ +" : t.delta < 0 ? "↓ " : "→ "}
                      {t.delta === 0 ? "0" : Math.abs(t.delta)}
                      {t.delta !== 0 ? " pts" : ""}
                    </span>
                  ) : (
                    <span className="text-soft">—</span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 -mx-2 hidden overflow-x-auto px-2 sm:block">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2 pr-3 text-[11px] font-bold tracking-[0.1em] text-soft uppercase">
                Warrior
              </th>
              {cycles.map((c) => (
                <th
                  key={c.id}
                  className="py-2 pr-3 text-[11px] font-bold tracking-[0.1em] text-soft uppercase"
                >
                  {c.name}
                  {c.status !== "closed" ? " · live" : ""}
                </th>
              ))}
              <th className="py-2 pr-3 text-[11px] font-bold tracking-[0.1em] text-soft uppercase">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = trends.get(r.profile_id);
              return (
                <tr key={r.profile_id} className="border-b border-line/60">
                  <td className="py-3 pr-3">
                    <p className="text-[14px] font-bold text-ink">{r.full_name}</p>
                    {r.title ? <p className="text-[12px] text-soft">{r.title}</p> : null}
                  </td>
                  {cycles.map((c) => {
                    const s = r.scores[c.id] ?? null;
                    const live = c.status !== "closed";
                    return (
                      <td key={c.id} className="py-3 pr-3">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() =>
                            setOpen({
                              profileId: r.profile_id,
                              name: r.full_name,
                              cycleId: c.id,
                              cycleName: c.name,
                            })
                          }
                        >
                          <span
                            className={`text-[14px] font-bold ${scoreTone(s ? s.pct : null)} ${
                              live ? "opacity-45" : ""
                            }`}
                          >
                            {pctLabel(s ? s.pct : null)}
                            {s && live ? " so far" : ""}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-3 pr-3 text-[14px]">
                    {canTrend && t?.delta !== null && t?.delta !== undefined ? (
                      <span className={t.delta >= 0 ? "font-bold text-emer" : "font-bold text-red"}>
                        {t.delta > 0 ? "↑ +" : t.delta < 0 ? "↓ " : "→ "}
                        {t.delta === 0 ? "0" : Math.abs(t.delta)}
                        {t.delta !== 0 ? " pts" : ""}
                      </span>
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-soft">No warriors to show yet.</p>
        ) : null}
      </div>

      {open ? (
        <CycleGoalsModal
          profileId={open.profileId}
          name={open.name}
          cycleId={open.cycleId}
          cycleName={open.cycleName}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}
