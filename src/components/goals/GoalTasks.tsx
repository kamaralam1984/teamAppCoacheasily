import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { useCreateTasks, useTasks } from "@/hooks/useTasks";
import { shortDay, type Task } from "@/lib/tasks";
import { statusOf } from "@/lib/taskWorkflow";

const SHOWN = 4;

/** The tasks that move this goal: how many are done, what is still open, and a way to add one from here. */
export function GoalTasks({
  goalId,
  profileId,
  orgId,
}: {
  goalId: string;
  profileId: string;
  orgId: string;
}) {
  const { data: tasks } = useTasks(profileId);
  const create = useCreateTasks(orgId, profileId);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [all, setAll] = useState(false);

  const linked = useMemo(
    () => (tasks ?? []).filter((t) => t.goal_id === goalId && t.owner_id === profileId),
    [tasks, goalId, profileId],
  );
  const open = linked.filter((t) => statusOf(t) !== "completed" && !t.done);
  const doneCount = linked.length - open.length;
  const shown = all ? open : open.slice(0, SHOWN);

  function add() {
    const text = title.trim();
    if (!text) return;
    create.mutate(
      [
        {
          title: text,
          due_date: due || null,
          slot: "Anytime",
          priority: "Normal",
          owner_id: profileId,
          goal_id: goalId,
        },
      ],
      {
        onSuccess: () => {
          setTitle("");
          setDue("");
          toast.success("Task added to this goal.");
        },
        onError: () => toast.error("That didn't save. Please try again."),
      },
    );
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="ce-label">Tasks for this goal</p>
        <span className="text-[12px] font-semibold text-soft">
          {linked.length === 0
            ? "none yet"
            : `${doneCount} of ${linked.length} done${open.length ? ` · ${open.length} still open` : ""}`}
        </span>
      </div>

      {linked.length > 0 ? (
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-cream"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={linked.length}
          aria-valuenow={doneCount}
          aria-label="Tasks done for this goal"
        >
          <div
            className="h-full rounded-full bg-emer transition-[width] duration-700"
            style={{ width: `${Math.round((doneCount / linked.length) * 100)}%` }}
          />
        </div>
      ) : null}

      {shown.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {shown.map((t: Task) => (
            <li key={t.id}>
              <Link
                to="/tasks"
                className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-cream"
              >
                <span className="min-w-0 truncate font-semibold text-ink">{t.title}</span>
                <span className="shrink-0 text-[12px] text-soft">
                  {t.due_date ? `due ${shortDay(t.due_date)}` : "no date"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {open.length > SHOWN ? (
        <button
          type="button"
          className="mt-1 min-h-9 text-[12px] font-bold text-goldD underline underline-offset-4"
          onClick={() => setAll((v) => !v)}
        >
          {all ? "Show fewer" : `Show all ${open.length}`}
        </button>
      ) : null}

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="ce-input h-11 min-w-[12rem] flex-1"
          aria-label="New task for this goal"
          placeholder="Add a task that moves this goal"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="date"
          className="ce-input h-11 w-[10.5rem]"
          aria-label="Due date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <button
          type="submit"
          className="btn3d btn3d-ghost"
          disabled={create.isPending || title.trim().length === 0}
        >
          Add
        </button>
      </form>
    </div>
  );
}
