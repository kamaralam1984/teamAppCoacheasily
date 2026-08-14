import { useState } from "react";

import { Ring } from "@/components/goals/Ring";
import { StepAdvice } from "@/components/goals/StepAdvice";
import {
  useArchiveGoal,
  useLogEntry,
  usePurgeGoal,
  useSaveLearnings,
} from "@/hooks/useGoals";
import { fmt, istToday, weekLine, type GoalWithProgress } from "@/lib/goals";

interface Props {
  item: GoalWithProgress;
  editable: boolean;
  onEdit?: () => void;
  /** HR and Admin only: destroy the goal and its daily numbers for good. */
  canPurge?: boolean;
  style?: React.CSSProperties;
}

export function GoalCard({ item, editable, onEdit, canPurge = false, style }: Props) {
  const { goal, progress } = item;
  const p = progress;
  const [reviewValue, setReviewValue] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [learnings, setLearnings] = useState(goal.learnings ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const del = useArchiveGoal();
  const purge = usePurgeGoal();
  const log = useLogEntry();
  const saveLearnings = useSaveLearnings();

  const submitReview = () => {
    if (!reviewValue.trim() && !reviewNote.trim()) return;
    const stamp = new Date().toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
    log.mutate(
      {
        goalId: goal.id,
        date: istToday(),
        ...(goal.kind === "number" && reviewValue.trim()
          ? { value: Number(reviewValue) }
          : {}),
        note: `Weekly review (${stamp}): ${reviewNote.trim() || "no note"}`,
      },
      {
        onSuccess: () => {
          setReviewValue("");
          setReviewNote("");
        },
      },
    );
  };

  return (
    <article className="ce-rise ce-card p-6" style={style}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <Ring pct={p?.pct ?? 0} />
        <div className="min-w-[8rem] flex-1">
          <h3 className="font-display text-2xl leading-tight text-ink">{goal.name}</h3>
          {goal.metric ? <p className="mt-0.5 text-[13px] text-soft">{goal.metric}</p> : null}
        </div>
        {editable ? (
          <div className="order-3 flex w-full shrink-0 items-center gap-2 sm:order-none sm:w-auto">
            <button
              type="button"
              onClick={onEdit}
              className="min-h-11 flex-1 rounded-full border border-line px-3 text-[12px] font-bold text-soft sm:flex-none"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-11 flex-1 rounded-full border border-line px-3 text-[12px] font-bold text-red sm:flex-none"
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>

      {confirmDelete ? (
        <div className="mt-4 rounded-[14px] border border-gold/50 bg-gold/10 p-4">
          <p className="text-[13px] leading-relaxed font-bold text-ink">
            Remove &ldquo;{goal.name}&rdquo; from your goals?
            {(p?.entries_count ?? 0) > 0
              ? ` All ${p?.entries_count} day${p?.entries_count === 1 ? "" : "s"} of logged numbers are kept — the goal simply moves to your Archived list, and you can restore it any time.`
              : " It moves to your Archived list and you can restore it any time. Nothing is lost."}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="min-h-11 flex-1 rounded-lg border border-line bg-ivory px-3 text-[13px] font-bold text-ink"
              onClick={() => setConfirmDelete(false)}
            >
              Keep it here
            </button>
            <button
              type="button"
              className="min-h-11 flex-1 rounded-lg bg-goldD px-3 text-[13px] font-bold text-white disabled:opacity-50"
              disabled={del.isPending}
              onClick={() => del.mutate(goal.id, { onSuccess: () => setConfirmDelete(false) })}
            >
              {del.isPending ? "Removing…" : "Remove from my goals"}
            </button>
          </div>
          {canPurge ? (
            <div className="mt-3 border-t border-line pt-3">
              {confirmPurge ? (
                <>
                  <p className="text-[13px] leading-relaxed font-bold text-red">
                    Permanently destroy &ldquo;{goal.name}&rdquo; and{" "}
                    {p?.entries_count ?? 0} day{(p?.entries_count ?? 0) === 1 ? "" : "s"} of daily
                    numbers? This cannot be undone.
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="min-h-11 flex-1 rounded-lg border border-line bg-ivory px-3 text-[13px] font-bold text-ink"
                      onClick={() => setConfirmPurge(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="min-h-11 flex-1 rounded-lg bg-red px-3 text-[13px] font-bold text-white disabled:opacity-50"
                      disabled={purge.isPending}
                      onClick={() => purge.mutate(goal.id)}
                    >
                      {purge.isPending ? "Deleting…" : "Delete for good"}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="text-[12px] font-bold text-red underline"
                  onClick={() => setConfirmPurge(true)}
                >
                  HR only: delete permanently
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] font-semibold">
        <span className="text-soft">{fmt(goal.baseline)}</span>
        <span className="text-line">→</span>
        <span className="text-lg text-ink">{fmt(p?.current_value ?? goal.baseline)}</span>
        <span className="text-line">→</span>
        <span className="text-goldD">{fmt(goal.target)}</span>
        {goal.unit ? <span className="text-soft">{goal.unit}</span> : null}
      </div>

      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-cream">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-goldL transition-[width] duration-500"
          style={{ width: `${Math.max(p?.pct ?? 0, 2)}%` }}
        />
      </div>

      {goal.kind === "funnel" && goal.stages?.length ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {goal.stages.map((s, i) => (
              <div key={s + String(i)} className="rounded-[12px] border border-line bg-cream/50 p-3">
                <p className="ce-label">{s}</p>
                <p className="mt-1 font-display text-2xl text-ink">{fmt(p?.totals[i] ?? 0)}</p>
                {i > 0 ? (
                  <p className="mt-0.5 text-[12px] font-bold text-soft">
                    {fmt(p?.step_rates[i - 1]?.rate ?? 0)}% from {goal.stages![i - 1]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {p?.weakest_step ? (
            <p className="mt-4 rounded-[12px] border border-red/30 bg-red/8 p-3 text-[13px] leading-relaxed font-semibold text-red">
              🔍 Your weakest step is {p.weakest_step.from} → {p.weakest_step.to} at{" "}
              {fmt(p.weakest_step.rate)}%. {fmt(p.weakest_step.to_count)} of{" "}
              {fmt(p.weakest_step.from_count)} made it through. Fix this one step and the whole
              number moves.
            </p>
          ) : null}
          {p?.weakest_step ? <StepAdvice goalId={goal.id} /> : null}
        </>
      ) : null}

      {weekLine(goal, p) ? (
        <p className="mt-4 text-[13px] leading-relaxed text-soft">{weekLine(goal, p)}</p>
      ) : null}

      {goal.plan ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink">
          <span className="ce-label">Plan</span>
          <br />
          {goal.plan}
        </p>
      ) : null}

      {editable ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="ce-label">Weekly review</p>
          <p className="mt-1 text-[13px] leading-relaxed font-semibold text-goldD">
            Be honest with yourself. This isn't for the company — it's for your own growth.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {goal.kind === "number" ? (
              <input
                type="number"
                inputMode="decimal"
                value={reviewValue}
                onChange={(e) => setReviewValue(e.target.value)}
                placeholder="Where you are now"
                className="ce-input h-11 sm:w-48"
              />
            ) : null}
            <input
              type="text"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="What actually happened this week?"
              className="ce-input h-11 flex-1"
            />
            <button
              type="button"
              className="btn3d"
              onClick={submitReview}
              disabled={log.isPending}
            >
              {log.isPending ? "Saving…" : "Save review"}
            </button>
          </div>

          <label className="mt-4 block">
            <span className="ce-label">Learnings</span>
            <textarea
              value={learnings}
              onChange={(e) => setLearnings(e.target.value)}
              onBlur={() => {
                if ((goal.learnings ?? "") !== learnings) {
                  saveLearnings.mutate({ goalId: goal.id, learnings });
                }
              }}
              rows={3}
              className="ce-input mt-1 w-full"
              placeholder="What is this goal teaching you?"
            />
          </label>
        </div>
      ) : goal.learnings ? (
        <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-soft">
          <span className="ce-label">Their learning</span>
          <br />
          {goal.learnings}
        </p>
      ) : null}
    </article>
  );
}
