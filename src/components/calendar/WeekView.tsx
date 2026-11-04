import type { EditTarget } from "@/components/calendar/EventEditor";
import type { CalendarData } from "@/hooks/useCalendar";
import { MARKER_COLOUR, addDays, dayTone, niceDate, timeLabel, weekdayName } from "@/lib/calendar";
import { buildDayView } from "@/lib/calendarDerive";
import { isOffOn, type Profile } from "@/lib/warriors";

interface Props {
  start: string;
  data: CalendarData | undefined;
  byId: Map<string, Profile>;
  today: string;
  /** The viewer's own weekly off, tinted grey. */
  viewerWeeklyOff?: string | null;
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
  viewerWeeklyOff = null,
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
        const isOff = isOffOn(viewerWeeklyOff, weekdayName(date));
        const tone = dayTone({
          holiday: Boolean(view.holiday),
          flexi: view.flexi.length > 0,
          birthday: view.birthdays.length > 0,
          off: isOff,
        });
        const tint = tone.bg;
        /** On a dark card every line takes the card's text colour instead of its own. */
        const ink = (light: string) => (tone.dark ? "" : light);
        const chip = (light: string) =>
          `rounded border px-2 py-1 text-[11px] font-bold ${tone.dark ? "border-current/40" : light}`;
        return (
          <div
            key={date}
            className={`ce-card overflow-hidden ${tint} ${
              date === selected ? "ring-2 ring-gold ring-inset" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectDay(date)}
              className={`w-full border-b border-line px-3 py-2 text-left ${
                date === today && !tone.dark ? "bg-gold/15" : tint ? "" : "bg-cream"
              }`}
            >
              <span className={`block text-[10px] font-bold tracking-[0.08em] uppercase ${ink("text-soft")}`}>
                {weekdayName(date).slice(0, 3)}
              </span>
              <span className={`font-display text-lg ${ink("text-ink")}`}>
                {niceDate(date)}
                {date === today && tone.dark ? (
                  <span className="ml-1.5 text-[10px] uppercase">· Today</span>
                ) : null}
              </span>
            </button>

            <div className="space-y-1 p-2">
              {view.holiday ? (
                <p className={chip("border-red/30 bg-red/10 text-red")}>
                  {view.holiday.name} <span className="font-semibold">(Fixed Holiday)</span>
                </p>
              ) : null}

              {view.flexi.map((f) => (
                <p
                  key={f.id}
                  className={chip("border-flexi/30 bg-flexi/10 text-flexi")}
                >
                  {f.name} <span className="font-semibold">(Flexi Holiday)</span>
                </p>
              ))}

              {isOff ? (
                <p className={chip("border-grey/40 bg-grey/15 text-ink/70")}>
                  (Weekly Off)
                </p>
              ) : null}

              {view.birthdays.map((b) => (
                <p
                  key={`b-${b.id}`}
                  className={`${chip("border-gold/40 bg-gold/12 text-goldD")} ${tone.dark ? "text-yellow" : ""}`}
                >
                  🎂 {b.full_name} <span className="font-semibold">(Happy Birthday)</span>
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
                <p className={`text-[10px] ${ink("text-soft")}`}>👤 {view.leave.length} away</p>
              ) : null}

              {!view.holiday &&
              !isOff &&
              view.flexi.length === 0 &&
              view.programs.length === 0 &&
              view.events.length === 0 ? (
                <p className={`text-[11px] ${ink("text-soft")}`}>Clear</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
