import { useEffect, useState } from "react";

import { Mark } from "@/components/Mark";
import { WORK_MODE_LABEL, type WorkMode } from "@/hooks/useAttendance";
import type { DailyCode } from "@/hooks/useDailyCode";
import { isOffOn, weeklyOffLabel } from "@/lib/warriors";

export interface DailyCodeModalProps {
  code: DailyCode | null;
  loading?: boolean;
  pending?: boolean;
  error?: boolean;
  onClose: () => void;
  onPledge: (focus: string, status: WorkMode, offReason: string) => void;
  /** the signed-in person's weekly off, e.g. "Monday" or "Saturday,Sunday" */
  weeklyOff?: string | null;
}

const FALLBACK_PLEDGE = "I'm here, and I'll work honestly today";

/**
 * The morning ritual. Nothing is written until the pledge button is pressed —
 * and the words are a commitment, never a check.
 */
export function DailyCodeModal({
  code,
  loading,
  pending,
  error,
  onClose,
  onPledge,
  weeklyOff = null,
}: DailyCodeModalProps) {
  const [focus, setFocus] = useState("");
  const [mode, setMode] = useState<WorkMode>("present");
  const [offReason, setOffReason] = useState("");
  const todayName = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  });
  /** Everybody has their own weekly off, one day or more, and it differs from person to person. */
  const onWeeklyOff = isOffOn(weeklyOff, todayName);
  const needsReason = onWeeklyOff && offReason.trim().length < 3;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-night/55 px-4 py-6 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Today's code"
      onClick={onClose}
    >
      <div
        className="ce-rise ce-card w-full max-w-lg p-7 sm:p-9"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex items-center rounded-full bg-goldL/20 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-goldD uppercase">
            {code?.value ?? "Honesty"}
          </span>
          <Mark size={26} color="var(--ce-gold)" />
        </div>

        {loading ? (
          <p className="mt-7 text-sm text-soft">Bringing today's code…</p>
        ) : (
          <>
            <h2 className="mt-6 font-display text-3xl leading-[1.15] text-ink sm:text-4xl">
              {code?.title ?? "The day begins with the truth"}
            </h2>
            <p className="mt-4 text-[15px] leading-[1.8] text-soft">
              {code?.body ??
                "Nobody is watching, and that is exactly the point. We are trusted because we tell the truth about our work — the wins and the stuck parts alike."}
            </p>
          </>
        )}

        <fieldset className="mt-8">
          <legend className="ce-label">How are you working today?</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => (
              <label
                key={m}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-[13px] font-bold ${
                  mode === m
                    ? "border-goldD bg-goldL/30 text-ink"
                    : "border-line bg-white text-soft hover:border-gold"
                }`}
              >
                <input
                  type="radio"
                  name="dc-mode"
                  className="sr-only"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {WORK_MODE_LABEL[m]}
              </label>
            ))}
          </div>
        </fieldset>

        {onWeeklyOff ? (
          <div className="mt-5 rounded-[12px] border border-gold/50 bg-goldL/15 p-4">
            <label htmlFor="dc-off" className="ce-label">
              Today is your weekly off ({weeklyOffLabel(weeklyOff)}). Why are you working today?
            </label>
            <input
              id="dc-off"
              className="ce-input"
              maxLength={200}
              required
              value={offReason}
              placeholder="Client launch, covering for the team…"
              onChange={(e) => setOffReason(e.target.value)}
            />
            <p className="mt-1.5 text-[12px] text-soft">
              The day counts as a working day. Your manager and HR can see the reason.
            </p>
          </div>
        ) : null}

        <div className="mt-5">
          <button
            type="button"
            className="btn3d w-full"
            disabled={pending || needsReason}
            onClick={() =>
              onPledge(focus.trim().slice(0, 120), mode, offReason.trim().slice(0, 200))
            }
          >
            {pending ? "One moment…" : (code?.pledge ?? FALLBACK_PLEDGE)}
          </button>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <label htmlFor="dc-focus" className="ce-label">
            What are you on today? <span className="font-normal text-soft">(optional)</span>
          </label>
          <input
            id="dc-focus"
            className="ce-input"
            maxLength={120}
            value={focus}
            placeholder="Calling the 40 unconnected leads from Tuesday"
            onChange={(e) => setFocus(e.target.value)}
          />
          <p className="mt-1.5 text-[12px] text-soft">
            Your team sees this line today. It is how a remote team stays in the same room.
          </p>
        </div>

        {error ? (
          <p className="mt-4 text-[13px] font-semibold text-red">
            That didn't go through. Please try once more.
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-11 w-full text-[13px] font-semibold text-soft underline-offset-4 hover:underline"
        >
          Not today
        </button>
      </div>
    </div>
  );
}
