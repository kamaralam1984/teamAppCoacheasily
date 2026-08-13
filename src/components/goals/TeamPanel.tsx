import { useMemo, useState } from "react";

import { Ring } from "@/components/goals/Ring";
import { useRemindAll, useTeamGoals } from "@/hooks/useGoals";
import { fmt, type TeamGoalRow } from "@/lib/goals";
import { initials, roleLabel, shortDate } from "@/lib/warriors";

/** A combined funnel for reports who share the same stages — where revenue leaks shows up. */
function rollUps(rows: TeamGoalRow[]) {
  const map = new Map<string, { stages: string[]; totals: number[]; people: number }>();
  rows.forEach((row) =>
    row.goals.forEach(({ goal, progress }) => {
      if (goal.kind !== "funnel" || !goal.stages?.length || !progress) return;
      const key = goal.stages.join("→");
      const cur = map.get(key) ?? {
        stages: goal.stages,
        totals: goal.stages.map(() => 0),
        people: 0,
      };
      goal.stages.forEach((_, i) => {
        cur.totals[i] = (cur.totals[i] ?? 0) + (progress.totals[i] ?? 0);
      });
      cur.people += 1;
      map.set(key, cur);
    }),
  );
  return [...map.values()]
    .filter((r) => r.people >= 2 && (r.totals[0] ?? 0) > 0)
    .map((r) => {
      const n = r.stages.length;
      const first = r.totals[0] ?? 0;
      const headline = first > 0 ? ((r.totals[n - 1] ?? 0) / first) * 100 : 0;
      let weakest: { from: string; to: string; rate: number } | null = null;
      for (let i = 0; i < n - 1; i += 1) {
        const from = r.totals[i] ?? 0;
        const to = r.totals[i + 1] ?? 0;
        if (from <= 0) continue;
        const rate = (to / from) * 100;
        if (!weakest || rate < weakest.rate) {
          weakest = { from: r.stages[i] ?? "", to: r.stages[i + 1] ?? "", rate };
        }
      }
      return { ...r, headline, weakest };
    });

}

export function TeamPanel({ canSeePast }: { canSeePast: boolean }) {
  const { data, isLoading } = useTeamGoals(true);
  const remind = useRemindAll();
  const [reminded, setReminded] = useState<number | null>(null);
  const rows = data ?? [];
  const combined = useMemo(() => rollUps(rows), [rows]);

  if (isLoading) {
    return <p className="text-sm text-soft">Loading your line…</p>;
  }

  return (
    <div className="space-y-6">
      <section className="ce-rise ce-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-ink">Your line this cycle</h2>
            <p className="mt-1 text-[13px] text-soft">
              {rows.length} {rows.length === 1 ? "person" : "people"} ·{" "}
              {rows.filter((r) => r.logged_today).length} logged today
            </p>
          </div>
          <button
            type="button"
            className="btn3d"
            disabled={remind.isPending}
            onClick={() =>
              remind.mutate(null, { onSuccess: (n) => setReminded(n) })
            }
          >
            {remind.isPending ? "Sending…" : "Remind all"}
          </button>
        </div>
        {reminded !== null ? (
          <p className="mt-3 text-[13px] font-semibold text-emer">
            {reminded === 0 ? "Nobody needed a nudge — everyone is on top of it." : `${reminded} nudged.`}
          </p>
        ) : null}
      </section>

      {combined.map((c) => (
        <section key={c.stages.join("→")} className="ce-rise ce-card p-6">
          <p className="ce-label">Team funnel · {c.people} people</p>
          <p className="mt-2 font-display text-2xl leading-tight text-ink">
            {c.stages.map((s, i) => `${fmt(c.totals[i])} ${s.toLowerCase()}`).join(" → ")} ={" "}
            {c.headline.toFixed(1)}%
          </p>
          {c.weakest ? (
            <p className="mt-2 text-[13px] font-semibold text-red">
              Weakest step {c.weakest.from} → {c.weakest.to} at {c.weakest.rate.toFixed(1)}%.
            </p>
          ) : null}
        </section>
      ))}

      {rows.map((row, i) => {
        const noGoals = row.goal_count === 0;
        const stale = row.days_since_log === null || row.days_since_log >= 9;
        return (
          <section
            key={row.profile.id}
            className="ce-rise ce-card p-6"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream text-[13px] font-bold text-goldD">
                {initials(row.profile.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-ink">{row.profile.full_name}</p>
                <p className="text-[13px] text-soft">
                  {[row.profile.title, roleLabel(row.profile.role)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl text-ink">{fmt(row.avg_pct)}%</p>
                <p className="text-[11px] font-bold text-soft">
                  {row.goal_count} {row.goal_count === 1 ? "goal" : "goals"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {noGoals ? (
                <span className="rounded-full bg-red/10 px-3 py-1 text-[12px] font-bold text-red">
                  No goals this cycle
                </span>
              ) : null}
              {!noGoals && stale ? (
                <span className="rounded-full bg-saff/12 px-3 py-1 text-[12px] font-bold text-[color:var(--ce-saffBtn)]">
                  {row.last_entry_date
                    ? `No numbers since ${shortDate(row.last_entry_date)}`
                    : "Never logged any numbers"}
                </span>
              ) : null}
              {row.logged_today ? (
                <span className="rounded-full bg-emer/12 px-3 py-1 text-[12px] font-bold text-emer">
                  ✓ logged today
                </span>
              ) : null}
            </div>

            {row.goals.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {row.goals.map(({ goal, progress }) => (
                  <li key={goal.id} className="flex items-start gap-3">
                    <Ring pct={progress?.pct ?? 0} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-ink">{goal.name}</p>
                      <p className="text-[13px] text-soft">
                        {fmt(goal.baseline)} → {fmt(progress?.current_value ?? goal.baseline)} →{" "}
                        {fmt(goal.target)} {goal.unit ?? ""}
                      </p>
                      {progress?.weakest_step ? (
                        <p className="mt-1 text-[12px] font-semibold text-red">
                          Weakest: {progress.weakest_step.from} → {progress.weakest_step.to} at{" "}
                          {fmt(progress.weakest_step.rate)}%
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      {!canSeePast ? (
        <p className="text-[13px] leading-relaxed text-soft">
          Past-cycle team data sits with People &amp; Culture.
        </p>
      ) : null}
    </div>
  );
}
