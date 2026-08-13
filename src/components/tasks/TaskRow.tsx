import { Trash2 } from "lucide-react";

import {
  PRIORITY_TONE,
  SLOT_ICON,
  shortDay,
  type Task,
} from "@/lib/tasks";

export interface TaskRowProps {
  task: Task;
  ownerName?: string | null;
  fromName?: string | null;
  blockerTitle?: string | null;
  blockerLate?: boolean;
  onToggle: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

export function TaskRow({
  task,
  ownerName,
  fromName,
  blockerTitle,
  blockerLate,
  onToggle,
  onDelete,
}: TaskRowProps) {
  return (
    <div className="flex gap-3 rounded-[12px] border border-line bg-ivory p-3.5">
      <button
        type="button"
        aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onClick={() => onToggle(task)}
        className={
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors " +
          (task.done ? "border-emer bg-emer text-white" : "border-line bg-white hover:border-gold")
        }
      >
        {task.done ? <span aria-hidden>✓</span> : null}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={
            "text-[15px] leading-snug font-semibold " +
            (task.done ? "text-soft line-through" : "text-ink")
          }
        >
          {task.title}
          {fromName ? <span className="font-normal text-soft"> · from {fromName}</span> : null}
          {ownerName ? <span className="font-normal text-soft"> · for {ownerName}</span> : null}
        </p>

        {task.description ? (
          <p className="mt-1 text-[13px] leading-relaxed text-soft">{task.description}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.due_date ? (
            <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-soft">
              {shortDay(task.due_date)}
            </span>
          ) : null}
          {task.slot !== "Anytime" ? (
            <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-soft">
              {SLOT_ICON[task.slot]} {task.slot}
            </span>
          ) : null}
          {task.priority !== "Normal" ? (
            <span
              className={
                "rounded-full px-2 py-0.5 text-[11px] font-bold " + PRIORITY_TONE[task.priority]
              }
            >
              {task.priority}
            </span>
          ) : null}
          {blockerTitle ? (
            <span
              className={
                "rounded-full px-2 py-0.5 text-[11px] font-bold " +
                (blockerLate ? "bg-red/12 text-red" : "bg-violet/12 text-violet")
              }
            >
              Waiting on “{blockerTitle}”
            </span>
          ) : null}
        </div>
      </div>

      {onDelete ? (
        <button
          type="button"
          aria-label={`Remove ${task.title}`}
          onClick={() => onDelete(task)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-soft hover:bg-cream hover:text-red"
        >
          <Trash2 size={16} />
        </button>
      ) : null}
    </div>
  );
}
