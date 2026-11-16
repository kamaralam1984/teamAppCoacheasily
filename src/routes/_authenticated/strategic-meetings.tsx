import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { MeetingDashboard } from "@/components/goals/MeetingDashboard";
import { useDeveloperAccess } from "@/hooks/useDeveloper";
import {
  meetingPeriod,
  useMeetingGoals,
  useMeetingGoalNotes,
  useMeetingGoalWrites,
  useMeetingWeekGoals,
  useSaveMeetingGoalNote,
  type GoalScope,
  type GoalUpdate,
  type MeetingGoal,
  type NoteField,
} from "@/hooks/useMeetingGoals";
import { useMyProfile } from "@/hooks/useMyProfile";
import { startDrag, useTableSizes } from "@/hooks/useTableSizes";
import { meetingLabel, useStrategicMeetings } from "@/hooks/useStrategicMeetings";
import { useWarriors } from "@/hooks/useWarriors";
import { addDays, daysBetween, timeLabel, todayIso } from "@/lib/calendar";
import { buildCsv, buildPdf, downloadBytes, MIME, safeFileName } from "@/lib/exporters";
import { runCharts, runProgress, weekCharts, weekProgress } from "@/lib/meetingGoalCharts";
import { meetingGoalTable } from "@/lib/meetingGoalExport";
import { downlineIds, shortDate } from "@/lib/warriors";

