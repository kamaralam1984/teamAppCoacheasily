import { useMemo, useState } from "react";

import {
  useAddEvents,
  useAddPrograms,
  useCalendarYear,
  type CalendarData,
} from "@/hooks/useCalendar";
import {
  EVENT_TYPES,
  PROGRAM_TYPES,
  WEEKDAYS,
  addDays,
  dayOfWeek,
  daysBetween,
  parseLine,
  rangeLabel,
  todayIso,
  type Parsed,
} from "@/lib/calendar";
import { PasteReview, type Draft } from "@/components/calendar/PasteReview";
import { VoiceInput } from "@/components/calendar/VoiceInput";
import type { Profile } from "@/lib/warriors";

interface Props {
  orgId: string;
  profileId: string;
  warriors: Profile[];
}

function clashesFor(data: CalendarData | undefined, from: string, to: string): string[] {
  if (!data) return [];
  const hits: string[] = [];
  for (const p of data.programs) {
    if (p.from_date <= to && p.to_date >= from) hits.push(p.name);
  }
  for (const e of data.events) {
    if (e.date <= to && (e.end_date ?? e.date) >= from) hits.push(e.name);
  }
  return Array.from(new Set(hits));
}

function Preview({
  parsed,
  data,
  name,
  onName,
  weeks,
  onWeeks,
  until,
  onUntil,
  bulkOk,
  onBulkOk,
}: {
  parsed: Parsed;
  data: CalendarData | undefined;
  name: string;
  onName: (v: string) => void;
  weeks: number;
  onWeeks: (v: number) => void;
  until: string;
  onUntil: (v: string) => void;
  bulkOk: boolean;
  onBulkOk: (v: boolean) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!parsed.ok) {
    return (
      <p className="rounded-lg border border-red/30 bg-red/10 p-3 text-[13px] font-semibold text-red">
        ✕ {parsed.error}
      </p>
    );
  }
  const shown = showAll ? parsed.dates : parsed.dates.slice(0, 5);
  const last = parsed.dates[parsed.dates.length - 1];
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <label className="ce-label" htmlFor="preview-name">
        Name (edit if needed)
      </label>
      <input
        id="preview-name"
        className="ce-input"
        value={name}
        onChange={(e) => onName(e.target.value)}
      />
      <p className="mt-2 text-[13px] text-soft">
        {parsed.type}
        {parsed.fromTime ? ` · ${parsed.fromTime}${parsed.toTime ? `–${parsed.toTime}` : ""}` : ""}
        {parsed.location ? ` · ${parsed.location}` : ""}
        {` · ${parsed.dates.length} date${parsed.dates.length === 1 ? "" : "s"}`}
      </p>

      {parsed.unbounded ? (
        <div className="mt-3 rounded-lg border border-gold/40 bg-gold/10 p-3">
          <p className="text-[13px] font-semibold text-ink">
            No end date given — I'll create {parsed.dates.length} session
            {parsed.dates.length === 1 ? "" : "s"}
            {last ? ` through ${rangeLabel(last.from, last.to)}` : ""}.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {HORIZON_CHOICES.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  onUntil("");
                  onWeeks(w);
                }}
                className={`min-h-9 rounded-full px-3 text-[12px] font-bold ${
                  !until && weeks === w
                    ? "bg-night text-goldL"
                    : "border border-line bg-white text-soft"
                }`}
              >
                {w} weeks
              </button>
            ))}
            <input
              type="date"
              aria-label="Or pick an end date"
              className="ce-input h-9 w-auto py-0 text-[12px]"
              value={until}
              onChange={(e) => onUntil(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {parsed.dates.length > BULK_CONFIRM_ABOVE ? (
        <label className="mt-3 flex min-h-11 items-center gap-2 text-[13px] font-semibold text-ink">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={bulkOk}
            onChange={(e) => onBulkOk(e.target.checked)}
          />
          Yes, create {parsed.dates.length} sessions.
        </label>
      ) : null}

      <ul className="mt-2 space-y-1">
        {shown.map((d) => {
          const clash = clashesFor(data, d.from, d.to);
          return (
            <li key={d.from} className="text-[12px] text-soft">
              {rangeLabel(d.from, d.to)}
              {clash.length > 0 ? (
                <span className="font-bold text-goldD"> ⚠ already: {clash.join(", ")}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {parsed.dates.length > 5 ? (
        <button
          type="button"
          className="mt-1 text-[12px] font-bold text-plum underline"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show less" : `+${parsed.dates.length - 5} more`}
        </button>
      ) : null}
    </div>
  );
}


export function Scheduler({ orgId, profileId, warriors }: Props) {
  const [mode, setMode] = useState<"one" | "paste" | "manual">("one");
  const { data: window } = useCalendarYear(true);
  const addPrograms = useAddPrograms();
  const addEvents = useAddEvents();
  const today = todayIso();

  const hosts = useMemo(
    () => warriors.filter((w) => w.status === "active"),
    [warriors],
  );

  // ── one event, in plain English ──
  const [sentence, setSentence] = useState("");
  const [hostId, setHostId] = useState("");
  const parsed = useMemo(() => (sentence.trim() ? parseLine(sentence, today) : null), [sentence, today]);

  // ── paste a list ──
  const [pasted, setPasted] = useState("");
  const parsedList = useMemo(
    () =>
      pasted
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => parseLine(l, today)),
    [pasted, today],
  );

  // ── manual ──
  const [mName, setMName] = useState("");
  const [mType, setMType] = useState<string>("Meeting");
  const [mFrom, setMFrom] = useState(today);
  const [mTo, setMTo] = useState(today);
  const [mFromTime, setMFromTime] = useState("");
  const [mToTime, setMToTime] = useState("");
  const [mLocation, setMLocation] = useState("");
  const [mRepeat, setMRepeat] = useState(false);
  const [mUntil, setMUntil] = useState("");
  const [mHost, setMHost] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const isProgramType = (t: string) => (PROGRAM_TYPES as string[]).includes(t);

  const commit = async (items: Parsed[], host: string) => {
    const programRows = [];
    const eventRows = [];
    for (const item of items) {
      if (!item.ok) continue;
      const seriesId = item.dates.length > 1 ? crypto.randomUUID() : null;
      let n = 1;
      for (const d of item.dates) {
        if (item.isProgram && isProgramType(item.type)) {
          programRows.push({
            org_id: orgId,
            name: item.name,
            type: item.type,
            from_date: d.from,
            to_date: d.to,
            host_id: host || null,
            location: item.location,
            series_id: seriesId,
            session_no: seriesId ? n : null,
            created_by: profileId,
          });
        } else {
          eventRows.push({
            org_id: orgId,
            name: item.name,
            type: item.type,
            date: d.from,
            end_date: d.to === d.from ? null : d.to,
            from_time: item.fromTime,
            to_time: item.toTime,
            location: item.location,
            series_id: seriesId,
            created_by: profileId,
          });
        }
        n += 1;
      }
    }
    await addPrograms.mutateAsync(programRows);
    await addEvents.mutateAsync(eventRows);
    setNote(`Added ${programRows.length + eventRows.length} dated item(s).`);
  };

  /** Reviewed rows from the paste table — same name and type becomes one numbered series. */
  const commitDrafts = async (drafts: Draft[]) => {
    const seriesFor = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const d of drafts) {
      const k = `${d.name}|${d.type}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, n] of counts) if (n > 1) seriesFor.set(k, crypto.randomUUID());

    const seen = new Map<string, number>();
    const programRows = [];
    const eventRows = [];
    for (const d of drafts) {
      const k = `${d.name}|${d.type}`;
      const seriesId = seriesFor.get(k) ?? null;
      const no = (seen.get(k) ?? 0) + 1;
      seen.set(k, no);
      if (d.isProgram && isProgramType(d.type)) {
        programRows.push({
          org_id: orgId,
          name: d.name,
          type: d.type,
          from_date: d.from,
          to_date: d.to,
          from_time: d.fromTime || null,
          to_time: d.toTime || null,
          host_id: d.hostId || null,
          location: d.location || null,
          series_id: seriesId,
          session_no: seriesId ? no : null,
          created_by: profileId,
        });
      } else {
        eventRows.push({
          org_id: orgId,
          name: d.name,
          type: d.type,
          date: d.from,
          end_date: d.to === d.from ? null : d.to,
          from_time: d.fromTime || null,
          to_time: d.toTime || null,
          host_id: d.hostId || null,
          location: d.location || null,
          series_id: seriesId,
          created_by: profileId,
        });
      }
    }
    await addPrograms.mutateAsync(programRows);
    await addEvents.mutateAsync(eventRows);
    setNote(`Added ${programRows.length + eventRows.length} dated item(s).`);
  };



  const manualDates = () => {
    const out: { from: string; to: string }[] = [];
    const span = Math.max(0, daysBetween(mFrom, mTo));
    if (!mRepeat) return [{ from: mFrom, to: mTo }];
    const want = dayOfWeek(mFrom);
    let cursor = mFrom;
    const limit = mUntil || addDays(mFrom, 7 * 11);
    let guard = 0;
    while (daysBetween(cursor, limit) >= 0 && guard < 60) {
      if (dayOfWeek(cursor) === want) out.push({ from: cursor, to: addDays(cursor, span) });
      cursor = addDays(cursor, 7);
      guard += 1;
    }
    return out;
  };

  const tab = (id: typeof mode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setMode(id);
        setNote(null);
      }}
      className={`min-h-11 rounded-full px-4 text-[13px] font-bold ${
        mode === id ? "bg-night text-goldL" : "border border-line bg-white text-soft"
      }`}
    >
      {label}
    </button>
  );

  const busy = addPrograms.isPending || addEvents.isPending;
  const validList = parsedList.filter((p) => p.ok);

  return (
    <div className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Schedule something</h2>
      <p className="mt-1 text-[13px] text-soft">
        Write it the way you'd say it. Check the preview, then confirm.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {tab("one", "One event")}
        {tab("paste", "Paste a list")}
        {tab("manual", "Manual form")}
      </div>

      {mode === "one" ? (
        <div className="mt-4 space-y-3">
          <div>
            <label className="ce-label" htmlFor="sentence">
              What's happening?
            </label>
            <textarea
              id="sentence"
              className="ce-input py-3"
              rows={2}
              placeholder="CBA Hinglish 17-20 August online — or — Standup every Tuesday at 10am until 30 September"
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
            />
          </div>
          <div>
            <label className="ce-label" htmlFor="host">
              Host (optional)
            </label>
            <select
              id="host"
              className="ce-input"
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
            >
              <option value="">Not set</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.full_name}
                </option>
              ))}
            </select>
          </div>
          <VoiceInput onTranscript={(t) => setSentence((s) => (s ? `${s} ${t}` : t))} />
          {parsed ? <Preview parsed={parsed} data={window} /> : null}

          <button
            type="button"
            className="btn3d w-full sm:w-auto"
            disabled={!parsed?.ok || busy}
            onClick={() => {
              if (parsed?.ok) void commit([parsed], hostId).then(() => setSentence(""));
            }}
          >
            Confirm and add
          </button>
        </div>
      ) : null}

      {mode === "paste" ? (
        <div className="mt-4 space-y-3">
          <div>
            <label className="ce-label" htmlFor="pasted">
              One item per line
            </label>
            <textarea
              id="pasted"
              className="ce-input py-3"
              rows={6}
              placeholder={"MCA Marathi 7 July\nMCA Marathi 14 July\nKickstart on 24 July online"}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
          </div>
          <div>
            <label className="ce-label" htmlFor="host-list">
              Host for all of these (optional)
            </label>
            <select
              id="host-list"
              className="ce-input"
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
            >
              <option value="">Not set</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.full_name}
                </option>
              ))}
            </select>
          </div>
          {parsedList.length > 0 ? (
            <PasteReview
              parsed={parsedList}
              hosts={hosts}
              defaultHostId={hostId}
              data={window}
              busy={busy}
              onConfirm={(drafts) => void commitDrafts(drafts).then(() => setPasted(""))}
            />
          ) : null}

        </div>
      ) : null}

      {mode === "manual" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="ce-label" htmlFor="m-name">
              Name
            </label>
            <input
              id="m-name"
              className="ce-input"
              value={mName}
              onChange={(e) => setMName(e.target.value)}
            />
          </div>
          <div>
            <label className="ce-label" htmlFor="m-type">
              Type
            </label>
            <select
              id="m-type"
              className="ce-input"
              value={mType}
              onChange={(e) => setMType(e.target.value)}
            >
              <optgroup label="Programmes">
                {PROGRAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Events">
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="ce-label" htmlFor="m-host">
              Host
            </label>
            <select
              id="m-host"
              className="ce-input"
              value={mHost}
              onChange={(e) => setMHost(e.target.value)}
            >
              <option value="">Not set</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ce-label" htmlFor="m-from">
              First day
            </label>
            <input
              id="m-from"
              type="date"
              className="ce-input"
              value={mFrom}
              onChange={(e) => setMFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="ce-label" htmlFor="m-to">
              Last day
            </label>
            <input
              id="m-to"
              type="date"
              className="ce-input"
              value={mTo}
              onChange={(e) => setMTo(e.target.value)}
            />
          </div>
          <div>
            <label className="ce-label" htmlFor="m-ft">
              Starts
            </label>
            <input
              id="m-ft"
              type="time"
              className="ce-input"
              value={mFromTime}
              onChange={(e) => setMFromTime(e.target.value)}
            />
          </div>
          <div>
            <label className="ce-label" htmlFor="m-tt">
              Ends
            </label>
            <input
              id="m-tt"
              type="time"
              className="ce-input"
              value={mToTime}
              onChange={(e) => setMToTime(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="ce-label" htmlFor="m-loc">
              Location
            </label>
            <input
              id="m-loc"
              className="ce-input"
              placeholder="Online, Mumbai, …"
              value={mLocation}
              onChange={(e) => setMLocation(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-end gap-3">
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={mRepeat}
                onChange={(e) => setMRepeat(e.target.checked)}
              />
              Repeat weekly on {WEEKDAYS[dayOfWeek(mFrom)]}
            </label>
            {mRepeat ? (
              <div>
                <label className="ce-label" htmlFor="m-until">
                  Until
                </label>
                <input
                  id="m-until"
                  type="date"
                  className="ce-input"
                  value={mUntil}
                  onChange={(e) => setMUntil(e.target.value)}
                />
              </div>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <button
              type="button"
              className="btn3d w-full sm:w-auto"
              disabled={!mName.trim() || busy}
              onClick={() => {
                const item: Parsed = {
                  ok: true,
                  raw: mName,
                  name: mName.trim(),
                  type: mType,
                  isProgram: isProgramType(mType),
                  from: mFrom,
                  to: mTo,
                  fromTime: mFromTime || null,
                  toTime: mToTime || null,
                  location: mLocation || null,
                  repeatDow: mRepeat ? dayOfWeek(mFrom) : null,
                  repeatUntil: mRepeat ? mUntil || null : null,
                  dates: manualDates(),
                };
                void commit([item], mHost).then(() => setMName(""));
              }}
            >
              Add to the calendar
            </button>
          </div>
        </div>
      ) : null}

      {note ? <p className="mt-3 text-[13px] font-semibold text-emer">{note}</p> : null}
      {addPrograms.isError || addEvents.isError ? (
        <p className="mt-3 text-[13px] font-semibold text-red">
          That didn't save. Please check the dates and try again.
        </p>
      ) : null}
    </div>
  );
}
