import { toast } from "sonner";
import { useMemo, useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import {
  HOLIDAY_KINDS,
  isDayOff,
  KIND_LABEL,
  useAddCalendarHolidays,
  useHolidayCalendar,
  useHolidaySuggestions,
  useRemoveCalendarHoliday,
  useUpdateCalendarHoliday,
  type CalendarHoliday,
  type HolidayKind,
} from "@/hooks/useHolidayCalendar";
import { useOrgSettings, useSaveOrgSettings } from "@/hooks/useOrg";
import type { HolidaySuggestion } from "@/lib/holidaySuggestions";
import { longDate, todayIso, weekdayName } from "@/lib/calendar";

const KIND_TONE: Record<string, string> = {
  national: "bg-red/12 text-red",
  regional: "bg-saff/15 text-saffBtn",
  company: "bg-violet/12 text-violet",
  optional: "bg-goldL/30 text-goldD",
  restricted: "bg-mist/50 text-ink",
};

function HolidayRow({ h, canManage }: { h: CalendarHoliday; canManage: boolean }) {
  const update = useUpdateCalendarHoliday();
  const remove = useRemoveCalendarHoliday();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(h.name);
  const [date, setDate] = useState(h.date);
  const [kind, setKind] = useState<HolidayKind>(h.kind as HolidayKind);
  const proposed = h.status === "proposed";
  const fail = (e: unknown) => toast.error((e as Error).message || "That didn't save.");

  return (
    <li
      className={`rounded-lg border bg-white px-3 py-2 ${proposed ? "border-gold/60 bg-goldL/10" : "border-line"}`}
    >
      {editing ? (
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end">
          <input
            type="date"
            aria-label="Date"
            className="ce-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            aria-label="Name"
            className="ce-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="Type"
            className="ce-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as HolidayKind)}
          >
            {HOLIDAY_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn3d"
              disabled={!name.trim() || update.isPending}
              onClick={() =>
                update.mutate(
                  { id: h.id, patch: { name: name.trim(), date, kind } },
                  { onSuccess: () => setEditing(false), onError: fail },
                )
              }
            >
              Save
            </button>
            <button type="button" className="btn3d btn3d-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${isDayOff(h.kind) && !proposed ? "bg-red" : "bg-soft/40"}`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{h.name}</p>
            <p className="text-[12px] text-soft">
              {longDate(h.date)} · {weekdayName(h.date)}
              {h.region ? ` · ${h.region}` : ""}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${KIND_TONE[h.kind] ?? ""}`}
          >
            {KIND_LABEL[h.kind as HolidayKind] ?? h.kind}
          </span>
          {proposed ? (
            <span className="rounded-full bg-goldL/40 px-2 py-0.5 text-[11px] font-bold text-goldD">
              Proposed
            </span>
          ) : null}
          {canManage ? (
            <div className="flex items-center gap-1">
              {proposed ? (
                <button
                  type="button"
                  className="btn3d min-h-9 px-3 text-[12px]"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate(
                      { id: h.id, patch: { status: "approved" } },
                      { onSuccess: () => toast.success("Approved."), onError: fail },
                    )
                  }
                >
                  Approve
                </button>
              ) : null}
              <button
                type="button"
                className="min-h-9 px-2 text-[12px] font-bold text-violet"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <ConfirmButton
                label="✕"
                ariaLabel={`Remove ${h.name}`}
                message={`Remove the ${h.name} holiday on ${longDate(h.date)}? Everyone's calendar and any comp-off rule for that day changes with it.`}
                confirmLabel="Yes, remove it"
                pending={remove.isPending}
                onConfirm={() => remove.mutate(h.id, { onError: fail })}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-soft"
              />
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}

/** Suggestions for a year, from the organisation's country and region. HR proposes the ones it wants. */
function Suggestions({ orgId, existing }: { orgId: string | null; existing: CalendarHoliday[] }) {
  const suggest = useHolidaySuggestions();
  const add = useAddCalendarHolidays(orgId);
  const thisYear = Number(todayIso().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const have = useMemo(() => new Set(existing.map((h) => h.date)), [existing]);
  const items = (suggest.data?.items ?? []).filter((h) => !have.has(h.date));
  const key = (h: HolidaySuggestion) => `${h.date}|${h.name}`;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="ce-label">Suggested holidays</h3>
      <p className="text-[12px] text-soft">
        Suggestions are only proposals. Pick the ones you want, then approve them in the list above.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label>
          <span className="ce-label">Year</span>
          <select
            className="ce-input"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[thisYear, thisYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn3d btn3d-ghost"
          disabled={suggest.isPending}
          onClick={() => {
            setPicked(new Set());
            suggest.mutate(year, {
              onError: (e) => toast.error((e as Error).message || "Couldn't load suggestions."),
            });
          }}
        >
          {suggest.isPending ? "Looking…" : "Suggest holidays"}
        </button>
      </div>

      {suggest.data ? (
        <div className="mt-3 space-y-2">
          <p className="text-[12px] text-soft">
            {suggest.data.country}
            {suggest.data.region ? ` / ${suggest.data.region}` : ""} ·{" "}
            {suggest.data.notes.join(" ")}
          </p>
          {items.length === 0 ? (
            <p className="text-sm text-soft">Nothing new to suggest for {suggest.data.year}.</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((h) => (
                <li key={key(h)}>
                  <label className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-white px-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={picked.has(key(h))}
                      onChange={(e) =>
                        setPicked((p) => {
                          const next = new Set(p);
                          if (e.target.checked) next.add(key(h));
                          else next.delete(key(h));
                          return next;
                        })
                      }
                    />
                    <span className="flex-1 text-sm text-ink">
                      <b>{h.name}</b> · {longDate(h.date)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${KIND_TONE[h.kind]}`}
                    >
                      {KIND_LABEL[h.kind]}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 ? (
            <button
              type="button"
              className="btn3d"
              disabled={picked.size === 0 || add.isPending}
              onClick={() =>
                add.mutate(
                  items
                    .filter((h) => picked.has(key(h)))
                    .map((h) => ({
                      date: h.date,
                      name: h.name,
                      kind: h.kind,
                      region: h.region,
                      status: "proposed" as const,
                      source: "suggested" as const,
                    })),
                  {
                    onSuccess: () => {
                      toast.success("Proposed. Approve them in the list when you are ready.");
                      setPicked(new Set());
                    },
                    onError: (e) => toast.error((e as Error).message || "That didn't save."),
                  },
                )
              }
            >
              Propose {picked.size || ""} selected
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Where the organisation is, so suggestions fit it. */
function Region() {
  const { data: settings } = useOrgSettings();
  const save = useSaveOrgSettings();
  const [country, setCountry] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const shownCountry = country ?? settings?.holiday_country ?? "IN";
  const shownRegion = region ?? settings?.holiday_region ?? "";

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
      <label>
        <span className="ce-label">Country code</span>
        <input
          className="ce-input w-24"
          maxLength={2}
          value={shownCountry}
          onChange={(e) => setCountry(e.target.value.toUpperCase())}
        />
      </label>
      <label>
        <span className="ce-label">State or region code</span>
        <input
          className="ce-input w-32"
          placeholder="MH"
          maxLength={6}
          value={shownRegion}
          onChange={(e) => setRegion(e.target.value.toUpperCase())}
        />
      </label>
      <button
        type="button"
        className="btn3d btn3d-ghost"
        disabled={save.isPending || shownCountry.length !== 2}
        onClick={() =>
          save.mutate(
            { holiday_country: shownCountry, holiday_region: shownRegion.trim() },
            {
              onSuccess: () => toast.success("Saved."),
              onError: (e) => toast.error((e as Error).message || "That didn't save."),
            },
          )
        }
      >
        Save location
      </button>
    </div>
  );
}

export function HolidaysCard({ orgId, canManage }: { orgId: string | null; canManage: boolean }) {
  const { data: holidays } = useHolidayCalendar();
  const add = useAddCalendarHolidays(orgId);
  const [date, setDate] = useState(todayIso());
  const [name, setName] = useState("");
  const [kind, setKind] = useState<HolidayKind>("company");

  const list = holidays ?? [];
  const proposed = list.filter((h) => h.status === "proposed").length;

  return (
    <div className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Holidays</h2>
      <p className="mt-1 text-[13px] text-soft">
        National, regional and company holidays are days off for everyone: they drive the sandwich
        rule, comp-offs, attendance and earned leave. Optional and restricted holidays are listed
        here without making anyone take the day off.
      </p>
      {canManage && proposed > 0 ? (
        <p className="mt-2 rounded-lg bg-goldL/25 px-3 py-2 text-[13px] font-bold text-goldD">
          {proposed} proposed holiday{proposed === 1 ? "" : "s"} waiting for approval.
        </p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {list.map((h) => (
          <HolidayRow key={h.id} h={h} canManage={canManage} />
        ))}
        {list.length === 0 ? <li className="text-sm text-soft">No holidays listed yet.</li> : null}
      </ul>

      {canManage ? (
        <>
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end">
            <div>
              <label className="ce-label" htmlFor="h-date">
                Date
              </label>
              <input
                id="h-date"
                type="date"
                className="ce-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="ce-label" htmlFor="h-name">
                Name
              </label>
              <input
                id="h-name"
                className="ce-input"
                placeholder="Holi"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="ce-label" htmlFor="h-kind">
                Type
              </label>
              <select
                id="h-kind"
                className="ce-input"
                value={kind}
                onChange={(e) => setKind(e.target.value as HolidayKind)}
              >
                {HOLIDAY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn3d-ghost btn3d"
              disabled={!name.trim() || add.isPending}
              onClick={() =>
                add.mutate([{ date, name: name.trim(), kind }], {
                  onSuccess: () => {
                    setName("");
                    toast.success("Holiday added.");
                  },
                  onError: (e) => toast.error((e as Error).message || "That didn't save."),
                })
              }
            >
              Add holiday
            </button>
          </div>
          <Suggestions orgId={orgId} existing={list} />
          <Region />
        </>
      ) : null}
    </div>
  );
}
