import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  useCancelShift,
  useMyShifts,
  useRequestShift,
  useShiftCheck,
  type ShiftStatus,
} from "@/hooks/useWeeklyOffShift";
import { isOffOn, shortDate, weeklyOffDays, weeklyOffLabel } from "@/lib/warriors";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayName(iso: string): string {
  return DAY_NAMES[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
}

/** Monday of the week that holds `iso` — a shift stays inside one Monday-to-Sunday week. */
function weekStart(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

function label(iso: string): string {
  return `${dayName(iso).slice(0, 3)} ${shortDate(iso)}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** The database explains every refusal in words, so show its message. */
function errorText(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : "That didn't go through.";
}

const STATUS_STYLE: Record<ShiftStatus, string> = {
  pending: "bg-cream text-goldD border-gold/40",
  approved: "bg-emer/10 text-emer border-emer/30",
  rejected: "bg-red/10 text-red border-red/30",
  cancelled: "bg-white text-soft border-line",
};

const STATUS_LABEL: Record<ShiftStatus, string> = {
  pending: "waiting for HR",
  approved: "shifted",
  rejected: "not approved",
  cancelled: "cancelled",
};

/**
 * The weekly off section of the leave page. "Forgot" opens the form to move one week's weekly off
 * to another day of the same week: 2 a quarter go through straight away, more need HR, 8 a year.
 */
export function WeeklyOffShiftCard({ weeklyOff }: { weeklyOff: string | null }) {
  const fixed = weeklyOffDays(weeklyOff).length > 0;
  const { data } = useMyShifts(fixed);
  const request = useRequestShift();
  const cancel = useCancelShift();

  const [open, setOpen] = useState(false);
  const [off, setOff] = useState("");
  const [next, setNext] = useState("");
  const [reason, setReason] = useState("");

  const today = data?.today ?? "";
  const taken = useMemo(
    () =>
      new Set(
        (data?.shifts ?? [])
          .filter((s) => s.status === "pending" || s.status === "approved")
          .flatMap((s) => [s.off_date, s.new_date]),
      ),
    [data],
  );

  /** my weekly offs in the next five weeks that are not moved yet */
  const offChoices = useMemo(() => {
    if (!today) return [];
    const out: string[] = [];
    for (let i = 0; i < 35; i++) {
      const d = addDays(today, i);
      if (isOffOn(weeklyOff, dayName(d)) && !taken.has(d)) out.push(d);
    }
    return out;
  }, [today, weeklyOff, taken]);

  /** the working days of that week, from today on */
  const nextChoices = useMemo(() => {
    if (!off) return [];
    const monday = weekStart(off);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter(
      (d) => d >= today && !isOffOn(weeklyOff, dayName(d)) && !taken.has(d),
    );
  }, [off, today, weeklyOff, taken]);

  const check = useShiftCheck(off, next, open);
  const problem = check.data?.problem ?? null;
  const needsHr = check.data?.needs_hr ?? false;
  const reasonMissing = needsHr && reason.trim().length < 3;
  const blocked =
    !off || !next || check.isFetching || Boolean(problem) || reasonMissing || request.isPending;

  if (!fixed) return null;
  const usage = data?.usage ?? null;

  const reset = () => {
    setOpen(false);
    setOff("");
    setNext("");
    setReason("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    request.mutate(
      { off, next, reason },
      {
        onSuccess: (res) => {
          toast.success(
            res.needs_hr
              ? "Sent to HR. You'll hear as soon as they decide."
              : `Done — ${label(next)} is your weekly off and ${label(off)} is a working day.`,
          );
          reset();
        },
        onError: (err) => toast.error(errorText(err)),
      },
    );
  };

  return (
    <section className="ce-rise ce-card p-6" style={{ animationDelay: "200ms" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Weekly off</h2>
          <p className="mt-1 text-sm text-soft">
            Yours is <strong className="text-ink">{weeklyOffLabel(weeklyOff)}</strong>. Need a
            different day one week? Move it to another day of the same week.
          </p>
        </div>
        {open ? null : (
          <button type="button" className="btn3d" onClick={() => setOpen(true)}>
            Forgot
          </button>
        )}
      </div>

      {usage ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[14px] border border-line bg-cream/60 p-4">
            <p className="text-[11px] font-bold tracking-[0.12em] text-soft uppercase">
              This quarter
            </p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="font-display text-4xl text-ink">{usage.free_left}</span>
              <span className="text-[13px] font-semibold text-soft">
                / {usage.free_per_quarter} free left
              </span>
            </p>
            <p className="mt-1 text-[12px] text-soft">
              {shortDate(usage.quarter_from)} → {shortDate(usage.quarter_to)} · used{" "}
              {usage.quarter_used}. More than {usage.free_per_quarter} needs HR's approval.
            </p>
          </div>
          <div className="rounded-[14px] border border-line bg-cream/60 p-4">
            <p className="text-[11px] font-bold tracking-[0.12em] text-soft uppercase">This year</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="font-display text-4xl text-ink">{usage.year_left}</span>
              <span className="text-[13px] font-semibold text-soft">/ {usage.per_year} left</span>
            </p>
            <p className="mt-1 text-[12px] text-soft">
              {shortDate(usage.year_from)} → {shortDate(usage.year_to)} · counted from your joining
              date.
            </p>
          </div>
        </div>
      ) : null}

      {open ? (
        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-bold text-ink">Weekly off to move</span>
              <select
                className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"
                value={off}
                onChange={(e) => {
                  setOff(e.target.value);
                  setNext("");
                }}
              >
                <option value="">Pick a day</option>
                {offChoices.map((d) => (
                  <option key={d} value={d}>
                    {label(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] font-bold text-ink">Take off on instead</span>
              <select
                className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"
                value={next}
                disabled={!off}
                onChange={(e) => setNext(e.target.value)}
              >
                <option value="">
                  {off ? "Pick a day that week" : "First pick the weekly off"}
                </option>
                {nextChoices.map((d) => (
                  <option key={d} value={d}>
                    {label(d)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-[13px] font-bold text-ink">
              Why {needsHr ? "(HR reads this)" : "(optional)"}
            </span>
            <textarea
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          {problem ? (
            <p className="rounded-lg border border-red/30 bg-red/10 p-3 text-[13px] font-semibold text-red">
              {problem}
            </p>
          ) : off && next && check.data ? (
            needsHr ? (
              <p className="rounded-lg border border-gold/40 bg-cream p-3 text-[13px] font-semibold text-goldD">
                This would be your {ordinal((check.data.usage?.quarter_used ?? 0) + 1)} shift this
                quarter. The first {check.data.usage?.free_per_quarter ?? 2} go through straight
                away; this one waits for HR to approve.
              </p>
            ) : (
              <p className="rounded-lg border border-emer/30 bg-emer/10 p-3 text-[13px] font-semibold text-emer">
                No approval needed — it goes through as soon as you send it.
              </p>
            )
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" className="btn3d w-full sm:w-auto" disabled={blocked}>
              {needsHr ? "Send to HR" : "Shift my weekly off"}
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-white px-5 text-[15px] font-bold text-ink sm:w-auto"
              onClick={reset}
            >
              Not now
            </button>
          </div>
        </form>
      ) : null}

      {data && data.shifts.length > 0 ? (
        <ul className="mt-5 divide-y divide-line border-t border-line">
          {data.shifts.map((s) => {
            const ahead = (s.off_date < s.new_date ? s.off_date : s.new_date) > today;
            const mayCancel = s.status === "pending" || (s.status === "approved" && ahead);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {label(s.off_date)} → {label(s.new_date)}
                  </p>
                  {s.reason ? <p className="text-[13px] text-soft">“{s.reason}”</p> : null}
                  {s.status === "rejected" && s.decision_note ? (
                    <p className="mt-0.5 text-[12px] text-red">{s.decision_note}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {mayCancel ? (
                    <button
                      type="button"
                      className="text-[12px] font-bold text-soft underline"
                      disabled={cancel.isPending}
                      onClick={() =>
                        cancel.mutate(s.id, {
                          onSuccess: () =>
                            toast.success("Cancelled. Your usual weekly off is back."),
                          onError: (err) => toast.error(errorText(err)),
                        })
                      }
                    >
                      Cancel
                    </button>
                  ) : null}
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${STATUS_STYLE[s.status]}`}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
