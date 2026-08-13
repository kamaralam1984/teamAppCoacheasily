import { useEffect, useState, type CSSProperties } from "react";

import { istToday, shortDay, weekCompletion, type Task } from "@/lib/tasks";
import type { Reflection } from "@/hooks/useTasks";

export interface WeekCardProps {
  tasks: Task[];
  reflections: Reflection[];
  saving?: boolean;
  onSave: (note: string) => void;
  style?: CSSProperties;
}

export function WeekCard({ tasks, reflections, saving, onSave, style }: WeekCardProps) {
  const today = istToday();
  const { closed, total, pct } = weekCompletion(tasks, today);
  const todays = reflections.find((r) => r.date === today);
  const [note, setNote] = useState(todays?.note ?? "");

  useEffect(() => {
    if (todays?.note) setNote(todays.note);
  }, [todays?.note]);

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">This week</h2>
        <span className="text-[13px] text-soft">
          {closed} of {total} closed
        </span>
      </div>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-cream">
        <div
          className="h-full rounded-full bg-emer transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-[13px] text-soft">{pct}% of the last seven days finished.</p>

      <div className="mt-6 border-t border-line pt-5">
        <label htmlFor="wk-reflect" className="ce-label">
          One honest line about today
        </label>
        <textarea
          id="wk-reflect"
          className="ce-input min-h-20"
          value={note}
          placeholder="Slow start, but the refund queue is finally clear."
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          className="btn3d mt-3 w-full sm:w-auto"
          disabled={saving || !note.trim()}
          onClick={() => onSave(note)}
        >
          {saving ? "Saving…" : todays ? "Update today's line" : "Save today's line"}
        </button>
      </div>

      {reflections.length > 0 ? (
        <ul className="mt-5 space-y-3 border-t border-line pt-4">
          {reflections.map((r) => (
            <li key={r.id}>
              <p className="text-[11px] font-bold tracking-wider text-goldD uppercase">
                {shortDay(r.date)}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-soft">{r.note}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
