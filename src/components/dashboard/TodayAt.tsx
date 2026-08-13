import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";

import type { CalendarData } from "@/hooks/useCalendar";
import type { PresenceRow } from "@/hooks/useDailyCode";
import { timeLabel } from "@/lib/calendar";
import type { Profile } from "@/lib/warriors";
import { isOffToday } from "@/lib/warriors";

export interface TodayAtProps {
  today: string;
  data: CalendarData | undefined;
  presence: PresenceRow[];
  people: Profile[];
  style?: CSSProperties;
}

function covers(from: string, to: string, date: string) {
  return from <= date && date <= to;
}

/** Everything the company is doing today, and everybody who is in the room. */
export function TodayAt({ today, data, presence, people, style }: TodayAtProps) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const holiday = data?.holidays.find((h) => h.date === today) ?? null;
  const programs = (data?.programs ?? []).filter((p) => covers(p.from_date, p.to_date, today));
  const events = (data?.events ?? [])
    .filter((e) => covers(e.date, e.end_date ?? e.date, today))
    .sort((a, b) => (a.from_time ?? "99:99").localeCompare(b.from_time ?? "99:99"));

  const onLeaveIds = new Set(
    (data?.leave ?? []).filter((l) => covers(l.from_date, l.to_date, today)).map((l) => l.profile_id),
  );

  const present = presence.filter((r) => r.present);
  const away = presence.filter(
    (r) => !r.present && (onLeaveIds.has(r.profile_id) || isOffToday(byId.get(r.profile_id) ?? ({} as Profile))),
  );
  const yetToMark = presence.filter(
    (r) =>
      !r.present &&
      !onLeaveIds.has(r.profile_id) &&
      !isOffToday(byId.get(r.profile_id) ?? ({} as Profile)),
  );

  const nothingOn = !holiday && programs.length === 0 && events.length === 0;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Today at CoachEasily</h2>
        <Link to="/calendar" className="text-[13px] font-bold text-saffBtn hover:underline">
          Full calendar →
        </Link>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {/* ── Happening today ─────────────────────────────── */}
        <div>
          <p className="ce-label">Happening today</p>
          {nothingOn ? (
            <p className="mt-3 rounded-[14px] bg-cream px-4 py-4 text-[13px] leading-relaxed text-soft">
              No sessions today — a clear day to move your goal forward.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {holiday ? (
                <li className="rounded-[12px] bg-gold/15 px-3 py-2.5">
                  <p className="text-[14px] font-bold text-goldD">🎉 {holiday.name}</p>
                  <p className="text-[12px] text-soft">Company holiday</p>
                </li>
              ) : null}
              {programs.map((p) => (
                <li key={p.id} className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">
                      {p.name}
                      {p.session_no ? ` · session ${p.session_no}` : ""}
                    </p>
                    <p className="text-[12px] text-soft">
                      {[
                        timeLabel(p.from_time),
                        p.host_id ? byId.get(p.host_id)?.full_name : null,
                        p.location,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "All day"}
                    </p>
                  </div>
                </li>
              ))}
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-saff" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{e.name}</p>
                    <p className="text-[12px] text-soft">
                      {[
                        e.all_day ? "All day" : timeLabel(e.from_time),
                        e.host_id ? byId.get(e.host_id)?.full_name : null,
                        e.location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Who's around ─────────────────────────────────── */}
        <div>
          <p className="ce-label">
            Who's around today · {present.length} of {presence.length}
          </p>
          {present.length === 0 ? (
            <p className="mt-3 rounded-[14px] bg-cream px-4 py-4 text-[13px] text-soft">
              Nobody has marked attendance yet. Be the first one in.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {present.map((r) => (
                <li key={r.profile_id} className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emer" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{r.full_name}</p>
                    {r.focus ? (
                      <p className="mt-0.5 text-[13px] leading-relaxed text-soft italic">
                        “{r.focus}”
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[12px] text-soft">Marked in</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {away.length > 0 ? (
            <p className="mt-4 border-t border-line pt-3 text-[13px] text-soft">
              Away today:{" "}
              {away
                .map(
                  (a) =>
                    `${a.full_name.split(" ")[0]}${
                      onLeaveIds.has(a.profile_id) ? "" : " (weekly off)"
                    }`,
                )
                .join(" · ")}
            </p>
          ) : null}
          {yetToMark.length > 0 ? (
            <p className="mt-2 text-[13px] text-soft">
              Yet to mark: {yetToMark.map((a) => a.full_name.split(" ")[0]).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
