import { useState } from "react";

import { AttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import { GoalStatusChip } from "@/components/goals/GoalCollab";
import { usePersonTasks } from "@/hooks/useDashboards";
import { useGoalStatuses } from "@/hooks/useGoalCollab";
import { shortDay, istToday } from "@/lib/tasks";
import { isOverdue, STATUS_LABEL, STATUS_TONE, statusOf } from "@/lib/taskWorkflow";

type Tab = "attendance" | "tasks" | "goals";

/** One person, opened from the team table: attendance, tasks and goals in one place. */
export function PersonDetail({ profileId, name }: { profileId: string; name: string }) {
  const [tab, setTab] = useState<Tab>("attendance");
  const tabs: { id: Tab; label: string }[] = [
    { id: "attendance", label: "Attendance" },
    { id: "tasks", label: "Tasks" },
    { id: "goals", label: "Goals" },
  ];

  return (
    <div className="space-y-4 border-t border-line bg-cream/50 p-4">
      <nav className="flex gap-2" aria-label={`${name} details`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            className={`min-h-11 rounded-full px-4 text-[13px] font-bold ${
              tab === t.id ? "bg-night text-goldL" : "border border-line bg-white text-soft"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "attendance" ? <AttendanceCalendar profileId={profileId} /> : null}
      {tab === "tasks" ? <PersonTasks profileId={profileId} /> : null}
      {tab === "goals" ? <PersonGoals profileId={profileId} /> : null}
    </div>
  );
}

function PersonTasks({ profileId }: { profileId: string }) {
  const { data, isLoading } = usePersonTasks(profileId);
  const today = istToday();
  const open = (data ?? []).filter((t) => statusOf(t) !== "completed");
  const done = (data ?? []).filter((t) => statusOf(t) === "completed").slice(-5);

  if (isLoading) return <p className="text-sm text-soft">Loading…</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {open.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"
          >
            <span className="flex-1 text-sm font-semibold text-ink">{t.title}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[statusOf(t)]}`}
            >
              {STATUS_LABEL[statusOf(t)]}
            </span>
            {isOverdue(t, today) ? (
              <span className="rounded-full bg-red/12 px-2 py-0.5 text-[11px] font-bold text-red">
                Overdue
              </span>
            ) : null}
            {t.due_date ? (
              <span className="text-[12px] text-soft">{shortDay(t.due_date)}</span>
            ) : null}
          </li>
        ))}
        {open.length === 0 ? <li className="text-sm text-soft">No open tasks.</li> : null}
      </ul>
      {done.length > 0 ? (
        <p className="text-[12px] text-soft">
          Recently completed: {done.map((t) => t.title).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function PersonGoals({ profileId }: { profileId: string }) {
  const { data, isLoading, error } = useGoalStatuses(profileId);
  if (isLoading) return <p className="text-sm text-soft">Loading…</p>;
  if (error) return <p className="text-sm text-red">The goals couldn't be loaded.</p>;
  return (
    <ul className="space-y-1.5">
      {(data ?? []).map((g) => (
        <li key={g.goal_id} className="rounded-lg border border-line bg-white px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 text-sm font-semibold text-ink">{g.name}</span>
            <GoalStatusChip status={g.status} />
          </div>
          <p className="mt-1 text-[12px] text-soft">
            {Math.round(g.pct)}% done, an even pace would be {Math.round(g.expected_pct)}% ·{" "}
            {g.milestones_done}/{g.milestones_total} milestones · {g.comments} comment
            {g.comments === 1 ? "" : "s"}
          </p>
        </li>
      ))}
      {data && data.length === 0 ? (
        <li className="text-sm text-soft">No goals in the active cycle.</li>
      ) : null}
    </ul>
  );
}
