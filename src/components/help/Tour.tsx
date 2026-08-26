import { useEffect, useLayoutEffect, useState } from "react";

interface Step {
  /** data-tour value on the element to point at. Empty means "no target". */
  target: string;
  title: string;
  line: string;
}

const STEPS: Step[] = [
  {
    target: "attendance",
    title: "Start with attendance",
    line: "One tap when you begin the day. It stamps the time, so it cannot be back-dated or undone — and every twenty days marked earns you a day of leave.",
  },
  {
    target: "code",
    title: "Today's code",
    line: "A value, a thought and a pledge for the day. It appears when you mark attendance and stays here so you can come back to it.",
  },
  {
    target: "priorities",
    title: "Choose your few priorities",
    line: "Pick the small number of things you will actually finish today. Fewer, kept, beats a long list carried forward.",
  },
  {
    target: "goals",
    title: "Your goals",
    line: "Log today's number here or on the Goals tab. Progress is measured from where you started, not from zero.",
  },
  {
    target: "tab-leave",
    title: "Leave lives here",
    line: "Balances, applying, and the history of what was decided. The form tells you how many days will actually be charged before you send it.",
  },
  {
    target: "idea",
    title: "Raise anything with the lamp",
    line: "A fix, an annoyance, an idea — with a screenshot if it helps. You can send it anonymously.",
  },
  {
    target: "account",
    title: "Your menu",
    line: "Your profile and photo, what's new in the app, and Help — where this walkthrough can be started again.",
  },
];

function find(target: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

/** A short guided walkthrough. Points at real things, and can be left at any moment. */
export function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  );

  const step = STEPS[i]!;

  useLayoutEffect(() => {
    const el = find(step.target);
    if (!el) {
      setBox(null);
      return;
    }
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const t = window.setTimeout(measure, 380);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDone();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const last = i === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-night/70" onClick={onDone} aria-hidden />

      {box ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-2xl ring-4 ring-goldL"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.0)",
          }}
        />
      ) : null}

      <div
        role="dialog"
        aria-label="Walkthrough"
        className="absolute inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] mx-auto max-w-md rounded-2xl bg-ivory p-5 shadow-2xl sm:inset-x-auto sm:right-6"
      >
        <p className="ce-label">
          Step {i + 1} of {STEPS.length}
        </p>
        <h2 className="mt-1 font-display text-xl leading-snug text-ink">{step.title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-soft">{step.line}</p>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="btn3d"
            onClick={() => (last ? onDone() : setI((n) => n + 1))}
          >
            {last ? "Done" : "Next"}
          </button>
          {i > 0 ? (
            <button type="button" className="btn3d btn3d-ghost" onClick={() => setI((n) => n - 1)}>
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDone}
            className="ml-auto text-[13px] font-semibold text-soft underline underline-offset-4"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
