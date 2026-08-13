import type { CSSProperties } from "react";

import { istToday, type Task } from "@/lib/tasks";

/** Three things. Not thirty. The day is won on purpose. */
export function WinTheDay({
  tasks,
  meId,
  onToggle,
  style,
}: {
  tasks: Task[] | undefined;
  meId: string | null;
  onToggle: (task: Task) => void;
  style?: CSSProperties;
}) {
  const today = istToday();
  const mine = (tasks ?? []).filter(
    (t) => t.owner_id === meId && t.due_date && t.due_date <= today,
  );
  const top = [...mine]
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.due_date ?? "").localeCompare(b.due_date ?? "");
    })
    .slice(0, 3);
  const doneCount = top.filter((t) => t.done).length;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Win the day</h2>
        {top.length > 0 ? (
          <span className="text-[13px] text-soft">
            {doneCount} of {top.length}
          </span>
        ) : null}
      </div>

      {top.length === 0 ? (
        <p className="mt-4 rounded-[14px] bg-cream px-4 py-4 text-[13px] leading-relaxed text-soft">
          Nothing due today. Pick one task on the Tasks tab and give it a date — that is how a day
          gets won.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {top.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onToggle(t)}
                className="flex w-full items-start gap-3 rounded-[12px] border border-line bg-ivory p-3 text-left"
              >
                <span
                  aria-hidden
                  className={
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 " +
                    (t.done ? "border-emer bg-emer text-white" : "border-line bg-white")
                  }
                >
                  {t.done ? "✓" : ""}
                </span>
                <span
                  className={
                    "text-[14px] leading-snug font-semibold " +
                    (t.done ? "text-soft line-through" : "text-ink")
                  }
                >
                  {t.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
