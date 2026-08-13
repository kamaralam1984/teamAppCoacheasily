import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";

import { Ring } from "@/components/goals/Ring";
import type { Cycle, GoalWithProgress } from "@/lib/goals";
import { istToday } from "@/lib/tasks";

function daysLeft(cycle: Cycle | null): number | null {
  if (!cycle) return null;
  const a = new Date(`${istToday()}T00:00:00Z`).getTime();
  const b = new Date(`${cycle.end_date}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function MyGoalsCard({
  goals,
  cycle,
  style,
}: {
  goals: GoalWithProgress[] | undefined;
  cycle: Cycle | null;
  style?: CSSProperties;
}) {
  const list = (goals ?? []).filter((g) => !g.goal.archived);
  const avg =
    list.length > 0
      ? list.reduce((sum, g) => sum + (g.progress?.pct ?? 0), 0) / list.length
      : 0;
  const left = daysLeft(cycle);

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">My goals</h2>
        <Link to="/goals" className="text-[13px] font-bold text-saffBtn hover:underline">
          Open goals →
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="mt-4 rounded-[14px] bg-cream px-4 py-4 text-[13px] leading-relaxed text-soft">
          No goals written for {cycle?.name ?? "this cycle"} yet. Write one — a number you can move
          this cycle.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-4">
            <Ring pct={avg} size={78} />
            <div>
              <p className="text-[15px] font-bold text-ink">
                {list.length} goal{list.length === 1 ? "" : "s"} · {cycle?.name ?? "this cycle"}
              </p>
              <p className="text-[13px] text-soft">
                {left === null
                  ? "No cycle open"
                  : left === 0
                    ? "Last day of the cycle"
                    : `${left} day${left === 1 ? "" : "s"} left in the cycle`}
              </p>
            </div>
          </div>

          <ul className="mt-5 space-y-3">
            {list.map(({ goal, progress }) => {
              const pct = progress?.pct ?? 0;
              return (
                <li key={goal.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[14px] font-semibold text-ink">
                      {goal.name}
                    </p>
                    <span className="text-[13px] font-bold text-soft">{Math.round(pct)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-cream">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
