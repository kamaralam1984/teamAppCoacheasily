import { useMemo, useState } from "react";

import { useTeamDay, type TeamDayRow } from "@/hooks/useAttendanceEngine";
import {
  hoursLabel,
  KIND_LABEL,
  KIND_STYLE,
  todayIst,
  type DayInfo,
  type DayKind,
} from "@/lib/attendanceKinds";

/** What needs a look first: absent, then late, then the rest. */
const ORDER: DayKind[] = [
  "absent",
  "late",
  "half_day",
  "wfh",
  "present",
  "leave",
  "not_marked",
  "holiday",
  "weekly_off",
];
const HIDDEN: DayKind[] = ["not_joined", "upcoming"];

export function TeamDay({
  canCorrect,
  onOpenCalendar,
  onCorrect,
}: {
  canCorrect: boolean;
  onOpenCalendar: (row: TeamDayRow) => void;
  onCorrect: (row: TeamDayRow, day: DayInfo) => void;
}) {
  const [date, setDate] = useState(todayIst());
  const { data, isLoading, error } = useTeamDay(date, true);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((r) => !HIDDEN.includes(r.kind))
        .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)),
    [data],
  );
  const count = (k: DayKind) => rows.filter((r) => r.kind === k).length;

  const chips: { kind: DayKind; label: string }[] = [
    { kind: "absent", label: "Absent" },
    { kind: "late", label: "Late" },
    { kind: "half_day", label: "Half day" },
    { kind: "wfh", label: "WFH" },
    { kind: "present", label: "On time" },
    { kind: "leave", label: "On leave" },
  ];

  return (
    <section className="ce-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Team on a day</h2>
        <label>
          <span className="ce-label">Day</span>
          <input
            type="date"
            className="ce-input"
            max={todayIst()}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-soft">Loading…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red">The team view couldn't be loaded.</p>
      ) : (
        <>
          <ul className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
              <li
                key={c.kind}
                className={`rounded-full px-3 py-1 text-[12px] font-bold ${KIND_STYLE[c.kind]}`}
              >
                {c.label}: {count(c.kind)}
              </li>
            ))}
          </ul>
          {date === todayIst() ? (
            <p className="mt-2 text-[12px] text-soft">
              Today isn't over, so anyone who hasn't marked yet shows as "Not marked yet", not
              absent.
            </p>
          ) : null}

          <ul className="mt-4 divide-y divide-line">
            {rows.map((r) => (
              <li key={r.profile_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <button
                  type="button"
                  className="min-h-11 text-left text-sm font-bold text-ink hover:underline"
                  onClick={() => onOpenCalendar(r)}
                >
                  {r.full_name}
                  {r.department ? (
                    <span className="ml-2 text-[12px] font-normal text-soft">{r.department}</span>
                  ) : null}
                </button>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${KIND_STYLE[r.kind]}`}
                >
                  {KIND_LABEL[r.kind]}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
                <span className="text-[12px] text-soft">
                  {r.check_in ? `in ${r.check_in}` : ""}
                  {r.check_out ? ` · out ${r.check_out}` : ""}
                  {hoursLabel(r.hours) ? ` · ${hoursLabel(r.hours)}` : ""}
                </span>
                {canCorrect ? (
                  <button
                    type="button"
                    className="ml-auto min-h-11 px-2 text-[13px] font-bold text-violet"
                    onClick={() => onCorrect(r, r)}
                  >
                    Correct
                  </button>
                ) : null}
              </li>
            ))}
            {rows.length === 0 ? <li className="py-3 text-sm text-soft">Nobody to show.</li> : null}
          </ul>
        </>
      )}
    </section>
  );
}
