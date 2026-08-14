import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { Celebrate } from "@/components/Celebrate";
import { DailyCodeModal } from "@/components/DailyCodeModal";
import { TodayFocus } from "@/components/TodayFocus";
import { TodayAt } from "@/components/dashboard/TodayAt";
import { WinTheDay } from "@/components/dashboard/WinTheDay";
import { MyTasksCard } from "@/components/dashboard/MyTasksCard";
import { MyGoalsCard } from "@/components/dashboard/MyGoalsCard";
import { BirthdayCard } from "@/components/dashboard/BirthdayCard";
import { ComingUp } from "@/components/dashboard/ComingUp";
import { Announcements } from "@/components/dashboard/Announcements";
import { PunctualityCard } from "@/components/Punctuality";
import { DailyNumbers } from "@/components/goals/DailyNumbers";
import { Mark } from "@/components/Mark";
import { WorkMeter } from "@/components/WorkMeter";
import { Rituals } from "@/components/culture/Rituals";

import {
  useAttendanceHistory,
  useAttendanceSummary,
  useMarkAttendance,
} from "@/hooks/useAttendance";
import { usePresenceToday, useTodayCode } from "@/hooks/useDailyCode";
import { useCycles, useEveningNudge, useGoalsFor } from "@/hooks/useGoals";
import { usePendingApprovals } from "@/hooks/useLeave";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useOrgSettings, usePunctualityMe } from "@/hooks/useOrg";
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import { useWarriors } from "@/hooks/useWarriors";
import { useNextDays } from "@/hooks/useCalendar";
import { useAnnouncements } from "@/hooks/useReports";
import {
  DEFAULT_MEETING_TIME,
  prettyTime,
  punchMessage,
} from "@/lib/punctuality";
import { shortDate } from "@/lib/warriors";
import { birthdaysOn, firstName, isBirthdayToday, istToday } from "@/lib/birthdays";
import { useTheme } from "@/hooks/useTheme";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home | CoachEasily Team App" },
      {
        name: "description",
        content:
          "Mark your attendance, watch your earned leave grow and start the day with your team.",
      },
      { property: "og:title", content: "Home | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "Mark your attendance, watch your earned leave grow and start the day with your team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const IST = "Asia/Kolkata";

function todayParts() {
  const now = new Date();
  return {
    weekday: now.toLocaleDateString("en-GB", { weekday: "long", timeZone: IST }),
    date: now.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: IST,
    }),
  };
}