export const Route = createFileRoute("/_authenticated/strategic-meetings")({
  head: () => ({
    meta: [
      { title: "Strategic Meetings | CoachEasily Team App" },
      {
        name: "description",
        content: "Everyone's goals for the run-up to each strategic meeting, with a weekly update.",
      },
      { property: "og:title", content: "Strategic Meetings | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Everyone's goals for the run-up to each strategic meeting, with a weekly update.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StrategicMeetingsPage,
});

/** How long a cell waits after the last key before it saves by itself. */
const AUTOSAVE_MS = 1000;

/**
 * The page's unsaved cells: each cell registers how to save itself now, and says when it holds
 * typing that has not been sent yet, so the Save button, leaving the page and the status line
 * all see the same thing.
 */
type Drafts = {
  register: (flush: () => void) => () => void;
  setDirty: (key: object, dirty: boolean) => void;
};
const DraftsContext = createContext<Drafts | null>(null);

/**
 * A cell you can type in. It saves by itself a moment after you stop typing, when you leave it,
 * when its table goes away (another person, meeting or week) and when the page is hidden or
 * closed; only if it changed. Typing is never overwritten by a reload of the table.
 */
function Cell({
  value,
  onSave,
  placeholder,
  type = "text",
  multiline = false,
  rows = 2,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  multiline?: boolean;
  rows?: number;
  className?: string;
}) {
  const drafts = useContext(DraftsContext);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const sent = useRef(value); // the value last saved, or last loaded
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [key] = useState(() => ({}));

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const v = draftRef.current;
    if (v !== sent.current) {
      sent.current = v;
      onSaveRef.current(v);
    }
    drafts?.setDirty(key, false);
  }, [drafts, key]);

  // take the saved value from the server, but never over typing that is in progress
  useEffect(() => {
    if (focused.current || draftRef.current !== sent.current) return;
    sent.current = value;
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  // save what is left when the cell goes away
  useEffect(() => {
    const off = drafts?.register(flush);
    return () => {
      off?.();
      flush();
    };
  }, [drafts, flush]);

  const change = (v: string) => {
    setDraft(v);
    draftRef.current = v;
    drafts?.setDirty(key, v !== sent.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_MS);
  };
  const focus = () => {
    focused.current = true;
  };
  const blur = () => {
    focused.current = false;
    flush();
  };

  const base = `w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-ink hover:border-line focus:border-gold focus:bg-white focus:outline-none ${className}`;
  return multiline ? (
    <textarea
      rows={rows}
      className={`${base} min-h-[52px] resize-y`}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => change(e.target.value)}
      onFocus={focus}
      onBlur={blur}
    />
  ) : (
    <input
      type={type}
      className={base}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => change(e.target.value)}
      onFocus={focus}
      onBlur={blur}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function StrategicMeetingsPage() {
  const today = todayIso();
  const { data: me } = useMyProfile();
  const viewer = me?.profile ?? null;
  const { data: meetings, isLoading: meetingsLoading } = useStrategicMeetings(Boolean(viewer));
  const { data: warriors } = useWarriors();
  const { data: dev } = useDeveloperAccess(Boolean(viewer));

  // whose table you can open: HR, admin (Sir) and developers everyone; a manager their own
  // team (everyone below them); everyone else only their own. The database enforces the same.
  const people = useMemo(() => {
    const active = (warriors ?? []).filter((p) => p.status === "active");
    const seeAll = viewer?.role === "hr" || viewer?.role === "admin" || Boolean(dev?.isDeveloper);
    const team = viewer ? downlineIds(warriors ?? [], viewer.id) : new Set<string>();
    return active
      .filter((p) => seeAll || p.id === viewer?.id || team.has(p.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [warriors, viewer, dev]);

  // the next meeting by default, else the latest one
  const defaultMeeting = useMemo(() => {
    const list = meetings ?? [];
    return list.find((m) => m.meeting_date >= today) ?? list[list.length - 1] ?? null;
  }, [meetings, today]);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const meeting = (meetings ?? []).find((m) => m.id === (meetingId ?? defaultMeeting?.id)) ?? null;

  const [personId, setPersonId] = useState<string | null>(null);
  const activePerson =
    (personId && people.some((p) => p.id === personId) ? personId : null) ?? viewer?.id ?? null;
  const person = people.find((p) => p.id === activePerson) ?? null;

  // who may write this table: HR and admin all, everyone their own (a manager only reads their
  // team's); a developer who is neither writes through the audited Developer route
  const direct = useMemo(() => {
    if (!viewer || !activePerson) return false;
    if (viewer.role === "hr" || viewer.role === "admin") return true;
    return viewer.id === activePerson;
  }, [viewer, activePerson]);
  const viaDev = !direct && Boolean(dev?.isDeveloper);
  const canWrite = direct || viaDev;

  const period = useMemo(
    () => (meeting ? meetingPeriod(meeting, meetings ?? []) : null),
    [meeting, meetings],
  );
  // the toggle: goals for the whole run-up (45 days), or for one week of it
  const [mode, setMode] = useState<"run" | "week">("run");
  const [pickedWeek, setPickedWeek] = useState<string | null>(null);
  const weeks = period?.weeks ?? [];
  const thisWeek = [...weeks].reverse().find((w) => w <= today) ?? weeks[0] ?? null;
  const weekStart = pickedWeek && weeks.includes(pickedWeek) ? pickedWeek : thisWeek;
  const scope: GoalScope =
    mode === "week" && weekStart ? { kind: "week", weekStart } : { kind: "run" };
  const weekColumns = scope.kind === "run" ? weeks : [];

  const { data, isLoading } = useMeetingGoals(meeting?.id ?? null, activePerson, scope, viaDev);
  const writes = useMeetingGoalWrites(meeting?.id ?? null, activePerson, viaDev, scope);
  const goals: MeetingGoal[] = data?.goals ?? [];
  const updates = useMemo(() => {
    const map = new Map<string, GoalUpdate>();
    for (const u of data?.updates ?? []) map.set(`${u.goal_id}|${u.week_start}`, u);
    return map;
  }, [data]);

  // the optional Challenges / Learnings / Remarks columns (one entry per goal): only shown once added
  const { data: notes } = useMeetingGoalNotes(meeting?.id ?? null, activePerson, scope, viaDev);
  const saveNote = useSaveMeetingGoalNote(meeting?.id ?? null, activePerson, viaDev, scope);
  const boxes = (
    [
      {
        field: "challenges",
        label: "Challenges",
        tone: "bg-red/10",
        placeholder: "What got in the way…",
      },
      {
        field: "learnings",
        label: "Learnings",
        tone: "bg-gold/15",
        placeholder: "What I learned…",
      },
      {
        field: "remarks",
        label: "Remarks",
        tone: "bg-emer/10",
        placeholder: "Any remark…",
      },
    ] as const
  ).filter((b) => notes?.[b.field] != null);
  const missingBoxes = (
    [
      ["challenges", "Challenges"],
      ["learnings", "Learnings"],
      ["remarks", "Remarks"],
    ] as const
  ).filter(([field]) => notes?.[field] == null);

  const { data: weekGoals } = useMeetingWeekGoals(
    meeting?.id ?? null,
    activePerson,
    mode === "week",
    viaDev,
  );
  const dashboard = useMemo(() => {
    const rows = data?.goals ?? [];
    const allWeeks = period?.weeks ?? [];
    return mode === "week" && weekStart
      ? {
          charts: weekCharts(rows, weekGoals ?? [], allWeeks, weekStart, today),
          weeks: weekProgress(weekGoals ?? [], allWeeks, weekStart, today),
          note: "Goals with an outcome written, each week",
        }
      : {
          charts: runCharts(rows, data?.updates ?? [], allWeeks, thisWeek, today),
          weeks: runProgress(rows, data?.updates ?? [], allWeeks, today),
          note: "Goals with an update written, each week",
        };
  }, [data, weekGoals, mode, weekStart, period, thisWeek, today]);

  // every cell's unsaved typing: saved by the Save button, and before the page is hidden or left
  const [dirtyCount, setDirtyCount] = useState(0);
  const drafts = useMemo(() => {
    const flushers = new Set<() => void>();
    const dirty = new Set<object>();
    return {
      register(flush: () => void) {
        flushers.add(flush);
        return () => void flushers.delete(flush);
      },
      setDirty(key: object, on: boolean) {
        if (on === dirty.has(key)) return;
        if (on) dirty.add(key);
        else dirty.delete(key);
        setDirtyCount(dirty.size);
      },
      flushAll() {
        for (const f of [...flushers]) f();
      },
    };
  }, []);
  const saving = writes.saveGoal.isPending || writes.saveUpdate.isPending || saveNote.isPending;
  const unsaved = dirtyCount > 0 || saving;
  useEffect(() => {
    const hide = () => drafts.flushAll();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") drafts.flushAll();
    };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [drafts]);
  useEffect(() => {
    if (!unsaved) return;
    // closing or reloading while a save is still on its way: ask first
    const warn = (e: BeforeUnloadEvent) => {
      drafts.flushAll();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved, drafts]);

  // column widths and row heights dragged like a spreadsheet; kept in this browser only
  const sizes = useTableSizes("ce-strategic-goals-sizes:v1");
  const COL_DEFAULT: Record<string, number> = {
    type: 130,
    no: 48,
    title: 240,
    measure: 140,
    timeline: 150,
    outcome: 120,
  };
  const colKeys = [
    "type",
    "no",
    "title",
    "measure",
    "timeline",
    "outcome",
    ...weekColumns.map((w) => `week:${w}`),
    ...boxes.map((b) => `box:${b.field}`),
  ];
  const colWidth = (k: string) =>
    sizes.col(k) ?? COL_DEFAULT[k] ?? (k.startsWith("week:") ? 180 : 240);
  // once anything is resized the table switches to fixed widths, so every column keeps its size
  const colStyle = (k: string) => {
    if (!sizes.changed) return undefined;
    const w = colWidth(k);
    return { width: w, minWidth: w, maxWidth: w };
  };
  const colGrip = (k: string) => (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to change the column width"
      title="Drag to change the width"
      className="absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize hover:bg-gold/70"
      onPointerDown={(e) =>
        startDrag(
          e,
          "x",
          (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width,
          (w) => sizes.setCol(k, w),
        )
      }
    />
  );

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : "That didn't save. Please try again.");

  /** Add (""), write (text) or remove (null) a Challenges, Learnings or Remarks box. */
  const writeNote = (field: NoteField, value: string | null) =>
    viewer &&
    saveNote.mutate(
      { orgId: viewer.org_id, field, value, by: viewer.id, exists: Boolean(notes) },
      { onError: fail },
    );

  const isHr = viewer?.role === "hr" || viewer?.role === "admin";
  const runDays = period ? daysBetween(period.from, period.to) + 1 : 0;

  const heading =
    scope.kind === "week"
      ? `Goals for the week of ${shortDate(scope.weekStart)}`
      : `Goals for next ${runDays} days`;
  const periodLine =
    scope.kind === "week"
      ? `${shortDate(scope.weekStart)} to ${shortDate(addDays(scope.weekStart, 6))}`
      : period
        ? `${shortDate(period.from)} to ${shortDate(period.to)}`
        : "";

  /** The table as it stands on screen, downloaded as a CSV or a PDF. */
  function exportAs(kind: "csv" | "pdf") {
    if (!meeting || goals.length === 0) return;
    const table = meetingGoalTable({
      person: person?.full_name ?? "Goals",
      heading,
      period: [periodLine, meetingLabel(meeting)].filter(Boolean).join(" · "),
      goals,
      updates: data?.updates ?? [],
      weeks: weekColumns,
      weekLabel: shortDate,
      dateLabel: shortDate,
      columnsAdded: boxes.map((b) => b.field),
    });
    const name = safeFileName(`${table.title} ${meetingLabel(meeting)}`, kind);
    if (kind === "csv") downloadBytes(name, buildCsv(table.columns, table.rows), MIME.csv);
    else {
      downloadBytes(
        name,
        buildPdf(table.title, table.subtitle, table.columns, table.rows, new Date(), 10),
        MIME.pdf,
      );
    }
    toast.success(`${kind.toUpperCase()} downloaded.`);
  }

  return (
    <AppShell>
      <div className="space-y-5 py-2">
        <div className="ce-rise">
          <h1 className="font-display text-3xl text-ink">Strategic Meetings</h1>
          <p className="mt-1 text-sm text-soft">
            Everyone's goals for the run-up to each strategic meeting, with an update every week.
          </p>
        </div>

        {meetingsLoading ? (
          <div className="ce-card p-6 text-sm text-soft">Loading…</div>
        ) : !meeting ? (
          <div className="ce-card p-6 text-sm text-soft">
            No strategic meeting has been set yet.
            {isHr ? (
              <>
                {" "}
                Add one in{" "}
                <Link to="/settings" className="font-bold text-goldD underline">
                  Admin settings
                </Link>
                .
              </>
            ) : (
              " HR will add the next one."
            )}
          </div>
        ) : (
          <>
            <section className="ce-card grid gap-3 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className="ce-label">Goals for</span>
                <div
                  role="tablist"
                  aria-label="Goals for 45 days or one week"
                  className="mt-1 inline-flex rounded-full border border-line bg-cream p-1"
                >
                  {(
                    [
                      ["run", "45 Days"],
                      ["week", "Weekly"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={mode === value}
                      onClick={() => setMode(value)}
                      className={`min-h-9 rounded-full px-5 text-[13px] font-bold transition-colors ${
                        mode === value ? "bg-night text-goldL" : "text-soft hover:text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                <span className="ce-label">Meeting</span>
                <select
                  className="ce-input"
                  value={meeting.id}
                  onChange={(e) => setMeetingId(e.target.value)}
                >
                  {(meetings ?? [])
                    .slice()
                    .reverse()
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {meetingLabel(m)} · {shortDate(m.meeting_date)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span className="ce-label">Person</span>
                {/* a member has only their own table: just their name, no picker */}
                {people.length > 1 ? (
                  <select
                    className="ce-input"
                    value={activePerson ?? ""}
                    onChange={(e) => setPersonId(e.target.value)}
                  >
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                        {p.id === viewer?.id ? " (you)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="ce-input flex items-center">
                    {person?.full_name ?? viewer?.full_name ?? ""}
                  </div>
                )}
              </label>
              {mode === "week" && weeks.length > 0 ? (
                <label className="sm:col-span-2">
                  <span className="ce-label">Week</span>
                  <select
                    className="ce-input"
                    value={weekStart ?? ""}
                    onChange={(e) => setPickedWeek(e.target.value)}
                  >
                    {weeks.map((w) => (
                      <option key={w} value={w}>
                        Week of {shortDate(w)} ({shortDate(w)} – {shortDate(addDays(w, 6))})
                        {w === thisWeek ? " · this week" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>

            <DraftsContext.Provider value={drafts}>
              <section className="ce-card overflow-hidden">
                <div className="bg-night px-4 py-3 text-center text-white">
                  <p className="font-display text-xl">
                    {person ? `${person.full_name} — ` : ""}
                    {heading}
                  </p>
                  <p className="text-[12px] font-bold tracking-[0.08em] text-goldL uppercase">
                    {periodLine} · {meetingLabel(meeting)}
                  </p>
                  {meeting.tagline || meeting.from_time || meeting.location ? (
                    <p className="mt-0.5 text-[12px] text-mist">
                      {[meeting.tagline, timeLabel(meeting.from_time), meeting.location]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>

                {!isLoading && goals.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-b border-line bg-cream px-4 py-2">
                    <span className="mr-auto text-[12px] text-soft">
                      Download this table · drag a column's right edge or a row's bottom edge (in
                      No) to resize
                    </span>
                    {sizes.changed ? (
                      <button type="button" className="btn3d btn3d-ghost" onClick={sizes.reset}>
                        Reset sizes
                      </button>
                    ) : null}
                    <button type="button" className="btn3d" onClick={() => exportAs("csv")}>
                      CSV
                    </button>
                    <button
                      type="button"
                      className="btn3d btn3d-gold"
                      onClick={() => exportAs("pdf")}
                    >
                      PDF
                    </button>
                  </div>
                ) : null}

                {!canWrite ? (
                  <p className="border-b border-line bg-cream px-4 py-2 text-[12px] text-soft">
                    You can read this table. Only {person?.full_name.split(" ")[0] ?? "they"} and HR
                    can change it.
                  </p>
                ) : null}

                <div className="overflow-x-auto">
                  <table
                    className={`border-collapse text-left ${sizes.changed ? "" : "w-full"}`}
                    style={
                      sizes.changed
                        ? {
                            tableLayout: "fixed",
                            width:
                              colKeys.reduce((sum, k) => sum + colWidth(k), 0) +
                              (canWrite ? 40 : 0),
                          }
                        : { minWidth: (weekColumns.length > 0 ? 1010 : 770) + boxes.length * 240 }
                    }
                  >
                    <thead>
                      <tr className="bg-gold/25 text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
                        <th
                          className="relative min-w-[120px] border border-line px-2 py-2"
                          style={colStyle("type")}
                        >
                          Type
                          {colGrip("type")}
                        </th>
                        <th
                          className="relative w-10 border border-line px-2 py-2 text-center"
                          style={colStyle("no")}
                        >
                          No
                          {colGrip("no")}
                        </th>
                        <th
                          className="relative min-w-[220px] border border-line px-2 py-2"
                          style={colStyle("title")}
                        >
                          Goal / Task
                          {colGrip("title")}
                        </th>
                        <th
                          className="relative min-w-[120px] border border-line px-2 py-2"
                          style={colStyle("measure")}
                        >
                          Measure
                          {colGrip("measure")}
                        </th>
                        <th
                          className="relative w-[140px] border border-line px-2 py-2"
                          style={colStyle("timeline")}
                        >
                          Timeline
                          {colGrip("timeline")}
                        </th>
                        <th
                          className="relative min-w-[110px] border border-line px-2 py-2"
                          style={colStyle("outcome")}
                        >
                          Outcome
                          {colGrip("outcome")}
                        </th>
                        {weekColumns.map((w) => (
                          <th
                            key={w}
                            className="relative min-w-[170px] border border-line bg-emer/15 px-2 py-2"
                            style={colStyle(`week:${w}`)}
                          >
                            Week of {shortDate(w)}
                            {colGrip(`week:${w}`)}
                          </th>
                        ))}
                        {boxes.map((b) => (
                          <th
                            key={b.field}
                            className={`relative min-w-[240px] border border-line px-2 py-2 ${b.tone}`}
                            style={colStyle(`box:${b.field}`)}
                          >
                            <span className="flex items-center justify-between gap-2">
                              {b.label}
                              {canWrite ? (
                                <button
                                  type="button"
                                  aria-label={`Hide the ${b.label} column`}
                                  className="rounded px-1.5 text-[14px] text-red hover:bg-red/10"
                                  title="Hide this column; what is written stays saved and comes back if you add it again"
                                  onClick={() => writeNote(b.field, null)}
                                >
                                  ×
                                </button>
                              ) : null}
                            </span>
                            {colGrip(`box:${b.field}`)}
                          </th>
                        ))}
                        {canWrite ? (
                          <th
                            className="w-10 border border-line"
                            style={sizes.changed ? { width: 40 } : undefined}
                          />
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td colSpan={99} className="px-4 py-6 text-sm text-soft">
                            Loading…
                          </td>
                        </tr>
                      ) : goals.length === 0 ? (
                        <tr>
                          <td colSpan={99} className="px-4 py-6 text-sm text-soft">
                            {scope.kind === "week"
                              ? "No goals written for this week yet."
                              : "No goals written for this meeting yet."}
                          </td>
                        </tr>
                      ) : (
                        goals.map((g, i) => (
                          <tr
                            key={g.id}
                            className="ce-rowsize align-top odd:bg-white even:bg-cream/50"
                            style={
                              sizes.row(g.id)
                                ? ({
                                    height: sizes.row(g.id),
                                    "--row-h": `${sizes.row(g.id)! - 8}px`,
                                  } as CSSProperties)
                                : undefined
                            }
                          >
                            <td className="border border-line p-0.5">
                              {canWrite ? (
                                <select
                                  aria-label={`Goal ${i + 1}: main goal or sub goal`}
                                  className="w-full rounded-md border border-transparent bg-transparent px-1 py-1.5 text-[12px] font-bold text-ink hover:border-line focus:border-gold focus:outline-none"
                                  value={g.goal_type === "sub" ? "sub" : "main"}
                                  onChange={(e) =>
                                    writes.saveGoal.mutate(
                                      { id: g.id, values: { goal_type: e.target.value } },
                                      { onError: fail },
                                    )
                                  }
                                >
                                  <option value="main">Main Goal</option>
                                  <option value="sub">Sub Goal</option>
                                </select>
                              ) : (
                                <span className="block px-2 py-2 text-[12px] font-bold text-ink">
                                  {g.goal_type === "sub" ? "Sub Goal" : "Main Goal"}
                                </span>
                              )}
                            </td>
                            <td className="relative border border-line px-2 py-2 text-center text-[13px] font-bold text-ink">
                              {i + 1}
                              <span
                                role="separator"
                                aria-orientation="horizontal"
                                aria-label="Drag to change the row height"
                                title="Drag to change the row height"
                                className="absolute right-0 bottom-0 left-0 z-10 h-2 cursor-row-resize hover:bg-gold/70"
                                onPointerDown={(e) =>
                                  startDrag(
                                    e,
                                    "y",
                                    (
                                      e.currentTarget.closest("tr") as HTMLElement
                                    ).getBoundingClientRect().height,
                                    (h) => sizes.setRow(g.id, h),
                                  )
                                }
                              />
                            </td>
                            {canWrite ? (
                              <>
                                <td className="border border-line p-0.5">
                                  <Cell
                                    multiline
                                    className="font-bold"
                                    value={g.title}
                                    placeholder="Increase show up rate of …"
                                    onSave={(v) =>
                                      writes.saveGoal.mutate(
                                        { id: g.id, values: { title: v } },
                                        { onError: fail },
                                      )
                                    }
                                  />
                                </td>
                                <td className="border border-line p-0.5">
                                  <Cell
                                    value={g.measure ?? ""}
                                    placeholder="200+"
                                    onSave={(v) =>
                                      writes.saveGoal.mutate(
                                        { id: g.id, values: { measure: v.trim() || null } },
                                        { onError: fail },
                                      )
                                    }
                                  />
                                </td>
                                <td className="border border-line p-0.5">
                                  <Cell
                                    type="date"
                                    value={g.timeline ?? ""}
                                    onSave={(v) =>
                                      writes.saveGoal.mutate(
                                        { id: g.id, values: { timeline: v || null } },
                                        { onError: fail },
                                      )
                                    }
                                  />
                                </td>
                                <td className="border border-line p-0.5">
                                  <Cell
                                    multiline
                                    className="font-bold text-emer"
                                    value={g.outcome ?? ""}
                                    placeholder="105% Achieved"
                                    onSave={(v) =>
                                      writes.saveGoal.mutate(
                                        { id: g.id, values: { outcome: v.trim() || null } },
                                        { onError: fail },
                                      )
                                    }
                                  />
                                </td>
                                {weekColumns.map((w) => {
                                  const u = updates.get(`${g.id}|${w}`);
                                  return (
                                    <td key={w} className="border border-line p-0.5">
                                      <Cell
                                        multiline
                                        value={u?.note ?? ""}
                                        placeholder="This week…"
                                        onSave={(v) =>
                                          writes.saveUpdate.mutate(
                                            {
                                              goalId: g.id,
                                              weekStart: w,
                                              note: v,
                                              by: viewer?.id ?? null,
                                              exists: Boolean(u),
                                            },
                                            { onError: fail },
                                          )
                                        }
                                      />
                                    </td>
                                  );
                                })}
                                {boxes.map((b) => (
                                  <td
                                    key={b.field}
                                    className={`border border-line p-0.5 ${b.tone}`}
                                  >
                                    <Cell
                                      multiline
                                      value={g[b.field] ?? ""}
                                      placeholder={b.placeholder}
                                      onSave={(v) =>
                                        writes.saveGoal.mutate(
                                          { id: g.id, values: { [b.field]: v.trim() || null } },
                                          { onError: fail },
                                        )
                                      }
                                    />
                                  </td>
                                ))}
                                <td className="border border-line px-1 py-2 text-center">
                                  <button
                                    type="button"
                                    aria-label="Remove this goal"
                                    className="rounded px-1.5 text-[16px] text-red hover:bg-red/10"
                                    onClick={() => {
                                      if (
                                        !window.confirm("Remove this goal and its weekly updates?")
                                      )
                                        return;
                                      writes.deleteGoal.mutate(g.id, { onError: fail });
                                    }}
                                  >
                                    ×
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="border border-line px-2 py-2 text-[13px] font-bold whitespace-pre-line text-ink">
                                  {g.title || "—"}
                                </td>
                                <td className="border border-line px-2 py-2 text-[13px] text-ink">
                                  {g.measure ?? ""}
                                </td>
                                <td className="border border-line px-2 py-2 text-[13px] text-ink">
                                  {g.timeline ? shortDate(g.timeline) : ""}
                                </td>
                                <td className="border border-line px-2 py-2 text-[13px] font-bold text-emer">
                                  {g.outcome ?? ""}
                                </td>
                                {weekColumns.map((w) => (
                                  <td
                                    key={w}
                                    className="border border-line px-2 py-2 text-[12px] whitespace-pre-line text-ink"
                                  >
                                    {updates.get(`${g.id}|${w}`)?.note ?? ""}
                                  </td>
                                ))}
                                {boxes.map((b) => (
                                  <td
                                    key={b.field}
                                    className={`border border-line px-2 py-2 text-[12px] whitespace-pre-line text-ink ${b.tone}`}
                                  >
                                    {g[b.field] ?? ""}
                                  </td>
                                ))}
                              </>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {canWrite ? (
                  <div className="border-t border-line p-3">
                    <button
                      type="button"
                      className="btn3d btn3d-gold"
                      disabled={writes.addGoal.isPending || !viewer}
                      onClick={() =>
                        viewer &&
                        writes.addGoal.mutate(
                          {
                            orgId: viewer.org_id,
                            position: (goals[goals.length - 1]?.position ?? 0) + 10,
                            createdBy: viewer.id,
                          },
                          { onError: fail },
                        )
                      }
                    >
                      + Add goal
                    </button>
                    {goals.length > 0
                      ? missingBoxes.map(([field, label]) => (
                          <button
                            key={field}
                            type="button"
                            className="btn3d ml-2"
                            disabled={saveNote.isPending || !viewer}
                            title={`Add a ${label} column, one entry beside each goal (only if you need it)`}
                            onClick={() => writeNote(field, "")}
                          >
                            + {label}
                          </button>
                        ))
                      : null}
                    <button
                      type="button"
                      className="btn3d btn3d-gold ml-2"
                      disabled={!unsaved}
                      title="Save everything typed in this table now"
                      onClick={() => drafts.flushAll()}
                    >
                      Save
                    </button>
                    <span
                      className={`ml-3 text-[12px] ${unsaved ? "font-bold text-goldD" : "text-soft"}`}
                      aria-live="polite"
                    >
                      {saving
                        ? "Saving…"
                        : dirtyCount > 0
                          ? "Unsaved changes, saving in a moment…"
                          : "All changes saved. Cells save by themselves as you type."}
                    </span>
                  </div>
                ) : null}
              </section>
            </DraftsContext.Provider>

            {goals.length > 0 ? (
              <MeetingDashboard
                data={dashboard.charts}
                goals={goals}
                weeks={dashboard.weeks}
                overviewNote={dashboard.note}
              />
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
