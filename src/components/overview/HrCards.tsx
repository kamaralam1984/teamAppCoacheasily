import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { useHolidays } from "@/hooks/useAttendance";
import type { DashHr } from "@/hooks/useDashboards";
import { useWarriors } from "@/hooks/useWarriors";
import { KIND_LABEL, KIND_STYLE, type DayKind } from "@/lib/attendanceKinds";
import { nextBirthday } from "@/lib/birthdays";
import { niceDate } from "@/lib/calendar";
import { addDays, istToday } from "@/lib/tasks";

function Card({ title, children, to }: { title: string; children: React.ReactNode; to?: string }) {
  return (
    <section className="ce-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-xl text-ink">{title}</h2>
        {to ? (
          <Link to={to} className="text-[12px] font-bold text-violet">
            Open →
          </Link>
        ) : null}
      </div>
      <div className="mt-3 space-y-2 text-sm text-ink">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-soft">{children}</p>;
}

function Num({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-cream px-3 py-2 text-center">
      <div className={`font-display text-2xl ${tone ?? "text-ink"}`}>{value}</div>
      <div className="text-[10px] font-bold tracking-wider text-soft uppercase">{label}</div>
    </div>
  );
}

const TODAY_KINDS: DayKind[] = [
  "present",
  "late",
  "wfh",
  "half_day",
  "leave",
  "absent",
  "not_marked",
];

/** Organisation-wide numbers for HR and the boss. */
export function HrCards({ data }: { data: DashHr }) {
  const { data: holidays } = useHolidays();
  const { data: people } = useWarriors();
  const today = istToday();

  const upcomingHolidays = (holidays ?? []).filter((h) => h.date >= today).slice(0, 3);
  const birthdays = useMemo(() => {
    const horizon = addDays(today, 14);
    return (people ?? [])
      .filter((p) => p.status === "active")
      .map((p) => ({ name: p.full_name, on: nextBirthday(p.birthday, today) }))
      .filter(
        (b): b is { name: string; on: string } => Boolean(b.on) && (b.on as string) <= horizon,
      )
      .sort((a, b) => a.on.localeCompare(b.on))
      .slice(0, 6);
  }, [people, today]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="People" to="/warriors">
        <div className="grid grid-cols-3 gap-2">
          <Num label="Active" value={data.headcount.active} />
          <Num label="Exited" value={data.headcount.exited} />
          <Num label="Joined, 30 days" value={data.new_joiners.length} />
        </div>
        {data.new_joiners.length > 0 ? (
          <p className="text-[13px] text-soft">
            New:{" "}
            {data.new_joiners.map((j) => `${j.full_name} (${niceDate(j.joined_on)})`).join(", ")}
          </p>
        ) : null}
      </Card>

      <Card title="Attendance today" to="/attendance">
        <ul className="flex flex-wrap gap-1.5">
          {TODAY_KINDS.filter((k) => (data.attendance.today[k] ?? 0) > 0).map((k) => (
            <li
              key={k}
              className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${KIND_STYLE[k]}`}
            >
              {KIND_LABEL[k]}: {data.attendance.today[k]}
            </li>
          ))}
        </ul>
        <p className="text-[12px] font-bold tracking-wider text-soft uppercase">
          Exceptions on {niceDate(data.attendance.last_working_day)}
        </p>
        {data.attendance.absent.length === 0 && data.attendance.late.length === 0 ? (
          <Empty>Nobody was absent or late.</Empty>
        ) : (
          <>
            {data.attendance.absent.length > 0 ? (
              <p>
                <b className="text-red">Absent:</b>{" "}
                {data.attendance.absent.map((a) => a.full_name).join(", ")}
              </p>
            ) : null}
            {data.attendance.late.length > 0 ? (
              <p>
                <b className="text-saffBtn">Late:</b>{" "}
                {data.attendance.late
                  .map((a) => (a.check_in ? `${a.full_name} (${a.check_in})` : a.full_name))
                  .join(", ")}
              </p>
            ) : null}
          </>
        )}
      </Card>

      <Card title="Leave waiting for a decision" to="/approvals">
        {data.leave.pending_count === 0 ? (
          <Empty>Nothing is waiting.</Empty>
        ) : (
          <ul className="space-y-1">
            {data.leave.pending.map((l) => (
              <li key={l.id}>
                <b>{l.full_name}</b> · {l.type} · {niceDate(l.from_date)}
                {l.to_date !== l.from_date ? ` – ${niceDate(l.to_date)}` : ""} ({l.days} day
                {l.days === 1 ? "" : "s"})
              </li>
            ))}
            {data.leave.pending_count > data.leave.pending.length ? (
              <li className="text-[13px] text-soft">
                and {data.leave.pending_count - data.leave.pending.length} more
              </li>
            ) : null}
          </ul>
        )}
      </Card>

      <Card title="Probation" to="/warriors">
        <p className="text-[13px] text-soft">{data.probation.on_probation} on probation</p>
        {data.probation.ending_soon.length === 0 ? (
          <Empty>Nobody's probation ends in the next 14 days.</Empty>
        ) : (
          <ul className="space-y-1">
            {data.probation.ending_soon.map((p) => (
              <li key={p.profile_id}>
                <b>{p.full_name}</b> · ends {niceDate(p.end_date)}{" "}
                <span className="text-[12px] text-soft">
                  ({p.days_left < 0 ? `${-p.days_left} days over` : `${p.days_left} days left`})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Earned leave" to="/settings">
        <div className="grid grid-cols-2 gap-2">
          <Num label="Credits, 30 days" value={data.earned_leave.credits_30d} />
          <Num label="Lapsed, 30 days" value={data.earned_leave.lapses_30d} />
        </div>
        {data.earned_leave.exceptions.length === 0 ? (
          <Empty>No capped credits or lapses lately.</Empty>
        ) : (
          <ul className="space-y-1">
            {data.earned_leave.exceptions.map((e, i) => (
              <li key={`${e.profile_id}-${i}`}>
                <b>{e.full_name}</b>{" "}
                {e.kind === "capped"
                  ? `hit the maximum balance (${e.days} not credited)`
                  : `lost ${e.days} day(s) at the new leave year`}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Goals" to="/team">
        <div className="grid grid-cols-4 gap-2">
          <Num label="On track" value={data.goals.on_track} tone="text-emer" />
          <Num
            label="At risk"
            value={data.goals.at_risk}
            tone={data.goals.at_risk ? "text-saffBtn" : "text-ink"}
          />
          <Num
            label="Overdue"
            value={data.goals.overdue}
            tone={data.goals.overdue ? "text-red" : "text-ink"}
          />
          <Num label="Done" value={data.goals.completed} tone="text-violet" />
        </div>
      </Card>

      <Card title="Tasks" to="/tasks">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Num label="Open" value={data.tasks.open} />
          <Num label="In progress" value={data.tasks.in_progress} />
          <Num label="In review" value={data.tasks.review} />
          <Num
            label="Overdue"
            value={data.tasks.overdue}
            tone={data.tasks.overdue ? "text-red" : "text-ink"}
          />
          <Num label="Done, 7 days" value={data.tasks.completed_7d} tone="text-emer" />
        </div>
      </Card>

      <Card title="Coming up" to="/calendar">
        {upcomingHolidays.length === 0 && birthdays.length === 0 ? (
          <Empty>No holidays or birthdays soon.</Empty>
        ) : null}
        {upcomingHolidays.map((h) => (
          <p key={h.id}>
            🎉 {h.name} · {niceDate(h.date)}
          </p>
        ))}
        {birthdays.map((b) => (
          <p key={`${b.name}-${b.on}`}>
            🎂 {b.name} · {niceDate(b.on)}
          </p>
        ))}
      </Card>
    </div>
  );
}
