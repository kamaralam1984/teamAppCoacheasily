import { useMemo, useState } from "react";

import { PersonDetail } from "@/components/overview/PersonDetail";
import type { TeamRow } from "@/hooks/useDashboards";
import { KIND_LABEL, KIND_STYLE, attended } from "@/lib/attendanceKinds";

type GroupBy = "department" | "manager";

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-cream px-3 py-2 text-center">
      <div className={`font-display text-2xl ${tone ?? "text-ink"}`}>{value}</div>
      <div className="text-[10px] font-bold tracking-wider text-soft uppercase">{label}</div>
    </div>
  );
}

/**
 * The team, grouped by department or by manager. Open a person to see their
 * attendance, tasks and goals without leaving the page.
 */
export function TeamTable({ rows, canGroup }: { rows: TeamRow[]; canGroup: boolean }) {
  const [groupBy, setGroupBy] = useState<GroupBy>(canGroup ? "department" : "manager");
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const totals = useMemo(() => {
    const sum = (f: (r: TeamRow) => number) => rows.reduce((n, r) => n + f(r), 0);
    return {
      people: rows.length,
      present: rows.filter((r) => attended(r.today.kind)).length,
      absent: rows.filter((r) => r.today.kind === "absent").length,
      openTasks: sum((r) => r.tasks.open),
      overdue: sum((r) => r.tasks.overdue),
      review: sum((r) => r.tasks.review),
      atRisk: sum((r) => r.goals.at_risk + r.goals.overdue),
    };
  }, [rows]);

  const groups = useMemo(() => {
    const map = new Map<string, TeamRow[]>();
    for (const r of rows) {
      const key =
        groupBy === "department"
          ? (r.department ?? "No department")
          : (r.manager_name ?? "Leadership");
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows, groupBy]);

  const toggleGroup = (g: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
        <Stat label="People" value={totals.people} />
        <Stat label="In today" value={totals.present} tone="text-emer" />
        <Stat label="Absent" value={totals.absent} tone={totals.absent ? "text-red" : "text-ink"} />
        <Stat label="Open tasks" value={totals.openTasks} />
        <Stat
          label="Overdue"
          value={totals.overdue}
          tone={totals.overdue ? "text-red" : "text-ink"}
        />
        <Stat label="In review" value={totals.review} />
        <Stat
          label="Goals at risk"
          value={totals.atRisk}
          tone={totals.atRisk ? "text-saffBtn" : "text-ink"}
        />
      </div>

      {canGroup ? (
        <div className="flex items-center gap-2" role="group" aria-label="Group the team">
          <span className="ce-label mb-0">Group by</span>
          {(["department", "manager"] as GroupBy[]).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={groupBy === g}
              className={`min-h-11 rounded-full px-4 text-[13px] font-bold capitalize ${
                groupBy === g ? "bg-night text-goldL" : "border border-line bg-white text-soft"
              }`}
              onClick={() => setGroupBy(g)}
            >
              {g}
            </button>
          ))}
        </div>
      ) : null}

      {groups.map(([name, list]) => (
        <div key={name} className="ce-card overflow-hidden">
          <button
            type="button"
            aria-expanded={!collapsed.has(name)}
            className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left"
            onClick={() => toggleGroup(name)}
          >
            <span className="font-display text-xl text-ink">
              {collapsed.has(name) ? "▸" : "▾"} {name}
            </span>
            <span className="text-[12px] text-soft">
              {list.length} · {list.filter((r) => attended(r.today.kind)).length} in ·{" "}
              {list.reduce((n, r) => n + r.tasks.overdue, 0)} overdue
            </span>
          </button>

          {collapsed.has(name) ? null : (
            <ul className="divide-y divide-line border-t border-line">
              {list.map((r) => (
                <li key={r.profile_id}>
                  <button
                    type="button"
                    aria-expanded={openId === r.profile_id}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-cream/60"
                    onClick={() => setOpenId(openId === r.profile_id ? null : r.profile_id)}
                  >
                    <span className="min-w-40 flex-1">
                      <span className="block text-sm font-bold text-ink">{r.full_name}</span>
                      <span className="block text-[12px] text-soft">
                        {groupBy === "department"
                          ? r.manager_name
                            ? `Reports to ${r.manager_name}`
                            : r.title
                          : r.department}
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${KIND_STYLE[r.today.kind]}`}
                    >
                      {KIND_LABEL[r.today.kind]}
                    </span>
                    <span className="text-[12px] text-soft">
                      {r.tasks.open} open
                      {r.tasks.overdue ? (
                        <b className="text-red"> · {r.tasks.overdue} overdue</b>
                      ) : null}
                      {r.tasks.review ? ` · ${r.tasks.review} in review` : ""}
                    </span>
                    <span className="text-[12px] text-soft">
                      {r.goals.total === 0 ? (
                        "No goals"
                      ) : (
                        <>
                          {r.goals.total} goal{r.goals.total === 1 ? "" : "s"}
                          {r.goals.at_risk ? (
                            <b className="text-saffBtn"> · {r.goals.at_risk} at risk</b>
                          ) : null}
                          {r.goals.overdue ? (
                            <b className="text-red"> · {r.goals.overdue} overdue</b>
                          ) : null}
                        </>
                      )}
                    </span>
                    {r.pending_leave ? (
                      <span className="rounded-full bg-violet/12 px-2 py-0.5 text-[11px] font-bold text-violet">
                        {r.pending_leave} leave to decide
                      </span>
                    ) : null}
                  </button>
                  {openId === r.profile_id ? (
                    <PersonDetail profileId={r.profile_id} name={r.full_name} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {rows.length === 0 ? (
        <p className="ce-card p-6 text-sm text-soft">Nobody to show yet.</p>
      ) : null}
    </section>
  );
}