function Dashboard() {
  const { theme } = useTheme();
  const { data } = useMyProfile();
  const profile = data?.profile ?? null;

  const { data: summary } = useAttendanceSummary(profile ? undefined : null);
  const { data: history } = useAttendanceHistory(profile?.id ?? null, 7);
  const mark = useMarkAttendance(profile?.id ?? null, profile?.org_id ?? null);

  interface Cheer {
    message: string;
    action?: { label: string; href: string } | null;
    quiet?: boolean;
  }
  const [celebration, setCelebration] = useState<Cheer | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const { data: todayCode, isLoading: codeLoading } = useTodayCode(Boolean(profile));
  const { data: presence } = usePresenceToday(Boolean(profile));
  const { weekday, date } = todayParts();

  const canReview =
    profile?.role === "manager" || profile?.role === "hr" || profile?.role === "admin";
  const { data: pending } = usePendingApprovals(Boolean(profile) && canReview);
  const pendingLeave = pending?.length ?? 0;

  const marked = summary?.marked_today ?? false;

  const { data: org } = useOrgSettings(Boolean(profile));
  const { data: punc } = usePunctualityMe(Boolean(profile));
  const meetingTime = org?.daily_meeting_time || DEFAULT_MEETING_TIME;
  const meetingUrl = org?.daily_meeting_url ?? "";
  const mondayKey = `ce-monday-review-${summary?.today ?? "today"}`;
  const [mondayDone, setMondayDone] = useState(false);
  useEffect(() => {
    setMondayDone(window.localStorage.getItem(mondayKey) === "1");
  }, [mondayKey]);
  const isMonday =
    new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: IST }) === "Monday";

  const { data: cycles } = useCycles();
  const activeCycle = useMemo(() => cycles?.find((c) => c.status === "active") ?? null, [cycles]);
  const { data: myGoals } = useGoalsFor(profile ? undefined : null, activeCycle?.id ?? null);
  useEveningNudge(Boolean(profile) && marked);

  const { data: tasks } = useTasks(profile?.id ?? null);
  const updateTask = useUpdateTask();
  const { data: people } = useWarriors();
  const { data: cal } = useNextDays(45);
  const { data: announcements } = useAnnouncements(Boolean(profile));
  const roster = people ?? [];
  const founderId = useMemo(
    () => roster.find((p) => p.status === "active" && !p.manager_id)?.id ?? null,
    [roster],
  );


  /* ── Birthdays ─────────────────────────────────────────── */
  const istDay = istToday();
  const myBirthday = isBirthdayToday(profile);
  const showBirthdays = org?.team_birthdays !== false;
  const othersToday = useMemo(
    () =>
      showBirthdays
        ? birthdaysOn(roster, istDay).filter((p) => p.id !== profile?.id)
        : [],
    [roster, istDay, profile?.id, showBirthdays],
  );

  /** Once a day, on first load — never on every navigation. */
  const birthdayKey = `ce-birthday-${profile?.id ?? "me"}-${istDay}`;
  useEffect(() => {
    if (!profile || !myBirthday) return;
    if (window.localStorage.getItem(birthdayKey) === "1") return;
    window.localStorage.setItem(birthdayKey, "1");
    setCelebration({
      message: `Happy birthday, ${firstName(profile.full_name)}. 🎉 The whole team is glad you're here.`,
    });
  }, [profile, myBirthday, birthdayKey]);

  const onMark = (focus: string) => {
    mark.mutate(focus, {
      onError: () => undefined,
      onSuccess: (res) => {
        setCodeOpen(false);
        const earlyCount = (punc?.early ?? 0) + (res.onTime ? 1 : 0);
        const lines = [punchMessage(res.onTime, res.at, earlyCount)];
        if (res.compOffReason) {
          lines.push(`⚖️ You worked on ${res.compOffReason} — 1 comp-off is yours.`);
        } else if (res.milestone) {
          lines.push(`${res.daysMarked} days worked — you have just earned another paid leave.`);
        }
        setCelebration({
          message: lines.join(" "),
          quiet: !res.onTime,
          action: meetingUrl
            ? { label: `Join the ${prettyTime(meetingTime)} standup →`, href: meetingUrl }
            : null,
        });
      },
    });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        {/* ── Hero ───────────────────────────────────────────── */}
        <section
          className="ce-rise relative overflow-hidden rounded-[14px] bg-night p-6 text-white shadow-[0_10px_30px_rgba(23,17,38,0.18)] sm:p-8"
        >
          {myBirthday ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--ce-goldL) 42%, transparent) 0%, transparent 70%)",
              }}
            />
          ) : null}
          <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[11px] font-bold tracking-[0.16em] text-mist uppercase">
              {weekday} · {date}
            </p>
            <Mark size={34} color="var(--ce-goldL)" />
          </div>

          <h1 className="mt-5 font-display text-4xl leading-tight text-white sm:text-5xl">
            {myBirthday ? "Happy birthday, " : "Namaste, "}
            {profile?.full_name?.split(" ")[0] ?? "warrior"}
            {myBirthday ? " 🎂" : ""}
          </h1>
          {myBirthday ? (
            <p className="mt-2 text-sm font-bold text-goldL">
              The whole team is glad you're here. Have a wonderful day.
            </p>
          ) : null}
          <p className="mt-2 text-sm text-mist">
            {profile?.title ? `${profile.title} · ` : ""}
            {profile?.department ?? "CoachEasily"}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            {marked ? (
              <div className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emer px-5 text-[15px] font-bold text-white sm:w-auto">
                <span aria-hidden>✓</span> Present today ·{" "}
                {summary ? shortDate(summary.today) : date}
              </div>
            ) : (
              <button
                type="button"
                className="btn3d w-full sm:w-auto"
                onClick={() => setCodeOpen(true)}
                disabled={mark.isPending || !profile}
              >
                Mark attendance ({prettyTime(meetingTime)})
              </button>
            )}

            {marked && meetingUrl ? (
              <a
                href={meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-goldL px-4 text-[13px] font-bold text-night sm:w-auto"
              >
                Join the {prettyTime(meetingTime)} standup →
              </a>
            ) : null}

            {canReview ? (
              <a
                href="/approvals"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-goldL/40 bg-goldL/15 px-4 text-[13px] font-bold text-goldL sm:w-auto"
              >
                {pendingLeave} leave {pendingLeave === 1 ? "request" : "requests"} to review →
              </a>
            ) : null}
          </div>

          {marked && profile && summary ? (
            <TodayFocus profileId={profile.id} today={summary.today} />
          ) : null}

          {!marked ? (
            <p className="mt-4 text-[13px] leading-relaxed text-mist">
              The standup room opens for you the moment you mark attendance.
            </p>
          ) : null}

          {mark.isError ? (
            <p className="mt-4 text-[13px] font-semibold text-goldL">
              That didn't go through. Please try again.
            </p>
          ) : null}
          </div>
        </section>

        {profile && othersToday.length > 0 ? (
          <BirthdayCard
            me={profile}
            celebrants={othersToday}
            style={{ animationDelay: "20ms" }}
          />
        ) : null}

        {theme.greeting ? (
          <section
            className="ce-rise ce-card flex items-start gap-3 p-5"
            style={{ animationDelay: "30ms" }}
          >
            <span aria-hidden className="text-2xl leading-none">
              {theme.emoji}
            </span>
            <div>
              <p className="ce-label">{theme.name}</p>
              <p className="font-display text-xl leading-snug text-ink">{theme.greeting}</p>
            </div>
          </section>
        ) : null}

        {/* ── The twenty-second habit, high up ───────────────── */}
        {isMonday && !mondayDone ? (
          <a
            href="/goals?review=1"
            onClick={() => {
              window.localStorage.setItem(mondayKey, "1");
              setMondayDone(true);
            }}
            className="ce-rise ce-card block p-6"
            style={{ animationDelay: "40ms" }}
          >
            <p className="ce-label">Monday</p>
            <h2 className="mt-1 font-display text-2xl text-ink">
              It's Monday — review your goals before the {prettyTime(meetingTime)} standup
            </h2>
            <p className="mt-1 text-[13px] text-soft">
              Big type, one goal at a time. Ready to share on the call. →
            </p>
          </a>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <WinTheDay
            tasks={tasks}
            meId={profile?.id ?? null}
            onToggle={(t) =>
              updateTask.mutate({
                id: t.id,
                patch: { done: !t.done, done_at: t.done ? null : new Date().toISOString() },
              })
            }
            style={{ animationDelay: "50ms" }}
          />
          {profile ? (
            <Rituals
              me={profile}
              onCelebrate={(m: string) => setCelebration({ message: m })}
              style={{ animationDelay: "60ms" }}
            />
          ) : null}
        </div>

        <TodayAt
          today={summary?.today ?? new Date().toISOString().slice(0, 10)}
          data={cal}
          presence={presence ?? []}
          people={roster}
          style={{ animationDelay: "70ms" }}
        />

        <DailyNumbers
          cycle={activeCycle}
          goals={myGoals ?? []}
          onCelebrate={(m: string) => setCelebration({ message: m })}
          style={{ animationDelay: "80ms" }}
        />

        <PunctualityCard
          me={punc}
          meetingTime={prettyTime(meetingTime)}
          style={{ animationDelay: "90ms" }}
        />

        {/* ── Work meter (no leave balances here — we celebrate work) ─ */}
        <WorkMeter summary={summary} style={{ animationDelay: "100ms" }} />

        <MyTasksCard tasks={tasks} meId={profile?.id ?? null} style={{ animationDelay: "110ms" }} />

        <MyGoalsCard
          goals={myGoals ?? []}
          cycle={activeCycle}
          style={{ animationDelay: "120ms" }}
        />


        <ComingUp
          data={cal}
          people={roster}
          me={profile}
          showTeamBirthdays={Boolean(org?.team_birthdays)}
          founderId={founderId}
          style={{ animationDelay: "150ms" }}
        />

        <Announcements items={announcements} style={{ animationDelay: "160ms" }} />

        {/* ── Recent attendance, newest first ────────────────── */}
        {history && history.length > 0 ? (
          <section className="ce-rise ce-card p-6" style={{ animationDelay: "170ms" }}>
            <h2 className="font-display text-2xl text-ink">Your recent days</h2>
            <ul className="mt-4 space-y-2.5">
              {history.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink">{shortDate(row.date)}</span>
                  <span className="text-[13px] text-soft">
                    Marked at{" "}
                    {new Date(row.marked_at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: IST,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {codeOpen ? (
        <DailyCodeModal
          code={todayCode ?? null}
          loading={codeLoading}
          pending={mark.isPending}
          error={mark.isError}
          onClose={() => setCodeOpen(false)}
          onPledge={onMark}
        />
      ) : null}

      {celebration ? (
        <Celebrate
          message={celebration.message}
          action={celebration.action ?? null}
          quiet={celebration.quiet ?? false}
          onDone={() => setCelebration(null)}
        />
      ) : null}
    </AppShell>
  );
}
