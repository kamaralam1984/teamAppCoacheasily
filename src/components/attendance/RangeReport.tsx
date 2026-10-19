import { useState } from "react";

import { useRangeReport } from "@/hooks/useAttendanceEngine";
import { monthStart, todayIst } from "@/lib/attendanceKinds";
import { downloadCsv, toCsv } from "@/lib/reports";

/** Counts per person over a date range, with a CSV for HR. */
export function RangeReport() {
  const [from, setFrom] = useState(monthStart(todayIst()));
  const [to, setTo] = useState(todayIst());
  const valid = Boolean(from && to && from <= to);
  const { data, isLoading, error } = useRangeReport(from, to, valid);

  function exportCsv() {
    const headers = [
      "Warrior",
      "Department",
      "Working days",
      "Present",
      "Late",
      "Work from home",
      "Half days",
      "On leave",
      "Absent",
      "Holidays",
      "Weekly offs",
    ];
    const body = (data ?? []).map((r) => [
      r.full_name,
      r.department ?? "",
      r.working_days,
      r.present,
      r.late,
      r.wfh,
      r.half_day,
      r.leave,
      r.absent,
      r.holidays,
      r.weekly_offs,
    ]);
    downloadCsv(`attendance-${from}-to-${to}.csv`, toCsv(headers, body));
  }

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Attendance report</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label>
          <span className="ce-label">From</span>
          <input
            type="date"
            className="ce-input"
            max={to || todayIst()}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          <span className="ce-label">To</span>
          <input
            type="date"
            className="ce-input"
            min={from}
            max={todayIst()}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn3d btn3d-gold"
          disabled={!data || data.length === 0}
          onClick={exportCsv}
        >
          Download CSV
        </button>
      </div>
      <p className="mt-2 text-[12px] text-soft">Up to 93 days at a time.</p>

      {!valid ? (
        <p className="mt-4 text-sm text-soft">Pick a start day that is not after the end day.</p>
      ) : isLoading ? (
        <p className="mt-4 text-sm text-soft">Loading…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red">{(error as Error).message}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-line text-soft">
              <tr>
                {["Warrior", "Days", "Present", "Late", "WFH", "Half", "Leave", "Absent"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-2 py-2 text-[11px] font-bold tracking-wider uppercase"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.profile_id} className="border-b border-line/60">
                  <td className="px-2 py-2 font-bold text-ink">{r.full_name}</td>
                  <td className="px-2 py-2">{r.working_days}</td>
                  <td className="px-2 py-2">{r.present}</td>
                  <td className="px-2 py-2">{r.late}</td>
                  <td className="px-2 py-2">{r.wfh}</td>
                  <td className="px-2 py-2">{r.half_day}</td>
                  <td className="px-2 py-2">{r.leave}</td>
                  <td className={`px-2 py-2 ${r.absent > 0 ? "font-bold text-red" : ""}`}>
                    {r.absent}
                  </td>
                </tr>
              ))}
              {data && data.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-soft" colSpan={8}>
                    No one to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
