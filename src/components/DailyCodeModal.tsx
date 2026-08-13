import { useEffect, useState } from "react";

import { Mark } from "@/components/Mark";
import type { DailyCode } from "@/hooks/useDailyCode";

export interface DailyCodeModalProps {
  code: DailyCode | null;
  loading?: boolean;
  pending?: boolean;
  error?: boolean;
  onClose: () => void;
  onPledge: (focus: string) => void;
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
}: DailyCodeModalProps) {
  const [focus, setFocus] = useState("");

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

        <div className="mt-8">
          <button
            type="button"
            className="btn3d w-full"
            disabled={pending}
            onClick={() => onPledge(focus.trim().slice(0, 120))}
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
