import { useEffect, useMemo, useState } from "react";

import {
  useAttendees,
  useCancelItem,
  useDuplicateItem,
  useSaveEvent,
  useSaveProgram,
  useSetAttendees,
  type CalEvent,
  type Program,
  type SeriesScope,
} from "@/hooks/useCalendar";
import { EVENT_TYPES, PROGRAM_TYPES, longDate } from "@/lib/calendar";
import { SeriesPanel } from "@/components/calendar/SeriesPanel";
import { googleEventUrl } from "@/lib/calendarLinks";
import { canEditEvent, canEditProgram, isOrdinary } from "@/lib/calendarPerms";
import type { Profile } from "@/lib/warriors";

export type EditTarget =
  | { kind: "event"; row: CalEvent }
  | { kind: "program"; row: Program };

interface Props {
  target: EditTarget;
  warriors: Profile[];
  me: Profile | null;
  onClose: () => void;
}

const SCOPES: { value: SeriesScope; label: string }[] = [
  { value: "one", label: "This session only" },
  { value: "following", label: "This and all following" },
  { value: "all", label: "All sessions in the series" },
];

export function EventEditor({ target, warriors, me, onClose }: Props) {
  const isEvent = target.kind === "event";
  const row = target.row;
  const anchorDate = isEvent ? (row as CalEvent).date : (row as Program).from_date;
  const inSeries = Boolean(row.series_id);

  const mayEdit = isEvent
    ? canEditEvent(me, row as CalEvent)
    : canEditProgram(me, row as Program);

  const saveEvent = useSaveEvent();
  const saveProgram = useSaveProgram();
  const cancelItem = useCancelItem();
  const duplicate = useDuplicateItem();
  const { data: allAttendees } = useAttendees();
  const setAttendees = useSetAttendees(row.org_id);

  const hosts = useMemo(() => warriors.filter((w) => w.status === "active"), [warriors]);

  const [name, setName] = useState(row.name);
  const [type, setType] = useState(row.type);
  const [from, setFrom] = useState(anchorDate);
  const [to, setTo] = useState(
    isEvent ? ((row as CalEvent).end_date ?? (row as CalEvent).date) : (row as Program).to_date,
  );
  const [allDay, setAllDay] = useState(!row.from_time);
  const [fromTime, setFromTime] = useState(row.from_time ?? "");
  const [toTime, setToTime] = useState(row.to_time ?? "");
  const [location, setLocation] = useState(row.location ?? "");
  const [description, setDescription] = useState(row.description ?? "");
  const [hostId, setHostId] = useState(row.host_id ?? "");
  const [coverId, setCoverId] = useState(isEvent ? "" : ((row as Program).cover_id ?? ""));
  const [scope, setScope] = useState<SeriesScope>("one");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSeries, setShowSeries] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const mine = useMemo(
    () => (allAttendees ?? []).filter((a) => a.kind === target.kind && a.ref_id === row.id),
    [allAttendees, target.kind, row.id],
  );
  const [attending, setAttending] = useState<string[]>([]);
  const [required, setRequired] = useState<string[]>([]);

  useEffect(() => {
    setAttending(mine.map((a) => a.profile_id));
    setRequired(mine.filter((a) => a.required).map((a) => a.profile_id));
  }, [mine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const typeOptions = isEvent
    ? me && !canEditEvent(me, row as CalEvent)
      ? [type]
      : (me?.role === "manager" && !canEditProgram(me)
          ? EVENT_TYPES.filter((t) => isOrdinary(t))
          : EVENT_TYPES)
    : PROGRAM_TYPES;

  const toggleAttendee = (id: string) => {
    setAttending((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
    setRequired((list) => (list.includes(id) ? list.filter((x) => x !== id) : list));
  };

  const save = async () => {
    setNote(null);
    if (!name.trim()) {
      setNote("Give it a name first.");
      return;
    }
    if (to < from) {
      setNote("The last day can't be before the first day.");
      return;
    }
    try {
      if (isEvent) {
        await saveEvent.mutateAsync({
          row: row as CalEvent,
          scope,
          patch: {
            name: name.trim(),
            type,
            date: from,
            end_date: to === from ? null : to,
            all_day: allDay,
            from_time: allDay || !fromTime ? null : fromTime,
            to_time: allDay || !toTime ? null : toTime,
            location: location.trim() || null,
            description: description.trim() || null,
            host_id: hostId || null,
          },
        });
      } else {
        await saveProgram.mutateAsync({
          row: row as Program,
          scope,
          patch: {
            name: name.trim(),
            type,
            from_date: from,
            to_date: to,
            from_time: allDay || !fromTime ? null : fromTime,
            to_time: allDay || !toTime ? null : toTime,
            location: location.trim() || null,
            description: description.trim() || null,
            host_id: hostId || null,
            cover_id: coverId || null,
          },
        });
      }
      await setAttendees.mutateAsync({
        kind: target.kind,
        refId: row.id,
        profileIds: attending,
        requiredIds: required,
      });
      onClose();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn't save. Try once more.");
    }
  };

  const remove = async () => {
    try {
      await cancelItem.mutateAsync({
        table: isEvent ? "events" : "programs",
        row: { id: row.id, series_id: row.series_id, date: anchorDate },
        scope,
      });
      onClose();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn't delete. Try once more.");
    }
  };

  const gcal = googleEventUrl({
    title: name,
    start: from,
    end: to,
    fromTime: allDay ? null : fromTime || null,
    toTime: allDay ? null : toTime || null,
    location: location || null,
    details: description || null,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ce-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-[14px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.1em] text-soft uppercase">
              {isEvent ? "Event" : "Programme"}
              {inSeries ? " · part of a series" : ""}
            </p>
            <h2 className="font-display text-2xl text-ink">{row.name}</h2>
            <p className="text-[12px] text-soft">{longDate(anchorDate)}</p>
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

        {!mayEdit ? (
          <p className="mt-4 rounded-lg border border-line bg-cream p-3 text-[13px] text-soft">
            You can see everything here, but this one is kept by HR and Admin.
          </p>
        ) : null}

        {inSeries ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-cream p-3">
            <p className="text-[13px] text-ink">Part of a series.</p>
            <button
              type="button"
              className="btn3d btn3d-ghost"
              onClick={() => setShowSeries(true)}
            >
              Manage series
            </button>
          </div>
        ) : null}

        {showSeries && row.series_id ? (
          <SeriesPanel
            table={isEvent ? "events" : "programs"}
            seriesId={row.series_id}
            orgId={row.org_id}
            createdBy={me?.id ?? ""}
            onClose={() => setShowSeries(false)}
          />
        ) : null}

        {inSeries && mayEdit ? (
          <fieldset className="mt-4 rounded-lg border border-gold/40 bg-cream p-3">
            <legend className="px-1 text-[11px] font-bold tracking-[0.08em] text-goldD uppercase">
              Apply changes to
            </legend>
            <div className="space-y-1.5">
              {SCOPES.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-[13px] text-ink">
                  <input
                    type="radio"
                    name="series-scope"
                    checked={scope === s.value}
                    onChange={() => setScope(s.value)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="mt-4 space-y-3">
          <div>
            <label className="ce-label" htmlFor="ev-name">
              Name
            </label>
            <input
              id="ev-name"
              className="ce-input"
              value={name}
              disabled={!mayEdit}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="ce-label" htmlFor="ev-type">
                Type
              </label>
              <select
                id="ev-type"
                className="ce-input"
                value={type}
                disabled={!mayEdit}
                onChange={(e) => setType(e.target.value)}
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ce-label" htmlFor="ev-host">
                Host
              </label>
              <select
                id="ev-host"
                className="ce-input"
                value={hostId}
                disabled={!mayEdit}
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="ce-label" htmlFor="ev-from">
                First day
              </label>
              <input
                id="ev-from"
                type="date"
                className="ce-input"
                value={from}
                disabled={!mayEdit}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (to < e.target.value) setTo(e.target.value);
                }}
              />
            </div>
            <div>
              <label className="ce-label" htmlFor="ev-to">
                Last day
              </label>
              <input
                id="ev-to"
                type="date"
                className="ce-input"
                value={to}
                disabled={!mayEdit}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] font-bold text-ink">
            <input
              type="checkbox"
              checked={allDay}
              disabled={!mayEdit}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All day
          </label>

          {!allDay ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="ce-label" htmlFor="ev-start">
                  Starts
                </label>
                <input
                  id="ev-start"
                  type="time"
                  className="ce-input"
                  value={fromTime}
                  disabled={!mayEdit}
                  onChange={(e) => setFromTime(e.target.value)}
                />
              </div>
              <div>
                <label className="ce-label" htmlFor="ev-end">
                  Ends
                </label>
                <input
                  id="ev-end"
                  type="time"
                  className="ce-input"
                  value={toTime}
                  disabled={!mayEdit}
                  onChange={(e) => setToTime(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="ce-label" htmlFor="ev-loc">
              Location
            </label>
            <input
              id="ev-loc"
              className="ce-input"
              value={location}
              placeholder="Online, Mumbai office…"
              disabled={!mayEdit}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          {!isEvent ? (
            <div>
              <label className="ce-label" htmlFor="ev-cover">
                Cover — who owns this if the host is away
              </label>
              <select
                id="ev-cover"
                className="ce-input"
                value={coverId}
                disabled={!mayEdit}
                onChange={(e) => setCoverId(e.target.value)}
              >
                <option value="">Nobody yet</option>
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.full_name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="ce-label" htmlFor="ev-desc">
              Description
            </label>
            <textarea
              id="ev-desc"
              className="ce-input min-h-20"
              value={description}
              disabled={!mayEdit}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <p className="ce-label">Attendees</p>
            <p className="mb-2 text-[12px] text-soft">
              Tick who is coming. Star the ones who must be there — we will warn you if they take
              leave on these dates.
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line bg-white p-2">
              {hosts.map((w) => {
                const on = attending.includes(w.id);
                return (
                  <div key={w.id} className="flex items-center gap-2">
                    <label className="flex min-h-9 flex-1 items-center gap-2 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!mayEdit}
                        onChange={() => toggleAttendee(w.id)}
                      />
                      {w.full_name}
                    </label>
                    {on ? (
                      <button
                        type="button"
                        disabled={!mayEdit}
                        onClick={() =>
                          setRequired((list) =>
                            list.includes(w.id)
                              ? list.filter((x) => x !== w.id)
                              : [...list, w.id],
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                          required.includes(w.id)
                            ? "border-goldD/40 bg-gold/15 text-goldD"
                            : "border-line bg-cream text-soft"
                        }`}
                      >
                        {required.includes(w.id) ? "Required" : "Optional"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {note ? (
          <p className="mt-3 rounded-lg border border-red/30 bg-red/10 p-3 text-[13px] font-semibold text-red">
            {note}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          {mayEdit ? (
            <button
              type="button"
              className="btn3d flex-1 sm:flex-none"
              onClick={save}
              disabled={saveEvent.isPending || saveProgram.isPending}
            >
              {saveEvent.isPending || saveProgram.isPending ? "Saving…" : "Save changes"}
            </button>
          ) : null}
          <a className="btn3d btn3d-ghost" href={gcal} target="_blank" rel="noreferrer">
            Add to Google Calendar
          </a>
          {mayEdit ? (
            <button
              type="button"
              className="btn3d btn3d-ghost"
              onClick={() =>
                duplicate.mutate(
                  { table: isEvent ? "events" : "programs", id: row.id },
                  { onSuccess: onClose },
                )
              }
            >
              Duplicate
            </button>
          ) : null}
        </div>

        {mayEdit ? (
          <div className="mt-3">
            {confirmDelete ? (
              <div className="rounded-lg border border-red/30 bg-red/10 p-3">
                <p className="text-[13px] font-semibold text-red">
                  Delete {inSeries ? SCOPES.find((s) => s.value === scope)?.label.toLowerCase() : "this"}
                  ? Anyone subscribed will see it disappear from their calendar.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="btn3d btn3d-danger" onClick={remove}>
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    className="btn3d btn3d-ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="text-[13px] font-bold text-red underline"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
