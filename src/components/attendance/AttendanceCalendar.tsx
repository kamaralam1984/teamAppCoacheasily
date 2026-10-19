import { useState } from "react";

import { useAttendanceMonth } from "@/hooks/useAttendanceEngine";
import {
  attended,
  hoursLabel,
  KIND_LABEL,
  KIND_STYLE,
  monthStart,
  monthTitle,
  shiftMonth,
  todayIst,
  type DayInfo,
  type DayKind,
} from "@/lib/attendanceKinds";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEGEND: DayKind[] = [
  "present",
  "late",
  "wfh",
  "half_day",
  "leave",
  "holiday",
  "weekly_off",
  "absent",
];

function dayNumber(iso: string) {
  return Number(iso.slice(8, 10));
}

/** Monday-first column index of the first of the month. */
function leadingBlanks(first: string) {
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay();
  return (dow + 6) % 7;
}

/**
 * One person's month. HR passes onPickDay to open the correction form from a day.
 * Omit profileId for the signed-in person.
 */
export function AttendanceCalendar({
  profileId,
  onPickDay,
  className,
}: {
  profileId?: string | null;
  onPickDay?: (day: DayInfo) => void;
  className?: string;
}) {
  const [month, setMonth] = useState(() => monthStart(todayIst()));
  const { data, isLoading, error } = useAttendanceMonth(profileId, month);
  const currentMonth = monthStart(todayIst());

  const days = data?.days ?? [];
  const count = (...kinds: DayKind[]) => days.filter((d) => kinds.includes(d.kind)).length;
  const worked = days.filter((d) => d.hours !== null);
  const totalHours = worked.reduce((sum, d) => sum + (d.hours ?? 0), 0);

  const totals: { label: string; value: number }[] = [
    { label: "Present", value: count("present", "late") },
    { label: "Late", value: count("late") },
    { label: "Work from home", value: count("wfh") },
    { label: "Half days", value: count("half_day") },
    { label: "On leave", value: count("leave") },
    { label: "Absent", value: count("absent") },
  ];

  return (
    <section className={`ce-card p-5 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">{monthTitle(month)}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn3d btn3d-ghost min-h-11"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ←
          </button>
          <button
            type="button"
            className="btn3d btn3d-ghost min-h-11"
            disabled={month === currentMonth}
            onClick={() => setMonth(currentMonth)}
          >
            This month
          </button>
          <button
            type="button"
            className="btn3d btn3d-ghost min-h-11"
            aria-label="Next month"
            disabled={month >= currentMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            →
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-soft">Loading…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red">The calendar couldn't be loaded.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-[10px] font-bold tracking-wider text-soft uppercase">
                {w}
              </div>
            ))}
            {Array.from({ length: leadingBlanks(month) }).map((_, i) => (
              <div key={`b${i}`} />
            ))}
            {days.map((d) => {
              const clickable =
                Boolean(onPickDay) && d.kind !== "upcoming" && d.kind !== "not_joined";
              const detail = [
                KIND_LABEL[d.kind],
                d.note,
                d.check_in ? `in ${d.check_in}` : null,
                d.check_out ? `out ${d.check_out}` : null,
                hoursLabel(d.hours),
              ]
                .filter(Boolean)
                .join(" · ");
              const cell = (
                <>
                  <span className="text-[13px] font-bold">{dayNumber(d.date)}</span>
                  <span className="mt-0.5 block truncate text-[9px] leading-tight font-semibold">
                    {attended(d.kind) ? (d.check_in ?? "") : d.kind === "absent" ? "Absent" : ""}
                  </span>
                </>
              );
              const cls = `flex min-h-14 flex-col items-center justify-center rounded-lg p-1 ${KIND_STYLE[d.kind]} ${
                d.date === todayIst() ? "ring-2 ring-gold" : ""
              }`;
              return clickable ? (
                <button
                  key={d.date}
                  type="button"
                  title={detail}
                  aria-label={`${d.date}: ${detail}`}
                  className={`${cls} hover:brightness-95 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none`}
                  onClick={() => onPickDay?.(d)}
                >
                  {cell}
                </button>
              ) : (
                <div key={d.date} title={detail} className={cls}>
                  {cell}
                </div>
              );
            })}
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {totals.map((t) => (
              <div
                key={t.label}
                className="rounded-lg border border-line bg-cream px-2 py-2 text-center"
              >
                <dt className="text-[10px] font-bold tracking-wider text-soft uppercase">
                  {t.label}
                </dt>
                <dd className="font-display text-xl text-ink">{t.value}</dd>
              </div>
            ))}
          </dl>
          {worked.length > 0 ? (
            <p className="mt-3 text-[13px] text-soft">
              {hoursLabel(totalHours)} logged over {worked.length} checked-out{" "}
              {worked.length === 1 ? "day" : "days"} (about {hoursLabel(totalHours / worked.length)}{" "}
              a day).
            </p>
          ) : null}

          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Legend">
            {LEGEND.map((k) => (
              <li
                key={k}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${KIND_STYLE[k]}`}
              >
                {KIND_LABEL[k]}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
