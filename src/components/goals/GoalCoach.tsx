import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";

import { checkGoal, type GoalReview } from "@/lib/goalCoach.functions";

export interface GoalCoachProps {
  payload: {
    kind: "number" | "funnel";
    name: string;
    metric: string;
    unit: string;
    baseline: string;
    target: string;
    stages: string[];
    cycleStart: string;
    cycleEnd: string;
  };
  disabled?: boolean;
  /** they choose to take the suggested funnel — nothing changes unless they tap */
  onUseStages?: (stages: string[]) => void;
}

/** "Check my goal" — the AI reads it and suggests. The person decides. */
export function GoalCoach({ payload, disabled, onUseStages }: GoalCoachProps) {
  const ask = useServerFn(checkGoal);
  const review = useMutation<GoalReview>({
    mutationFn: async () => ask({ data: payload }),
  });

  const r = review.data;

  return (
    <div className="rounded-[14px] border border-line bg-pearl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-ink">Want a second pair of eyes?</p>
        <button
          type="button"
          className="min-h-11 rounded-full border border-gold bg-cream px-4 text-[13px] font-bold text-goldD disabled:opacity-40"
          disabled={review.isPending || !payload.name.trim()}
          onClick={() => review.mutate()}
        >
          {review.isPending ? "Reading your goal…" : "Check my goal"}
        </button>
      </div>
      <p className="mt-1.5 text-[12px] text-soft">
        CoachEasily AI only suggests. Nothing is changed or saved unless you do it yourself.
      </p>

      {review.isError ? (
        <p className="mt-3 text-[13px] font-semibold text-soft">
          {(review.error as Error).message} Your goal is fine to save without it.
        </p>
      ) : null}

      {r ? (
        <div className="mt-3 space-y-2.5">
          {r.verdict ? <p className="text-[14px] font-bold text-ink">{r.verdict}</p> : null}
          {[
            ["Is it countable?", r.trackable],
            ["Is the target realistic?", r.target],
            ["Number or funnel?", r.shape],
          ]
            .filter(([, v]) => v)
            .map(([label, v]) => (
              <p key={label} className="text-[13px] leading-relaxed text-soft">
                <span className="font-bold text-ink">{label}</span> {v}
              </p>
            ))}

          {r.stages.length >= 2 ? (
            <div className="rounded-[12px] border border-line bg-white p-3">
              <p className="text-[13px] font-bold text-ink">Suggested steps</p>
              <p className="mt-1 text-[13px] text-soft">{r.stages.join(" → ")}</p>
              {onUseStages && !disabled ? (
                <button
                  type="button"
                  className="mt-2 min-h-11 text-[13px] font-bold text-goldD underline underline-offset-4"
                  onClick={() => onUseStages(r.stages)}
                >
                  Use these steps
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
