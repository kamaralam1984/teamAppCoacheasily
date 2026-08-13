import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { Celebrate } from "@/components/Celebrate";
import { Mark } from "@/components/Mark";
import {
  useAttendanceHistory,
  useAttendanceSummary,
  useMarkAttendance,
} from "@/hooks/useAttendance";
import { useMyProfile } from "@/hooks/useMyProfile";

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
  const pendingLeave: number = 0; // leave requests land in a later screen

  const marked = summary?.marked_today ?? false;
  const days = summary?.days_marked ?? 0;
  const toNext = summary?.to_next_leave ?? 20;
  const progress = ((days % 20) / 20) * 100;
  const streak = summary?.streak ?? 0;

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

        {/* ── Work meter ─────────────────────────────────────── */}
        <section className="ce-rise ce-card p-6" style={{ animationDelay: "80ms" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl text-ink">
              🔥 {days} {days === 1 ? "day" : "days"} worked in the app
            </h2>
            <p className="text-[13px] font-semibold text-goldD">
              {toNext} more and you earn a paid leave
            </p>
          </div>

          <div
            className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-cream"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={20}
            aria-valuenow={days % 20}
            aria-label="Progress to your next earned leave"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-goldL transition-[width] duration-500"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-soft">
            Starts the day you first mark attendance here. 1 paid leave for every 20 days.
          </p>

          {streak >= 2 ? (
            <p className="mt-3 text-[13px] font-semibold text-emer">
              {streak} days in a row — just for you, never on a leaderboard.
            </p>
          ) : null}

          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-5">
            <div>
              <dt className="text-[11px] font-bold tracking-[0.12em] text-soft uppercase">
                Earned leave available
              </dt>
              <dd className="mt-1 font-display text-3xl text-ink">
                {summary?.earned_available ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold tracking-[0.12em] text-soft uppercase">
                Comp-offs in hand
              </dt>
              <dd className="mt-1 font-display text-3xl text-ink">
                {summary?.comp_off_available ?? 0}
              </dd>
            </div>
          </dl>
        </section>

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
