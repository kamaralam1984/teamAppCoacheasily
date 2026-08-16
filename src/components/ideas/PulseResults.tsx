import { useEffect, useState } from "react";

import { usePulseResults, usePulseRounds } from "@/hooks/usePulse";

export function PulseResultsPanel({ enabled }: { enabled: boolean }) {
  const { data: rounds } = usePulseRounds(enabled);
  const [roundId, setRoundId] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId && rounds && rounds.length > 0) setRoundId(rounds[0]!.id);
  }, [rounds, roundId]);

  const { data: results, isLoading } = usePulseResults(enabled ? roundId : null);

  if (!enabled || !rounds || rounds.length === 0) return null;

  return (
    <section className="ce-card p-6">
      <h2 className="font-display text-2xl text-ink">Pulse results</h2>
      <p className="mt-2 text-[13px] leading-[1.7] text-soft">
        Anonymous, and only totals. Answers stay sealed until at least four people have responded —
        with a team this size, three is easy to guess at.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {rounds.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRoundId(r.id)}
            className={`min-h-11 rounded-full border px-3 text-[12px] font-bold ${
              roundId === r.id
                ? "border-goldD bg-gold/15 text-goldD"
                : "border-line bg-ivory text-soft"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="mt-4 text-[13px] text-soft">Loading…</p>
      ) : results ? (
        <div className="mt-4 space-y-3">
          <p className="text-[14px] text-ink">
            <span className="font-bold">{results.count}</span> response
            {results.count === 1 ? "" : "s"}
            {results.average !== null ? (
              <>
                {" · average "}
                <span className="font-bold">{Number(results.average).toFixed(1)}</span> out of 5
              </>
            ) : null}
          </p>
          {results.sealed ? (
            <p className="rounded-lg border border-line bg-ivory p-3 text-[13px] text-soft">
              Sealed. Fewer than four responses so far — nothing is shown, not even to HR.
            </p>
          ) : results.texts.length === 0 ? (
            <p className="text-[13px] text-soft">No written answers yet.</p>
          ) : (
            <ul className="space-y-2">
              {results.texts.map((t, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-line bg-ivory p-3 text-[13px] leading-[1.7] text-ink"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
