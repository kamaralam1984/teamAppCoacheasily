import { useEarnedLeaveLedger, type LedgerEntry } from "@/hooks/useEarnedLeave";
import { niceDate } from "@/lib/calendar";

function signed(n: number): string {
  const text = Number.isInteger(n) ? String(Math.abs(n)) : String(Math.abs(n));
  return n > 0 ? `+${text}` : n < 0 ? `−${text}` : "0";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Line({ e }: { e: LedgerEntry }) {
  const delta = e.delta ?? e.credited;
  const tone =
    e.kind === "used"
      ? "border-violet/25 bg-violet/8"
      : e.kind === "lapse"
        ? "border-saff/30 bg-saff/10"
        : e.kind === "pending"
          ? "border-dashed border-line bg-white"
          : "border-line bg-cream";

  let title: string;
  let detail: string | null = null;
  if (e.kind === "opening") {
    title = "Opening balance";
    detail = "Brought in when your account started.";
  } else if (e.kind === "credit") {
    title = "Earned leave credited";
    if (e.period_start && e.period_end) {
      detail = `${e.eligible_days} working days, ${niceDate(e.period_start)} → ${niceDate(e.period_end)}${
        e.source === "rebuild" ? " · counted again from the joining date" : ""
      }`;
    }
    if (e.credited < e.amount) {
      detail = `${detail ? `${detail} · ` : ""}Capped at the maximum balance (${e.amount - e.credited} not credited).`;
    }
  } else if (e.kind === "lapse") {
    title = "Lapsed at the new leave year";
    detail = `Only ${e.carry_limit} day(s) carry forward.`;
  } else if (e.kind === "used") {
    const same = !e.to_date || e.to_date === e.credited_on;
    title = "Earned leave used";
    detail = `${same ? niceDate(e.credited_on) : `${niceDate(e.credited_on)} to ${niceDate(e.to_date as string)}`}${
      e.half_day ? " · half day" : ""
    }`;
  } else {
    title = "Waiting for approval";
    detail = `${plural(e.amount, "day")} from ${niceDate(e.credited_on)}. Not counted until it is approved.`;
  }

  return (
    <li className={`rounded-lg border px-3 py-2 text-[13px] text-ink ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">
          {title}
          <span className="ml-2 font-normal text-soft">
            {e.kind === "credit"
              ? `earned ${niceDate(e.credited_on)}`
              : e.kind === "opening"
                ? ""
                : niceDate(e.credited_on)}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <b className={delta > 0 ? "text-emer" : delta < 0 ? "text-violet" : "text-soft"}>
            {e.kind === "pending" ? "…" : signed(delta)}
          </b>
          {e.available_after !== undefined && e.kind !== "pending" ? (
            <span className="text-soft">balance {e.available_after}</span>
          ) : null}
        </span>
      </div>
      {detail ? <p className="mt-1 text-soft">{detail}</p> : null}
    </li>
  );
}

/**
 * The earned leave account, line by line: the opening balance, every credit on the day it was
 * earned, anything that lapsed, and every day of earned leave used, with the balance after each
 * line. The person sees the account; HR and admin also see the working days behind each credit.
 */
export function EarnedLeaveLedger({
  profileId,
  className,
}: {
  /** omit for the signed-in person */
  profileId?: string | null;
  className?: string;
}) {
  const { data, isLoading, error } = useEarnedLeaveLedger(profileId);

  const lines = data ?? [];
  const sum = (kind: LedgerEntry["kind"]) =>
    lines.filter((l) => l.kind === kind).reduce((n, l) => n + (l.delta ?? l.credited), 0);
  const opening = sum("opening");
  const earned = sum("credit");
  const lapsed = -sum("lapse");
  const used = -sum("used");
  const pending = lines.filter((l) => l.kind === "pending").reduce((n, l) => n + l.amount, 0);
  const available = opening + earned - lapsed - used;

  return (
    <section className={`ce-card p-5 ${className ?? ""}`}>
      <h2 className="font-display text-2xl text-ink">Earned leave account</h2>
      {isLoading ? (
        <p className="mt-3 text-sm text-soft">Loading…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red">The account couldn't be loaded.</p>
      ) : lines.length === 0 ? (
        <p className="mt-3 text-sm text-soft">
          Nothing yet. A day of earned leave is added each time the working-day target is reached.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: "Opening", value: opening },
              { label: "Earned", value: earned },
              { label: "Used", value: used },
              { label: "Lapsed", value: lapsed },
              { label: "Available", value: available },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-lg border border-line bg-cream px-3 py-2 text-center"
              >
                <dt className="text-[10px] font-bold tracking-wider text-soft uppercase">
                  {t.label}
                </dt>
                <dd
                  className={`font-display text-xl ${t.label === "Available" ? "text-emer" : "text-ink"}`}
                >
                  {t.value}
                </dd>
              </div>
            ))}
          </dl>
          {pending > 0 ? (
            <p className="mt-2 text-[12px] text-soft">
              {plural(pending, "day")} more {pending === 1 ? "is" : "are"} waiting for approval and
              not counted above.
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {lines.map((e) => (
              <Line key={`${e.kind}-${e.id}`} e={e} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
