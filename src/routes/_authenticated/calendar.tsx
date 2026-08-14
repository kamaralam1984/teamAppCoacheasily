import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { AgendaView } from "@/components/calendar/AgendaView";
import { DayDetail } from "@/components/calendar/DayDetail";
import { EventEditor, type EditTarget } from "@/components/calendar/EventEditor";
import { HolidaysCard } from "@/components/calendar/HolidaysCard";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { Scheduler } from "@/components/calendar/Scheduler";
import { SyncCard } from "@/components/calendar/SyncCard";
import { WeekView } from "@/components/calendar/WeekView";
import {
  useCalendarMonth,
  useCalendarYear,
  useNext30,
  usePrepNudges,
  useSaveEvent,
  useSaveProgram,
} from "@/hooks/useCalendar";
import { TYPE_LABEL } from "@/hooks/useLeave";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useOrgSettings } from "@/hooks/useOrg";
import { useWarriors } from "@/hooks/useWarriors";
import {
  MARKER_COLOUR,
  MONTHS,
  SUMMARY_ORDER,
  addDays,
  dayOfWeek,
  daysBetween,
  iso,
  monthGrid,
  niceDate,
  parseIso,
  rangeLabel,
  timeLabel,
  todayIso,
} from "@/lib/calendar";
import { monthConflicts } from "@/lib/calendarDerive";
import { canAddEvents, canEditEvent, canEditProgram, whoToAsk } from "@/lib/calendarPerms";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Company calendar | CoachEasily Team App" },
      {
        name: "description",
        content:
          "Every CBA, MCA, Kickstart, Summit, holiday and who is away — month, week or agenda, on any device.",
      },
      { property: "og:title", content: "Company calendar | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "Every CBA, MCA, Kickstart, Summit, holiday and who is away — month, week or agenda, on any device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

type ViewMode = "month" | "week" | "agenda";

function CalendarPage() {
  const today = todayIso();
  const { data: me } = useMyProfile();
  const profile = me?.profile ?? null;

  const mayAdd = canAddEvents(profile);
  const mayMove = canEditProgram(profile) || profile?.role === "manager";

  const [cursor, setCursor] = useState(() => {
    const { y, m } = parseIso(today);
    return { y, m };
  });
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<ViewMode>("agenda");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [undo, setUndo] = useState<{ target: EditTarget; from: string } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) setView("month");
  }, []);

  const { data: monthData, isLoading } = useCalendarMonth(cursor.y, cursor.m);
  const { data: next30 } = useNext30();
  const { data: yearData } = useCalendarYear(true);
  const { data: warriors } = useWarriors();
  usePrepNudges(Boolean(profile));

  const saveEvent = useSaveEvent();
  const saveProgram = useSaveProgram();

  const byId = useMemo(() => new Map((warriors ?? []).map((w) => [w.id, w])), [warriors]);

  /** Birthdays on the calendar. People & Culture own the toggle; the founder always shows. */
  const { data: org } = useOrgSettings(Boolean(profile));
  const birthdayIds = useMemo(() => {
    const all = warriors ?? [];
    const founderId = all.find((p) => p.status === "active" && !p.manager_id)?.id ?? null;
    const show = org?.team_birthdays !== false;
    return new Set(
      all
        .filter((p) => p.status === "active" && (show || p.id === founderId))
        .map((p) => p.id),
    );
  }, [warriors, org]);

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

  /** Soonest first, across programmes and events. */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !yearData) return [];
    const hostName = (id: string | null) => (id ? (byId.get(id)?.full_name ?? "") : "");
    const rows: { key: string; date: string; label: string; sub: string; target: EditTarget }[] = [];
    for (const p of yearData.programs) {
      const hay = `${p.name} ${p.type} ${hostName(p.host_id)} ${p.location ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
      rows.push({
        key: `p-${p.id}`,
        date: p.from_date,
        label: `${p.name}${p.session_no ? ` · Session ${p.session_no}` : ""}`,
        sub: `${p.type} · ${rangeLabel(p.from_date, p.to_date)}${
          p.host_id ? ` · ${hostName(p.host_id)}` : ""
        }`,
        target: { kind: "program", row: p },
      });
    }
    for (const e of yearData.events) {
      const hay = `${e.name} ${e.type} ${hostName(e.host_id)} ${e.location ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
      rows.push({
        key: `e-${e.id}`,
        date: e.date,
        label: e.name,
        sub: `${e.type} · ${niceDate(e.date)}${
          e.from_time ? ` · ${timeLabel(e.from_time)}` : ""
        }`,
        target: { kind: "event", row: e },
      });
    }
    return rows
      .sort((a, b) => {
        const ad = Math.abs(daysBetween(today, a.date));
        const bd = Math.abs(daysBetween(today, b.date));
        return ad === bd ? a.label.localeCompare(b.label) : ad - bd;
      })
      .slice(0, 25);
  }, [query, yearData, byId, today]);

  const step = (delta: number) => {
    setCursor((c) => {
      const m = c.m + delta;
      if (m < 1) return { y: c.y - 1, m: 12 };
      if (m > 12) return { y: c.y + 1, m: 1 };
      return { y: c.y, m };
    });
  };

  const goTo = (date: string) => {
    const { y, m } = parseIso(date);
    setCursor({ y, m });
    setSelected(date);
  };

  const weekStart = useMemo(() => addDays(selected, -dayOfWeek(selected)), [selected]);
  const agendaFrom = view === "agenda" ? (selected < today ? selected : today) : today;
  const agendaTo = addDays(agendaFrom, 59);

  const moveTo = async (target: EditTarget, date: string, remember = true) => {
    const wasOn = target.kind === "event" ? target.row.date : target.row.from_date;
    if (wasOn === date) return;
    if (target.kind === "event") {
      if (!canEditEvent(profile, target.row)) return;
      const span = daysBetween(target.row.date, target.row.end_date ?? target.row.date);
      await saveEvent.mutateAsync({
        row: target.row,
        scope: "one",
        patch: { date, end_date: span > 0 ? addDays(date, span) : null },
      });
    } else {
      if (!canEditProgram(profile, target.row)) return;
      const span = daysBetween(target.row.from_date, target.row.to_date);
      await saveProgram.mutateAsync({
        row: target.row,
        scope: "one",
        patch: { from_date: date, to_date: addDays(date, Math.max(0, span)) },
      });
    }
    if (remember) setUndo({ target, from: wasOn });
  };

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  const onGridKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (map[e.key] !== undefined) {
      e.preventDefault();
      goTo(addDays(selected, map[e.key]!));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("day-detail")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const viewTab = (id: ViewMode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setView(id)}
      aria-pressed={view === id}
      className={`min-h-11 rounded-full px-4 text-[13px] font-bold ${
        view === id ? "bg-night text-goldL" : "border border-line bg-white text-soft"
      }`}
    >
      {label}
    </button>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5 py-2">
        <div className="ce-rise">
          <h1 className="font-display text-3xl text-ink">Company calendar</h1>
          <p className="mt-1 text-sm text-soft">
            Everything CoachEasily is running, and who is away while it runs.
          </p>
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn3d btn3d-ghost" onClick={() => goTo(today)}>
              Today
            </button>
            <select
              className="ce-input h-11 w-auto"
              aria-label="Jump to month"
              value={cursor.m}
              onChange={(e) => setCursor((c) => ({ ...c, m: Number(e.target.value) }))}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className="ce-input h-11 w-auto"
              aria-label="Jump to year"
              value={cursor.y}
              onChange={(e) => {
                const y = Number(e.target.value);
                setCursor((c) => ({ ...c, y }));
                setSelected(iso(y, cursor.m, 1));
              }}
            >
              {[cursor.y - 1, cursor.y, cursor.y + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <div className="ml-auto flex gap-2">
              {viewTab("agenda", "Agenda")}
              {viewTab("week", "Week")}
              {viewTab("month", "Month")}
            </div>
          </div>

          <div className="mt-3">
            <label className="ce-label" htmlFor="cal-search">
              Search programmes, events, hosts
            </label>
            <input
              id="cal-search"
              className="ce-input"
              placeholder="MCA, Kirti, Summit…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim().length >= 2 ? (
              results.length > 0 ? (
                <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                  {results.map((r) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-left"
                        onClick={() => {
                          goTo(r.date);
                          setEditing(r.target);
                        }}
                      >
                        <span className="block text-sm font-bold text-ink">{r.label}</span>
                        <span className="block text-[12px] text-soft">{r.sub}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-soft">Nothing matches that yet.</p>
              )
            ) : null}
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

        <div
          className="ce-rise focus:outline-none"
          style={{ animationDelay: "120ms" }}
          ref={gridRef}
          tabIndex={0}
          role="application"
          aria-label="Calendar. Arrow keys move the day, Enter opens it."
          onKeyDown={onGridKey}
        >
          {isLoading && view === "month" ? (
            <div className="ce-card p-6 text-sm text-soft">Loading the month…</div>
          ) : view === "month" ? (
            <MonthGrid
              year={cursor.y}
              month={cursor.m}
              data={monthData}
              byId={byId}
              today={today}
              viewerWeeklyOff={profile?.weekly_off ?? null}
              selected={selected}
              onSelect={setSelected}
              onOpen={setEditing}
              onMove={mayMove ? (t, d) => void moveTo(t, d) : undefined}
              birthdayIds={birthdayIds}
            />
          ) : view === "week" ? (
            <WeekView
              start={weekStart}
              data={yearData}
              byId={byId}
              today={today}
              selected={selected}
              onSelectDay={setSelected}
              onOpen={setEditing}
              birthdayIds={birthdayIds}
            />
          ) : (
            <AgendaView
              data={yearData}
              byId={byId}
              from={agendaFrom}
              to={agendaTo}
              today={today}
              onOpen={setEditing}
              onSelectDay={setSelected}
              birthdayIds={birthdayIds}
            />
          )}
        </div>

        <div id="day-detail" className="ce-rise" style={{ animationDelay: "180ms" }}>
          <DayDetail
            date={selected}
            data={view === "month" ? monthData : yearData}
            byId={byId}
            canSchedule={mayAdd}
            onOpen={setEditing}
            birthdayIds={birthdayIds}
          />
        </div>

        <div className="ce-rise" style={{ animationDelay: "220ms" }}>
          <SyncCard profileId={profile?.id ?? null} orgId={profile?.org_id ?? null} />
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

        {mayAdd && profile ? (
          <div className="ce-rise" style={{ animationDelay: "300ms" }}>
            <Scheduler orgId={profile.org_id} profileId={profile.id} warriors={warriors ?? []} />
          </div>
        ) : (
          <div className="ce-rise ce-card p-5 text-sm text-soft" style={{ animationDelay: "300ms" }}>
            {whoToAsk(profile)}
          </div>
        )}

        <div className="ce-rise" style={{ animationDelay: "360ms" }}>
          <HolidaysCard
            orgId={profile?.org_id ?? null}
            canManage={canEditProgram(profile)}
          />
        </div>
      </div>

      {editing ? (
        <EventEditor
          target={editing}
          warriors={warriors ?? []}
          me={profile}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {undo ? (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-[14px] bg-night px-4 py-3 text-white shadow-lg">
          <span className="flex-1 text-[13px]">Moved to {niceDate(selected)}.</span>
          <button
            type="button"
            className="min-h-9 rounded-lg border border-goldL/50 px-3 text-[13px] font-bold text-goldL"
            onClick={() => {
              const u = undo;
              setUndo(null);
              void moveTo(u.target, u.from, false);
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}
