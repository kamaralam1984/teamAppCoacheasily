import { useState } from "react";

import { useLogEnergy, useMyEnergy, useTeamEnergy } from "@/hooks/useCulture";
import { ENERGY_LEVELS, istToday, shortDate, type TeamEnergy } from "@/lib/culture";
import type { Profile } from "@/lib/warriors";

/**
 * A private journal, not a form your boss reads.
 * RLS on energy_logs allows exactly one reader: the person who wrote it.
 */
export function EnergyCheckIn({ me, style }: { me: Profile; style?: React.CSSProperties }) {
  const { data: logs } = useMyEnergy(me.id, 7);
  const log = useLogEnergy(me.org_id, me.id);
  const [note, setNote] = useState("");

  const today = istToday();
  const todayRow = (logs ?? []).find((l) => l.date === today);
  const chosen = todayRow?.score ?? null;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <p className="ce-label">Private check-in</p>
      <h2 className="mt-1 font-display text-2xl text-ink">How are you really doing today?</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        This is yours alone. Not your manager, not People &amp; Culture, not the founder — nobody
        can open it. Leadership only ever sees one number for the whole team, and only once at
        least three people have checked in. Skipping it is completely fine.
      </p>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {ENERGY_LEVELS.map((l) => (
          <button
            key={l.score}
            type="button"
            onClick={() => log.mutate({ score: l.score, note })}
            className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-[14px] border px-1 py-2 transition ${
              chosen === l.score
                ? "border-goldD bg-gold/15"
                : "border-line bg-cream hover:-translate-y-0.5"
            }`}
          >
            <span className="text-2xl">{l.emoji}</span>
            <span className="text-center text-[10px] leading-tight font-bold text-soft">
              {l.label}
            </span>
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="ce-label">A line for yourself (optional)</span>
        <input
          className="mt-1 min-h-12 w-full rounded-lg border border-line bg-ivory px-3 text-[15px] text-ink"
          placeholder="Only you will ever read this."
          defaultValue={todayRow?.note ?? ""}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (chosen) log.mutate({ score: chosen, note });
          }}
        />
      </label>

      {chosen !== null && chosen <= 2 ? (
        <p className="mt-4 rounded-[14px] border border-violet/30 bg-violet/8 p-4 text-[13px] leading-relaxed font-bold text-ink">
          Heavy days happen. Please talk to someone you trust — Shubhangi in People &amp; Culture is
          there for exactly this, and it stays between you.
        </p>
      ) : null}

      {(logs ?? []).length > 0 ? (
        <div className="mt-5">
          <p className="ce-label">Your last 7 check-ins</p>
          <div className="mt-3 flex items-end gap-2">
            {(logs ?? []).map((l) => (
              <div key={l.id} className="flex max-w-14 flex-1 flex-col items-center gap-1">
                <span className="text-[14px]">

                  {ENERGY_LEVELS.find((e) => e.score === l.score)?.emoji}
                </span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-violet/70 to-mist"
                  style={{ height: `${l.score * 16}px` }}
                />
                <span className="text-[10px] text-soft">{shortDate(l.date)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Leadership's single number — never a person, never a name. */
export function TeamEnergyCard({ enabled }: { enabled: boolean }) {
  const { data } = useTeamEnergy(enabled);
  if (!enabled) return null;
  const e = data as TeamEnergy | null | undefined;

  return (
    <section className="ce-rise ce-card p-6">
      <p className="ce-label">Team energy today</p>
      {!e || !e.enough ? (
        <>
          <h2 className="mt-1 font-display text-2xl text-ink">Not enough check-ins yet today.</h2>
          <p className="mt-1 text-[13px] text-soft">
            With fewer than three, the average would just be one person's private answer. So it
            stays hidden.
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-1 font-display text-4xl text-ink">{e.average?.toFixed(1)} / 5</h2>
          <p className="mt-1 text-[13px] text-soft">
            {e.checked_in} warriors checked in. No names, no individual scores — not for anyone.
          </p>
          {(e.average ?? 5) < 2.5 ? (
            <p className="mt-3 rounded-[14px] border border-red/40 bg-red/8 p-4 text-[13px] font-bold text-ink">
              The team is running low. Something is going on — ask, don't assume.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
