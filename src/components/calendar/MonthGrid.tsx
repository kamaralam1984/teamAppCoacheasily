import type { EditTarget } from "@/components/calendar/EventEditor";
import type { CalendarData } from "@/hooks/useCalendar";
import { MARKER_COLOUR, WEEKDAYS, monthGrid, parseIso, weekdayName } from "@/lib/calendar";
import { buildDayView } from "@/lib/calendarDerive";
import type { Profile } from "@/lib/warriors";

interface Props {
  year: number;
  month: number;
  data: CalendarData | undefined;
  byId: Map<string, Profile>;
  today: string;
  viewerWeeklyOff: string | null;
  selected: string;
  onSelect: (date: string) => void;
  onOpen?: (target: EditTarget) => void;
  /** Desktop drag-to-move. Undefined means the viewer may not move things. */
  onMove?: (target: EditTarget, toDate: string) => void;
}

export function MonthGrid({
  year,
  month,
  data,
  byId,
  today,
  viewerWeeklyOff,
  selected,
  onSelect,
  onOpen,
  onMove,
}: Props) {
  const cells = monthGrid(year, month);

  const pick = (kind: "event" | "program", id: string): EditTarget | null => {
    if (kind === "event") {
      const row = data?.events.find((e) => e.id === id);
      return row ? { kind: "event", row } : null;
    }
    const row = data?.programs.find((p) => p.id === id);
    return row ? { kind: "program", row } : null;
  };

  return (
    <div className="ce-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-cream">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-2 text-center text-[10px] font-bold tracking-[0.08em] text-soft uppercase"
          >
            {w.slice(0, 3)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const view = buildDayView(data, cell.date, byId);
          const items = [
            ...view.programs.map((p) => ({ key: p.id, kind: "program" as const, type: p.type, label: p.name })),
            ...view.events.map((e) => ({ key: e.id, kind: "event" as const, type: e.type, label: e.name })),
          ];
          const isToday = cell.date === today;
          const isOff = viewerWeeklyOff && weekdayName(cell.date) === viewerWeeklyOff;
          const isSelected = cell.date === selected;

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelect(cell.date)}
              onDragOver={(e) => {
                if (onMove) e.preventDefault();
              }}
              onDrop={(e) => {
                if (!onMove) return;
                e.preventDefault();
                const raw = e.dataTransfer.getData("text/plain");
                const [kind, id] = raw.split(":");
                if (kind !== "event" && kind !== "program") return;
                const target = pick(kind, id ?? "");
                if (target) onMove(target, cell.date);
              }}
              aria-label={`${cell.date}${view.holiday ? ` · ${view.holiday.name}` : ""}`}
              aria-pressed={isSelected}
              className={[
                "min-h-[72px] border-r border-b border-line p-1.5 text-left align-top transition-colors last:border-r-0",
                isToday ? "bg-gold/15" : isOff ? "bg-cream" : "bg-ivory",
                cell.inMonth ? "" : "opacity-40",
                isSelected ? "ring-2 ring-gold ring-inset" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex h-6 min-w-6 items-center justify-center rounded-full text-[12px] font-bold",
                  isToday ? "bg-night text-goldL" : "text-ink",
                ].join(" ")}
              >
                {parseIso(cell.date).d}
              </span>

              {view.holiday ? (
                <span className="mt-0.5 block truncate text-[10px] leading-tight font-bold text-red">
                  {view.holiday.name}
                </span>
              ) : null}

              <span className="mt-0.5 block space-y-0.5">
                {items.slice(0, 2).map((it) => (
                  <span
                    key={it.key}
                    draggable={Boolean(onMove)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", `${it.kind}:${it.key}`);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={(e) => {
                      if (!onOpen) return;
                      e.stopPropagation();
                      const target = pick(it.kind, it.key);
                      if (target) onOpen(target);
                    }}
                    className="flex items-center gap-1"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${MARKER_COLOUR[it.type] ?? "bg-soft"}`}
                    />
                    <span className="truncate text-[10px] leading-tight text-ink">{it.label}</span>
                  </span>
                ))}
                {items.length > 2 ? (
                  <span className="block text-[10px] font-bold text-soft">
                    +{items.length - 2} more
                  </span>
                ) : null}
              </span>

              {view.leave.length > 0 ? (
                <span className="mt-0.5 block text-[10px] text-soft">
                  👤 {view.leave.length} away
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
