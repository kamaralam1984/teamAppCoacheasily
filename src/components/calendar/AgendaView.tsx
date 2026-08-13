import type { CalendarData } from "@/hooks/useCalendar";
import type { EditTarget } from "@/components/calendar/EventEditor";
import { CHIP_STYLE, MARKER_COLOUR, addDays, daysBetween, longDate, niceDate, timeLabel, weekdayName } from "@/lib/calendar";
import { buildDayView } from "@/lib/calendarDerive";
import type { Profile } from "@/lib/warriors";

interface Props {
  data: CalendarData | undefined;
  byId: Map<string, Profile>;
  from: string;
  to: string;
  today: string;
  onOpen: (target: EditTarget) => void;
  onSelectDay: (date: string) => void;
}

/** A phone-first list: every day that has something, in date order. */
export function AgendaView({ data, byId, from, to, today, onOpen, onSelectDay }: Props) {
  const days: string[] = [];
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) days.push(d);

  const rows = days
    .map((date) => ({ date, view: buildDayView(data, date, byId) }))
    .filter(
      ({ view }) =>
        view.holiday || view.programs.length > 0 || view.events.length > 0 || view.leave.length > 0,
    );

  if (rows.length === 0) {
    return (
      <div className="ce-card p-6 text-center">
        <p className="font-display text-xl text-ink">Nothing on the books here</p>
        <p className="mt-1 text-sm text-soft">
          A clear stretch — good time to move your goals forward.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map(({ date, view }) => (
        <div key={date} className="ce-card overflow-hidden">
          <button
            type="button"
            onClick={() => onSelectDay(date)}
            className={`flex w-full items-baseline gap-2 border-b border-line px-4 py-2.5 text-left ${
              date === today ? "bg-gold/15" : "bg-cream"
            }`}
          >
            <span className="font-display text-lg text-ink">{niceDate(date)}</span>
            <span className="text-[11px] font-bold tracking-[0.08em] text-soft uppercase">
              {weekdayName(date).slice(0, 3)}
            </span>
            {date === today ? (
              <span className="ml-auto rounded-full bg-night px-2.5 py-0.5 text-[10px] font-bold text-goldL">
                TODAY
              </span>
            ) : null}
          </button>

          <ul className="divide-y divide-line">
            {view.holiday ? (
              <li className="flex items-center gap-2 px-4 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${MARKER_COLOUR["Holiday"]}`} />
                <span className="text-sm font-bold text-ink">{view.holiday.name}</span>
                <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${CHIP_STYLE["Holiday"]}`}>
                  Holiday
                </span>
              </li>
            ) : null}

            {view.programs.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen({ kind: "program", row: p })}
                  className="flex w-full items-start gap-2 px-4 py-3 text-left"
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${MARKER_COLOUR[p.type] ?? "bg-soft"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">
                      {p.name}
                      {p.session_no ? ` · Session ${p.session_no}` : ""}
                    </span>
                    <span className="block text-[12px] text-soft">
                      {p.from_time ? `${timeLabel(p.from_time)}${p.to_time ? `–${timeLabel(p.to_time)}` : ""} · ` : ""}
                      {p.host_id ? (byId.get(p.host_id)?.full_name ?? "Host not set") : "Host not set"}
                      {p.location ? ` · ${p.location}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${CHIP_STYLE[p.type] ?? CHIP_STYLE["Event"]}`}>
                    {p.type}
                  </span>
                </button>
              </li>
            ))}

            {view.events.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpen({ kind: "event", row: e })}
                  className="flex w-full items-start gap-2 px-4 py-3 text-left"
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${MARKER_COLOUR[e.type] ?? MARKER_COLOUR["Event"]}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{e.name}</span>
                    <span className="block text-[12px] text-soft">
                      {e.from_time
                        ? `${timeLabel(e.from_time)}${e.to_time ? `–${timeLabel(e.to_time)}` : ""}`
                        : "All day"}
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${CHIP_STYLE[e.type] ?? CHIP_STYLE["Event"]}`}>
                    {e.type}
                  </span>
                </button>
              </li>
            ))}

            {view.leave.length > 0 ? (
              <li className="px-4 py-2.5 text-[12px] text-soft">
                Away: {view.leave.map((l) => l.full_name).join(", ")}
              </li>
            ) : null}
          </ul>

          {view.conflicts.length > 0 ? (
            <p className="border-t border-red/30 bg-red/10 px-4 py-2 text-[12px] font-semibold text-red">
              {view.conflicts[0]}
            </p>
          ) : null}
          <span className="sr-only">{longDate(date)}</span>
        </div>
      ))}
    </div>
  );
}
