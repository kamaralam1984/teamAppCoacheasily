import { useState, type CSSProperties } from "react";

import type { PresenceRow } from "@/hooks/useDailyCode";

export interface PresenceBoardProps {
  rows: PresenceRow[];
  style?: CSSProperties;
  /** How many present warriors to show before "Show all". */
  limit?: number;
}

/** Visible intent, not visible hours. */
export function PresenceBoard({ rows, style, limit = 8 }: PresenceBoardProps) {
  const [expanded, setExpanded] = useState(false);
  const present = rows.filter((r) => r.present);
  const away = rows.filter((r) => !r.present);
  const shown = expanded ? present : present.slice(0, limit);

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Who's around today</h2>
        <span className="text-[13px] text-soft">
          {present.length} of {rows.length}
        </span>
      </div>

      {present.length === 0 ? (
        <p className="mt-4 text-sm text-soft">Nobody has marked attendance yet today.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((r) => (
            <li key={r.profile_id} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emer" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{r.full_name}</p>
                {r.focus ? (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-soft italic">
                    “{r.focus}”
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {present.length > limit ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 min-h-11 text-[13px] font-bold text-saffBtn underline-offset-4 hover:underline"
        >
          {expanded ? "Show fewer" : `Show all ${present.length}`}
        </button>
      ) : null}

      {away.length > 0 ? (
        <p className="mt-4 border-t border-line pt-4 text-[13px] text-soft">
          Yet to mark: {away.map((a) => a.full_name.split(" ")[0]).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
