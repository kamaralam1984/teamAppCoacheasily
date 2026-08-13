import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { AppraisalTable } from "@/components/reports/AppraisalTable";
import { LeaveLedgerTable } from "@/components/reports/LeaveLedgerTable";
import { TeamHealthRow } from "@/components/reports/TeamHealthRow";
import { useMyProfile } from "@/hooks/useMyProfile";
import {
  useOrgSettings,
  usePunctualityRows,
  useSaveOrgSettings,
} from "@/hooks/useOrg";
import { useAppraisal, useLeaveLedger, useTeamHealth } from "@/hooks/useReports";
import {
  DEFAULT_MEETING_TIME,
  prettyTime,
  punctualityCsv,
  type PunctualityRow,
} from "@/lib/punctuality";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports | CoachEasily Team App" },
      {
        name: "description",
        content:
          "The People & Culture record: goal achievement by cycle, timeliness, the leave ledger and today's team health.",
      },
      { property: "og:title", content: "Reports | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "The People & Culture record: goal achievement by cycle, timeliness, the leave ledger and today's team health.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function monthOptions(): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    return {
      value,
      label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  });
}

function Page() {
  const { data } = useMyProfile();
  const profile = data?.profile ?? null;
  const role = profile?.role ?? "member";
  /** Managers coach their live team. The appraisal record belongs here only. */
  const isHr = role === "hr" || role === "admin";

  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0]!.value);
  const monthLabel = months.find((m) => m.value === month)?.label ?? "";

  const { data: org } = useOrgSettings(Boolean(profile));
  const { data: rows } = usePunctualityRows(Boolean(profile) && isHr, month);
  const { data: appraisal } = useAppraisal(Boolean(profile) && isHr);
  const { data: ledger } = useLeaveLedger(Boolean(profile) && isHr);
  const { data: health } = useTeamHealth(Boolean(profile) && isHr);

  const sorted: PunctualityRow[] = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.pct_early - a.pct_early),
    [rows],
  );

  const download = () => {
    const blob = new Blob([punctualityCsv(sorted, monthLabel)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timeliness-${month.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isHr) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-10">
          <h1 className="font-display text-3xl text-ink">Reports</h1>
          <p className="mt-2 text-sm text-soft">
            This record is kept by People &amp; Culture. Managers coach their live team — you'll
            find everything you need on the Team tab.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 py-2">
        <header className="ce-rise">
          <h1 className="font-display text-4xl text-ink">Reports</h1>
          <p className="mt-1 text-sm text-soft">
            People &amp; Culture only. Everything below is in Mumbai time.
          </p>
        </header>

        <TeamHealthRow health={health} style={{ animationDelay: "40ms" }} />

        <AppraisalTable data={appraisal} style={{ animationDelay: "60ms" }} />

        <section className="ce-rise ce-card p-6" style={{ animationDelay: "80ms" }}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="ce-label">Mornings</p>
              <h2 className="mt-1 font-display text-2xl text-ink">Timeliness — {monthLabel}</h2>
              <p className="mt-1 max-w-xl text-[13px] text-soft">
                This is a picture of the room, not a scoreboard. Weekly offs, approved leave and
                company holidays are excluded, and warriors without a fixed weekly off are counted
                only on the days they actually worked.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="ce-input h-11"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="Month"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="min-h-11 rounded-full border border-line px-4 text-[13px] font-bold text-soft"
                onClick={download}
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="mt-5 -mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Warrior", "Working days", "Marked", "Early", "% early", "Avg punch"].map(
                    (h) => (
                      <th
                        key={h}
                        className="py-2 pr-3 text-[11px] font-bold tracking-[0.1em] text-soft uppercase"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.profile_id} className="border-b border-line/60">
                    <td className="py-3 pr-3">
                      <p className="text-[14px] font-bold text-ink">{r.full_name}</p>
                      {r.title ? <p className="text-[12px] text-soft">{r.title}</p> : null}
                    </td>
                    <td className="py-3 pr-3 text-[14px] text-ink">{r.working_days}</td>
                    <td className="py-3 pr-3 text-[14px] text-ink">{r.marked}</td>
                    <td className="py-3 pr-3 text-[14px] text-ink">{r.early}</td>
                    <td className="py-3 pr-3">
                      <span className="text-[14px] font-bold text-goldD">{r.pct_early}%</span>
                    </td>
                    <td className="py-3 pr-3 text-[14px] text-soft">{r.avg_punch ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 ? (
              <p className="mt-4 text-sm text-soft">Nothing marked in this month yet.</p>
            ) : null}
          </div>
        </section>

        <LeaveLedgerTable rows={ledger} style={{ animationDelay: "100ms" }} />

        <SettingsCard />
      </div>
    </AppShell>
  );
}

function SettingsCard() {
  const { data: org } = useOrgSettings();
  const save = useSaveOrgSettings();
  const [url, setUrl] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [birthdays, setBirthdays] = useState<boolean | null>(null);

  const urlValue = url ?? org?.daily_meeting_url ?? "";
  const timeValue = time ?? org?.daily_meeting_time ?? DEFAULT_MEETING_TIME;
  const birthdayValue = birthdays ?? Boolean(org?.team_birthdays);

  return (
    <section className="ce-rise ce-card p-6" style={{ animationDelay: "120ms" }}>
      <p className="ce-label">Company settings</p>
      <h2 className="mt-1 font-display text-2xl text-ink">The daily standup</h2>
      <p className="mt-1 text-[13px] text-soft">
        The room link is hidden until a warrior marks attendance. That is deliberate.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px]">
        <label className="block">
          <span className="ce-label">Meeting link</span>
          <input
            className="ce-input mt-1 h-12 w-full"
            value={urlValue}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <label className="block">
          <span className="ce-label">Start time (IST)</span>
          <input
            type="time"
            className="ce-input mt-1 h-12 w-full"
            value={timeValue}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={birthdayValue}
          onChange={(e) => setBirthdays(e.target.checked)}
        />
        <span className="text-[13px] leading-relaxed text-soft">
          <span className="block font-bold text-ink">Show team birthdays in Coming up</span>
          The founder's birthday always appears. Turn this on to show everybody's.
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn3d"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              {
                daily_meeting_url: urlValue.trim(),
                daily_meeting_time: timeValue,
                team_birthdays: birthdayValue,
                timezone: "Asia/Kolkata",
              },
              {
                onSuccess: () => {
                  setUrl(null);
                  setTime(null);
                  setBirthdays(null);
                },
              },
            )
          }
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
        {save.isSuccess ? <span className="text-[13px] font-bold text-emer">Saved.</span> : null}
        {save.isError ? (
          <span className="text-[13px] font-bold text-red">{(save.error as Error).message}</span>
        ) : null}
      </div>
    </section>
  );
}
