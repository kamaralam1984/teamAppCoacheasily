import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { AttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import { CorrectionDialog } from "@/components/attendance/CorrectionDialog";
import { CorrectionsLog } from "@/components/attendance/CorrectionsLog";
import { RangeReport } from "@/components/attendance/RangeReport";
import { TeamDay } from "@/components/attendance/TeamDay";
import { useMyProfile } from "@/hooks/useMyProfile";
import type { DayInfo } from "@/lib/attendanceKinds";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance | CoachEasily Team App" },
      {
        name: "description",
        content: "Your month of attendance, and for managers and HR, who is in, late or absent.",
      },
      { property: "og:title", content: "Attendance | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Your month of attendance, and for managers and HR, who is in, late or absent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Tab = "calendar" | "team" | "report";

interface Subject {
  id: string;
  name: string;
}

function Page() {
  const { data } = useMyProfile();
  const me = data?.profile ?? null;
  const isHr = me?.role === "hr" || me?.role === "admin";
  const isLead = isHr || me?.role === "manager";

  const [tab, setTab] = useState<Tab>("calendar");
  /** whose calendar is open; null means the signed-in person's own */
  const [viewing, setViewing] = useState<Subject | null>(null);
  const [fixing, setFixing] = useState<{ subject: Subject; day: DayInfo } | null>(null);

  const subject = viewing ?? (me ? { id: me.id, name: me.full_name } : null);
  const looksAtSelf = !viewing || viewing.id === me?.id;

  const tabs: { id: Tab; label: string }[] = [
    { id: "calendar", label: "Calendar" },
    ...(isLead ? [{ id: "team" as const, label: "Team on a day" }] : []),
    ...(isLead ? [{ id: "report" as const, label: "Report" }] : []),
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <header className="ce-rise">
          <h1 className="font-display text-4xl text-ink">Attendance</h1>
          <p className="mt-1 text-sm text-soft">
            {isLead
              ? "Your month, and who is in, late or absent across your team."
              : "Your month at a glance."}
          </p>
        </header>

        {tabs.length > 1 ? (
          <nav className="flex flex-wrap gap-2" aria-label="Attendance sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? "page" : undefined}
                className={`btn3d ${tab === t.id ? "btn3d-dark" : "btn3d-ghost"}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        ) : null}

        {tab === "calendar" && subject ? (
          <>
            {!looksAtSelf ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-cream px-4 py-2">
                <span className="text-sm font-bold text-ink">{subject.name}</span>
                <button
                  type="button"
                  className="min-h-11 text-[13px] font-bold text-violet"
                  onClick={() => setViewing(null)}
                >
                  Back to my attendance
                </button>
              </div>
            ) : null}
            <AttendanceCalendar
              key={subject.id}
              profileId={looksAtSelf ? null : subject.id}
              {...(isHr ? { onPickDay: (day: DayInfo) => setFixing({ subject, day }) } : {})}
            />
            {isHr ? (
              <p className="text-[12px] text-soft">
                HR: tap a day to correct it. Every correction keeps the old value, the new value and
                your reason.
              </p>
            ) : null}
            <CorrectionsLog
              key={`log-${subject.id}`}
              profileId={looksAtSelf ? null : subject.id}
              enabled={looksAtSelf || isHr}
            />
          </>
        ) : null}

        {tab === "team" && isLead ? (
          <TeamDay
            canCorrect={isHr}
            onOpenCalendar={(row) => {
              setViewing({ id: row.profile_id, name: row.full_name });
              setTab("calendar");
            }}
            onCorrect={(row, day) =>
              setFixing({ subject: { id: row.profile_id, name: row.full_name }, day })
            }
          />
        ) : null}

        {tab === "report" && isLead ? <RangeReport /> : null}
      </div>

      {fixing ? (
        <CorrectionDialog
          profileId={fixing.subject.id}
          name={fixing.subject.name}
          day={fixing.day}
          onClose={() => setFixing(null)}
        />
      ) : null}
    </AppShell>
  );
}
