import type { EditTarget } from "@/components/calendar/EventEditor";
import { CHIP_STYLE, dayTone, longDate, timeLabel, weekdayName } from "@/lib/calendar";
import { buildDayView, offLabel, viewerOffOn, type ShiftDays } from "@/lib/calendarDerive";
import type { CalendarData } from "@/hooks/useCalendar";
import { TYPE_LABEL } from "@/hooks/useLeave";
import type { Profile } from "@/lib/warriors";

interface Props {
  date: string;
  data: CalendarData | undefined;
  byId: Map<string, Profile>;
  canSchedule: boolean;
  onOpen?: ((target: EditTarget) => void) | undefined;
  birthdayIds?: Set<string> | null;
  /** The viewer's own weekly off. */
  viewerWeeklyOff?: string | null;
  /** The viewer's approved weekly off shifts. */
  shiftDays?: ShiftDays | null;
}

function Chip({ type }: { type: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-[0.06em] uppercase ${
        CHIP_STYLE[type] ?? CHIP_STYLE["Event"]
      }`}
    >
      {type}
    </span>
  );
}

export function DayDetail({
  date,
  data,
  byId,
  canSchedule,
  onOpen,
  birthdayIds = null,
  viewerWeeklyOff = null,
  shiftDays = null,
}: Props) {
  const view = buildDayView(data, date, byId, birthdayIds);
  const offKind = viewerOffOn(viewerWeeklyOff, shiftDays, date);
  const off = offKind !== null;
  const tone = dayTone({
    holiday: Boolean(view.holiday),
    flexi: view.flexi.length > 0,
    birthday: view.birthdays.length > 0,
    off,
  });
  /** What kind of day it is, in the same words and colours as the calendar blocks. */
  const labels = [
    ...(view.holiday ? [`${view.holiday.name} (Fixed Holiday)`] : []),
    ...view.flexi.map((f) => `${f.name} (Flexi Holiday)`),
    ...view.birthdays.map((b) => `🎂 ${b.full_name} (Happy Birthday)`),
    ...(off ? [offLabel(offKind)] : []),
  ];

  const nothing =
    !view.holiday &&
    view.flexi.length === 0 &&
    view.programs.length === 0 &&
    view.events.length === 0 &&
    view.leave.length === 0 &&
    view.birthdays.length === 0;

  return (
    <div className="ce-card p-5">
      <div className={tone.bg ? `-mx-2 -mt-2 rounded-[12px] px-3 py-2.5 ${tone.bg}` : ""}>
        <p
          className={`text-[11px] font-bold tracking-[0.1em] uppercase ${tone.dark ? "" : "text-soft"}`}
        >
          {weekdayName(date)}
        </p>
        <h2 className={`font-display text-2xl ${tone.dark ? "" : "text-ink"}`}>{longDate(date)}</h2>
        {labels.map((l) => (
          <p
            key={l}
            className={`mt-0.5 text-[13px] font-bold ${
              l.startsWith("🎂") ? "text-yellow" : tone.dark ? "" : "text-ink/70"
            }`}
          >
            {l}
          </p>
        ))}
      </div>

      {view.conflicts.map((c) => (
        <p
          key={c}
          className="mt-3 rounded-lg border border-red/30 bg-red/10 p-3 text-[13px] leading-relaxed font-semibold text-red"
        >
          {c}
        </p>
      ))}

      {view.compOff.map((c) => (
        <p
          key={c}
          className="mt-3 rounded-lg border border-gold/40 bg-cream p-3 text-[13px] leading-relaxed font-semibold text-goldD"
        >
          {c}
        </p>
      ))}

      {view.birthdays.map((b) => (
        <p
          key={`bday-${b.id}`}
          className="mt-3 rounded-lg bg-bday p-3 text-[13px] leading-relaxed font-bold text-yellow"
        >
          🎂 It's {b.full_name}'s birthday{b.title ? ` — ${b.title}` : ""}. Say something warm.
        </p>
      ))}

      {view.holiday ? (
        <div className="mt-4 flex items-center gap-2">
          <Chip type="Holiday" />
          <span className="text-sm font-bold text-ink">{view.holiday.name}</span>
        </div>
      ) : null}

      {view.flexi.map((f) => (
        <div key={f.id} className="mt-4 flex flex-wrap items-center gap-2">
          <Chip type="Flexi" />
          <span className="text-sm font-bold text-ink">{f.name}</span>
          <span className="text-[12px] text-soft">
            Pick it as a flexi day off — apply from Leave.
          </span>
        </div>
      ))}

      {view.programs.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {view.programs.map((p) => {
            const host = p.host_id ? byId.get(p.host_id) : undefined;
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-start gap-2 rounded-lg border border-line bg-white p-3"
              >
                <Chip type={p.type} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">
                    {p.name}
                    {p.session_no ? ` · Session ${p.session_no}` : ""}
                  </p>
                  <p className="text-[12px] text-soft">
                    {host ? `Hosted by ${host.full_name}` : "Host not set"}
                    {p.location ? ` · ${p.location}` : ""}
                    {p.language ? ` · ${p.language}` : ""}
                  </p>
                </div>
                {onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen({ kind: "program", row: p })}
                    className="min-h-9 rounded-lg border border-line px-3 text-[12px] font-bold text-ink"
                  >
                    {canSchedule ? "Open" : "Details"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {view.events.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {view.events.map((e) => {
            const creator = e.created_by ? byId.get(e.created_by) : undefined;
            const time = timeLabel(e.from_time);
            return (
              <li
                key={e.id}
                className="flex flex-wrap items-start gap-2 rounded-lg border border-line bg-white p-3"
              >
                <Chip type="Event" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">
                    {e.name} <span className="font-normal text-soft">· {e.type}</span>
                  </p>
                  <p className="text-[12px] text-soft">
                    {time ? `${time}${e.to_time ? ` – ${timeLabel(e.to_time)}` : ""}` : "All day"}
                    {e.location ? ` · ${e.location}` : ""}
                    {creator ? ` · added by ${creator.full_name}` : ""}
                  </p>
                </div>
                {onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen({ kind: "event", row: e })}
                    className="min-h-9 rounded-lg border border-line px-3 text-[12px] font-bold text-ink"
                  >
                    {canSchedule ? "Open" : "Details"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {view.leave.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="ce-label">On approved leave</p>
          <ul className="flex flex-wrap gap-2">
            {view.leave.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-2 rounded-full border border-line bg-cream px-3 py-1 text-[12px] text-ink"
              >
                <span className="font-bold">{l.full_name}</span>
                <span className="text-soft">{TYPE_LABEL[l.type] ?? l.type}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {nothing ? (
        <p className="mt-4 text-sm text-soft">
          No sessions today — a clear day to move your goals forward.
        </p>
      ) : null}
    </div>
  );
}
