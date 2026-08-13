import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { Celebrate } from "@/components/Celebrate";
import { DailyNumbers } from "@/components/goals/DailyNumbers";
import { Mark } from "@/components/Mark";
import { WorkMeter } from "@/components/WorkMeter";
import {
  useAttendanceHistory,
  useAttendanceSummary,
  useMarkAttendance,
} from "@/hooks/useAttendance";
import { useCycles, useEveningNudge, useGoalsFor } from "@/hooks/useGoals";
import { usePendingApprovals } from "@/hooks/useLeave";
import { useMyProfile } from "@/hooks/useMyProfile";
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

  const [celebration, setCelebration] = useState<string | null>(null);
  const { weekday, date } = todayParts();

  const canReview =
    profile?.role === "manager" || profile?.role === "hr" || profile?.role === "admin";
  const { data: pending } = usePendingApprovals(Boolean(profile) && canReview);
  const pendingLeave = pending?.length ?? 0;

  const marked = summary?.marked_today ?? false;

  const { data: cycles } = useCycles();
  const activeCycle = useMemo(() => cycles?.find((c) => c.status === "active") ?? null, [cycles]);
  const { data: myGoals } = useGoalsFor(profile ? undefined : null, activeCycle?.id ?? null);
  useEveningNudge(Boolean(profile) && marked);


  const onMark = () => {
    mark.mutate(undefined, {
      onSuccess: (res) => {
        if (res.compOffReason) {
          setCelebration(`⚖️ You worked on ${res.compOffReason} — 1 comp-off is yours.`);
        } else if (res.milestone) {
          setCelebration(
            `🔥 ${res.daysMarked} days worked — you have just earned another paid leave.`,
          );
        } else {
          setCelebration(`Attendance marked for ${shortDate(res.date)}. Have a strong day.`);
        }
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
                onClick={onMark}
                disabled={mark.isPending || !profile}
              >
                {mark.isPending ? "Marking…" : "Mark attendance (11:00 AM)"}
              </button>
            )}

            {canReview ? (
              <a
                href="/approvals"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-goldL/40 bg-goldL/15 px-4 text-[13px] font-bold text-goldL sm:w-auto"
              >
                {pendingLeave} leave {pendingLeave === 1 ? "request" : "requests"} to review →
              </a>
            ) : null}
          </div>

          {mark.isError ? (
            <p className="mt-4 text-[13px] font-semibold text-goldL">
              That didn't go through. Please try again.
            </p>
          ) : null}
        </section>

        {/* ── Work meter (no leave balances here — we celebrate work) ─ */}
        {/* ── The twenty-second habit, high up ───────────────── */}
        <DailyNumbers
          cycle={activeCycle}
          goals={myGoals ?? []}
          onCelebrate={setCelebration}
          style={{ animationDelay: "60ms" }}
        />

        <WorkMeter summary={summary} style={{ animationDelay: "80ms" }} />



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

      {celebration ? (
        <Celebrate message={celebration} onDone={() => setCelebration(null)} />
      ) : null}
    </AppShell>
  );
}
