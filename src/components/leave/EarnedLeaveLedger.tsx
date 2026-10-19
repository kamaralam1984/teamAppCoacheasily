import { useEarnedLeaveLedger } from "@/hooks/useEarnedLeave";
import { niceDate } from "@/lib/calendar";

/**
 * Every automatic earned-leave credit, newest first. The person sees the transaction;
 * HR/Admin also get the working-day period and policy it was calculated from.
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

  return (
    <section className={`ce-card p-5 ${className ?? ""}`}>
      <h2 className="font-display text-2xl text-ink">Earned leave credits</h2>
      {isLoading ? (
        <p className="mt-3 text-sm text-soft">Loading…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red">The credits couldn't be loaded.</p>
      ) : !data || data.length === 0 ? (
        <p className="mt-3 text-sm text-soft">
          No credits yet. One is added automatically each time the working-day target is reached.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.map((e) =>
            e.kind === "lapse" ? (
              <li
                key={e.id}
                className="rounded-lg border border-saff/30 bg-saff/10 px-3 py-2 text-[13px] text-ink"
              >
                <span className="font-bold">
                  {e.credited} earned leave lapsed · {niceDate(e.credited_on)}
                </span>
                <p className="mt-1 text-soft">
                  A new leave year began, and only {e.carry_limit} day(s) carry forward.
                </p>
              </li>
            ) : (
              <li
                key={e.id}
                className="rounded-lg border border-line bg-cream px-3 py-2 text-[13px] text-ink"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    +{e.credited} earned leave · {niceDate(e.credited_on)}
                  </span>
                  <span className="text-soft">
                    {e.previous_balance} → {e.new_balance}
                  </span>
                </div>
                {e.credited < e.amount ? (
                  <p className="mt-1 text-soft">
                    Capped at the maximum balance ({e.amount - e.credited} not credited).
                  </p>
                ) : null}
                {e.period_start && e.period_end ? (
                  <p className="mt-1 text-soft">
                    {e.eligible_days} eligible working days, {niceDate(e.period_start)} →{" "}
                    {niceDate(e.period_end)}
                    {e.source && e.source !== "system" ? ` · ${e.source}` : ""}
                  </p>
                ) : null}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
