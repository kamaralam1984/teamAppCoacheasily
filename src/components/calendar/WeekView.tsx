import type { EditTarget } from "@/components/calendar/EventEditor";
import type { CalendarData } from "@/hooks/useCalendar";
import { MARKER_COLOUR, addDays, niceDate, timeLabel, weekdayName } from "@/lib/calendar";
import { buildDayView } from "@/lib/calendarDerive";
import type { Profile } from "@/lib/warriors";

interface Props {
  start: string;
  data: CalendarData | undefined;
  byId: Map<string, Profile>;
  today: string;
  selected: string;
  onSelectDay: (date: string) => void;
  onOpen: (target: EditTarget) => void;
  birthdayIds?: Set<string> | null;
}

export function WeekView({
  start,
  data,
  byId,
  today,
  selected,
  onSelectDay,
  onOpen,
  birthdayIds = null,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div className="grid gap-2 sm:grid-cols-7">
      {days.map((date) => {
        const view = buildDayView(data, date, byId, birthdayIds);
        return (
          <div
            key={date}
            className={`ce-card overflow-hidden ${
              date === selected ? "ring-2 ring-gold ring-inset" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectDay(date)}
              className={`w-full border-b border-line px-3 py-2 text-left ${
                date === today ? "bg-gold/15" : "bg-cream"
              }`}
            >
              <span className="block text-[10px] font-bold tracking-[0.08em] text-soft uppercase">
                {weekdayName(date).slice(0, 3)}
              </span>
              <span className="font-display text-lg text-ink">{niceDate(date)}</span>
            </button>

            <div className="space-y-1 p-2">
              {view.holiday ? (
                <p className="rounded border border-red/30 bg-red/10 px-2 py-1 text-[11px] font-bold text-red">
                  {view.holiday.name}
                </p>
              ) : null}

              {view.birthdays.map((b) => (
                <p
                  key={`b-${b.id}`}
                  className="rounded border border-gold/40 bg-gold/12 px-2 py-1 text-[11px] font-bold text-goldD"
                >
                  🎂 {b.full_name}
                </p>
              ))}

              {view.programs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpen({ kind: "program", row: p })}
                  className="flex w-full items-start gap-1.5 rounded border border-line bg-white px-2 py-1 text-left"
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${MARKER_COLOUR[p.type] ?? "bg-soft"}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold text-ink">{p.name}</span>
                    {p.from_time ? (
                      <span className="block text-[10px] text-soft">{timeLabel(p.from_time)}</span>
                    ) : null}
                  </span>
                </button>
              ))}

              {view.events.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpen({ kind: "event", row: e })}
                  className="flex w-full items-start gap-1.5 rounded border border-line bg-white px-2 py-1 text-left"
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${MARKER_COLOUR[e.type] ?? MARKER_COLOUR["Event"]}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold text-ink">{e.name}</span>
                    <span className="block text-[10px] text-soft">
                      {e.from_time ? timeLabel(e.from_time) : "All day"}
                    </span>
                  </span>
                </button>
              ))}

              {view.leave.length > 0 ? (
                <p className="text-[10px] text-soft">👤 {view.leave.length} away</p>
              ) : null}

              {!view.holiday && view.programs.length === 0 && view.events.length === 0 ? (
                <p className="text-[11px] text-soft">Clear</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
