import { useState } from "react";

import { useSaveGoal, type SaveGoalInput } from "@/hooks/useGoals";
import {
  METRIC_SUGGESTIONS,
  applyTemplate,
  templatesFor,
  type Cycle,
  type Goal,
} from "@/lib/goals";

import { GoalCoach } from "./GoalCoach";
import { StageEditor } from "./StageEditor";

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
  tracksRevenue: boolean;
  /** how many days of numbers this goal already carries */
  entriesCount?: number;
  /** today's number, used when they choose to start a fresh goal */
  currentValue?: number;
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
    tracksRevenue: false,
  };
}

export function draftFromGoal(g: Goal, entriesCount = 0, currentValue?: number): GoalDraft {
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
    tracksRevenue: Boolean(g.tracks_revenue),
    entriesCount,
    ...(currentValue === undefined ? {} : { currentValue }),
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
  /** true once they tap "Create a new goal from this" — the fork carries the number forward */
  const [forked, setForked] = useState(false);
  const save = useSaveGoal();
  const templates = templatesFor(department);

  /* counts[] is positional forever: counts[1] is stage 1 for every day already logged.
     So a goal with history may be RENAMED but never re-shaped. Forking is the way out. */
  const hasHistory = Boolean(initial.id) && (initial.entriesCount ?? 0) > 0 && !forked;
  const shapeLocked = hasHistory;

  const set = (patch: Partial<GoalDraft>) => setD((cur) => ({ ...cur, ...patch }));

  const stages = d.stages.map((s) => s.trim()).filter(Boolean);

  const canNext = () => {
    if (step === 0) return d.name.trim().length > 1;
    if (step === 1)
      return d.kind === "number"
        ? d.metric.trim().length > 0
        : stages.length >= 2 && stages.length <= 5;
    if (step === 2) return d.baseline.trim() !== "";
    return d.target.trim() !== "";
  };

  const submit = () => {
    const baseline = Number(d.baseline);
    const target = Number(d.target);
    if (d.kind === "funnel" && (stages.length < 2 || stages.length > 5)) {
      setError("A funnel needs between two and five steps.");
      return;
    }


    /* A fork never rewrites history — the old goal stays exactly as it is. */
    const input: SaveGoalInput = {
      ...(d.id ? { id: d.id } : {}),
      profile_id: profileId,
      org_id: orgId,
      cycle_id: cycle.id,
      kind: d.kind,
      name: d.name.trim(),
      metric: d.kind === "funnel" ? stages.join(" → ") : d.metric.trim(),
      unit: d.kind === "funnel" ? "%" : d.unit.trim() || null,
      baseline,
      target,
      stages: d.kind === "funnel" ? stages : null,
      plan: d.plan.trim() || null,
      tracks_revenue: d.tracksRevenue,
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
                <p className="ce-label">A starting point for {department}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={shapeLocked}
                      className="min-h-11 rounded-full border border-line bg-cream px-3 text-[12px] font-bold text-ink disabled:opacity-40"
                      onClick={() => set(applyTemplate(t))}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-soft">
                  Or write your own — a template is a starting point, never a cage.
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            {hasHistory ? (
              <div className="rounded-[14px] border border-gold/50 bg-gold/8 p-4">
                <p className="text-[13px] leading-relaxed font-bold text-ink">
                  This goal already has {initial.entriesCount} day
                  {initial.entriesCount === 1 ? "" : "s"} of numbers logged against these stages.
                  Changing them now would scramble that history. Create a new goal instead — you
                  can carry the current number forward as its starting point.
                </p>
                <p className="mt-2 text-[12px] text-soft">
                  Renaming a step is fine — the position never moves, so the history still lines up.
                </p>
                <button
                  type="button"
                  className="btn3d mt-3 w-full sm:w-auto"
                  onClick={() => {
                    setForked(true);
                    setD((cur) => {
                      const { id: _drop, ...rest } = cur;
                      return {
                        ...rest,
                        entriesCount: 0,
                        ...(initial.currentValue === undefined
                          ? {}
                          : { baseline: String(initial.currentValue) }),
                      };
                    });
                  }}
                >
                  Create a new goal from this →
                </button>
              </div>
            ) : null}

            {forked ? (
              <p className="rounded-[14px] border border-emer/40 bg-emer/8 p-3 text-[13px] font-bold text-emer">
                Fresh goal, everything pre-filled. The old one stays untouched with all its days
                intact.
              </p>
            ) : null}

            <div className="flex gap-2">
              {(["number", "funnel"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={shapeLocked}
                  onClick={() => set({ kind: k })}
                  className={`min-h-11 flex-1 rounded-lg border px-3 text-[13px] font-bold disabled:opacity-40 ${
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
                  Name each step in your own words. You log raw counts every day — never a
                  percentage.
                </p>
                <StageEditor
                  stages={d.stages}
                  renameOnly={shapeLocked}
                  onChange={(s) => set({ stages: s })}
                />
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
            <label className="flex items-start gap-3 rounded-[14px] border border-line bg-cream/50 p-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0"
                checked={d.tracksRevenue}
                onChange={(e) => set({ tracksRevenue: e.target.checked })}
              />
              <span>
                <span className="text-[14px] font-bold text-ink">
                  This goal brings in revenue
                </span>
                <span className="mt-1 block text-[13px] text-soft">
                  A rupee field appears on your daily log so you can record what closed that day.
                  It stays optional.
                </span>
              </span>
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

        {step === 3 ? (
          <GoalCoach
            payload={{
              kind: d.kind,
              name: d.name,
              metric: d.metric,
              unit: d.unit,
              baseline: d.baseline,
              target: d.target,
              stages,
              cycleStart: cycle.start_date,
              cycleEnd: cycle.end_date,
            }}
            disabled={shapeLocked}
            onUseStages={(next) => set({ kind: "funnel", stages: next })}
          />
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
