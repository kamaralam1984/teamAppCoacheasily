import { useState } from "react";

import { useMyPulse, useSubmitPulse } from "@/hooks/usePulse";

const SNOOZE_PREFIX = "ce-pulse-snooze-";

function istToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function PulseCard({
  enabled,
  style,
}: {
  enabled: boolean;
  style?: React.CSSProperties;
}) {
  const { data: round } = useMyPulse(enabled);
  const submit = useSubmitPulse();
  const [answers, setAnswers] = useState<(number | string | null)[]>([]);
  const [snoozed, setSnoozed] = useState(false);

  if (!round) return null;

  const key = `${SNOOZE_PREFIX}${round.id}`;
  const snoozedToday =
    snoozed ||
    (typeof window !== "undefined" && window.localStorage.getItem(key) === istToday());
  if (snoozedToday) return null;

  const value = (i: number) => answers[i] ?? null;
  const set = (i: number, v: number | string) =>
    setAnswers((prev) => {
      const copy = [...prev];
      while (copy.length < round.questions.length) copy.push(null);
      copy[i] = v;
      return copy;
    });

  const ready = round.questions.some((q, i) => (q.type === "scale" ? value(i) !== null : true));

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <p className="ce-label">{round.label}</p>
      <h2 className="mt-1 font-display text-2xl text-ink">Three questions, under a minute</h2>
      <p className="mt-2 text-[13px] leading-[1.7] text-soft">
        This is completely anonymous. Your answers are stored with no name and no time — we cannot
        tell who said what, and nobody will try.
      </p>

      <div className="mt-5 space-y-5">
        {round.questions.map((q, i) => (
          <div key={i}>
            <p className="text-[14px] font-semibold text-ink">{q.text}</p>
            {q.type === "scale" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {Array.from(
                  { length: (q.max ?? 5) - (q.min ?? 1) + 1 },
                  (_, n) => (q.min ?? 1) + n,
                ).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set(i, n)}
                    className={`min-h-11 min-w-11 rounded-lg border text-[14px] font-bold transition ${
                      value(i) === n
                        ? "border-goldD bg-gold/15 text-goldD"
                        : "border-line bg-ivory text-soft"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                rows={2}
                value={typeof value(i) === "string" ? (value(i) as string) : ""}
                onChange={(e) => set(i, e.target.value)}
                className="mt-2 w-full rounded-lg border border-line bg-ivory p-3 text-[14px] text-ink"
              />
            )}
          </div>
        ))}
      </div>

      {submit.isError ? (
        <p className="mt-3 text-[13px] font-semibold text-goldD">
          That didn't go through. Please try again.
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn3d w-full sm:w-auto"
          disabled={!ready || submit.isPending}
          onClick={() => {
            const padded = round.questions.map((q, i) => {
              const v = value(i);
              if (q.type === "scale") return typeof v === "number" ? v : null;
              return typeof v === "string" ? v : "";
            });
            submit.mutate({ roundId: round.id, answers: padded });
          }}
        >
          {submit.isPending ? "Sending…" : "Send anonymously"}
        </button>
        <button
          type="button"
          className="btn3d btn3d-ghost w-full sm:w-auto"
          onClick={() => {
            window.localStorage.setItem(key, istToday());
            setSnoozed(true);
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
