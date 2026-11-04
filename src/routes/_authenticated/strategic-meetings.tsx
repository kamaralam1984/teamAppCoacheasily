import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { useDeveloperAccess } from "@/hooks/useDeveloper";
import {
  meetingPeriod,
  useMeetingGoals,
  useMeetingGoalWrites,
  type GoalUpdate,
  type MeetingGoal,
} from "@/hooks/useMeetingGoals";
import { useMyProfile } from "@/hooks/useMyProfile";
import { meetingLabel, useStrategicMeetings } from "@/hooks/useStrategicMeetings";
import { useWarriors } from "@/hooks/useWarriors";
import { daysBetween, timeLabel, todayIso } from "@/lib/calendar";
import { downlineIds, shortDate } from "@/lib/warriors";

export const Route = createFileRoute("/_authenticated/strategic-meetings")({
  head: () => ({
    meta: [
      { title: "Strategic Meetings | CoachEasily Team App" },
      {
        name: "description",
        content: "Everyone's goals for the run-up to each strategic meeting, with a weekly update.",
      },
      { property: "og:title", content: "Strategic Meetings | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Everyone's goals for the run-up to each strategic meeting, with a weekly update.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StrategicMeetingsPage,
});

/** A cell you can type in; it saves when you leave it, and only if it changed. */
function Cell({
  value,
  onSave,
  placeholder,
  type = "text",
  multiline = false,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  multiline?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onSave(draft);
  };
  const base = `w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-ink hover:border-line focus:border-gold focus:bg-white focus:outline-none ${className}`;
  return multiline ? (
    <textarea
      rows={2}
      className={`${base} min-h-[52px] resize-y`}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
    />
  ) : (
    <input
      type={type}
      className={base}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function StrategicMeetingsPage() {
  const today = todayIso();
  const { data: me } = useMyProfile();
  const viewer = me?.profile ?? null;
  const { data: meetings, isLoading: meetingsLoading } = useStrategicMeetings(Boolean(viewer));
  const { data: warriors } = useWarriors();
  const { data: dev } = useDeveloperAccess(Boolean(viewer));

  const people = useMemo(
    () =>
      (warriors ?? [])
        .filter((p) => p.status === "active")
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [warriors],
  );

  // the next meeting by default, else the latest one
  const defaultMeeting = useMemo(() => {
    const list = meetings ?? [];
    return list.find((m) => m.meeting_date >= today) ?? list[list.length - 1] ?? null;
  }, [meetings, today]);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const meeting = (meetings ?? []).find((m) => m.id === (meetingId ?? defaultMeeting?.id)) ?? null;

  const [personId, setPersonId] = useState<string | null>(null);
  const activePerson = personId ?? viewer?.id ?? null;
  const person = people.find((p) => p.id === activePerson) ?? null;

  // who may write this table: HR and admin all, managers their team, everyone their own;
  // a developer who is none of those writes through the audited Developer route
  const direct = useMemo(() => {
    if (!viewer || !activePerson) return false;
    if (viewer.role === "hr" || viewer.role === "admin") return true;
    if (viewer.id === activePerson) return true;
    return downlineIds(warriors ?? [], viewer.id).has(activePerson);
  }, [viewer, activePerson, warriors]);
  const viaDev = !direct && Boolean(dev?.isDeveloper);
  const canWrite = direct || viaDev;

  const period = useMemo(
    () => (meeting ? meetingPeriod(meeting, meetings ?? []) : null),
    [meeting, meetings],
  );
  const { data, isLoading } = useMeetingGoals(meeting?.id ?? null, activePerson);
  const writes = useMeetingGoalWrites(meeting?.id ?? null, activePerson, viaDev);
  const goals: MeetingGoal[] = data?.goals ?? [];
  const updates = useMemo(() => {
    const map = new Map<string, GoalUpdate>();
    for (const u of data?.updates ?? []) map.set(`${u.goal_id}|${u.week_start}`, u);
    return map;
  }, [data]);

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : "That didn't save. Please try again.");

  const isHr = viewer?.role === "hr" || viewer?.role === "admin";
  const runDays = period ? daysBetween(period.from, period.to) + 1 : 0;

  return (
    <AppShell>
      <div className="space-y-5 py-2">
        <div className="ce-rise">
          <h1 className="font-display text-3xl text-ink">Strategic Meetings</h1>
          <p className="mt-1 text-sm text-soft">
            Everyone's goals for the run-up to each strategic meeting, with an update every week.
          </p>
        </div>

        {meetingsLoading ? (
          <div className="ce-card p-6 text-sm text-soft">Loading…</div>
        ) : !meeting ? (
          <div className="ce-card p-6 text-sm text-soft">
            No strategic meeting has been set yet.
            {isHr ? (
              <>
                {" "}
                Add one in{" "}
                <Link to="/settings" className="font-bold text-goldD underline">
                  Admin settings
                </Link>
                .
              </>
            ) : (
              " HR will add the next one."
            )}
          </div>
        ) : (
          <>
            <section className="ce-card grid gap-3 p-4 sm:grid-cols-2">
              <label>
                <span className="ce-label">Meeting</span>
                <select
                  className="ce-input"
                  value={meeting.id}
                  onChange={(e) => setMeetingId(e.target.value)}
                >
                  {(meetings ?? [])
                    .slice()
                    .reverse()
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {meetingLabel(m)} · {shortDate(m.meeting_date)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span className="ce-label">Person</span>
                <select
                  className="ce-input"
                  value={activePerson ?? ""}
                  onChange={(e) => setPersonId(e.target.value)}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                      {p.id === viewer?.id ? " (you)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="ce-card overflow-hidden">
              <div className="bg-night px-4 py-3 text-center text-white">
                <p className="font-display text-xl">
                  {person ? `${person.full_name} — ` : ""}Goals for next {runDays} days
                </p>
                <p className="text-[12px] font-bold tracking-[0.08em] text-goldL uppercase">
                  {period ? `${shortDate(period.from)} to ${shortDate(period.to)}` : ""} ·{" "}
                  {meetingLabel(meeting)}
                </p>
                {meeting.tagline || meeting.from_time || meeting.location ? (
                  <p className="mt-0.5 text-[12px] text-mist">
                    {[meeting.tagline, timeLabel(meeting.from_time), meeting.location]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>

              {!canWrite ? (
                <p className="border-b border-line bg-cream px-4 py-2 text-[12px] text-soft">
                  You can read this table. {person?.full_name.split(" ")[0] ?? "They"}, their
                  manager and HR can change it.
                </p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-left">
                  <thead>
                    <tr className="bg-gold/25 text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
                      <th className="w-10 border border-line px-2 py-2 text-center">No</th>
                      <th className="min-w-[220px] border border-line px-2 py-2">Goal / Task</th>
                      <th className="min-w-[120px] border border-line px-2 py-2">Measure</th>
                      <th className="w-[140px] border border-line px-2 py-2">Timeline</th>
                      <th className="min-w-[110px] border border-line px-2 py-2">Outcome</th>
                      {period?.weeks.map((w) => (
                        <th key={w} className="min-w-[170px] border border-line bg-emer/15 px-2 py-2">
                          Week of {shortDate(w)}
                        </th>
                      ))}
                      {canWrite ? <th className="w-10 border border-line" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={99} className="px-4 py-6 text-sm text-soft">
                          Loading…
                        </td>
                      </tr>
                    ) : goals.length === 0 ? (
                      <tr>
                        <td colSpan={99} className="px-4 py-6 text-sm text-soft">
                          No goals written for this meeting yet.
                        </td>
                      </tr>
                    ) : (
                      goals.map((g, i) => (
                        <tr key={g.id} className="align-top odd:bg-white even:bg-cream/50">
                          <td className="border border-line px-2 py-2 text-center text-[13px] font-bold text-ink">
                            {i + 1}
                          </td>
                          {canWrite ? (
                            <>
                              <td className="border border-line p-0.5">
                                <Cell
                                  multiline
                                  className="font-bold"
                                  value={g.title}
                                  placeholder="Increase show up rate of …"
                                  onSave={(v) => writes.saveGoal.mutate({ id: g.id, values: { title: v } }, { onError: fail })}
                                />
                              </td>
                              <td className="border border-line p-0.5">
                                <Cell
                                  value={g.measure ?? ""}
                                  placeholder="200+"
                                  onSave={(v) =>
                                    writes.saveGoal.mutate({ id: g.id, values: { measure: v.trim() || null } }, { onError: fail })
                                  }
                                />
                              </td>
                              <td className="border border-line p-0.5">
                                <Cell
                                  type="date"
                                  value={g.timeline ?? ""}
                                  onSave={(v) =>
                                    writes.saveGoal.mutate({ id: g.id, values: { timeline: v || null } }, { onError: fail })
                                  }
                                />
                              </td>
                              <td className="border border-line p-0.5">
                                <Cell
                                  multiline
                                  className="font-bold text-emer"
                                  value={g.outcome ?? ""}
                                  placeholder="105% Achieved"
                                  onSave={(v) =>
                                    writes.saveGoal.mutate({ id: g.id, values: { outcome: v.trim() || null } }, { onError: fail })
                                  }
                                />
                              </td>
                              {period?.weeks.map((w) => {
                                const u = updates.get(`${g.id}|${w}`);
                                return (
                                  <td key={w} className="border border-line p-0.5">
                                    <Cell
                                      multiline
                                      value={u?.note ?? ""}
                                      placeholder="This week…"
                                      onSave={(v) =>
                                        writes.saveUpdate.mutate(
                                          { goalId: g.id, weekStart: w, note: v, by: viewer?.id ?? null, exists: Boolean(u) },
                                          { onError: fail },
                                        )
                                      }
                                    />
                                  </td>
                                );
                              })}
                              <td className="border border-line px-1 py-2 text-center">
                                <button
                                  type="button"
                                  aria-label="Remove this goal"
                                  className="rounded px-1.5 text-[16px] text-red hover:bg-red/10"
                                  onClick={() => {
                                    if (!window.confirm("Remove this goal and its weekly updates?")) return;
                                    writes.deleteGoal.mutate(g.id, { onError: fail });
                                  }}
                                >
                                  ×
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="border border-line px-2 py-2 text-[13px] font-bold whitespace-pre-line text-ink">
                                {g.title || "—"}
                              </td>
                              <td className="border border-line px-2 py-2 text-[13px] text-ink">{g.measure ?? ""}</td>
                              <td className="border border-line px-2 py-2 text-[13px] text-ink">
                                {g.timeline ? shortDate(g.timeline) : ""}
                              </td>
                              <td className="border border-line px-2 py-2 text-[13px] font-bold text-emer">
                                {g.outcome ?? ""}
                              </td>
                              {period?.weeks.map((w) => (
                                <td key={w} className="border border-line px-2 py-2 text-[12px] whitespace-pre-line text-ink">
                                  {updates.get(`${g.id}|${w}`)?.note ?? ""}
                                </td>
                              ))}
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {canWrite ? (
                <div className="border-t border-line p-3">
                  <button
                    type="button"
                    className="btn3d btn3d-gold"
                    disabled={writes.addGoal.isPending || !viewer}
                    onClick={() =>
                      viewer &&
                      writes.addGoal.mutate(
                        {
                          orgId: viewer.org_id,
                          position: (goals[goals.length - 1]?.position ?? 0) + 10,
                          createdBy: viewer.id,
                        },
                        { onError: fail },
                      )
                    }
                  >
                    + Add goal
                  </button>
                  <span className="ml-3 text-[12px] text-soft">
                    Type in any cell; it saves when you click away.
                  </span>
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
