import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { Mark } from "@/components/Mark";
import { GoalCharts } from "@/components/goals/GoalCharts";
import {
  dayLabel,
  fmt,
  istToday,
  progressWords,
  weekLine,
  type GoalWithProgress,
} from "@/lib/goals";
import type { GoalChartData } from "@/lib/goalCharts";
import { downloadGoalImage, downloadGoalPdf, goalFileName } from "@/lib/goalExport";

type Format = "image" | "pdf";

const REPORT_WIDTH = 820;
const REPORT_PADDING = 32;
/** report width less padding, then each panel's own padding and border */
const INNER = REPORT_WIDTH - REPORT_PADDING * 2;
const PANEL_CHROME = 26;
const COLUMN = (INNER - 12 * 4) / 5;
const FIXED = {
  bar: INNER - PANEL_CHROME,
  line: Math.floor(COLUMN * 3 + 12 * 2 - PANEL_CHROME),
  round: Math.floor(COLUMN * 2 + 12 - PANEL_CHROME),
};

export function GoalDownload({
  item,
  data,
  personName,
  cycleName,
}: {
  item: GoalWithProgress;
  data: GoalChartData;
  personName: string;
  cycleName: string;
}) {
  const [busy, setBusy] = useState<Format | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);

  const download = async (format: Format) => {
    // The report exists only while it is being saved, so a page of goals does not draw every chart twice.
    flushSync(() => setBusy(format));
    try {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const node = reportRef.current;
      if (!node) throw new Error("report not ready");
      const fileName = goalFileName(item.goal.name, istToday());
      await (format === "pdf"
        ? downloadGoalPdf(node, fileName)
        : downloadGoalImage(node, fileName));
    } catch {
      toast.error("That download did not work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="flex w-full gap-2 sm:w-auto">
        <button
          type="button"
          className="min-h-11 flex-1 rounded-full border border-line bg-ivory px-3 text-[12px] whitespace-nowrap font-bold text-ink disabled:opacity-50 sm:flex-none"
          disabled={busy !== null}
          onClick={() => void download("image")}
        >
          {busy === "image" ? "Preparing…" : "Download image"}
        </button>
        <button
          type="button"
          className="min-h-11 flex-1 rounded-full border border-line bg-ivory px-3 text-[12px] whitespace-nowrap font-bold text-ink disabled:opacity-50 sm:flex-none"
          disabled={busy !== null}
          onClick={() => void download("pdf")}
        >
          {busy === "pdf" ? "Preparing…" : "Download PDF"}
        </button>
      </div>

      {busy ? (
        <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
          <div
            ref={reportRef}
            className="bg-ivory text-ink"
            style={{ width: REPORT_WIDTH, padding: REPORT_PADDING }}
          >
            <Report item={item} data={data} personName={personName} cycleName={cycleName} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Report({
  item,
  data,
  personName,
  cycleName,
}: {
  item: GoalWithProgress;
  data: GoalChartData;
  personName: string;
  cycleName: string;
}) {
  const { goal, progress } = item;
  const words = progressWords(progress);
  const week = weekLine(goal, progress);
  const unit = goal.kind === "funnel" ? "%" : (goal.unit ?? "");

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Mark size={28} color="#8f6307" />
          <span className="font-display text-xl text-goldD">CoachEasily</span>
        </div>
        <p className="text-right text-[12px] text-soft">
          {personName} · {cycleName} · {dayLabel(istToday())}
        </p>
      </div>

      <h1 className="mt-4 font-display text-3xl leading-tight text-ink">{goal.name}</h1>
      {goal.metric ? <p className="mt-0.5 text-[13px] text-soft">{goal.metric}</p> : null}

      <div className="mt-4 grid grid-cols-4 gap-3">
        <Figure label="Started at" value={fmt(goal.baseline)} unit={unit} />
        <Figure label="Now" value={fmt(progress?.current_value ?? goal.baseline)} unit={unit} />
        <Figure label="Going to" value={fmt(goal.target)} unit={unit} />
        <Figure label="Moved this cycle" value={fmt(progress?.pct ?? 0)} unit="%" />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-ink">
        <span className="font-bold">{words.lead}.</span> {words.sentence}
      </p>
      {week ? <p className="mt-1 text-[13px] leading-relaxed text-soft">{week}</p> : null}

      <div className="mt-4">
        <GoalCharts data={data} fixed={FIXED} />
      </div>
    </>
  );
}

function Figure({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-cream/50 px-3 py-2">
      <p className="text-[10px] font-bold tracking-wide text-soft uppercase">{label}</p>
      <p className="text-lg font-bold text-ink">
        {value}
        {unit ? <span className="text-[11px] font-normal text-soft"> {unit}</span> : null}
      </p>
    </div>
  );
}
