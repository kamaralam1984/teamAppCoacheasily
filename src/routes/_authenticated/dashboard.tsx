import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { Celebrate } from "@/components/Celebrate";
import { DailyCodeModal } from "@/components/DailyCodeModal";
import { TodayFocus } from "@/components/TodayFocus";
import { PresenceBoard } from "@/components/PresenceBoard";
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
import {
  DEFAULT_MEETING_TIME,
  prettyTime,
  punchMessage,
} from "@/lib/punctuality";
import { shortDate } from "@/lib/warriors";


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
        <section className="ce-rise overflow-hidden rounded-[14px] bg-night p-6 text-white shadow-[0_10px_30px_rgba(23,17,38,0.18)] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[11px] font-bold tracking-[0.16em] text-mist uppercase">
              {weekday} · {date}
            </p>
            <Mark size={34} color="var(--ce-goldL)" />
          </div>

          <h1 className="mt-5 font-display text-4xl leading-tight text-white sm:text-5xl">
            Namaste, {profile?.full_name?.split(" ")[0] ?? "warrior"}
          </h1>
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
        </section>

        {/* ── Work meter (no leave balances here — we celebrate work) ─ */}
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

        <DailyNumbers
          cycle={activeCycle}
          goals={myGoals ?? []}
          onCelebrate={(m: string) => setCelebration({ message: m })}
          style={{ animationDelay: "60ms" }}
        />

        <PunctualityCard
          me={punc}
          meetingTime={prettyTime(meetingTime)}
          style={{ animationDelay: "70ms" }}
        />

        <WorkMeter summary={summary} style={{ animationDelay: "80ms" }} />

        <PresenceBoard rows={presence ?? []} style={{ animationDelay: "120ms" }} />

        {profile ? (
          <Rituals
            me={profile}
            onCelebrate={(m: string) => setCelebration({ message: m })}
            style={{ animationDelay: "140ms" }}
          />
        ) : null}




        {/* ── Recent attendance, newest first ────────────────── */}
        {history && history.length > 0 ? (
          <section className="ce-rise ce-card p-6" style={{ animationDelay: "160ms" }}>
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
