import { useState } from "react";

import { PROGRESS_EXPLAINER, progressWords, type GoalProgress } from "@/lib/goals";

/** The two figures, in the same words everywhere a goal appears. */
export function ProgressNumbers({
  progress,
  big,
  className,
}: {
  progress: GoalProgress | null | undefined;
  big?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const w = progressWords(progress);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={`font-bold text-goldD ${big ? "text-lg" : "text-[14px]"}`}
        >
          {w.lead}
        </span>
        {w.holding ? (
          <span className="text-[12px] font-bold tracking-wide text-soft uppercase">holding</span>
        ) : w.aside ? (
          <span className="text-[12px] font-semibold text-soft">· {w.aside}</span>
        ) : null}
        <button
          type="button"
          aria-label="What do these two numbers mean?"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-line text-[12px] font-bold text-soft"
        >
          ?
        </button>
      </div>
      <p className={`mt-1 leading-relaxed text-soft ${big ? "text-[14px]" : "text-[13px]"}`}>
        {w.sentence}
      </p>
      {open ? (
        <div className="mt-2 space-y-2 rounded-[12px] border border-line bg-ivory p-3 text-[13px] leading-relaxed text-ink">
          {PROGRESS_EXPLAINER.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ProgressNumbers;
