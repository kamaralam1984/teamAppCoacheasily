import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";

import { PRIORITY_TONE, SLOT_ICON, istToday, shortDay, type Task } from "@/lib/tasks";

export function MyTasksCard({
  tasks,
  meId,
  style,
}: {
  tasks: Task[] | undefined;
  meId: string | null;
  style?: CSSProperties;
}) {
  const today = istToday();
  const mine = (tasks ?? []).filter((t) => !t.done && t.owner_id === meId);
  const overdue = mine.filter((t) => t.due_date && t.due_date < today);
  const dueToday = mine.filter((t) => t.due_date === today);
  const next = [...mine]
    .sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31"))
    .slice(0, 4);

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">My tasks</h2>
        <Link to="/tasks" className="text-[13px] font-bold text-saffBtn hover:underline">
          All tasks →
        </Link>
      </div>

      <p className="mt-1 text-[13px] font-semibold">
        {overdue.length > 0 ? (
          <span className="text-red">
            {overdue.length} overdue · {dueToday.length} due today
          </span>
        ) : (
          <span className="text-emer">Nothing overdue. You're on top of it.</span>
        )}
      </p>

      {next.length === 0 ? (
        <p className="mt-4 rounded-[14px] bg-cream px-4 py-4 text-[13px] leading-relaxed text-soft">
          Nothing on the list. Write down the one thing that would make today count.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {next.map((t) => {
            const late = Boolean(t.due_date && t.due_date < today);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-soft/50" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                  {t.title}
                </span>
                {t.slot && t.slot !== "Anytime" ? (
                  <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-soft">
                    {SLOT_ICON[t.slot]} {t.slot}
                  </span>
                ) : null}
                {t.due_date ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      late ? "bg-red/12 text-red" : "bg-cream text-soft"
                    }`}
                  >
                    {shortDay(t.due_date)}
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    PRIORITY_TONE[t.priority] ?? "bg-cream text-soft"
                  }`}
                >
                  {t.priority}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
