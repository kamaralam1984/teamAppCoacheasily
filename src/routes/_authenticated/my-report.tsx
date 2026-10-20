import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ReportTable } from "@/components/reports/ReportTable";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useMyReport } from "@/hooks/useMyReport";
import { buildCsv, buildPdf, buildXlsx, downloadBytes, MIME, safeFileName } from "@/lib/exporters";
import {
  RANGE_PRESETS,
  TAB_LABEL,
  daysInRange,
  rangeProblem,
  reportFileName,
  type ReportTab,
} from "@/lib/myReport";
import { istToday } from "@/lib/tasks";

export const Route = createFileRoute("/_authenticated/my-report")({
  head: () => ({
    meta: [
      { title: "My report | CoachEasily Team App" },
      {
        name: "description",
        content:
          "Your own tasks, goals and daily numbers for any stretch of days, to read or download.",
      },
      { property: "og:title", content: "My report | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "Your own tasks, goals and daily numbers for any stretch of days, to read or download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data } = useMyProfile();
  const today = istToday();
  const first = RANGE_PRESETS[0]!;
  const [dates, setDates] = useState(() => first.range(today));
  const [preset, setPreset] = useState<string | null>(first.id);
  const [run, setRun] = useState<{ from: string; to: string } | null>(() => first.range(today));
  const [tab, setTab] = useState<ReportTab>("tasks");

  const result = useMyReport(run);
  const report = result.data ?? null;
  const problem = rangeProblem(dates.from, dates.to);
  const table = report ? report[tab] : null;

  const stats = useMemo(() => {
    if (!report) return [];
    const s = report.summary;
    return [
      { label: "Tasks", value: s.tasks },
      { label: "Completed", value: s.completed },
      { label: "Still pending", value: s.pending },
      { label: "Overdue", value: s.overdue },
      { label: "Goals", value: s.goals },
      { label: "Days with numbers", value: s.numbers_logged },
    ];
  }, [report]);

  function exportAs(kind: "csv" | "xlsx" | "pdf") {
    if (!report || !table) return;
    const name = safeFileName(reportFileName(report.person, tab, report.from, report.to), kind);
    if (kind === "csv") downloadBytes(name, buildCsv(table.columns, table.rows), MIME.csv);
    else if (kind === "xlsx") {
      downloadBytes(name, buildXlsx(table.title, table.columns, table.rows), MIME.xlsx);
    } else {
      downloadBytes(
        name,
        buildPdf(table.title, table.subtitle, table.columns, table.rows),
        MIME.pdf,
      );
    }
    toast.success(`${table.title} downloaded.`);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 py-2">
        <header className="ce-rise">
          <h1 className="font-display text-4xl text-ink">My report</h1>
          <p className="mt-1 text-sm text-soft">
            Your own tasks, goals and daily numbers for the days you choose. Only you can see this,
            and you can take it away as CSV, Excel or PDF.{" "}
            <Link
              to="/help"
              search={{ topic: "my-report" } as never}
              className="font-semibold underline underline-offset-4"
            >
              How does this work?
            </Link>
          </p>
        </header>

        <section className="ce-card space-y-4 p-5" aria-label="Choose the days">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick ranges">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => {
                  const range = p.range(today);
                  setDates(range);
                  setPreset(p.id);
                  setRun(range);
                }}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                  preset === p.id
                    ? "border-gold bg-goldL/20 text-ink"
                    : "border-line bg-ivory text-soft hover:border-gold"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-[12px] font-bold tracking-wider text-soft uppercase">
              From
              <input
                type="date"
                className="ce-input mt-1.5"
                max={dates.to || today}
                value={dates.from}
                onChange={(e) => {
                  setDates({ ...dates, from: e.target.value });
                  setPreset(null);
                }}
              />
            </label>
            <label className="block text-[12px] font-bold tracking-wider text-soft uppercase">
              To
              <input
                type="date"
                className="ce-input mt-1.5"
                min={dates.from}
                value={dates.to}
                onChange={(e) => {
                  setDates({ ...dates, to: e.target.value });
                  setPreset(null);
                }}
              />
            </label>
            <button
              type="button"
              className="btn3d"
              disabled={Boolean(problem) || result.isFetching}
              onClick={() => setRun({ ...dates })}
            >
              {result.isFetching ? "Working…" : "Show report"}
            </button>
          </div>
          {problem ? (
            <p className="text-sm font-semibold text-red">{problem}</p>
          ) : (
            <p className="text-[12px] text-soft">
              {daysInRange(dates.from, dates.to)} day
              {daysInRange(dates.from, dates.to) === 1 ? "" : "s"} selected.
            </p>
          )}
        </section>

        {result.isError ? (
          <p className="ce-card p-5 text-sm font-semibold text-red">
            {result.error instanceof Error
              ? result.error.message
              : "That report could not be made."}{" "}
            Please try again.
          </p>
        ) : null}

        {report && table ? (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {stats.map((s) => (
                <div key={s.label} className="ce-card p-3 text-center">
                  <p className="font-display text-3xl text-ink">{s.value}</p>
                  <p className="text-[11px] font-bold tracking-wider text-soft uppercase">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            <div
              role="tablist"
              aria-label="Report sections"
              className="flex flex-wrap gap-2 border-b border-line pb-2"
            >
              {(Object.keys(TAB_LABEL) as ReportTab[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`min-h-11 rounded-full px-4 text-sm font-bold ${
                    tab === k ? "bg-night text-goldL" : "text-soft hover:text-goldD"
                  }`}
                >
                  {TAB_LABEL[k]} · {report[k].rows.length}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-ink">{table.title}</h2>
                <p className="max-w-2xl text-[12px] leading-relaxed text-soft">{table.subtitle}</p>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Download">
                {(["csv", "xlsx", "pdf"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="btn3d btn3d-gold"
                    disabled={table.rows.length === 0}
                    onClick={() => exportAs(kind)}
                  >
                    {kind === "xlsx" ? "Excel" : kind.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {table.rows.length === 0 ? (
              <p className="ce-card p-5 text-sm text-soft">
                Nothing here for these days.{" "}
                {tab === "goals" ? (
                  <>
                    Goals show up when a goal cycle overlaps the days you chose.{" "}
                    <Link to="/goals" className="font-semibold underline underline-offset-4">
                      Open Goals
                    </Link>
                  </>
                ) : tab === "numbers" ? (
                  <>
                    Numbers appear once you log them against a goal.{" "}
                    <Link to="/goals" className="font-semibold underline underline-offset-4">
                      Log a number
                    </Link>
                  </>
                ) : (
                  <Link to="/tasks" className="font-semibold underline underline-offset-4">
                    Open Tasks
                  </Link>
                )}
              </p>
            ) : (
              <ReportTable columns={table.columns} rows={table.rows} />
            )}
            <p className="text-[12px] text-soft">
              Report for {data?.profile?.full_name ?? report.person}. The PDF prints names in plain
              Latin letters; anything else shows as “?”. Use the CSV or Excel file when a name has
              other scripts.
            </p>
          </section>
        ) : result.isLoading ? (
          <p className="text-sm text-soft">Putting your report together…</p>
        ) : null}
      </div>
    </AppShell>
  );
}
