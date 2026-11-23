import { useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useAddTaskComment,
  useSetTaskStatus,
  useTaskComments,
  useTaskEvents,
} from "@/hooks/useTaskWorkflow";
import { useUpdateTask } from "@/hooks/useTasks";
import {
  istToday,
  PRIORITIES,
  PRIORITY_TONE,
  REPEAT_LABEL,
  REPEATS,
  shortDay,
  SLOTS,
  type Priority,
  type Repeats,
  type Slot,
  type Task,
} from "@/lib/tasks";
import {
  actionsFor,
  describeEvent,
  isOverdue,
  isSelfMade,
  STATUS_LABEL,
  STATUS_TONE,
  statusOf,
  type TaskAction,
} from "@/lib/taskWorkflow";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One task in full: who asked, where it stands, the next step, comments with an
 * optional evidence link, and everything that has happened to it.
 */
export function TaskDetails({
  task,
  meId,
  orgId,
  isReviewer,
  nameOf,
  onClose,
}: {
  task: Task;
  meId: string;
  orgId: string;
  /** I asked for it, manage the owner, or I am HR / admin */
  isReviewer: boolean;
  nameOf: (id: string | null) => string | null;
  onClose: () => void;
}) {
  const { data: comments } = useTaskComments(task.id);
  const { data: events } = useTaskEvents(task.id);
  const addComment = useAddTaskComment(orgId, meId);
  const setStatus = useSetTaskStatus();
  const update = useUpdateTask();
  const [body, setBody] = useState("");
  const [evidence, setEvidence] = useState("");
  const [editing, setEditing] = useState(false);

  const isOwner = task.owner_id === meId;
  const status = statusOf(task);
  const actions = actionsFor(task, { isOwner, isReviewer });

  function run(a: TaskAction) {
    setStatus.mutate(
      { id: task.id, status: a.to },
      {
        onSuccess: () => toast.success(a.to === "review" ? "Sent for review." : "Updated."),
        onError: (e) => toast.error((e as Error).message || "That didn't save."),
      },
    );
  }

  function submitComment() {
    if (!body.trim()) return;
    addComment.mutate(
      { taskId: task.id, body, evidenceUrl: evidence },
      {
        onSuccess: () => {
          setBody("");
          setEvidence("");
        },
        onError: (e) =>
          toast.error(
            /check constraint|evidence/i.test((e as Error).message)
              ? "The evidence has to be a link starting with http:// or https://"
              : ((e as Error).message ?? "That didn't save."),
          ),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl leading-tight">{task.title}</DialogTitle>
        </DialogHeader>

        {editing ? <TaskEditForm task={task} onDone={() => setEditing(false)} /> : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONE[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
          {isOverdue(task) ? (
            <span className="rounded-full bg-red/12 px-2.5 py-0.5 text-[11px] font-bold text-red">
              Overdue
            </span>
          ) : null}
          {task.due_date ? (
            <span className="rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-bold text-soft">
              Due {shortDay(task.due_date)}
            </span>
          ) : null}
          {task.priority !== "Normal" ? (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PRIORITY_TONE[task.priority]}`}
            >
              {task.priority}
            </span>
          ) : null}
        </div>

        <p className="text-[13px] text-soft">
          For <b className="text-ink">{nameOf(task.owner_id) ?? "someone"}</b>
          {isSelfMade(task)
            ? " · their own task"
            : ` · asked by ${nameOf(task.created_by) ?? "someone"}`}
        </p>
        {task.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{task.description}</p>
        ) : null}

        {(isOwner || isReviewer) && !editing ? (
          <div>
            <button type="button" className="btn3d btn3d-ghost" onClick={() => setEditing(true)}>
              Edit task
            </button>
          </div>
        ) : null}

        {isOwner || isReviewer ? (
          <div>
            <label htmlFor="td-repeat" className="ce-label">
              Repeat
            </label>
            <select
              id="td-repeat"
              className="ce-input"
              value={task.repeats}
              disabled={update.isPending}
              onChange={(e) => {
                const repeats = e.target.value as Repeats;
                update.mutate(
                  {
                    id: task.id,
                    patch:
                      repeats !== "none" && !task.due_date
                        ? { repeats, due_date: istToday() }
                        : { repeats },
                  },
                  {
                    onSuccess: () =>
                      toast.success(
                        repeats === "none"
                          ? "It won't repeat any more."
                          : `It comes back ${repeats === "weekdays" ? "every working day" : "every day"} now.`,
                      ),
                    onError: (err) => toast.error((err as Error).message || "That didn't save."),
                  },
                );
              }}
            >
              {REPEATS.map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABEL[r]}
                </option>
              ))}
            </select>
            {task.repeats !== "none" ? (
              <p className="mt-1 text-[12px] text-soft">
                Tick it when it's done today. After midnight it comes back un-ticked by itself.
              </p>
            ) : null}
          </div>
        ) : null}

        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a.to + a.label}
                type="button"
                className={`btn3d ${a.danger ? "btn3d-danger" : a.primary ? "" : "btn3d-ghost"}`}
                disabled={setStatus.isPending}
                onClick={() => run(a)}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
        {status === "review" && isOwner && !isSelfMade(task) ? (
          <p className="text-[12px] text-soft">
            {nameOf(task.created_by) ?? "The person who asked"} checks it and marks it complete, or
            sends it back.
          </p>
        ) : null}

        <section>
          <h3 className="ce-label">Comments and evidence</h3>
          <ul className="space-y-2">
            {(comments ?? []).map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-line bg-cream px-3 py-2 text-[13px]"
              >
                <span className="font-bold text-ink">
                  {nameOf(c.author_id) ?? "Someone"} · {when(c.created_at)}
                </span>
                <p className="mt-0.5 whitespace-pre-wrap text-ink">{c.body}</p>
                {c.evidence_url ? (
                  <a
                    href={c.evidence_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block break-all font-bold text-violet underline-offset-2 hover:underline"
                  >
                    Evidence: {c.evidence_url}
                  </a>
                ) : null}
              </li>
            ))}
            {comments && comments.length === 0 ? (
              <li className="text-[13px] text-soft">No comments yet.</li>
            ) : null}
          </ul>
          <div className="mt-3 space-y-2">
            <textarea
              className="ce-input min-h-20"
              maxLength={2000}
              placeholder="Add an update or a question"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <input
              className="ce-input"
              placeholder="Evidence link (optional), https://…"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
            <button
              type="button"
              className="btn3d btn3d-gold"
              disabled={!body.trim() || addComment.isPending}
              onClick={submitComment}
            >
              {addComment.isPending ? "Saving…" : "Add comment"}
            </button>
          </div>
        </section>

        <section>
          <h3 className="ce-label">History</h3>
          <ol className="space-y-1.5 text-[13px]">
            {(events ?? []).map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="shrink-0 text-soft">{when(e.created_at)}</span>
                <span className="text-ink">
                  {e.actor_id ? <b>{nameOf(e.actor_id)} · </b> : null}
                  {describeEvent(e)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Change what the task is after it was made: title, details, date, time of day and priority.
 * Date and priority changes land in the task's history (tasks_history trigger).
 */
function TaskEditForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const update = useUpdateTask();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [due, setDue] = useState(task.due_date ?? "");
  const [slot, setSlot] = useState<Slot>(task.slot as Slot);
  const [priority, setPriority] = useState<Priority>(task.priority as Priority);
  const repeating = task.repeats !== "none";

  function save() {
    if (!title.trim()) {
      toast.error("The task needs a title.");
      return;
    }
    const patch: Partial<Task> = {};
    const nextDescription = description.trim() || null;
    // a repeating task always has a date; clearing it means "from today"
    const nextDue = due || (repeating ? istToday() : null);
    if (title.trim() !== task.title) patch.title = title.trim();
    if (nextDescription !== (task.description ?? null)) patch.description = nextDescription;
    if (nextDue !== task.due_date) patch.due_date = nextDue;
    if (slot !== task.slot) patch.slot = slot;
    if (priority !== task.priority) patch.priority = priority;
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    update.mutate(
      { id: task.id, patch },
      {
        onSuccess: () => {
          toast.success("Task updated.");
          onDone();
        },
        onError: (e) =>
          toast.error(
            /row-level security/i.test((e as Error).message)
              ? "You can't edit this task. Ask its owner or their manager."
              : (e as Error).message || "That didn't save.",
          ),
      },
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-cream p-3">
      <div>
        <label htmlFor="te-title" className="ce-label">
          Title
        </label>
        <input
          id="te-title"
          className="ce-input"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="te-desc" className="ce-label">
          Details
        </label>
        <textarea
          id="te-desc"
          className="ce-input min-h-20"
          placeholder="Details (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="te-due" className="ce-label">
            {repeating ? "Next due" : "Due"}
          </label>
          <input
            id="te-due"
            type="date"
            className="ce-input"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="te-slot" className="ce-label">
            When
          </label>
          <select
            id="te-slot"
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
          <label htmlFor="te-pri" className="ce-label">
            Priority
          </label>
          <select
            id="te-pri"
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
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn3d" disabled={update.isPending} onClick={save}>
          {update.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn3d btn3d-ghost"
          disabled={update.isPending}
          onClick={onDone}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
