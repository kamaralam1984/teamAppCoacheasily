import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";

import type { CalendarData } from "@/hooks/useCalendar";
import { addDays, daysBetween, niceDate, rangeLabel, timeLabel, todayIso } from "@/lib/calendar";
import { weeklyOffLabel, type Profile } from "@/lib/warriors";

interface Item {
  key: string;
  date: string;
  endDate?: string | null;
  icon: string;
  title: string;
  detail: string;
  tone: string;
}

/** MM-DD on a profile → the next date it falls on, ISO. */
function nextOccurrence(mmdd: string | null): string | null {
  if (!mmdd || !/^\d{2}-\d{2}$/.test(mmdd)) return null;
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${mmdd}`;
  return thisYear >= today ? thisYear : `${year + 1}-${mmdd}`;
}

export interface ComingUpProps {
  data: CalendarData | undefined;
  people: Profile[];
  me: Profile | null;
  showTeamBirthdays: boolean;
  founderId: string | null;
  style?: CSSProperties;
}

/** One list, strictly by date. Programme streams are deduped so five MCA
 *  sessions in a row never crowd out everything else. */
export function ComingUp({
  data,
  people,
  me,
  showTeamBirthdays,
  founderId,
  style,
}: ComingUpProps) {
  const today = todayIso();
  const horizon = addDays(today, 45);
  const byId = new Map(people.map((p) => [p.id, p]));
  const items: Item[] = [];

  // programmes — next occurrence of each stream only
  const seen = new Set<string>();
  for (const p of [...(data?.programs ?? [])].sort((a, b) =>
    a.from_date.localeCompare(b.from_date),
  )) {
    if (p.to_date < today || p.from_date > horizon) continue;
    const stream = `${p.type}|${p.language ?? ""}|${p.series_id ?? p.name}`;
    if (seen.has(stream)) continue;
    seen.add(stream);
    items.push({
      key: `p-${p.id}`,
      date: p.from_date,
      endDate: p.to_date,
      icon: "🎓",
      title: p.name,
      detail:
        [
          p.from_date === p.to_date ? timeLabel(p.from_time) : rangeLabel(p.from_date, p.to_date),
          p.host_id ? byId.get(p.host_id)?.full_name : null,
          p.location,
        ]
          .filter(Boolean)
          .join(" · ") || "Programme",
      tone: "bg-violet",
    });
  }

  for (const e of data?.events ?? []) {
    if ((e.end_date ?? e.date) < today || e.date > horizon) continue;
    items.push({
      key: `e-${e.id}`,
      date: e.date,
      endDate: e.end_date,
      icon: "📌",
      title: e.name,
      detail:
        [
          e.end_date && e.end_date !== e.date
            ? rangeLabel(e.date, e.end_date)
            : e.all_day
              ? "All day"
              : timeLabel(e.from_time),
          e.host_id ? byId.get(e.host_id)?.full_name : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Event",
      tone: "bg-saff",
    });
  }

  for (const h of data?.holidays ?? []) {
    if (h.date < today || h.date > horizon) continue;
    items.push({
      key: `h-${h.id}`,
      date: h.date,
      icon: "🎉",
      title: h.name,
      detail: "Company holiday",
      tone: "bg-gold",
    });
  }

  for (const p of people) {
    if (p.status !== "active") continue;
    const isFounder = p.id === founderId;
    if (!showTeamBirthdays && !isFounder) continue;
    const d = nextOccurrence(p.birthday);
    if (!d || d > horizon) continue;
    items.push({
      key: `b-${p.id}`,
      date: d,
      icon: "🎂",
      title: `${p.full_name}'s birthday`,
      detail: p.title ?? "CoachEasily",
      tone: "bg-emer",
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  // ⚡ prep ahead — the nearest holiday or birthday
  const prep = items.find((i) => i.icon === "🎉" || i.icon === "🎂") ?? null;
  const myBirthday = me ? nextOccurrence(me.birthday) : null;
  const myBirthdayClose =
    myBirthday && daysBetween(today, myBirthday) >= 0 && daysBetween(today, myBirthday) <= 45;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Coming up</h2>
        <Link to="/calendar" className="text-[13px] font-bold text-saffBtn hover:underline">
          Full calendar →
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-[14px] bg-cream px-4 py-4 text-[13px] leading-relaxed text-soft">
          The next six weeks are open. A quiet stretch is the best time to plan the loud one.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.slice(0, 10).map((i) => (
            <li key={i.key} className="flex gap-3">
              <span aria-hidden className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${i.tone}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">
                  {i.icon} {i.title}
                </p>
                <p className="text-[12px] text-soft">{i.detail}</p>
              </div>
              <span className="shrink-0 text-[12px] font-bold text-soft">
                {i.endDate && i.endDate !== i.date
                  ? rangeLabel(i.date, i.endDate)
                  : niceDate(i.date)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {me?.weekly_off ? (
        <p className="mt-4 border-t border-line pt-3 text-[13px] text-soft">
          Your weekly off: <span className="font-bold text-ink">{weeklyOffLabel(me.weekly_off)}</span>
        </p>
      ) : null}

      {myBirthdayClose ? (
        <p className="mt-3 rounded-[14px] bg-gold/15 px-4 py-3 text-[13px] leading-relaxed text-goldD">
          🎂 Your birthday is on {niceDate(myBirthday!)} — the team will want to celebrate. Block
          the day.
        </p>
      ) : prep ? (
        <p className="mt-3 rounded-[14px] bg-cream px-4 py-3 text-[13px] leading-relaxed text-soft">
          ⚡ Prep ahead: {prep.title} is on {niceDate(prep.date)} —{" "}
          {prep.icon === "🎉"
            ? "plan around it now so nothing slips."
            : "a small note from you goes a long way."}
        </p>
      ) : null}
    </section>
  );
}
