import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { AttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import { GoalStatusChip } from "@/components/goals/GoalCollab";
import { WarriorAvatar } from "@/components/warriors/Avatar";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useProfile360, type Profile360Full } from "@/hooks/useProfile360";
import { niceDate } from "@/lib/calendar";
import { PROBATION_LABEL } from "@/lib/probation";
import { roleLabel, weeklyOffLabel } from "@/lib/warriors";

export const Route = createFileRoute("/_authenticated/people/$profileId")({
  head: () => ({
    meta: [
      { title: "Profile | CoachEasily Team App" },
      {
        name: "description",
        content: "One person: work, goals, attendance, leave and HR status in one place.",
      },
      { property: "og:title", content: "Profile | CoachEasily Team App" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const LEAVE_LABEL: Record<string, string> = {
  casual: "Casual",
  sick: "Sick",
  earned: "Earned",
  comp_off: "Comp-off",
  maternity: "Maternity",
  lwp: "Unpaid",
};

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`ce-card p-5 ${className ?? ""}`}>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <div className="mt-3 space-y-2 text-sm text-ink">{children}</div>
    </section>
  );
}

function Num({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-cream px-3 py-2 text-center">
      <div className={`font-display text-2xl ${tone ?? "text-ink"}`}>{value}</div>
      <div className="text-[10px] font-bold tracking-wider text-soft uppercase">{label}</div>
    </div>
  );
}

function Full({ p }: { p: Profile360Full }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const goalAvg = p.goals.length
    ? Math.round(p.goals.reduce((n, g) => n + g.pct, 0) / p.goals.length)
    : null;
  const a = p.attendance;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Probation and HR">
          <p>
            Joined {p.joined_on ? niceDate(p.joined_on) : "—"}
            {p.weekly_off ? ` · weekly off ${weeklyOffLabel(p.weekly_off)}` : ""}
          </p>
          {p.probation ? (
            <>
              <p>
                <b>{PROBATION_LABEL[p.probation.status] ?? p.probation.status}</b> · started{" "}
                {niceDate(p.probation.start_date)}, ends {niceDate(p.probation.end_date)}
              </p>
              {p.probation.status !== "confirmed" ? (
                <p className="text-[13px] text-soft">
                  {p.probation.days_left >= 0
                    ? `${p.probation.days_left} days left`
                    : `${-p.probation.days_left} days past the end date`}
                  {p.probation.decisions > 0
                    ? ` · ${p.probation.decisions} decision(s) so far`
                    : ""}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-soft">No probation record.</p>
          )}
          {p.hr_contact ? (
            <p className="text-[13px] text-soft">HR contact: {p.hr_contact.full_name}</p>
          ) : null}
        </Card>

        <Card title="This month's attendance">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Num label="Present" value={a.present} tone="text-emer" />
            <Num label="Late" value={a.late} tone={a.late ? "text-saffBtn" : "text-ink"} />
            <Num label="WFH" value={a.wfh} />
            <Num label="Half" value={a.half_day} />
            <Num label="Leave" value={a.leave} />
            <Num label="Absent" value={a.absent} tone={a.absent ? "text-red" : "text-ink"} />
          </div>
          <p className="text-[12px] text-soft">{a.working_days} working days so far this month.</p>
          <button
            type="button"
            className="min-h-11 text-[13px] font-bold text-violet"
            onClick={() => setShowCalendar((v) => !v)}
          >
            {showCalendar ? "Hide the calendar" : "Show the month calendar"}
          </button>
        </Card>
      </div>

      {showCalendar ? <AttendanceCalendar profileId={p.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Leave">
          <ul className="grid grid-cols-2 gap-2">
            {p.leave.balances.map((b) => (
              <li key={b.type} className="rounded-lg border border-line bg-cream px-3 py-2">
                <div className="text-[11px] font-bold tracking-wider text-soft uppercase">
                  {LEAVE_LABEL[b.type] ?? b.type}
                </div>
                <div className="font-display text-xl text-ink">{b.balance} left</div>
                <div className="text-[12px] text-soft">
                  {b.used} used · {b.pending} pending · {b.entitled} in all
                </div>
              </li>
            ))}
          </ul>
          {p.leave.recent.length > 0 ? (
            <ul className="space-y-1 pt-1">
              {p.leave.recent.map((l) => (
                <li key={l.id} className="text-[13px] text-soft">
                  {LEAVE_LABEL[l.type] ?? l.type} · {niceDate(l.from_date)}
                  {l.to_date !== l.from_date ? ` – ${niceDate(l.to_date)}` : ""} · {l.days} day
                  {l.days === 1 ? "" : "s"} · <b className="text-ink">{l.status}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-soft">No leave requests yet.</p>
          )}
        </Card>

        <Card title="Tasks (last 90 days)">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Num label="Assigned" value={p.tasks.total} />
            <Num label="Completed" value={p.tasks.completed} tone="text-emer" />
            <Num label="Pending" value={p.tasks.pending} />
            <Num label="In review" value={p.tasks.in_review} />
            <Num
              label="Overdue"
              value={p.tasks.overdue}
              tone={p.tasks.overdue ? "text-red" : "text-ink"}
            />
          </div>
          {p.tasks.completion_rate !== null ? (
            <div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-cream"
                role="progressbar"
                aria-valuenow={p.tasks.completion_rate}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Task completion rate"
              >
                <div
                  className="h-full rounded-full bg-emer"
                  style={{ width: `${Math.max(p.tasks.completion_rate, 2)}%` }}
                />
              </div>
              <p className="mt-1 text-[12px] text-soft">{p.tasks.completion_rate}% completed</p>
            </div>
          ) : (
            <p className="text-soft">No tasks in this window.</p>
          )}
        </Card>
      </div>

      <Card title={goalAvg === null ? "Goals" : `Goals · ${goalAvg}% on average`}>
        {p.goals.length === 0 ? (
          <p className="text-soft">No goals in the active cycle.</p>
        ) : (
          <ul className="space-y-1.5">
            {p.goals.map((g) => (
              <li key={g.goal_id} className="rounded-lg border border-line bg-white px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-semibold">{g.name}</span>
                  <GoalStatusChip status={g.status} />
                </div>
                <p className="mt-1 text-[12px] text-soft">
                  {Math.round(g.pct)}% done, an even pace would be {Math.round(g.expected_pct)}% ·{" "}
                  {g.milestones_done}/{g.milestones_total} milestones
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent activity and comments">
        {p.recent.length === 0 ? (
          <p className="text-soft">Nothing yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {p.recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex gap-2 text-[13px]">
                <span className="shrink-0 text-soft">
                  {new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                <span>
                  {r.kind === "goal_comment" ? "💬 " : ""}
                  {r.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Page() {
  const { profileId } = Route.useParams();
  const { data, isLoading, error } = useProfile360(profileId);
  const { data: mine } = useMyProfile();

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-4 py-2">
        {isLoading ? <p className="text-sm text-soft">Loading…</p> : null}
        {error ? (
          <p className="ce-card p-6 text-sm text-soft">
            This person couldn't be found, or isn't in your organisation.
          </p>
        ) : null}

        {data ? (
          <>
            <header className="ce-card flex flex-wrap items-center gap-4 p-5">
              <WarriorAvatar name={data.full_name} size={64} src={data.avatar_url} />
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-3xl leading-tight text-ink">{data.full_name}</h1>
                <p className="text-sm text-soft">
                  {[data.title, data.department].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                  {data.employee_code ? (
                    <span className="rounded-full bg-cream px-2 py-0.5 font-bold text-ink">
                      {data.employee_code}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-violet/12 px-2 py-0.5 font-bold text-violet">
                    {roleLabel(data.role)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-bold ${
                      data.status === "active" ? "bg-emer/15 text-emer" : "bg-red/12 text-red"
                    }`}
                  >
                    {data.status === "active"
                      ? "Active"
                      : `Exited${data.exited_on ? ` ${niceDate(data.exited_on)}` : ""}`}
                  </span>
                  {data.manager_id && data.manager_name ? (
                    <Link
                      to="/people/$profileId"
                      params={{ profileId: data.manager_id }}
                      className="font-bold text-violet"
                    >
                      Reports to {data.manager_name}
                    </Link>
                  ) : null}
                </p>
              </div>
              {mine?.profile?.id === data.id ? (
                <Link to="/profile" className="btn3d btn3d-ghost">
                  Edit my profile
                </Link>
              ) : null}
            </header>

            {data.access === "full" ? (
              <Full p={data} />
            ) : (
              <p className="ce-card p-6 text-sm leading-relaxed text-soft">
                This is the directory card. Work, goals, attendance and leave are visible to the
                person, their managers, HR and admin.
                {data.hr_contact ? ` HR contact: ${data.hr_contact.full_name}.` : ""}
              </p>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
