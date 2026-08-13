import { useState } from "react";

import { useSaveGoal, type SaveGoalInput } from "@/hooks/useGoals";
import { METRIC_SUGGESTIONS, templatesFor, type Cycle, type Goal } from "@/lib/goals";

export interface GoalDraft {
  id?: string;
  kind: "number" | "funnel";
  name: string;
  metric: string;
  unit: string;
  baseline: string;
  target: string;
  stages: string[];
  plan: string;
}

export function emptyDraft(): GoalDraft {
  return {
    kind: "number",
    name: "",
    metric: "",
    unit: "",
    baseline: "",
    target: "",
    stages: ["", "", ""],
    plan: "",
  };
}

export function draftFromGoal(g: Goal): GoalDraft {
  return {
    id: g.id,
    kind: g.kind as "number" | "funnel",
    name: g.name,
    metric: g.metric ?? "",
    unit: g.unit ?? "",
    baseline: String(g.baseline),
    target: String(g.target),
    stages: g.stages?.length ? g.stages : ["", "", ""],
    plan: g.plan ?? "",
  };
}

interface Props {
  cycle: Cycle;
  profileId: string;
  orgId: string;
  department: string | null;
  initial: GoalDraft;
  onDone: () => void;
  onCancel: () => void;
}

const STEPS = ["Name it", "What you're counting", "Where you are today", "Where you'll be"];

export function GoalForm({
  cycle,
  profileId,
  orgId,
  department,
  initial,
  onDone,
  onCancel,
}: Props) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<GoalDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveGoal();
  const templates = templatesFor(department);

  const set = (patch: Partial<GoalDraft>) => setD((cur) => ({ ...cur, ...patch }));

  const stages = d.stages.map((s) => s.trim()).filter(Boolean);

  const canNext = () => {
    if (step === 0) return d.name.trim().length > 1;
    if (step === 1) return d.kind === "number" ? d.metric.trim().length > 0 : stages.length >= 2;
    if (step === 2) return d.baseline.trim() !== "";
    return d.target.trim() !== "";
  };

  const submit = () => {
    const baseline = Number(d.baseline);
    const target = Number(d.target);
    if (baseline === target) {
      setError("Where you are and where you're going cannot be the same number.");
      return;
    }
    const input: SaveGoalInput = {
      ...(d.id ? { id: d.id } : {}),
      profile_id: profileId,
      org_id: orgId,
      cycle_id: cycle.id,
      kind: d.kind,
      name: d.name.trim(),
      metric: d.kind === "funnel" ? stages.join(" → ") : d.metric.trim(),
      unit: d.unit.trim() || (d.kind === "funnel" ? "%" : null),
      baseline,
      target,
      stages: d.kind === "funnel" ? stages : null,
      plan: d.plan.trim() || null,
    };
    save.mutate(input, {
      onSuccess: onDone,
      onError: (e) => setError((e as Error).message),
    });
  };

  return (
    <div className="ce-card p-6">
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`rounded-full px-3 py-1 text-[12px] font-bold ${
              i === step
                ? "bg-night text-goldL"
                : i < step
                  ? "bg-emer/12 text-emer"
                  : "border border-line text-soft"
            }`}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {step === 0 ? (
          <>
            <label className="block">
              <span className="ce-label">Name your goal</span>
              <input
                className="ce-input mt-1 h-12 w-full"
                value={d.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Turn more calls into closures"
              />
            </label>
            {templates.length > 0 ? (
              <div>
                <p className="ce-label">Templates for {department}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      className="min-h-11 rounded-full border border-line bg-cream px-3 text-[12px] font-bold text-ink"
                      onClick={() =>
                        set({
                          name: t.name,
                          kind: t.kind,
                          metric: t.metric,
                          unit: t.unit ?? (t.kind === "funnel" ? "%" : ""),
                          stages: t.stages ?? ["", "", ""],
                        })
                      }
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="flex gap-2">
              {(["number", "funnel"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set({ kind: k })}
                  className={`min-h-11 flex-1 rounded-lg border px-3 text-[13px] font-bold ${
                    d.kind === k ? "border-gold bg-gold/12 text-ink" : "border-line text-soft"
                  }`}
                >
                  {k === "number" ? "One number" : "A funnel"}
                </button>
              ))}
            </div>

            {d.kind === "number" ? (
              <>
                <label className="block">
                  <span className="ce-label">What are you counting?</span>
                  <input
                    className="ce-input mt-1 h-12 w-full"
                    value={d.metric}
                    onChange={(e) => set({ metric: e.target.value })}
                    placeholder="e.g. Quality leads"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {METRIC_SUGGESTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-soft"
                      onClick={() => set({ metric: m })}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="ce-label">Unit (optional)</span>
                  <input
                    className="ce-input mt-1 h-11 w-full sm:w-48"
                    value={d.unit}
                    onChange={(e) => set({ unit: e.target.value })}
                    placeholder="calls · % · hours"
                  />
                </label>
              </>
            ) : (
              <>
                <p className="text-[13px] text-soft">
                  Name each stage. You log raw counts every day — never a percentage.
                </p>
                {d.stages.map((s, i) => (
                  <input
                    key={i}
                    className="ce-input h-11 w-full"
                    value={s}
                    onChange={(e) =>
                      set({ stages: d.stages.map((x, j) => (j === i ? e.target.value : x)) })
                    }
                    placeholder={`Stage ${i + 1}`}
                  />
                ))}
                <button
                  type="button"
                  className="rounded-full border border-line px-3 py-2 text-[12px] font-bold text-soft"
                  onClick={() => set({ stages: [...d.stages, ""] })}
                >
                  + Another stage
                </button>
              </>
            )}
          </>
        ) : null}

        {step === 2 ? (
          <label className="block">
            <span className="ce-label">
              {d.kind === "funnel"
                ? "Your conversion today (last stage ÷ first stage, %)"
                : "Where you are today"}
            </span>
            <input
              type="number"
              inputMode="decimal"
              className="ce-input mt-1 h-12 w-full sm:w-56"
              value={d.baseline}
              onChange={(e) => set({ baseline: e.target.value })}
              placeholder="0"
            />
            <p className="mt-2 text-[13px] text-soft">
              Progress is measured from here, not from zero. Honest starting points make honest
              percentages.
            </p>
          </label>
        ) : null}

        {step === 3 ? (
          <>
            <label className="block">
              <span className="ce-label">Where you'll be by {cycle.name} ends</span>
              <input
                type="number"
                inputMode="decimal"
                className="ce-input mt-1 h-12 w-full sm:w-56"
                value={d.target}
                onChange={(e) => set({ target: e.target.value })}
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="ce-label">How you'll get there (optional)</span>
              <textarea
                rows={3}
                className="ce-input mt-1 w-full"
                value={d.plan}
                onChange={(e) => set({ plan: e.target.value })}
              />
            </label>
          </>
        ) : null}

        {error ? <p className="text-[13px] font-semibold text-red">{error}</p> : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {step > 0 ? (
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-bold text-soft"
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
        ) : null}
        {step < 3 ? (
          <button
            type="button"
            className="btn3d"
            disabled={!canNext()}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </button>
        ) : (
          <button type="button" className="btn3d" disabled={!canNext() || save.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : d.id ? "Save changes" : "Set this goal"}
          </button>
        )}
        <button
          type="button"
          className="min-h-11 px-2 text-[13px] font-bold text-soft underline"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
