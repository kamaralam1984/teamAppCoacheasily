import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { DayDetail } from "@/components/calendar/DayDetail";
import { HolidaysCard } from "@/components/calendar/HolidaysCard";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { Scheduler } from "@/components/calendar/Scheduler";
import { useCalendarMonth, useCalendarYear, useNext30 } from "@/hooks/useCalendar";
import { TYPE_LABEL } from "@/hooks/useLeave";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useWarriors } from "@/hooks/useWarriors";
import {
  MARKER_COLOUR,
  MONTHS,
  SUMMARY_ORDER,
  monthGrid,
  niceDate,
  parseIso,
  rangeLabel,
  todayIso,
} from "@/lib/calendar";
import { monthConflicts } from "@/lib/calendarDerive";
import { buildIcs, downloadIcs, type IcsEntry } from "@/lib/ics";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Company calendar | CoachEasily Team App" },
      {
        name: "description",
        content:
          "Every CBA, MCA, Kickstart, Summit, holiday and who is away — one full-width month you can read at a glance.",
      },
      { property: "og:title", content: "Company calendar | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "Every CBA, MCA, Kickstart, Summit, holiday and who is away — one full-width month you can read at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const today = todayIso();
  const { data: me } = useMyProfile();
  const profile = me?.profile ?? null;
  const canSchedule =
    profile?.role === "manager" || profile?.role === "hr" || profile?.role === "admin";

  const [cursor, setCursor] = useState(() => {
    const { y, m } = parseIso(today);
    return { y, m };
  });
  const [selected, setSelected] = useState(today);

  const { data: monthData, isLoading } = useCalendarMonth(cursor.y, cursor.m);
  const { data: next30 } = useNext30();
  const { data: yearData } = useCalendarYear(true);
  const { data: warriors } = useWarriors();

  const byId = useMemo(
    () => new Map((warriors ?? []).map((w) => [w.id, w])),
    [warriors],
  );

  const inMonthDates = useMemo(
    () => monthGrid(cursor.y, cursor.m).filter((c) => c.inMonth).map((c) => c.date),
    [cursor],
  );

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    for (const p of monthData?.programs ?? []) {
      if (!inMonthDates.some((d) => d >= p.from_date && d <= p.to_date)) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      counts[p.type] = (counts[p.type] ?? 0) + 1;
    }
    for (const h of monthData?.holidays ?? []) {
      if (!inMonthDates.includes(h.date)) continue;
      counts["Holiday"] = (counts["Holiday"] ?? 0) + 1;
    }
    return SUMMARY_ORDER.filter((t) => counts[t]).map((t) => ({ type: t, n: counts[t]! }));
  }, [monthData, inMonthDates]);

  const conflicts = useMemo(
    () => monthConflicts(monthData, inMonthDates, byId),
    [monthData, inMonthDates, byId],
  );

  const upcoming = useMemo(() => {
    const rows = (next30?.leave ?? []).slice();
    rows.sort((a, b) =>
      a.from_date === b.from_date
        ? a.full_name.localeCompare(b.full_name)
        : a.from_date < b.from_date
          ? -1
          : 1,
    );
    return rows;
  }, [next30]);

  const step = (delta: number) => {
    setCursor((c) => {
      const m = c.m + delta;
      if (m < 1) return { y: c.y - 1, m: 12 };
      if (m > 12) return { y: c.y + 1, m: 1 };
      return { y: c.y, m };
    });
  };

  const downloadMyCalendar = () => {
    if (!yearData || !profile) return;
    const entries: IcsEntry[] = [];
    for (const p of yearData.programs) {
      const host = p.host_id ? byId.get(p.host_id) : undefined;
      entries.push({
        uid: `program-${p.id}`,
        title: `${p.name}${p.session_no ? ` · Session ${p.session_no}` : ""}`,
        start: p.from_date,
        end: p.to_date,
        location: p.location,
        description: host ? `Hosted by ${host.full_name}` : null,
      });
    }
    for (const h of yearData.holidays) {
      entries.push({
        uid: `holiday-${h.id}`,
        title: `Holiday · ${h.name}`,
        start: h.date,
        end: h.date,
      });
    }
    for (const e of yearData.events) {
      entries.push({
        uid: `event-${e.id}`,
        title: e.name,
        start: e.date,
        end: e.end_date ?? e.date,
        fromTime: e.from_time,
        toTime: e.to_time,
        location: e.location,
      });
    }
    for (const l of yearData.leave.filter((x) => x.profile_id === profile.id)) {
      entries.push({
        uid: `leave-${l.id}`,
        title: `Leave · ${TYPE_LABEL[l.type] ?? l.type}`,
        start: l.from_date,
        end: l.to_date,
      });
    }
    downloadIcs("coacheasily.ics", buildIcs("CoachEasily", entries));
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5 py-2">
        <div className="ce-rise flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-ink">Company calendar</h1>
            <p className="mt-1 text-sm text-soft">
              Everything CoachEasily is running, and who is away while it runs.
            </p>
          </div>
          <button
            type="button"
            className="btn3d btn3d-ghost"
            disabled={!yearData}
            onClick={downloadMyCalendar}
          >
            Add to my calendar
          </button>
        </div>

        <div className="ce-rise ce-card p-4" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Previous month"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink"
              onClick={() => step(-1)}
            >
              ‹
            </button>
            <h2 className="font-display text-2xl text-ink">
              {MONTHS[cursor.m - 1]} {cursor.y}
            </h2>
            <button
              type="button"
              aria-label="Next month"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink"
              onClick={() => step(1)}
            >
              ›
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            {summary.length > 0 ? (
              summary.map((s, i) => (
                <span key={s.type} className="flex items-center gap-1.5 text-[13px] text-ink">
                  {i > 0 ? <span className="text-line">·</span> : null}
                  <span className={`h-2 w-2 rounded-full ${MARKER_COLOUR[s.type]}`} />
                  {s.n} {s.type}
                </span>
              ))
            ) : (
              <span className="text-[13px] text-soft">Nothing scheduled this month yet.</span>
            )}
          </div>

          {conflicts.map((c) => (
            <p
              key={c}
              className="mt-3 rounded-lg border border-red/30 bg-red/10 p-3 text-[13px] leading-relaxed font-semibold text-red"
            >
              {c}
            </p>
          ))}
        </div>

        <div className="ce-rise" style={{ animationDelay: "120ms" }}>
          {isLoading ? (
            <div className="ce-card p-6 text-sm text-soft">Loading the month…</div>
          ) : (
            <MonthGrid
              year={cursor.y}
              month={cursor.m}
              data={monthData}
              byId={byId}
              today={today}
              viewerWeeklyOff={profile?.weekly_off ?? null}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </div>

        <div className="ce-rise" style={{ animationDelay: "180ms" }}>
          <DayDetail
            date={selected}
            data={monthData}
            byId={byId}
            canSchedule={Boolean(canSchedule)}
          />
        </div>

        <div className="ce-rise ce-card p-5" style={{ animationDelay: "240ms" }}>
          <h2 className="font-display text-2xl text-ink">Who's off in the next 30 days</h2>
          {upcoming.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {upcoming.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"
                >
                  <span className="text-sm font-bold text-ink">{l.full_name}</span>
                  <span className="text-[12px] text-soft">
                    {rangeLabel(l.from_date, l.to_date)}
                    {l.half_day ? " · half day" : ""}
                  </span>
                  <span className="ml-auto rounded-full border border-line bg-cream px-2.5 py-0.5 text-[11px] font-bold text-goldD">
                    {TYPE_LABEL[l.type] ?? l.type}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-soft">Everyone is around for the next month.</p>
          )}
          {profile?.weekly_off ? (
            <p className="mt-3 border-t border-line pt-3 text-[13px] text-soft">
              Your weekly off is <strong className="text-ink">{profile.weekly_off}</strong> — those
              days are tinted on the grid. Today is {niceDate(today)}.
            </p>
          ) : null}
        </div>

        {canSchedule && profile ? (
          <div className="ce-rise" style={{ animationDelay: "300ms" }}>
            <Scheduler
              orgId={profile.org_id}
              profileId={profile.id}
              warriors={warriors ?? []}
            />
          </div>
        ) : (
          <div className="ce-rise ce-card p-5 text-sm text-soft" style={{ animationDelay: "300ms" }}>
            The calendar is kept by managers, People &amp; Culture and admins. Ask them to add or
            change anything here.
          </div>
        )}

        <div className="ce-rise" style={{ animationDelay: "360ms" }}>
          <HolidaysCard orgId={profile?.org_id ?? null} canManage={Boolean(canSchedule)} />
        </div>
      </div>
    </AppShell>
  );
}
