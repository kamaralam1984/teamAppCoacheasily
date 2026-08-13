import { useMemo, useState } from "react";

import { useGoalEntries, useLogEntry } from "@/hooks/useGoals";
import {
  dayLabel,
  fmt,
  istToday,
  missingDays,
  weekLine,
  type Cycle,
  type GoalWithProgress,
} from "@/lib/goals";

interface Props {
  cycle: Cycle | null;
  goals: GoalWithProgress[];
  onCelebrate: (message: string) => void;
  style?: React.CSSProperties;
}

/** The card builds itself from whatever the signed-in person's own goals describe. */
export function DailyNumbers({ cycle, goals, onCelebrate, style }: Props) {
  const today = istToday();
  const [date, setDate] = useState(today);

  const loggedCount = goals.filter((g) => g.progress?.logged_today).length;

  if (!cycle) {
    return (
      <section className="ce-rise ce-card p-6" style={style}>
        <h2 className="font-display text-2xl text-ink">Today's numbers</h2>
        <p className="mt-2 text-sm text-soft">
          No cycle is running yet. People &amp; Culture will open one.
        </p>
      </section>
    );
  }

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Today&rsquo;s numbers</h2>
        {goals.length > 0 ? (
          <span
            className={`rounded-full px-3 py-1 text-[12px] font-bold ${
              loggedCount === goals.length
                ? "bg-emer/12 text-emer"
                : "bg-saff/12 text-[color:var(--ce-saffBtn)]"
            }`}
          >
            {loggedCount === goals.length
              ? "✓ logged today"
              : `${loggedCount}/${goals.length} logged`}
          </span>
        ) : null}
      </div>

      {goals.length === 0 ? (
        <p className="mt-3 text-sm text-soft">
          You have no goals in {cycle.name} yet.{" "}
          <a href="/goals" className="font-bold text-goldD underline">
            Write your first one →
          </a>
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="ce-label" htmlFor="dn-date">
              Logging for
            </label>
            <input
              id="dn-date"
              type="date"
              value={date}
              max={today}
              min={cycle.start_date}
              onChange={(e) => setDate(e.target.value)}
              className="ce-input h-11 w-[170px]"
            />
            {date !== today ? (
              <button
                type="button"
                className="rounded-full border border-line px-3 py-1.5 text-[12px] font-bold text-soft"
                onClick={() => setDate(today)}
              >
                Back to today
              </button>
            ) : null}
          </div>

          <div className="mt-5 space-y-5">
            {goals.map((g) => (
              <GoalRow
                key={g.goal.id}
                item={g}
                date={date}
                cycleStart={cycle.start_date}
                onSetDate={setDate}
                onCelebrate={onCelebrate}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function GoalRow({
  item,
  date,
  cycleStart,
  onSetDate,
  onCelebrate,
}: {
  item: GoalWithProgress;
  date: string;
  cycleStart: string;
  onSetDate: (d: string) => void;
  onCelebrate: (m: string) => void;
}) {
  const { goal, progress } = item;
  const stages = goal.kind === "funnel" ? (goal.stages ?? []) : [goal.metric ?? goal.name];
  const { data: entries } = useGoalEntries(goal.id, 30);
  const log = useLogEntry();

  const existing = useMemo(() => entries?.find((e) => e.date === date) ?? null, [entries, date]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const key = (i: number) => `${goal.id}-${date}-${i}`;
  const valueFor = (i: number) => {
    const d = draft[key(i)];
    if (d !== undefined) return d;
    if (!existing) return "";
    if (goal.kind === "funnel") {
      const v = existing.counts?.[i];
      return v === undefined || v === null ? "" : String(v);
    }
    return existing.value === null ? "" : String(existing.value);
  };

  const gaps = missingDays(entries ?? [], cycleStart, 7);

  const save = () => {
    const raw = stages.map((_, i) => valueFor(i).trim());
    if (raw.every((r) => r === "")) return;
    const payload =
      goal.kind === "funnel"
        ? { counts: raw.map((r) => Number(r || 0)) }
        : { value: Number(raw[0] || 0) };

    log.mutate(
      { goalId: goal.id, date, note: note || null, ...payload },
      {
        onSuccess: () => {
          setDraft({});
          setNote("");
          onCelebrate(
            date === istToday()
              ? `${goal.name} logged. Small numbers, every day — that is how it compounds.`
              : `${goal.name} logged for ${dayLabel(date)}. Gap filled.`,
          );
        },
      },
    );
  };

  const line = weekLine(goal, progress);

  return (
    <div className="rounded-[14px] border border-line bg-cream/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-bold text-ink">{goal.name}</p>
        <span className="text-[12px] font-bold text-goldD">{fmt(progress?.pct ?? 0)}%</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stages.map((s, i) => (
          <label key={s + String(i)} className="block">
            <span className="ce-label">{s}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={valueFor(i)}
              onChange={(e) => setDraft((d) => ({ ...d, [key(i)]: e.target.value }))}
              className="ce-input mt-1 h-12 w-full text-[17px] font-bold"
              placeholder="0"
            />
          </label>
        ))}
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="A note, if the day needs one"
        className="ce-input mt-3 h-11 w-full"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn3d" onClick={save} disabled={log.isPending}>
          {log.isPending ? "Saving…" : existing ? "Update" : "Save"}
        </button>
        {existing ? (
          <span className="text-[12px] font-bold text-emer">✓ saved for {dayLabel(date)}</span>
        ) : null}
      </div>

      {log.isError ? (
        <p className="mt-2 text-[13px] font-semibold text-red">
          {(log.error as Error).message || "That didn't save. Please try again."}
        </p>
      ) : null}

      {line ? <p className="mt-3 text-[13px] leading-relaxed text-soft">{line}</p> : null}

      {gaps.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-soft">
          <span>Missing:</span>
          {gaps.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onSetDate(d)}
              className="rounded-full border border-line bg-ivory px-2.5 py-1 font-bold text-goldD"
            >
              {dayLabel(d)}
            </button>
          ))}
        </p>
      ) : null}
    </div>
  );
}
