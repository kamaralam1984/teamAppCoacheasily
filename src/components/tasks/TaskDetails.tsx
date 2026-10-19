import { useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useAddTaskComment,
  useSetTaskStatus,
  useTaskComments,
  useTaskEvents,
} from "@/hooks/useTaskWorkflow";
import { PRIORITY_TONE, shortDay, type Task } from "@/lib/tasks";
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
  const [body, setBody] = useState("");
  const [evidence, setEvidence] = useState("");

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
          <p className="text-sm leading-relaxed text-ink">{task.description}</p>
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
