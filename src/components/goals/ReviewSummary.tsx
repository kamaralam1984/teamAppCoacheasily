import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";

import { teamWeekSummary } from "@/lib/reviewSummary.functions";
import type { ReviewSlide } from "@/components/goals/ReviewMode";

/** The manager's read-out for the 11 AM standup — a draft they edit before sharing. */
export function ReviewSummary({ slides, cycleName }: { slides: ReviewSlide[]; cycleName: string }) {
  const ask = useServerFn(teamWeekSummary);
  const [draft, setDraft] = useState<string | null>(null);

  const people = Object.values(
    slides.reduce<Record<string, { name: string; title: string | null; department: string | null; goals: unknown[] }>>(
      (acc, s) => {
        const key = s.personName;
        const p = s.item.progress;
        const g = s.item.goal;
        acc[key] ??= {
          name: s.personName,
          title: s.personTitle,
          department: null,
          goals: [],
        };
        acc[key].goals.push({
          name: g.name,
          kind: g.kind,
          baseline: Number(g.baseline),
          current: Number(p?.current_value ?? g.baseline),
          target: Number(g.target),
          pct: Number(p?.pct ?? 0),
          this_week: g.kind === "funnel" ? (p?.week_rate ?? null) : (p?.week_sum ?? null),
          last_week: g.kind === "funnel" ? (p?.prev_week_rate ?? null) : (p?.prev_week_sum ?? null),
          weakest_step: p?.weakest_step
            ? { from: p.weakest_step.from, to: p.weakest_step.to, rate: p.weakest_step.rate }
            : null,
        });
        return acc;
      },
      {},
    ),
  );

  const run = useMutation({
    mutationFn: async () =>
      ask({ data: { people: people as never, cycleName } }),
    onSuccess: (res) => setDraft(res.summary),
  });

  return (
    <section className="ce-card mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="ce-label">The team's week, in plain English</p>
        <button
          type="button"
          className="min-h-11 rounded-full border border-gold bg-cream px-4 text-[13px] font-bold text-goldD disabled:opacity-40"
          disabled={run.isPending || people.length === 0}
          onClick={() => run.mutate()}
        >
          {run.isPending ? "Reading the numbers…" : draft ? "Write it again" : "Draft the read-out"}
        </button>
      </div>

      {run.isError ? (
        <p className="mt-3 text-[14px] font-semibold text-soft">
          {(run.error as Error).message} Run the meeting off the numbers on screen.
        </p>
      ) : null}

      {draft !== null ? (
        <>
          <textarea
            className="ce-input mt-3 min-h-48 w-full text-[16px] leading-relaxed"
            aria-label="Standup read-out draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="mt-2 text-[12px] text-soft">
            A draft, not a verdict. Edit it in your own words before you read it out — nothing here
            is saved or shared automatically.
          </p>
        </>
      ) : null}
    </section>
  );
}
