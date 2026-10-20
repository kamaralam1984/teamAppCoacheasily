import { useState } from "react";

import { whatsLeft, type PendingTone, type WhatsLeft as Left } from "@/lib/pendingTasks";
import type { Task } from "@/lib/tasks";

const TONE: Record<PendingTone, string> = {
  late: "bg-red/12 text-red",
  today: "bg-saff/15 text-saffBtn",
  wait: "bg-violet/12 text-violet",
  idle: "bg-cream text-soft",
};

const SHOWN = 6;

function Chip({ n, label, tone }: { n: number; label: string; tone: PendingTone }) {
  if (n === 0) return null;
  return (
    <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${TONE[tone]}`}>
      {n} {label}
    </span>
  );
}

/** Everything still open, and for each one what is missing — so nobody has to work it out. */
export function WhatsLeft({
  tasks,
  byId,
  today,
  onOpen,
}: {
  tasks: Task[];
  byId: Map<string, Task>;
  today: string;
  onOpen: (task: Task) => void;
}) {
  const [all, setAll] = useState(false);
  const left: Left = whatsLeft(tasks, byId, today);
  if (left.total === 0) return null;
  const items = all ? left.items : left.items.slice(0, SHOWN);

  return (
    <section className="ce-rise ce-card p-6" aria-label="What is left">
      <p className="ce-label">What is left</p>
      <h2 className="mt-1 font-display text-2xl text-ink">
        {left.total} task{left.total === 1 ? "" : "s"} not finished yet
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip n={left.overdue} label="overdue" tone="late" />
        <Chip n={left.dueToday} label="due today" tone="today" />
        <Chip n={left.notStarted} label="not started" tone="idle" />
        <Chip n={left.inProgress} label="in progress" tone="idle" />
        <Chip n={left.inReview} label="waiting for review" tone="wait" />
        <Chip n={left.blocked} label="waiting on another task" tone="wait" />
        <Chip n={left.noDate} label="with no date" tone="idle" />
      </div>

      <ul className="mt-4 space-y-2">
        {items.map(({ task, reason, tone }) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onOpen(task)}
              className="flex min-h-12 w-full items-start gap-3 rounded-xl border border-line bg-ivory px-3 py-2.5 text-left hover:border-gold"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  tone === "late"
                    ? "bg-red"
                    : tone === "today"
                      ? "bg-saff"
                      : tone === "wait"
                        ? "bg-violet"
                        : "bg-soft/50"
                }`}
              />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-ink">
                  {task.title}
                </span>
                <span className="block text-[12px] text-soft">{reason}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {left.items.length > SHOWN ? (
        <button
          type="button"
          className="mt-3 min-h-11 text-[13px] font-bold text-goldD underline underline-offset-4"
          onClick={() => setAll((v) => !v)}
        >
          {all ? "Show fewer" : `Show all ${left.items.length}`}
        </button>
      ) : null}
      <p className="mt-3 text-[12px] text-soft">
        At 6 pm you also get a reminder for anything overdue or due today.
      </p>
    </section>
  );
}
