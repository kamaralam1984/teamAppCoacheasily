import { toast } from "sonner";
import { useState } from "react";

import { PRIORITIES, SLOTS, type Priority, type Slot, type Task } from "@/lib/tasks";
import type { Profile } from "@/lib/warriors";
import type { TaskInput } from "@/hooks/useTasks";

export interface QuickAddProps {
  meId: string;
  line: Profile[];
  openTasks: Task[];
  goals?: { id: string; name: string }[];
  pending?: boolean;
  onAdd: (input: TaskInput) => void;
}

export function QuickAdd({ meId, line, openTasks, goals = [], pending, onAdd }: QuickAddProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [slot, setSlot] = useState<Slot>("Anytime");
  const [priority, setPriority] = useState<Priority>("Normal");
  const [owner, setOwner] = useState(meId);
  const [blockedBy, setBlockedBy] = useState("");
  const [goalId, setGoalId] = useState("");

  const submit = () => {
    if (!title.trim()) {
      toast.error("Type what the task is first.");
      return;
    }
    onAdd({
      title,
      description,
      due_date: due || null,
      slot,
      priority,
      owner_id: owner || meId,
      blocked_by: blockedBy || null,
      goal_id: goalId || null,
    });
    setTitle("");
    setDescription("");
    setDue("");
    setSlot("Anytime");
    setPriority("Normal");
    setBlockedBy("");
    setGoalId("");
    setOwner(meId);
    setOpen(false);
  };

  return (
    <section className="ce-card p-5">
      <div className="flex gap-2">
        <input
          className="ce-input flex-1"
          placeholder="Add a task…"
          value={title}
          onFocus={() => setOpen(true)}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button type="button" className="btn3d shrink-0" disabled={pending} onClick={submit}>
          Add
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <textarea
            className="ce-input min-h-20"
            placeholder="Details (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="qa-due" className="ce-label">
                Due
              </label>
              <input
                id="qa-due"
                type="date"
                className="ce-input"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="qa-slot" className="ce-label">
                When
              </label>
              <select
                id="qa-slot"
                className="ce-input"
                value={slot}
                onChange={(e) => setSlot(e.target.value as Slot)}
              >
                {SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qa-pri" className="ce-label">
                Priority
              </label>
              <select
                id="qa-pri"
                className="ce-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {line.length > 0 ? (
              <div>
                <label htmlFor="qa-owner" className="ce-label">
                  For
                </label>
                <select
                  id="qa-owner"
                  className="ce-input"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  <option value={meId}>Me</option>
                  {line.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label htmlFor="qa-block" className="ce-label">
                Blocked by (optional)
              </label>
              <select
                id="qa-block"
                className="ce-input"
                value={blockedBy}
                onChange={(e) => setBlockedBy(e.target.value)}
              >
                <option value="">Nothing</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            {goals.length > 0 ? (
              <div>
                <label htmlFor="qa-goal" className="ce-label">
                  Which goal does this move?
                </label>
                <select
                  id="qa-goal"
                  className="ce-input"
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                >
                  <option value="">Not linked to a goal</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-11 text-[13px] font-semibold text-soft underline-offset-4 hover:underline"
          >
            Hide details
          </button>
        </div>
      ) : null}
    </section>
  );
}
