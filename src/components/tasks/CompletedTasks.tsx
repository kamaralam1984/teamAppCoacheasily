import { useState } from "react";

import { TaskRow } from "@/components/tasks/TaskRow";
import { completedSummary, doneLine } from "@/lib/pendingTasks";
import { istToday, type Task } from "@/lib/tasks";

const SHOWN = 8;

/** What has been finished, always in view — not tucked behind a link. */
export function CompletedTasks({
  tasks,
  onToggle,
  onOpen,
  onDelete,
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const [all, setAll] = useState(false);
  const { done, thisWeek } = completedSummary(tasks, istToday());
  const items = all ? done : done.slice(0, SHOWN);

  return (
    <section className="ce-rise ce-card p-6" aria-label="Completed tasks">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="ce-label">Completed</p>
          <h2 className="mt-1 font-display text-2xl text-ink">
            {done.length} task{done.length === 1 ? "" : "s"} done
          </h2>
        </div>
        <span className="text-[13px] text-soft">{thisWeek} finished in the last 7 days</span>
      </div>

      {done.length === 0 ? (
        <p className="mt-3 text-sm text-soft">
          Nothing finished yet. Tick a task off and it will be kept here.
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {items.map((t) => (
            <div key={t.id}>
              <TaskRow task={t} onToggle={onToggle} onOpen={onOpen} onDelete={onDelete} />
              <p className="mt-1 pl-3 text-[12px] font-semibold text-emer">{doneLine(t)}</p>
            </div>
          ))}
        </div>
      )}

      {done.length > SHOWN ? (
        <button
          type="button"
          className="mt-3 min-h-11 text-[13px] font-bold text-goldD underline underline-offset-4"
          onClick={() => setAll((v) => !v)}
        >
          {all ? "Show fewer" : `Show all ${done.length}`}
        </button>
      ) : null}
    </section>
  );
}
