import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ReportTable } from "@/components/reports/ReportTable";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useReport } from "@/hooks/useReportCenter";
import { buildCsv, buildPdf, buildXlsx, downloadBytes, MIME, safeFileName } from "@/lib/exporters";
import {
  daysBetween,
  defaultDates,
  presetDates,
  reportById,
  REPORTS,
  type ReportDef,
} from "@/lib/reportCatalog";
import { istToday } from "@/lib/tasks";

export const Route = createFileRoute("/_authenticated/report-center")({
  head: () => ({
    meta: [
      { title: "Report centre | CoachEasily Team App" },
      {
        name: "description",
        content:
          "Attendance, tasks, goals, leave, earned leave, holidays, probation and birthdays, with export.",
      },
      { property: "og:title", content: "Report centre | CoachEasily Team App" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const PRESETS = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_30", label: "Last 30 days" },
  { id: "this_year", label: "This year" },
] as const;

function Page() {
  const { data } = useMyProfile();
  const role = data?.profile?.role;
  const isHr = role === "hr" || role === "admin";
  const allowed = isHr || role === "manager";
  const today = istToday();

  const available = REPORTS.filter((r) => isHr || !r.hrOnly);
  const [id, setId] = useState("attendance");
  const def: ReportDef = reportById(id) ?? REPORTS[0]!;
  const [dates, setDates] = useState(() => defaultDates("month", today));
  const [run, setRun] = useState<{ id: string; from: string; to: string } | null>(null);

  const result = useReport(run);

  function pick(next: ReportDef) {
    setId(next.id);
    setDates(defaultDates(next.defaultRange, today));
    setRun(null);
  }

  const span = daysBetween(dates.from, dates.to);
  const problem =
    def.range === "none"
      ? null
      : !dates.from || !dates.to
        ? "Pick both dates."
        : span < 0
          ? "The end date is before the start date."
          : span > def.maxDays
            ? `This report takes at most ${def.maxDays + 1} days at a time.`
            : null;

  const report = result.data && run?.id === result.data.report ? result.data : null;

  function exportAs(kind: "csv" | "xlsx" | "pdf") {
    if (!report) return;
    const name = safeFileName(report.title, kind);
    if (kind === "csv") downloadBytes(name, buildCsv(report.columns, report.rows), MIME.csv);
    else if (kind === "xlsx") {
      downloadBytes(name, buildXlsx(report.title, report.columns, report.rows), MIME.xlsx);
    } else {
      downloadBytes(
        name,
        buildPdf(report.title, report.subtitle, report.columns, report.rows),
        MIME.pdf,
      );
    }
    toast.success(`${report.title} downloaded.`);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 py-2">
        <header className="ce-rise">
          <h1 className="font-display text-4xl text-ink">Report centre</h1>
          <p className="mt-1 text-sm text-soft">
            Run a report, sort it, and take it away as CSV, Excel or PDF.
          </p>
        </header>

        {data && !allowed ? (
          <p className="ce-card p-6 text-sm text-soft">This view is for managers, HR and admin.</p>
        ) : (
          <>
            <section aria-label="Reports" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={r.id === id}
                  onClick={() => pick(r)}
                  className={`min-h-16 rounded-[14px] border p-3 text-left ${
                    r.id === id
                      ? "border-gold bg-goldL/20"
                      : "border-line bg-ivory hover:border-gold"
                  }`}
                >
                  <span className="block font-display text-lg text-ink">{r.label}</span>
                  <span className="block text-[12px] leading-snug text-soft">{r.blurb}</span>
                </button>
              ))}
            </section>

            <section className="ce-card space-y-3 p-5">
              <h2 className="font-display text-2xl text-ink">{def.label}</h2>
              {def.range === "range" ? (
                <>
                  <div className="flex flex-wrap items-end gap-3">
                    <label>
                      <span className="ce-label">From</span>
                      <input
                        type="date"
                        className="ce-input"
                        value={dates.from}
                        onChange={(e) => setDates({ ...dates, from: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="ce-label">To</span>
                      <input
                        type="date"
                        className="ce-input"
                        min={dates.from}
                        value={dates.to}
                        onChange={(e) => setDates({ ...dates, to: e.target.value })}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick ranges">
                      {PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="min-h-11 rounded-full border border-line bg-white px-3 text-[12px] font-bold text-soft hover:border-gold"
                          onClick={() => setDates(presetDates(p.id, today))}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {problem ? <p className="text-[13px] font-semibold text-red">{problem}</p> : null}
                </>
              ) : (
                <p className="text-[13px] text-soft">This report does not use a date range.</p>
              )}
              <button
                type="button"
                className="btn3d"
                disabled={Boolean(problem) || result.isFetching}
                onClick={() => setRun({ id: def.id, from: dates.from, to: dates.to })}
              >
                {result.isFetching ? "Running…" : "Run report"}
              </button>
            </section>

            {result.error ? (
              <p className="ce-card p-5 text-sm text-red">
                {(result.error as Error).message || "The report couldn't be run."}
              </p>
            ) : null}

            {report ? (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl text-ink">{report.title}</h2>
                    <p className="max-w-2xl text-[12px] leading-relaxed text-soft">
                      {report.subtitle}
                    </p>
                    <p className="text-[12px] font-bold text-soft">
                      {report.rows.length} row{report.rows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Download">
                    <button
                      type="button"
                      className="btn3d btn3d-gold"
                      onClick={() => exportAs("csv")}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      className="btn3d btn3d-gold"
                      onClick={() => exportAs("xlsx")}
                    >
                      Excel
                    </button>
                    <button
                      type="button"
                      className="btn3d btn3d-gold"
                      onClick={() => exportAs("pdf")}
                    >
                      PDF
                    </button>
                  </div>
                </div>
                <ReportTable columns={report.columns} rows={report.rows} />
                <p className="text-[12px] text-soft">
                  The PDF prints names in plain Latin letters; anything else shows as “?”. Use the
                  CSV or Excel file when a name has other scripts.
                </p>
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
