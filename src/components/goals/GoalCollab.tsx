import { useState } from "react";
import { toast } from "sonner";

import {
  useAddGoalComment,
  useAddMilestone,
  useDeleteMilestone,
  useGoalComments,
  useGoalStatus,
  useMilestones,
  useToggleMilestone,
} from "@/hooks/useGoalCollab";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useWarriors } from "@/hooks/useWarriors";
import {
  GOAL_STATUS_HELP,
  GOAL_STATUS_LABEL,
  GOAL_STATUS_TONE,
  type GoalStatus,
} from "@/lib/goalStatus";
import { niceDate } from "@/lib/calendar";

export function GoalStatusChip({ status, className }: { status: GoalStatus; className?: string }) {
  return (
    <span
      title={GOAL_STATUS_HELP[status]}
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${GOAL_STATUS_TONE[status]} ${className ?? ""}`}
    >
      {GOAL_STATUS_LABEL[status]}
    </span>
  );
}

/** Milestones and the conversation between a person and their manager, under a goal. */
export function GoalCollab({ goalId, ownerId }: { goalId: string; ownerId: string }) {
  const { data: mine } = useMyProfile();
  const me = mine?.profile ?? null;
  const { data: people } = useWarriors();
  const nameOf = (id: string) => people?.find((p) => p.id === id)?.full_name ?? "Someone";
  const status = useGoalStatus(goalId, ownerId);

  const [open, setOpen] = useState(false);
  const milestones = useMilestones(goalId, open);
  const comments = useGoalComments(goalId, open);
  const addMilestone = useAddMilestone(goalId, me?.org_id);
  const toggle = useToggleMilestone(goalId);
  const remove = useDeleteMilestone(goalId);
  const addComment = useAddGoalComment(goalId, me?.org_id, me?.id);

  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [body, setBody] = useState("");

  const summary = status
    ? `${status.milestones_done}/${status.milestones_total} milestones · ${status.comments} comment${status.comments === 1 ? "" : "s"}`
    : "Milestones and comments";

  const fail = (e: unknown) => toast.error((e as Error).message || "That didn't save.");

  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        aria-expanded={open}
        className="min-h-11 w-full text-left text-[12px] font-bold tracking-wider text-soft uppercase"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▾" : "▸"} {summary}
      </button>

      {open ? (
        <div className="space-y-5">
          <section>
            <h4 className="ce-label">Milestones</h4>
            <ul className="space-y-1.5">
              {(milestones.data ?? []).map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0"
                    checked={m.done}
                    aria-label={`${m.title} done`}
                    onChange={(e) =>
                      toggle.mutate({ id: m.id, done: e.target.checked }, { onError: fail })
                    }
                  />
                  <span
                    className={`flex-1 text-sm ${m.done ? "text-soft line-through" : "text-ink"}`}
                  >
                    {m.title}
                    {m.due_date ? (
                      <span className="ml-2 text-[12px] text-soft">by {niceDate(m.due_date)}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${m.title}`}
                    className="min-h-9 px-2 text-[12px] font-bold text-red"
                    onClick={() => remove.mutate(m.id, { onError: fail })}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {milestones.data && milestones.data.length === 0 ? (
                <li className="text-[13px] text-soft">No milestones yet.</li>
              ) : null}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className="ce-input min-w-40 flex-1"
                placeholder="Add a milestone"
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                type="date"
                className="ce-input w-auto"
                aria-label="Milestone date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
              <button
                type="button"
                className="btn3d btn3d-gold"
                disabled={!title.trim() || addMilestone.isPending}
                onClick={() =>
                  addMilestone.mutate(
                    { title, dueDate: due },
                    {
                      onSuccess: () => {
                        setTitle("");
                        setDue("");
                      },
                      onError: fail,
                    },
                  )
                }
              >
                Add
              </button>
            </div>
          </section>

          <section>
            <h4 className="ce-label">Comments</h4>
            <ul className="space-y-2">
              {(comments.data ?? []).map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-line bg-cream px-3 py-2 text-[13px]"
                >
                  <span className="font-bold text-ink">
                    {nameOf(c.author_id)} ·{" "}
                    {new Date(c.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <p className="mt-0.5 whitespace-pre-wrap text-ink">{c.body}</p>
                </li>
              ))}
              {comments.data && comments.data.length === 0 ? (
                <li className="text-[13px] text-soft">Nothing said yet.</li>
              ) : null}
            </ul>
            <div className="mt-2 space-y-2">
              <textarea
                className="ce-input min-h-20"
                maxLength={2000}
                placeholder="Write a comment"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <button
                type="button"
                className="btn3d btn3d-gold"
                disabled={!body.trim() || addComment.isPending}
                onClick={() =>
                  addComment.mutate(body, { onSuccess: () => setBody(""), onError: fail })
                }
              >
                {addComment.isPending ? "Saving…" : "Comment"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
