import { useEffect, useMemo, useState } from "react";

const CONFETTI_COLOURS = [
  "var(--ce-goldL)",
  "var(--ce-gold)",
  "var(--ce-saff)",
  "var(--ce-violet)",
  "var(--ce-emer)",
  "var(--ce-mist)",
];

const FACTS = [
  "Writing a task down makes you 42% more likely to finish it.",
  "A 1% improvement every day compounds to 37x in a year.",
  "Teams that check in daily finish projects about 25% faster.",
  "Naming a goal out loud to one person doubles your follow-through.",
  "The first 20 minutes of your morning set the tone for the whole day.",
  "Short breaks every 90 minutes keep focus sharper than pushing through.",
  "Gratitude noted once a day measurably lowers workplace stress.",
  "Showing up on the dull days is what separates good from great.",
];

const CHEERS = [
  "Shabaash!",
  "Kya baat hai!",
  "Well played, warrior.",
  "That's the spirit.",
];

export interface CelebrateProps {
  message: string;
  cheer?: string;
  onDone: () => void;
  /** milliseconds before it dismisses itself */
  duration?: number;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Celebrate({ message, cheer, onDone, duration = 4000 }: CelebrateProps) {
  const reduced = useMemo(prefersReducedMotion, []);
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * FACTS.length));
  const line = useMemo(() => cheer ?? CHEERS[Math.floor(Math.random() * CHEERS.length)]!, [cheer]);

  const pieces = useMemo(
    () =>
      reduced
        ? []
        : Array.from({ length: 36 }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            delay: Math.random() * 900,
            fall: 2200 + Math.random() * 1400,
            spin: 700 + Math.random() * 900,
            size: 6 + Math.random() * 7,
            colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]!,
            round: i % 3 === 0,
          })),
    [reduced],
  );

  useEffect(() => {
    const dismiss = window.setTimeout(onDone, duration);
    const rotate = window.setInterval(() => setFactIndex((i) => (i + 1) % FACTS.length), 2000);
    return () => {
      window.clearTimeout(dismiss);
      window.clearInterval(rotate);
    };
  }, [duration, onDone]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-night/45 px-5"
      role="status"
      aria-live="polite"
      onClick={onDone}
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          aria-hidden
          className="ce-confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: p.colour,
            borderRadius: p.round ? "9999px" : "2px",
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.fall}ms, ${p.spin}ms`,
          }}
        />
      ))}

      <div className="ce-rise ce-card relative w-full max-w-sm p-6 text-center">
        <p className="font-display text-3xl leading-tight text-ink">{line}</p>
        <p className="mt-2 text-[15px] leading-relaxed font-semibold text-ink">{message}</p>
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[10px] font-bold tracking-[0.14em] text-goldD uppercase">
            Interesting fact
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-soft">{FACTS[factIndex]}</p>
        </div>
      </div>
    </div>
  );
}
