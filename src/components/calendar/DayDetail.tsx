import type { EditTarget } from "@/components/calendar/EventEditor";
import { CHIP_STYLE, longDate, timeLabel, weekdayName } from "@/lib/calendar";
import { buildDayView } from "@/lib/calendarDerive";
import type { CalendarData } from "@/hooks/useCalendar";
import { TYPE_LABEL } from "@/hooks/useLeave";
import type { Profile } from "@/lib/warriors";

interface Props {
  date: string;
  data: CalendarData | undefined;
  byId: Map<string, Profile>;
  canSchedule: boolean;
  onOpen?: ((target: EditTarget) => void) | undefined;
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

export function DayDetail({ date, data, byId, canSchedule, onOpen }: Props) {
  const view = buildDayView(data, date, byId);

  const nothing =
    !view.holiday && view.programs.length === 0 && view.events.length === 0 && view.leave.length === 0;

  return (
    <div className="ce-card p-5">
      <p className="text-[11px] font-bold tracking-[0.1em] text-soft uppercase">
        {weekdayName(date)}
      </p>
      <h2 className="font-display text-2xl text-ink">{longDate(date)}</h2>

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

      {view.holiday ? (
        <div className="mt-4 flex items-center gap-2">
          <Chip type="Holiday" />
          <span className="text-sm font-bold text-ink">{view.holiday.name}</span>
        </div>
      ) : null}

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
