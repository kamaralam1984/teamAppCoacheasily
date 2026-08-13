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

  /* ── the honesty check ──────────────────────────────────────
     Quiet by default. It speaks only when something looks unusual,
     and it always says why. It never tells anyone else.          */

  /** this person's own 14-day average for a stage, from their own entries */
  const avgFor = (i: number): number | null => {
    const rows = (entries ?? []).slice(0, 14);
    const nums = rows
      .map((e) => (goal.kind === "funnel" ? (e.counts?.[i] ?? null) : e.value))
      .filter((v): v is number => v !== null && v !== undefined);
    if (nums.length < 3) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };

  const backfilled = useMemo(
    () => missingDays(entries ?? [], cycleStart, 14).length,
    [entries, cycleStart],
  );

  const raw = () => stages.map((_, i) => valueFor(i).trim());

  const blocker = (): string | null => {
    if (goal.kind !== "funnel") return null;
    const nums = raw().map((r) => (r === "" ? null : Number(r)));
    for (let i = 1; i < nums.length; i += 1) {
      const prev = nums[i - 1] ?? null;
      const cur = nums[i] ?? null;
      if (prev !== null && cur !== null && cur > prev) {

        return `${stages[i]} can't be more than ${stages[i - 1]}.`;
      }
    }
    return null;
  };

  const unusual = (): string | null => {
    const nums = raw();
    for (let i = 0; i < nums.length; i += 1) {
      const v = nums[i] === "" ? null : Number(nums[i]);
      const a = avgFor(i);
      if (v !== null && a !== null && a > 0 && v > a * 3) {
        return `That's well above your usual ${fmt(Math.round(a * 10) / 10)} for ${stages[i]}. Confirm it's right?`;
      }
    }
    if (date !== istToday() && backfilled > 3) {
      return "Filling several days at once — take a moment to make sure each day is accurate.";
    }
    return null;
  };

  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const write = () => {
    const rows = raw();
    if (rows.every((r) => r === "")) return;
    const payload =
      goal.kind === "funnel"
        ? { counts: rows.map((r) => Number(r || 0)) }
        : { value: Number(rows[0] || 0) };

    log.mutate(
      { goalId: goal.id, date, note: note || null, ...payload },
      {
        onSuccess: () => {
          setDraft({});
          setNote("");
          setConfirmMsg(null);
          setSaved(true);
          onCelebrate(
            date === istToday()
              ? `${goal.name} logged. Honest numbers are how you actually improve.`
              : `${goal.name} logged for ${dayLabel(date)}. Gap filled.`,
          );
        },
      },
    );
  };

  const block = blocker();

  const save = () => {
    if (raw().every((r) => r === "")) return;
    if (block) return;
    const ask = unusual();
    if (ask) {
      setConfirmMsg(ask);
      return;
    }
    write();
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
              onChange={(e) => {
                setConfirmMsg(null);
                setSaved(false);
                setDraft((d) => ({ ...d, [key(i)]: e.target.value }));
              }}
              className="ce-input mt-1 h-12 w-full text-[17px] font-bold"
              placeholder="0"
            />
          </label>
        ))}
      </div>

      <p className="mt-2 text-[12px] text-soft">
        Real numbers only. This is for your growth, not for anyone&rsquo;s approval.
      </p>

      {block ? (
        <p className="mt-2 rounded-[12px] border border-red/40 bg-red/8 px-3 py-2 text-[13px] font-semibold text-red">
          {block}
        </p>
      ) : null}

      {confirmMsg && !block ? (
        <div className="mt-2 rounded-[12px] border border-gold/50 bg-gold/10 px-3 py-3">
          <p className="text-[13px] font-semibold text-ink">{confirmMsg}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-gold bg-gold/20 px-3 text-[13px] font-bold text-ink"
              onClick={write}
              disabled={log.isPending}
            >
              Yes, that&rsquo;s right
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-line px-3 text-[13px] font-bold text-soft"
              onClick={() => setConfirmMsg(null)}
            >
              Let me check
            </button>
          </div>
        </div>
      ) : null}

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="A note, if the day needs one"
        className="ce-input mt-3 h-11 w-full"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn3d"
          onClick={save}
          disabled={log.isPending || Boolean(block)}
        >
          {log.isPending ? "Saving…" : existing ? "Update" : "Save"}
        </button>
        {saved ? (
          <span className="text-[12px] font-bold text-emer">
            Logged. Honest numbers are how you actually improve.
          </span>
        ) : null}

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
