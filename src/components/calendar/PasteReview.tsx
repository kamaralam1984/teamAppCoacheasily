import { useEffect, useState } from "react";

import type { CalendarData } from "@/hooks/useCalendar";
import { EVENT_TYPES, PROGRAM_TYPES, rangeLabel, type Parsed } from "@/lib/calendar";
import type { Profile } from "@/lib/warriors";

export interface Draft {
  key: string;
  name: string;
  type: string;
  from: string;
  to: string;
  fromTime: string;
  toTime: string;
  location: string;
  hostId: string;
  isProgram: boolean;
}

interface Props {
  parsed: Parsed[];
  hosts: Profile[];
  defaultHostId: string;
  data: CalendarData | undefined;
  busy: boolean;
  onConfirm: (drafts: Draft[]) => void;
}

function clashes(data: CalendarData | undefined, from: string, to: string): string[] {
  if (!data) return [];
  const hits: string[] = [];
  for (const p of data.programs) if (p.from_date <= to && p.to_date >= from) hits.push(p.name);
  for (const e of data.events) if (e.date <= to && (e.end_date ?? e.date) >= from) hits.push(e.name);
  return Array.from(new Set(hits));
}

function toDrafts(parsed: Parsed[], hostId: string): Draft[] {
  const out: Draft[] = [];
  parsed.forEach((p, i) => {
    if (!p.ok) return;
    p.dates.forEach((d, j) => {
      out.push({
        key: `${i}-${j}-${d.from}`,
        name: p.name,
        type: p.type,
        from: d.from,
        to: d.to,
        fromTime: p.fromTime ?? "",
        toTime: p.toTime ?? "",
        location: p.location ?? "",
        hostId,
        isProgram: Boolean(p.isProgram),
      });
    });
  });
  return out;
}

/** Nothing is created until every row has been eyeballed and "Add all" is pressed. */
export function PasteReview({ parsed, hosts, defaultHostId, data, busy, onConfirm }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>(() => toDrafts(parsed, defaultHostId));

  useEffect(() => {
    setDrafts(toDrafts(parsed, defaultHostId));
  }, [parsed, defaultHostId]);

  const bad = parsed.filter((p) => !p.ok);

  const patch = (key: string, change: Partial<Draft>) =>
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));

  return (
    <div className="space-y-3">
      {bad.map((b, i) => (
        <p
          key={`${b.raw}-${i}`}
          className="rounded-lg border border-red/30 bg-red/10 p-3 text-[12px] font-semibold text-red"
        >
          ✕ Couldn't read “{b.raw}” — {b.ok ? "" : b.error}
        </p>
      ))}

      {drafts.length === 0 ? null : (
        <>
          <p className="text-[12px] text-soft">
            {drafts.length} proposed. Edit anything here — nothing is saved until you press the
            button.
          </p>

          <ul className="space-y-2">
            {drafts.map((d) => {
              const clash = clashes(data, d.from, d.to);
              return (
                <li key={d.key} className="rounded-lg border border-line bg-white p-3">
                  <div className="flex items-start gap-2">
                    <input
                      className="ce-input flex-1"
                      aria-label="Name"
                      value={d.name}
                      onChange={(e) => patch(d.key, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${d.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-soft"
                      onClick={() => setDrafts((rows) => rows.filter((r) => r.key !== d.key))}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <select
                      className="ce-input"
                      aria-label="Type"
                      value={d.type}
                      onChange={(e) =>
                        patch(d.key, {
                          type: e.target.value,
                          isProgram: (PROGRAM_TYPES as string[]).includes(e.target.value),
                        })
                      }
                    >
                      <optgroup label="Programmes">
                        {PROGRAM_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Events">
                        {EVENT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <select
                      className="ce-input"
                      aria-label="Host"
                      value={d.hostId}
                      onChange={(e) => patch(d.key, { hostId: e.target.value })}
                    >
                      <option value="">Host not set</option>
                      {hosts.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.full_name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className="ce-input"
                      aria-label="First day"
                      value={d.from}
                      onChange={(e) =>
                        patch(d.key, {
                          from: e.target.value,
                          to: d.to < e.target.value ? e.target.value : d.to,
                        })
                      }
                    />
                    <input
                      type="date"
                      className="ce-input"
                      aria-label="Last day"
                      value={d.to}
                      onChange={(e) => patch(d.key, { to: e.target.value })}
                    />
                    <input
                      type="time"
                      className="ce-input"
                      aria-label="Starts"
                      value={d.fromTime}
                      onChange={(e) => patch(d.key, { fromTime: e.target.value })}
                    />
                    <input
                      type="time"
                      className="ce-input"
                      aria-label="Ends"
                      value={d.toTime}
                      onChange={(e) => patch(d.key, { toTime: e.target.value })}
                    />
                    <input
                      className="ce-input sm:col-span-2"
                      aria-label="Location"
                      placeholder="Location"
                      value={d.location}
                      onChange={(e) => patch(d.key, { location: e.target.value })}
                    />
                  </div>

                  <p className="mt-2 text-[12px] text-soft">
                    {rangeLabel(d.from, d.to)}
                    {clash.length > 0 ? (
                      <span className="font-bold text-goldD"> ⚠ already: {clash.join(", ")}</span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="btn3d w-full sm:w-auto"
            disabled={busy || drafts.length === 0}
            onClick={() => onConfirm(drafts)}
          >
            {busy ? "Adding…" : `Add all ${drafts.length}`}
          </button>
        </>
      )}
    </div>
  );
}
